/**
 * quick-588 — fail-closed carrier access path conversion guard.
 *
 * WHAT THIS PINS
 * --------------
 * `docs/diagnostics/rls-policy-design.md` §6b named ten access paths that
 * would fail closed (return zero rows) the moment the drafted RLS policies
 * on `stops`, `route_template_stops` and `carrier_documents` go live,
 * because each ran on the bare `prisma` singleton with no
 * `app.current_tenant_id` set and no `bypass_rls_policy` on those three
 * tables to fall back on.
 *
 * DIVERGENCE (reported, not silently absorbed): the diagnostic's own title
 * says "10, in 5 files" and its table lists exactly ten rows — but its
 * closing §7 sentence says "the ten fail-closed sites in §6b plus the one
 * in §3", double-counting row #10 (`stops/[id]/page.tsx:121`), which IS the
 * §3 site. The real count is ten, not eleven. Those ten collapse into SIX
 * transaction roots (A-E straightforward, F split) because the client swap
 * happens at the `$transaction` receiver, not at each nested `stops:` /
 * `documents:` key.
 *
 * THE SIX ROOTS
 * -------------
 *   A. driver-routes.ts  getMyActiveDispatch   -> tenantPrisma.$transaction
 *   B. driver-routes.ts  getMyDispatchHistory  -> tenantPrisma.$transaction
 *   C. driver-load.ts    getMyLoads            -> tenantPrisma.$transaction
 *   D. dispatches/route.ts        GET          -> tenantPrisma.$transaction
 *                                                  (getTenantPrismaForOrg)
 *   E. dispatches/[id]/route.ts   GET          -> tenantPrisma.$transaction
 *                                                  (getTenantPrismaForOrg)
 *   F. stops/[id]/page.tsx  documents block    -> SPLIT: carrierDocument on
 *      tenantPrisma (no flag, CarrierDocument is EXEMPT_MODELS), User stays
 *      on the bare `prisma` client in its own flagged `prisma.$transaction`
 *      (User is NOT exempt — a tenant client would newly inject a tenantId
 *      filter it has no column for).
 *
 * driver-routes.ts's THIRD transaction (`startTrip`'s ownership check) is
 * deliberately OUT OF SCOPE — it reaches only CarrierDriver/Trip, never
 * CarrierStop/CarrierDocument, and stays on the bare client with its flag.
 * This guard pins that it is UNCHANGED, not merely absent from the "must
 * convert" list — a later "finish the job" edit converting it would not be
 * wrong on safety grounds, but it would silently invalidate this guard's own
 * evidence that the six roots above are independently, individually correct
 * (see the D/E argument-shape assertion below).
 *
 * CONVENTIONS (quick-546/549/562/565/567)
 * ----------------------------------------
 *   - CRLF normalised before any match — core.autocrlf=true, no
 *     .gitattributes, so an unnormalised scan passes vacuously here.
 *   - Per-file byte floor (each file's own real size, rounded down) — a
 *     blanket floor fails on driver-load.ts, which is genuinely ~2.8 KB.
 *   - Every `mustContain` has a "was it actually found" assertion.
 *   - Site count is asserted so deleting a row fails loudly.
 *   - A counter-assertion (driver-routes.ts's retained startTrip flag) that
 *     the scan reads real, unmodified content.
 *
 * Anti-vacuity: every assertion below was driven RED by hand-reverting the
 * corresponding conversion and capturing the failure, then restored by
 * hand-edit (never `git checkout --`, which would revert the whole file).
 * See 588-SUMMARY.md for the captured output.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

function read(rel: string): string {
  const src = readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
  if (src.length === 0) throw new Error(`empty read: ${rel}`);
  return src;
}

interface Root {
  id: string;
  path: string;
  minBytes: number;
  mustContain: RegExp[];
  mustNotContain: RegExp[];
}

const ROOTS: Root[] = [
  {
    id: 'A-getMyActiveDispatch',
    path: 'app/(driver)/actions/driver-routes.ts',
    minBytes: 12000,
    mustContain: [
      /export async function getMyActiveDispatch\(\)[\s\S]*?const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*\n\s*return tenantPrisma\.\$transaction\(async \(tx\) => \{/,
    ],
    mustNotContain: [
      // The specific offending shape: this function's transaction back on
      // the bare client with its bypass flag restored.
      /export async function getMyActiveDispatch\(\)[\s\S]*?return prisma\.\$transaction\(async \(tx\) => \{\s*\n\s*await tx\.\$executeRaw`SELECT set_config\('app\.bypass_rls'/,
    ],
  },
  {
    id: 'B-getMyDispatchHistory',
    path: 'app/(driver)/actions/driver-routes.ts',
    minBytes: 12000,
    mustContain: [
      /export async function getMyDispatchHistory\(\)[\s\S]*?const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*\n\s*return tenantPrisma\.\$transaction\(async \(tx\) => \{/,
    ],
    mustNotContain: [
      /export async function getMyDispatchHistory\(\)[\s\S]*?return prisma\.\$transaction\(async \(tx\) => \{\s*\n\s*await tx\.\$executeRaw`SELECT set_config\('app\.bypass_rls'/,
    ],
  },
  {
    id: 'startTrip-out-of-scope-untouched',
    path: 'app/(driver)/actions/driver-routes.ts',
    minBytes: 12000,
    mustContain: [
      // Counter-assertion: startTrip's ownership check is UNCHANGED — still
      // the bare client, still flagged. Proves the scan reads real content
      // and that this task did not "finish the job" on an out-of-scope tx.
      /const owned = await prisma\.\$transaction\(async \(tx\) => \{\s*\n\s*await tx\.\$executeRaw`SELECT set_config\('app\.bypass_rls', 'on', TRUE\)`;\s*\n\s*\n\s*const carrierDriver = await tx\.carrierDriver\.findFirst\(\{\s*\n\s*where: \{ userId: session\.userId, orgId: session\.tenantId \},\s*\n\s*\}\);\s*\n\s*if \(!carrierDriver\) return false;\s*\n\s*\n\s*const dispatch = await tx\.trip\.findFirst/,
    ],
    mustNotContain: [],
  },
  {
    id: 'C-getMyLoads',
    path: 'app/(driver)/actions/driver-load.ts',
    minBytes: 2500,
    mustContain: [
      /import \{ getTenantPrisma \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrisma\(\);\s*\n\s*\n\s*return tenantPrisma\.\$transaction\(async \(tx\) => \{/,
    ],
    mustNotContain: [
      // No bare `prisma.` usage should remain in this file at all — its
      // only transaction was the one converted.
      /\bprisma\.\$transaction\(/,
      /set_config\('app\.bypass_rls'/,
    ],
  },
  {
    id: 'D-dispatches-list',
    path: 'app/api/mobile/carrier/driver/dispatches/route.ts',
    minBytes: 4000,
    mustContain: [
      /import \{ getTenantPrismaForOrg \} from '@\/lib\/context\/tenant-context';/,
      // Exact argument form — so a later edit to getTenantPrisma() (which
      // throws on /api/mobile/* per DEC-11, no x-tenant-id header) fails
      // this assertion rather than silently swapping in a throwing call.
      /const tenantPrisma = await getTenantPrismaForOrg\(auth\.tenantId, auth\.userId\);\s*\n\s*const dispatches = await tenantPrisma\.\$transaction\(async \(tx\) => \{/,
    ],
    mustNotContain: [
      /\bprisma\.\$transaction\(/,
      /set_config\('app\.bypass_rls'/,
      // The bare, header-reading call — matched with a trailing `;` so this
      // does not also trip on the doc comment above mentioning it in prose.
      /getTenantPrisma\(\);/,
    ],
  },
  {
    id: 'E-dispatch-detail',
    path: 'app/api/mobile/carrier/driver/dispatches/[id]/route.ts',
    minBytes: 6500,
    mustContain: [
      /import \{ getTenantPrismaForOrg \} from '@\/lib\/context\/tenant-context';/,
      /const tenantPrisma = await getTenantPrismaForOrg\(auth\.tenantId, auth\.userId\);\s*\n\s*const result = await tenantPrisma\.\$transaction\(async \(tx\) => \{/,
    ],
    mustNotContain: [
      /\bprisma\.\$transaction\(/,
      /set_config\('app\.bypass_rls'/,
      /getTenantPrisma\(\);/,
    ],
  },
  {
    id: 'F-stop-documents-split',
    path: 'app/(owner)/carrier/stops/[id]/page.tsx',
    minBytes: 14000,
    mustContain: [
      // Tenant half: carrierDocument, no flag.
      /const docs = await tenantPrisma\.carrierDocument\.findMany\(\{/,
      // Bare half: user, still flagged, still its own transaction wrapper
      // (set_config(..., TRUE) is transaction-local — a bare
      // prisma.user.findMany outside a transaction would not carry it).
      /const users = await prisma\.\$transaction\(async \(tx\) => \{\s*\n\s*await tx\.\$executeRaw`SELECT set_config\('app\.bypass_rls', 'on', TRUE\)`;\s*\n\s*return tx\.user\.findMany\(/,
    ],
    mustNotContain: [
      // The old single-transaction shape (both halves on one bare client)
      // must never come back — that is precisely what made this site
      // fail-closed on carrierDocument while also being unsafe to swap
      // whole (User is not exempt).
      /const documents = await prisma\.\$transaction\(async \(tx\) => \{/,
    ],
  },
];

describe('quick-588 — fail-closed carrier access path conversion guard', () => {
  it('covers exactly the six transaction roots (integrity floor)', () => {
    expect(ROOTS.length).toBe(7); // 6 roots + the startTrip counter-assertion
  });

  describe.each(ROOTS)('$id ($path)', (root) => {
    it('is readable and non-trivial', () => {
      const src = read(root.path);
      expect(src.length).toBeGreaterThan(root.minBytes);
    });

    for (const pattern of root.mustContain) {
      it(`mustContain: ${pattern}`, () => {
        const src = read(root.path);
        expect(src).toMatch(pattern);
      });
    }

    for (const pattern of root.mustNotContain) {
      it(`mustNotContain: ${pattern}`, () => {
        const src = read(root.path);
        expect(src).not.toMatch(pattern);
      });
    }
  });

  it('per-file flag counts match the measured post-conversion values', () => {
    const expected: Record<string, number> = {
      'app/(driver)/actions/driver-routes.ts': 1, // startTrip only
      'app/(driver)/actions/driver-load.ts': 0,
      'app/api/mobile/carrier/driver/dispatches/route.ts': 0,
      'app/api/mobile/carrier/driver/dispatches/[id]/route.ts': 0,
      'app/(owner)/carrier/stops/[id]/page.tsx': 3, // dispatch@90, load@109, user (split)
    };
    for (const [rel, count] of Object.entries(expected)) {
      const src = read(rel);
      const found = src.split("set_config('app.bypass_rls'").length - 1;
      expect(found, `${rel}: expected ${count} flag(s), found ${found}`).toBe(count);
    }
  });

  it('no query shape marker (where/select/orderBy) was disturbed on the converted roots', () => {
    // Spot-check a handful of literal fragments that must survive verbatim —
    // not a full re-derivation of every query, just evidence the swap was
    // receiver-only rather than a query rewrite.
    const driverRoutes = read('app/(driver)/actions/driver-routes.ts');
    expect(driverRoutes).toMatch(/orderBy: \{ sequenceOrder: 'asc' as const \}/);
    expect(driverRoutes).toMatch(/status: 'in_progress',/);
    expect(driverRoutes).toMatch(/status: 'planned',/);

    const driverLoad = read('app/(driver)/actions/driver-load.ts');
    expect(driverLoad).toMatch(/status: \{ in: \['planned', 'in_progress'\] \},/);
    expect(driverLoad).toMatch(/orderBy: \{ createdAt: 'asc' \},/);

    const dispatchesList = read('app/api/mobile/carrier/driver/dispatches/route.ts');
    expect(dispatchesList).toMatch(/orderBy: \{ scheduledDeparture: 'asc' \},/);
    expect(dispatchesList).toMatch(/documents: \{ select: \{ id: true, documentType: true \} \},/);

    const dispatchDetail = read('app/api/mobile/carrier/driver/dispatches/[id]/route.ts');
    expect(dispatchDetail).toMatch(/where: \{ driverId: carrierDriver\.id \},/);

    const stopPage = read('app/(owner)/carrier/stops/[id]/page.tsx');
    expect(stopPage).toMatch(/orderBy: \{ createdAt: 'desc' \},/);
    expect(stopPage).toMatch(/fileSizeBytes: true,/);
  });
});
