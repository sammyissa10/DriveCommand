import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * quick-586 — a source-scanning guard over every bare-`prisma` access path to
 * `stops` / `route_template_stops` / `carrier_documents` that was converted
 * onto a tenant-scoped Prisma client (`getTenantPrisma()` or
 * `getTenantPrismaForOrg()`).
 *
 * Follows the quick-546/549/562 rules for this class of test:
 *   - CRLF is normalised before any pattern match (this repo is
 *     core.autocrlf=true with no .gitattributes, so a scan anchored on `\n`
 *     that skips this passes vacuously on an unmodified Windows checkout).
 *   - Every site carries a per-file byte-length floor (its own real size,
 *     rounded down), not one blanket constant — a legitimate short file can
 *     be a few hundred bytes.
 *   - Every `mustContain` pattern is asserted to have actually matched — the
 *     "was it actually found" assertion — not just implied by the file not
 *     throwing.
 *   - `SITES.length` is asserted so deleting a row shrinks coverage loudly
 *     rather than silently.
 *   - One counter-assertion (a `bypass_rls` string is still present in real,
 *     unmodified content) proves the scan is reading real files, not an
 *     empty string a bad path would also "pass" against.
 *
 * `mustNotContain` for `\bprisma\.\$transaction\(` is applied ONLY to files
 * where SITE-AUDIT.md confirmed no other transaction legitimately remains on
 * the bare client. It is NOT applied to the four files that still carry
 * additional, out-of-scope bare-prisma transactions (fleetMessage/user
 * lookups untouched by this task) — see SITE-AUDIT.md §5. A permanently red
 * guard is a guard everyone learns to ignore.
 */

const WEB_ROOT = path.resolve(__dirname, '..', '..');

function readSite(relPath: string): string {
  const abs = path.join(WEB_ROOT, relPath);
  return readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
}

interface Site {
  id: string;
  path: string;
  minBytes: number;
  mustContain: RegExp[];
  mustNotContain: RegExp[];
}

// ---------------------------------------------------------------------------
// Group 1 — request context, getTenantPrisma()
// ---------------------------------------------------------------------------

const GROUP_1_2_SITES: Site[] = [
  {
    id: 'site-1-driver-routes',
    path: 'src/app/(driver)/actions/driver-routes.ts',
    minBytes: 8000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*const owned = await tenantPrisma\.\$transaction/g,
    ],
    mustNotContain: [
      // Both carrierStop-bearing transactions (arriveAtStop, completeCurrentStop)
      // must be on tenantPrisma. Scoped tightly to the two converted blocks
      // (matched by their trailing `tx.carrierStop.findFirst`) rather than a
      // blanket `prisma.$transaction` ban, because `startTrip` in this SAME
      // file legitimately still opens `const owned = await prisma.$transaction`
      // for a carrierDriver+trip-only check that never reaches CarrierStop —
      // out of scope (SITE-AUDIT.md §4/§7) and must stay untouched. The two
      // earlier transactions (getMyActiveDispatch, getMyDispatchHistory) are
      // also out of scope for the same reason (nested-include only).
      /const owned = await prisma\.\$transaction\(async \(tx\) => \{\s*\n\s*await tx\.\$executeRaw`SELECT set_config\('app\.bypass_rls', 'on', TRUE\)`;\s*\n\s*\n\s*const carrierDriver = await tx\.carrierDriver\.findFirst\(\{\s*\n\s*where: \{ userId: session\.userId, orgId: session\.tenantId \},\s*\n\s*\}\);\s*\n\s*if \(!carrierDriver\) return false;\s*\n\s*\n\s*const stop = await tx\.carrierStop\.findFirst/,
    ],
  },
  {
    id: 'site-2-loads-detail-page',
    path: 'src/app/(owner)/carrier/loads/[id]/page.tsx',
    minBytes: 5000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);/,
      /tenantPrisma\.carrierStop\.findMany\(/,
      /tenantPrisma\.carrierStop\.count\(/,
    ],
    mustNotContain: [/\bprisma\.carrierStop\b/],
  },
  {
    id: 'site-3-stops-detail-page',
    path: 'src/app/(owner)/carrier/stops/[id]/page.tsx',
    minBytes: 5000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);/,
      /tenantPrisma\.carrierStop\.findUnique\(/,
    ],
    mustNotContain: [
      // Only the standalone findUnique is converted. The NEEDS-DECISION
      // transaction (CarrierDocument + User, SITE-AUDIT.md §5) must remain on
      // the bare client — asserted as a POSITIVE below, not just omitted.
    ],
  },
  {
    id: 'site-3b-needs-decision-untouched',
    path: 'src/app/(owner)/carrier/stops/[id]/page.tsx',
    minBytes: 5000,
    mustContain: [
      // The NEEDS-DECISION transaction (carrierDocument + user) is still on
      // the bare prisma client — this is the counter-assertion that Task 2/3
      // did NOT convert it.
      /const documents = await prisma\.\$transaction\(async \(tx\) => \{/,
    ],
    mustNotContain: [],
  },
  {
    id: 'site-4-trips-detail-page',
    path: 'src/app/(owner)/carrier/trips/[id]/page.tsx',
    minBytes: 6000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);/,
      /tenantPrisma\.routeTemplateStop\.findMany\(/,
      /tenantPrisma\.carrierDocument\.groupBy\(/,
    ],
    mustNotContain: [/\bprisma\.routeTemplateStop\b/, /\bprisma\.carrierDocument\b/],
  },
  {
    id: 'site-5-trips-stops-page',
    path: 'src/app/(owner)/carrier/trips/[id]/stops/page.tsx',
    minBytes: 3000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);/,
      /tenantPrisma\.carrierDocument\.groupBy\(/,
    ],
    mustNotContain: [/\bprisma\.carrierDocument\b/],
  },
  {
    id: 'site-6-driver-stop-documents-route',
    path: 'src/app/api/driver/stops/[stopId]/documents/route.ts',
    minBytes: 6000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);/g,
      /tenantPrisma\.\$transaction\(async \(tx\) => \{/g,
    ],
    mustNotContain: [/\bprisma\.\$transaction\(/, /\bprisma,\s*TX_OPTIONS\b/],
  },
  {
    id: 'site-7-driver-stop-messages-route',
    path: 'src/app/api/driver/stops/[stopId]/messages/route.ts',
    minBytes: 6000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*const result = await tenantPrisma\.\$transaction/,
      /const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*const context = await tenantPrisma\.\$transaction/,
    ],
    mustNotContain: [
      // The other three transactions in this file (fleetMessage/user lookups)
      // are out of scope and legitimately remain on the bare client, so no
      // blanket ban here either.
      /const result = await prisma\.\$transaction/,
      /const context = await prisma\.\$transaction/,
    ],
  },
  {
    id: 'site-8-mobile-expenses-route',
    path: 'src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts',
    minBytes: 3000,
    mustContain: [
      /import \{ getTenantPrismaForOrg \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrismaForOrg\(auth\.tenantId, auth\.userId\);/,
      /tenantPrisma\.\$transaction\(async \(tx\) => \{/,
    ],
    mustNotContain: [/\bprisma\.\$transaction\(/, /\bprisma,\s*TX_OPTIONS\b/],
  },
  {
    id: 'site-9-mobile-stop-documents-route',
    path: 'src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts',
    minBytes: 4000,
    mustContain: [
      /import \{ getTenantPrismaForOrg \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrismaForOrg\(auth\.tenantId, auth\.userId\);/,
      /tenantPrisma\.\$transaction\(async \(tx\) => \{/g,
    ],
    mustNotContain: [/\bprisma\.\$transaction\(/, /\bprisma,\s*TX_OPTIONS\b/],
  },
  {
    id: 'site-10-v1-stop-messages-route',
    path: 'src/app/api/v1/carrier/stops/[id]/messages/route.ts',
    minBytes: 5000,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*const stop = await tenantPrisma\.\$transaction/,
      /const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*const stopData = await tenantPrisma\.\$transaction/,
    ],
    mustNotContain: [
      /const stop = await prisma\.\$transaction/,
      /const stopData = await prisma\.\$transaction/,
    ],
  },
];

// ---------------------------------------------------------------------------
// Group 3 — sites 11-14, added in the second commit (Task 3), independently
// revertible from the Group 1/2 commit because both the code conversion and
// these rows land in the same commit.
// ---------------------------------------------------------------------------

const GROUP_3_SITES: Site[] = [
  {
    id: 'site-11-driver-dashboard',
    path: 'src/app/(driver)/actions/driver-dashboard.ts',
    minBytes: 4000,
    mustContain: [
      /const tenantPrisma = await getTenantPrisma\(\);/,
      /\? tenantPrisma\.\$transaction\(async \(tx\) => \{/,
      /tx\.carrierStop\.count\(/,
    ],
    mustNotContain: [
      // Only the carrierStop-bearing branch is converted. The carrierDriver-only
      // transaction above it (`const carrierDriver = await prisma.$transaction`)
      // stays on the bare client (out of scope, SITE-AUDIT.md §4/§7) — no
      // blanket `prisma.$transaction` ban in this file.
      /\? prisma\.\$transaction\(async \(tx\) => \{\s*\n\s*await tx\.\$executeRaw`SELECT set_config\('app\.bypass_rls', 'on', TRUE\)`;\s*\n\s*\n\s*const activeDispatch/,
    ],
  },
  {
    id: 'site-12-trips-reorder',
    path: 'src/lib/carrier/trips.ts',
    minBytes: 20000,
    mustContain: [
      /await tenantPrisma\.\$transaction\(\s*\n\s*stopOrder\.map/,
      /tenantPrisma\.carrierStop\.update\(/,
    ],
    mustNotContain: [
      /await prisma\.\$transaction\(\s*\n\s*stopOrder\.map/,
      /\n\s*prisma\.carrierStop\.update\(/,
    ],
  },
  {
    id: 'site-13-dispatch-generator',
    path: 'src/lib/carrier/dispatch-generator.ts',
    minBytes: 10000,
    mustContain: [
      /const \{ newDispatch, loadCreated, stopsCreatedCount \} = await tenantPrisma\.\$transaction\(async \(tx\) => \{/,
      /tx\.carrierStop\.create\(/,
    ],
    mustNotContain: [
      /const \{ newDispatch, loadCreated, stopsCreatedCount \} = await prisma\.\$transaction\(async \(tx\) => \{/,
      // The bare `prisma` import itself must be gone — it became genuinely
      // unused once this was the only remaining usage (SITE-AUDIT.md §4).
      /^import \{ prisma \} from '@\/lib\/db\/prisma';$/m,
    ],
  },
  {
    id: 'site-14-route-template-save',
    path: 'src/lib/carrier/route-template-save.ts',
    minBytes: 10000,
    mustContain: [
      /const notFound = await db\.\$transaction\(async \(tx\) => \{/,
      /const result = await db\.\$transaction\(async \(tx\) => \{/,
      /tx\.routeTemplateStop\.deleteMany\(/,
      /tx\.routeTemplateStop\.create\(/,
      /tx\.routeTemplateStop\.createMany\(/,
    ],
    mustNotContain: [
      /const notFound = await prisma\.\$transaction/,
      /const result = await prisma\.\$transaction/,
      // The bare `prisma` import became genuinely unused once both tx roots
      // moved to `db` — must be gone, not merely unreferenced.
      /^import \{ prisma \} from '@\/lib\/db\/prisma';/m,
    ],
  },
];

const SITES: Site[] = [...GROUP_1_2_SITES, ...GROUP_3_SITES];

// ---------------------------------------------------------------------------
// Integrity floor
// ---------------------------------------------------------------------------

describe('tenant-client-stop-access guard — integrity floor', () => {
  it('SITES enumerates exactly 15 entries (10 Group 1/2 conversion sites + the NEEDS-DECISION counter-assertion + 4 Group 3 sites)', () => {
    expect(SITES.length).toBe(15);
  });

  it('every site source is over its own per-file byte floor (a bad path would return a tiny/empty read)', () => {
    for (const site of SITES) {
      const source = readSite(site.path);
      expect(source.length, `${site.id} (${site.path}) unexpectedly short`).toBeGreaterThan(
        site.minBytes
      );
    }
  });

  it('at least one converted file still contains a real set_config(\'app.bypass_rls\' statement — proves the scan reads real, unmodified content', () => {
    const source = readSite(GROUP_1_2_SITES[0].path);
    expect(source).toMatch(/set_config\('app\.bypass_rls', 'on', TRUE\)/);
  });
});

// ---------------------------------------------------------------------------
// Per-site assertions
// ---------------------------------------------------------------------------

describe('tenant-client-stop-access guard — per-site conversion', () => {
  for (const site of SITES) {
    describe(site.id, () => {
      const source = readSite(site.path);

      for (const pattern of site.mustContain) {
        it(`mustContain: ${pattern}`, () => {
          expect(source).toMatch(pattern);
        });
      }

      for (const pattern of site.mustNotContain) {
        it(`mustNotContain: ${pattern}`, () => {
          expect(source).not.toMatch(pattern);
        });
      }
    });
  }
});
