/**
 * One-shot backfill: geocode every CarrierFacility row in a given org whose
 * latitude OR longitude is NULL, using the repo's existing Nominatim geocoder.
 *
 * Usage (run from apps/web):
 *   npx tsx --env-file=.env.local scripts/backfill-facility-coordinates.ts --org-id <uuid> [--apply]
 *
 * DRY RUN IS THE DEFAULT. `--apply` is the only thing that writes, and every
 * database reachable from this repo's .env.local is production Supabase. Do
 * not add `--apply` to a command line unless a human has explicitly approved
 * an apply run against this exact org, after reviewing the dry-run table.
 *
 * Why the geocode calls are serialised with a >= 1100ms sleep between them:
 * Nominatim's public instance enforces a hard cap of 1 request per second,
 * and geocode.ts's own header says "low-volume requests only". A backfill
 * loop over N facilities is exactly the volume that policy targets. Do NOT
 * "optimise" this into a `Promise.all` — that would violate the provider's
 * usage policy and risk the whole app's IP getting rate-limited or banned.
 * The throttle lives here, in the script, not in geocode.ts, because
 * geocode.ts's other callers are one-or-two-address user actions that never
 * needed one.
 *
 * geocodeAddress() exposes NO confidence or match-quality value — it discards
 * Nominatim's `importance` / `place_rank` / `display_name` and returns only
 * `{lat, lng} | null`. `geocode.ts` is NOT modified by this script. So the
 * confidence column below is the literal string
 * 'n/a (not exposed by geocodeAddress)' on every row. This script does not
 * call Nominatim directly to fish a confidence value out of the raw response
 * — that would bypass "use the existing geocoder as-is".
 *
 * BBOX CHECK (script-owned, computed in place of a confidence score): for
 * every resolved coordinate the script asserts that lat/lng falls inside a
 * hardcoded bounding box for the facility's own `state` column, and prints
 * PASS / FAIL / UNKNOWN. Boxes exist ONLY for states actually observed among
 * this org's NULL-coordinate facilities (WI, IN) — any other state value, or
 * one that is null/empty/unrecognised, reports UNKNOWN rather than guessing a
 * box. PASS means only "landed in the right state" — it is not a
 * premises-level accuracy claim, and is the ONLY automated quality signal
 * this script can produce given geocode.ts's return type.
 *
 * `country` (NOT NULL on CarrierFacility, defaults to 'US') IS included in
 * the address string submitted to the geocoder, alongside address_line1,
 * address_line2, city, state, zip — appended last. Values are inconsistent
 * across this table ('US' vs 'United States'); both are passed through as-is
 * and Nominatim tolerates either.
 *
 * NO-ADDRESS GUARD: because `country` is NOT NULL, a facility whose other
 * five address fields are all null/blank would still produce a non-empty
 * address string if country were the only ingredient considered — e.g. just
 * "US". Submitting that to Nominatim would very plausibly return the
 * centroid of the entire country: a plausible-looking coordinate pair that
 * is catastrophically wrong, and one that could sail through the bbox check
 * as an UNKNOWN or even a false PASS. So "no usable address" is judged on
 * the FIVE non-country fields only. If all five are blank, the address
 * string is built from country alone (or is literally empty), the row is
 * printed as SKIPPED (no address data), the geocoder is NEVER called for it,
 * and it does not consume a throttle slot.
 *
 * CITY-CENTROID FLAG: a facility with no `addressLine1` and no
 * `addressLine2` (only city/state/zip on file) can still be geocoded, but
 * Nominatim can only return a city/postal centroid for it — not the actual
 * premises. Those rows are still geocoded and reported (status column), but
 * flagged distinctly rather than presented as equivalent to a street-level
 * match. A bbox PASS on one of these means "right city/state", nothing more.
 */
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { geocodeAddress } from '../src/lib/geo/geocode';

const THROTTLE_MS = 1100; // > Nominatim's 1 req/s ceiling, with headroom
const NO_CONFIDENCE = 'n/a (not exposed by geocodeAddress)';

// Bounding boxes for states actually present among this org's NULL-coordinate
// facilities. Do NOT add a state here without verifying it against a real
// source — a wrong box would silently turn a real geocoding error into a
// false PASS. Any state not listed here reports UNKNOWN, never a guess.
const STATE_BOUNDING_BOXES: Record<
  string,
  { minLat: number; maxLat: number; minLng: number; maxLng: number }
> = {
  WI: { minLat: 42.49, maxLat: 47.31, minLng: -92.89, maxLng: -86.25 },
  IN: { minLat: 37.77, maxLat: 41.76, minLng: -88.1, maxLng: -84.78 },
};

type FacilityRow = {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `--ids` is an EXPLICIT ALLOWLIST of facility ids, and it is deliberately not
 * a class filter.
 *
 * The dry run sorted the NULL-coordinate set into classes (full street address
 * / city-centroid-only / no address at all), and it would have been easy to
 * encode "apply to Class A only" as a predicate. That would be the wrong
 * mechanism: a predicate re-derives its own membership at run time, so a row
 * whose address changed between the review and the write silently changes
 * class and joins — or leaves — the write set that a human approved. An
 * allowlist of literal ids cannot do that. What was reviewed is what is
 * written, and anything absent from the list is untouched no matter what its
 * data now looks like.
 *
 * Every other guard still applies on top of it: an allowlisted row that fails
 * to geocode is still skipped rather than written.
 */
function parseArgs(argv: string[]): {
  orgId: string | null;
  apply: boolean;
  ids: string[] | null;
} {
  let orgId: string | null = null;
  let apply = false;
  let rawIds: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--org-id') {
      orgId = argv[i + 1] ?? null;
      i++;
    } else if (arg.startsWith('--org-id=')) {
      orgId = arg.slice('--org-id='.length);
    } else if (arg === '--ids') {
      rawIds = argv[i + 1] ?? null;
      i++;
    } else if (arg.startsWith('--ids=')) {
      rawIds = arg.slice('--ids='.length);
    }
  }

  const ids = rawIds
    ? rawIds
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    : null;

  return {
    orgId: orgId && orgId.trim().length > 0 ? orgId.trim() : null,
    apply,
    ids: ids && ids.length > 0 ? ids : null,
  };
}

function nonBlank(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds the address string submitted to the geocoder.
 *
 * "No usable address" is judged on the FIVE non-country fields ONLY (see
 * NO-ADDRESS GUARD above) — country alone is never enough to justify a
 * geocoder call, because it is always present (NOT NULL) and submitting it
 * bare would return a country centroid, not a facility location.
 */
function buildAddress(row: FacilityRow): {
  fullAddress: string | null;
  hasStreetAddress: boolean;
} {
  const line1 = nonBlank(row.addressLine1);
  const line2 = nonBlank(row.addressLine2);
  const city = nonBlank(row.city);
  const state = nonBlank(row.state);
  const zip = nonBlank(row.zip);
  const country = nonBlank(row.country);

  const coreComponents = [line1, line2, city, state, zip].filter(
    (v): v is string => v !== null
  );

  if (coreComponents.length === 0) {
    // Every one of the five non-country fields is null/blank. country alone
    // does not count as a usable address — see NO-ADDRESS GUARD above.
    return { fullAddress: null, hasStreetAddress: false };
  }

  const allComponents = country ? [...coreComponents, country] : coreComponents;
  return {
    fullAddress: allComponents.join(', '),
    hasStreetAddress: line1 !== null || line2 !== null,
  };
}

function normalizeStateCode(state: string | null): string | null {
  if (!state) return null;
  const trimmed = state.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function bboxCheck(state: string | null, lat: number, lng: number): 'PASS' | 'FAIL' | 'UNKNOWN' {
  const code = normalizeStateCode(state);
  if (!code || !(code in STATE_BOUNDING_BOXES)) return 'UNKNOWN';
  const box = STATE_BOUNDING_BOXES[code];
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng
    ? 'PASS'
    : 'FAIL';
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function printRow(
  row: { id: string; name: string },
  address: string,
  lat: string,
  lng: string,
  bbox: string,
  status: string
): void {
  console.log(
    pad(row.id, 38) + '| ' +
    pad(row.name, 30) + '| ' +
    pad(address, 70) + '| ' +
    pad(lat, 12) + '| ' +
    pad(lng, 12) + '| ' +
    pad(NO_CONFIDENCE, 40) + '| ' +
    pad(bbox, 9) + '| ' +
    status
  );
}

async function main() {
  const { orgId, apply, ids } = parseArgs(process.argv.slice(2));

  if (!orgId) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/backfill-facility-coordinates.ts --org-id <uuid> [--ids <id,id,...>] [--apply]');
    console.error('  --org-id is REQUIRED.');
    console.error('  --ids is OPTIONAL. When given, ONLY those facility ids are considered (explicit allowlist).');
    console.error('  --apply is OPTIONAL and DEFAULTS TO OFF (dry run). Every database here is production Supabase.');
    process.exit(1);
    return;
  }

  // Use DIRECT_URL for scripts (bypasses pgbouncer for raw operations),
  // matching scripts/backfill-notification-html-cache.ts's convention.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Neither DIRECT_URL nor DATABASE_URL is set in environment');
  }

  const pool = new Pool({ connectionString, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  if (apply) {
    console.log('================================================================');
    console.log('  APPLY MODE — THIS WILL WRITE TO PRODUCTION SUPABASE');
    console.log(`  org: ${orgId}`);
    console.log('================================================================');
  } else {
    console.log('DRY RUN — no database writes');
  }

  // Printed BEFORE any write, so the approved set is on the record above the
  // rows it produced rather than inferred from them afterwards.
  if (ids) {
    console.log('');
    console.log(`[backfill] ALLOWLIST — ${ids.length} facility id(s); nothing outside this list is read or written:`);
    ids.forEach((id, i) => console.log(`  ${String(i + 1).padStart(2)}. ${id}`));
    console.log('');
  } else {
    console.log('[backfill] no --ids allowlist given — considering every NULL-coordinate facility in the org');
  }

  const rows = await prisma.carrierFacility.findMany({
    where: {
      orgId,
      OR: [{ latitude: null }, { longitude: null }],
      ...(ids ? { id: { in: ids } } : {}),
    },
    select: {
      id: true,
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zip: true,
      country: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log(`[backfill] found ${rows.length} facilities in org ${orgId} with a NULL latitude or longitude`);

  // A mistyped or already-populated id must be LOUD. Silently processing 7 rows
  // when a human approved 8 is the failure mode this check exists to prevent.
  if (ids) {
    const found = new Set(rows.map((r) => r.id));
    const unmatched = ids.filter((id) => !found.has(id));
    if (unmatched.length > 0) {
      console.log(
        `[backfill] WARNING — ${unmatched.length} allowlisted id(s) matched no NULL-coordinate facility in this org ` +
        `(wrong org, wrong id, or already populated):`
      );
      unmatched.forEach((id) => console.log(`  ! ${id}`));
    } else {
      console.log(`[backfill] allowlist fully matched: ${rows.length}/${ids.length}`);
    }
  }
  console.log('');
  console.log(
    pad('id', 38) + '| ' +
    pad('name', 30) + '| ' +
    pad('address submitted', 70) + '| ' +
    pad('latitude', 12) + '| ' +
    pad('longitude', 12) + '| ' +
    pad('confidence', 40) + '| ' +
    pad('bbox', 9) + '| ' +
    'status'
  );

  let okCount = 0;
  let cityCentroidCount = 0;
  let skippedNullCount = 0;
  let skippedNoAddressCount = 0;
  let bboxPassCount = 0;
  let bboxFailCount = 0;
  let bboxUnknownCount = 0;
  let isFirstGeocodeCall = true;

  for (const row of rows) {
    const { fullAddress, hasStreetAddress } = buildAddress(row);

    if (fullAddress === null) {
      skippedNoAddressCount++;
      printRow(
        row,
        '(no address data — address_line1/2, city, state, zip all null/blank)',
        '-',
        '-',
        '-',
        'SKIPPED (no address data)'
      );
      // No geocoder call, no throttle slot consumed.
      continue;
    }

    if (!isFirstGeocodeCall) {
      await sleep(THROTTLE_MS);
    }
    isFirstGeocodeCall = false;

    const hit = await geocodeAddress(fullAddress);

    if (hit === null) {
      skippedNullCount++;
      printRow(row, fullAddress, '-', '-', '-', 'SKIPPED (geocoder returned null)');
      continue;
    }

    const bbox = bboxCheck(row.state, hit.lat, hit.lng);
    if (bbox === 'PASS') bboxPassCount++;
    else if (bbox === 'FAIL') bboxFailCount++;
    else bboxUnknownCount++;

    okCount++;
    let status = 'OK';
    if (!hasStreetAddress) {
      cityCentroidCount++;
      status = 'OK (CITY-CENTROID — no street address on file, not premises-level)';
    }

    printRow(row, fullAddress, String(hit.lat), String(hit.lng), bbox, status);

    if (apply) {
      // Normal Prisma update() — CarrierFacility declares
      // `updatedAt DateTime @updatedAt`, so Prisma stamps `updated_at`
      // automatically on this call. That stamp is PERMITTED and EXPECTED
      // (amended constraint); raw SQL is deliberately NOT used to dodge it.
      // This writes latitude, longitude, and the automatic updatedAt stamp
      // only — no other column.
      const before = await prisma.carrierFacility.findUniqueOrThrow({
        where: { id: row.id },
        select: { updatedAt: true },
      });
      console.log(`  [apply] ${row.id} updated_at before: ${before.updatedAt.toISOString()}`);

      const updated = await prisma.carrierFacility.update({
        where: { id: row.id },
        data: { latitude: hit.lat, longitude: hit.lng },
      });
      console.log(`  [apply] ${row.id} updated_at after:  ${updated.updatedAt.toISOString()}`);
      console.log(`  [apply] wrote latitude/longitude for ${row.id}`);
    }
  }

  console.log('');
  console.log(
    `[backfill] summary: found=${rows.length} ok=${okCount} (city-centroid=${cityCentroidCount}) ` +
    `skipped-null=${skippedNullCount} skipped-no-address=${skippedNoAddressCount}`
  );
  console.log(
    `[backfill] bbox check: PASS=${bboxPassCount} FAIL=${bboxFailCount} UNKNOWN=${bboxUnknownCount}`
  );

  if (apply) {
    console.log(`[backfill] APPLY COMPLETE — ${okCount} rows written, 0 partial/fallback writes`);
  } else {
    console.log('DRY RUN COMPLETE — 0 rows written');
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
