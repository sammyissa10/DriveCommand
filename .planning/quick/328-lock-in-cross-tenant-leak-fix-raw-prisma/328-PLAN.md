---
phase: quick-328
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/raw-prisma-usage.ts
  - apps/web/package.json
  - apps/web/tests/isolation/dropdowns.test.ts
  - apps/web/tests/isolation/setup.ts
  - docs/audits/raw-prisma-usage.md
  - docs/runbooks/db-standardization-migration.md
  - .github/workflows/ci.yml
autonomous: true

must_haves:
  truths:
    - "`npm run audit:raw-prisma` runs from apps/web/ and writes docs/audits/raw-prisma-usage.md"
    - "Audit exits non-zero (1) when any LEAK_RISK usage exists, exits 0 when none"
    - "Audit correctly classifies usage as INTENTIONAL_ALLOWED (migrations, isolation tests, reporting/analytics with requireTenantContext, lib/db/* infrastructure) vs LEAK_RISK"
    - "Five dropdown tests pass: 3 rows in tenant A, 3 in tenant B, tenant A query returns exactly 3 rows with tenantId/orgId == A"
    - "All 17 existing isolation tests still pass"
    - "`tsc --noEmit` passes from apps/web/"
    - "CI job runs audit:raw-prisma and blocks merge on LEAK_RISK"
  artifacts:
    - path: "apps/web/scripts/audit/raw-prisma-usage.ts"
      provides: "Static scanner — scans apps/web/src/ and packages/*/src/ for raw Prisma patterns, classifies, writes report, exits non-zero on LEAK_RISK"
    - path: "docs/audits/raw-prisma-usage.md"
      provides: "Human-readable audit report grouped by classification with file:line locations"
    - path: "apps/web/tests/isolation/dropdowns.test.ts"
      provides: "Five Vitest tests (loads, carrier drivers, clients, facilities, trucks) per spec Section 6.3"
    - path: "apps/web/package.json"
      contains: "audit:raw-prisma"
  key_links:
    - from: "apps/web/scripts/audit/raw-prisma-usage.ts"
      to: "process.exit(1) on LEAK_RISK"
      via: "CI npm run audit:raw-prisma"
      pattern: "process\\.exit"
    - from: "apps/web/tests/isolation/dropdowns.test.ts"
      to: "createTenantClient(tenantAId)"
      via: "tenant-scoped Prisma client"
      pattern: "createTenantClient|withTenantRLS"
    - from: "apps/web/tests/isolation/setup.ts"
      to: "bypass_rls seed helpers for Load/Truck/CarrierDriver/CarrierClient/CarrierFacility"
      via: "$transaction with set_config('app.bypass_rls','on',TRUE)"
      pattern: "set_config.*bypass_rls"
---

<objective>
Lock in the cross-tenant leak fix from commit 1e9cd9a (quick-327) by adding:
(1) a static audit script that catches any future raw-Prisma usage that would bypass the tenant-scoped client
(2) five regression tests proving the dropdown-leak class of bugs cannot recur on the high-risk tables
(3) a CI gate so the audit blocks merges
(4) a doc cross-reference in the migration runbook

Purpose: prevent regression. The leak existed because feature code called `prisma.*` directly instead of `getTenantPrisma()` / a `TenantRepository` subclass. RLS now blocks data at the DB, but the app-layer guarantee is restored only if no `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, or `new PrismaClient(` shows up in feature code. Spec sections 2.5, 2.6, 3, 6.3.

Output: scanner + npm script + 5 tests + CI hook + runbook note.

Constraints (re-stated from task):
- Do NOT change response shapes
- Do NOT introduce new abstractions
- Reuse `getTenantPrisma()` and `TenantRepository` patterns (the existing class — name is `TenantRepository` not `BaseRepository`; the file is `base.repository.ts`)
- High-risk dropdown tables span both naming conventions: Load + Truck use `tenantId` (camelCase), while CarrierDriver + CarrierClient + CarrierFacility use `org_id` (mapped from `orgId`)
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
# Spec (read these sections first)
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md

# Existing infrastructure to reuse — do not reinvent
@apps/web/src/lib/db/prisma.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/lib/db/repositories/base.repository.ts
@apps/web/src/lib/context/tenant-context.ts

# Existing isolation test harness — extend, do not rewrite
@apps/web/tests/isolation/setup.ts
@apps/web/tests/isolation/cross-tenant.test.ts

# Existing audit script — match style (tsx, env-file, writes markdown to docs/audits/)
@apps/web/scripts/audit/db-tenant-audit.ts

# Package + CI to extend
@apps/web/package.json
@apps/web/vitest.config.ts
@.github/workflows/ci.yml

# Runbook to amend
@docs/runbooks/db-standardization-migration.md

# Schema reference for the five dropdown tables
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build raw-Prisma usage scanner + npm script + CI hook + runbook note</name>
  <files>
    apps/web/scripts/audit/raw-prisma-usage.ts
    apps/web/package.json
    .github/workflows/ci.yml
    docs/runbooks/db-standardization-migration.md
    docs/audits/raw-prisma-usage.md
  </files>
  <action>
Create a static TypeScript scanner that finds and classifies raw Prisma usage. No DB connection — pure file walk + regex.

**1. Create `apps/web/scripts/audit/raw-prisma-usage.ts`:**

Style: match `apps/web/scripts/audit/db-tenant-audit.ts` (tsx, file header comment, markdown report writer).

Logic:
- Walk these roots (relative to repo root, but script runs from `apps/web/`):
  - `apps/web/src/`
  - `packages/types/src/`
  - `packages/validation/src/`
  - `packages/api-client/src/`
- Include `.ts` and `.tsx` files. Exclude:
  - Anything under `apps/web/src/generated/` (Prisma client output)
  - Anything under `node_modules/`, `.next/`, `dist/`, `build/`
  - Test files (`*.test.ts`, `*.test.tsx`, `__tests__/`) — they are not feature code; the isolation tests legitimately use raw $executeRaw with bypass_rls
- For each file, scan line-by-line for these patterns (use simple substring/regex, not full AST — this is a heuristic gate, not a compiler):
  - `prisma.` (the lowercase Prisma singleton) — `\bprisma\.[a-zA-Z_$]`
  - `$queryRaw` — `\$queryRaw\b`
  - `$executeRaw` — `\$executeRaw\b`
  - `$queryRawUnsafe` — `\$queryRawUnsafe\b`
  - `$executeRawUnsafe` — `\$executeRawUnsafe\b`
  - `new PrismaClient(` — `new\s+PrismaClient\s*\(`

For each hit, record `{ file, line, lineText, pattern }`.

Classification (apply in order — first match wins):

INTENTIONAL_ALLOWED if file path matches any of:
- `apps/web/src/lib/db/prisma.ts` (the singleton itself)
- `apps/web/src/lib/db/tenant-client.ts` (the tenant-client wrapper)
- `apps/web/src/lib/db/extensions/tenant-rls.ts` (the RLS extension)
- `apps/web/src/lib/db/repositories/base.repository.ts` (the base repo)
- `apps/web/src/lib/context/tenant-context.ts` (defines `tenantRawQuery` which legitimately uses `prisma.$transaction` + `tx.$executeRaw` for set_config; also defines getTenantPrisma)
- Anything under `apps/web/prisma/` (migrations + seed)
- `apps/web/scripts/` (audit + maintenance scripts — they connect with their own client)
- `apps/web/scripts/migrate.mjs` (start hook)
- Reporting/analytics: files under `apps/web/src/lib/reports/` OR `apps/web/src/lib/analytics/` OR `apps/web/src/app/api/reports/` IF the file also contains the string `requireTenantContext` or `requireTenantId` (spec Section 2.6 allows raw SQL only when tenant context is explicitly required first)

LEAK_RISK otherwise.

Output:
- Write report to `docs/audits/raw-prisma-usage.md` (path relative to repo root — same convention as `db-tenant-audit.ts` which writes to `docs/audits/db-tenant-audit.md`; resolve via `path.resolve(__dirname, '../../../../docs/audits/raw-prisma-usage.md')`).
- Report structure:
  ```markdown
  # Raw Prisma Usage Audit

  **Generated:** <ISO timestamp>
  **Scanned:** apps/web/src, packages/*/src
  **Spec reference:** docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md §2.6

  ## Summary
  | Classification | Count |
  |---|---|
  | INTENTIONAL_ALLOWED | N |
  | LEAK_RISK | N |
  | **Total** | N |

  ## LEAK_RISK (must fix — bypasses tenant-scoped client)
  <table: File | Line | Pattern | Code | Reason>
  *(or "None — audit passes")*

  ## INTENTIONAL_ALLOWED (infrastructure / migrations / reporting with requireTenantContext)
  <grouped by file, line list per file>
  ```
- Print one-line console summary at the end: `Raw Prisma audit: X LEAK_RISK, Y INTENTIONAL_ALLOWED — report at docs/audits/raw-prisma-usage.md`.
- `process.exit(1)` if any LEAK_RISK exists, `process.exit(0)` otherwise.

Implementation notes:
- Use `fs.readdirSync(..., { withFileTypes: true, recursive: true })` (Node 20 supports recursive). Or implement a small recursive walker.
- Normalize paths to forward slashes for stable cross-platform output.
- Skip binary/lockfiles — only `.ts` and `.tsx`.
- Match comments? Yes — false positives in comments are fine and easy to fix (just rephrase). Do not try to strip comments.
- Pre-existing usage of `prisma.` inside `apps/web/src/lib/db/repositories/*.repository.ts` (other than `base.repository.ts`) — if any exist that use `prisma.` directly instead of `this.db.`, they ARE leaks. Let the audit flag them. (If the audit shows zero LEAK_RISK on first run, the leak fix from 1e9cd9a is confirmed.)

**2. Add npm script in `apps/web/package.json`:**

In the `scripts` block, add (sorted alphabetically near the other `audit:` / `check:` style entries — place after `check:docs`):
```json
"audit:raw-prisma": "tsx scripts/audit/raw-prisma-usage.ts"
```
No DB env needed (it's a static scan). Do not run with `--env-file=.env.local`.

**3. Hook into CI in `.github/workflows/ci.yml`:**

After the existing `Vitest` step, add a new step (still inside the same `ci` job, `working-directory: apps/web`):
```yaml
- name: Raw Prisma usage audit
  run: npm run audit:raw-prisma
  working-directory: apps/web
```
No DB env needed. The job exits non-zero (and PR is blocked) if the script finds LEAK_RISK.

**4. Append a section to `docs/runbooks/db-standardization-migration.md`:**

Add a new section at the end:
```markdown
## Raw Prisma usage gate (quick-328)

After the standardization migration, any new feature code that calls `prisma.$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, or instantiates `new PrismaClient(` bypasses the tenant-scoped client and reopens the dropdown-leak class of bugs. To prevent regression:

- Static gate: `npm run audit:raw-prisma` (from `apps/web/`) — writes `docs/audits/raw-prisma-usage.md` and exits non-zero on any `LEAK_RISK` finding.
- CI: runs on every PR after Vitest.
- Allowlist: infrastructure files (`lib/db/*`, `lib/context/tenant-context.ts`), migrations, scripts/, and reporting endpoints that explicitly call `requireTenantContext` first. See `scripts/audit/raw-prisma-usage.ts` for the canonical list.
- If a new file legitimately needs raw SQL (reporting/analytics): place it under `src/lib/reports/` or `src/app/api/reports/`, call `requireTenantId()` / `tenantRawQuery()` first, and the audit will classify it as `INTENTIONAL_ALLOWED`. Do not edit the allowlist to whitelist feature code.

Dropdown regression coverage: `apps/web/tests/isolation/dropdowns.test.ts` seeds 3 rows per tenant in Load, Truck, CarrierDriver, CarrierClient, CarrierFacility and asserts the tenant-scoped query returns exactly 3, all belonging to the calling tenant. Spec §6.3.
```

**5. Verify the audit produces a clean report:**

Run `npm run audit:raw-prisma` from `apps/web/`. The script writes `docs/audits/raw-prisma-usage.md` regardless of pass/fail. Commit that file (it's checked-in evidence that the gate works).

If the first run shows LEAK_RISK > 0, STOP and report findings — those are real leaks from quick-327 that the dropdown fix missed. Do NOT silently expand the allowlist.
  </action>
  <verify>
From `apps/web/`:
1. `npm run audit:raw-prisma` runs without crashing.
2. `docs/audits/raw-prisma-usage.md` exists and lists files.
3. Exit code: `echo $LASTEXITCODE` (PowerShell) is `0` if no leaks, `1` if leaks.
4. `cat apps/web/package.json` shows the new `audit:raw-prisma` script.
5. `cat .github/workflows/ci.yml` shows the new audit step.
6. `cat docs/runbooks/db-standardization-migration.md` shows the new section at the end.
  </verify>
  <done>
- `apps/web/scripts/audit/raw-prisma-usage.ts` exists and runs via `npm run audit:raw-prisma`
- `docs/audits/raw-prisma-usage.md` is generated with the documented structure
- Script exits 1 on any LEAK_RISK, 0 otherwise (manually verifiable by temporarily adding a `prisma.user.findMany()` to a non-allowlisted file and re-running)
- `audit:raw-prisma` script registered in `apps/web/package.json`
- CI workflow runs the audit after Vitest
- Runbook has the new "Raw Prisma usage gate" section
  </done>
</task>

<task type="auto">
  <name>Task 2: Add five dropdown isolation tests (Load, Truck, CarrierDriver, CarrierClient, CarrierFacility)</name>
  <files>
    apps/web/tests/isolation/setup.ts
    apps/web/tests/isolation/dropdowns.test.ts
  </files>
  <action>
Add per-spec §6.3 regression tests for the five high-risk dropdown tables. Reuse the existing harness — do not rewrite it.

**1. Extend `apps/web/tests/isolation/setup.ts`:**

Add new exported helpers (alongside the existing `createTestTenant`, `createTestUser`, `cleanupTestData`, `disconnectPrisma`). All helpers follow the existing pattern: `$transaction` wrapping `set_config('app.bypass_rls', 'on', TRUE)` then `create`. Use the existing exported `prisma` variable.

Add these helpers:

```ts
// Load uses tenantId. Required fields: tenantId, loadNumber, customerId, origin, destination, pickupDate, rate.
// We seed a Customer per tenant first (Customer also uses tenantId) so Load FK is satisfied.

export async function createTestCustomer(tenantId: string, companyName: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.customer.create({
      data: { tenantId, companyName },
    });
  });
}

export async function createTestLoad(tenantId: string, customerId: string, loadNumber: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.load.create({
      data: {
        tenantId,
        loadNumber,
        customerId,
        origin: 'Origin City',
        destination: 'Destination City',
        pickupDate: new Date(),
        rate: 1000,
      },
    });
  });
}

export async function createTestTruck(tenantId: string, vin: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.truck.create({
      data: {
        tenantId,
        make: 'TestMake',
        model: 'TestModel',
        year: 2024,
        vin,
        licensePlate: vin.slice(0, 7),
        odometer: 0,
      },
    });
  });
}

// CarrierDriver uses orgId (mapped from org_id). Required fields: orgId, firstName, lastName.
export async function createTestCarrierDriver(tenantId: string, firstName: string, lastName: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.carrierDriver.create({
      data: { orgId: tenantId, firstName, lastName },
    });
  });
}

// CarrierClient uses orgId. Required fields: orgId, name.
export async function createTestCarrierClient(tenantId: string, name: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.carrierClient.create({
      data: { orgId: tenantId, name },
    });
  });
}

// CarrierFacility uses orgId. Required fields: orgId, name.
export async function createTestCarrierFacility(tenantId: string, name: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.carrierFacility.create({
      data: { orgId: tenantId, name },
    });
  });
}
```

Update `cleanupTestData()` to also delete the new test fixtures (using bypass_rls, before tenant delete). Add these deleteMany calls **before** the existing `user.deleteMany` (delete children first, then users, then tenants):

```ts
// Delete in dependency order
await tx.load.deleteMany({ where: { loadNumber: { startsWith: 'TEST-LOAD-' } } });
await tx.truck.deleteMany({ where: { vin: { startsWith: 'TESTVIN' } } });
await tx.carrierDriver.deleteMany({ where: { firstName: 'TestDriver' } });
await tx.carrierClient.deleteMany({ where: { name: { startsWith: 'TestClient ' } } });
await tx.carrierFacility.deleteMany({ where: { name: { startsWith: 'TestFacility ' } } });
await tx.customer.deleteMany({ where: { companyName: { startsWith: 'TestCustomer ' } } });
// then existing user.deleteMany + tenant.deleteMany
```

Keep all other existing setup.ts behavior unchanged. Do NOT remove or rename existing exports.

**2. Create `apps/web/tests/isolation/dropdowns.test.ts`:**

Mirror the structure of `cross-tenant.test.ts` (skip when `DATABASE_URL` is unset, `beforeAll` seeds, `afterAll` cleans up, use `withTenantRLS` via `prisma.$extends`).

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import {
  prisma,
  createTestTenant,
  createTestCustomer,
  createTestLoad,
  createTestTruck,
  createTestCarrierDriver,
  createTestCarrierClient,
  createTestCarrierFacility,
  cleanupTestData,
  disconnectPrisma,
} from './setup';

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

/**
 * Dropdown / list endpoint regression tests (spec §6.3).
 *
 * For each high-risk dropdown table:
 *   1. Seed 3 rows in tenant A, 3 in tenant B.
 *   2. Query as tenant A using the RLS-scoped client.
 *   3. Assert exactly 3 rows returned, all belonging to tenant A.
 *
 * Tables covered: Load (tenantId), Truck (tenantId),
 *                 CarrierDriver / CarrierClient / CarrierFacility (orgId).
 *
 * These tests prove the cross-tenant leak fixed in quick-327 cannot recur.
 */
describeWithDb('Dropdown / list isolation (spec §6.3)', () => {
  let tenantAId: string;
  let tenantBId: string;
  let customerAId: string;
  let customerBId: string;

  beforeAll(async () => {
    const tenantA = await createTestTenant('Test Tenant A Dropdowns');
    const tenantB = await createTestTenant('Test Tenant B Dropdowns');
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // Customers for Load FK
    const custA = await createTestCustomer(tenantAId, 'TestCustomer A');
    const custB = await createTestCustomer(tenantBId, 'TestCustomer B');
    customerAId = custA.id;
    customerBId = custB.id;

    // Seed 3 of each entity per tenant
    for (let i = 1; i <= 3; i++) {
      await createTestLoad(tenantAId, customerAId, `TEST-LOAD-A-${i}`);
      await createTestLoad(tenantBId, customerBId, `TEST-LOAD-B-${i}`);

      // VIN is unique per (tenantId, vin). Use distinguishable VINs.
      await createTestTruck(tenantAId, `TESTVINA${i.toString().padStart(8, '0')}`);
      await createTestTruck(tenantBId, `TESTVINB${i.toString().padStart(8, '0')}`);

      await createTestCarrierDriver(tenantAId, 'TestDriver', `A${i}`);
      await createTestCarrierDriver(tenantBId, 'TestDriver', `B${i}`);

      await createTestCarrierClient(tenantAId, `TestClient A${i}`);
      await createTestCarrierClient(tenantBId, `TestClient B${i}`);

      await createTestCarrierFacility(tenantAId, `TestFacility A${i}`);
      await createTestCarrierFacility(tenantBId, `TestFacility B${i}`);
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnectPrisma();
  });

  it('Loads dropdown: tenant A sees exactly 3 loads, all tenant A', async () => {
    const db = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await db.load.findMany({
      where: { loadNumber: { startsWith: 'TEST-LOAD-' } },
    });
    expect(rows).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rows.some((r: any) => r.tenantId === tenantBId)).toBe(false);
  });

  it('Trucks dropdown: tenant A sees exactly 3 trucks, all tenant A', async () => {
    const db = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await db.truck.findMany({
      where: { vin: { startsWith: 'TESTVIN' } },
    });
    expect(rows).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
  });

  it('Carrier drivers dropdown: tenant A sees exactly 3 drivers, all tenant A', async () => {
    const db = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await db.carrierDriver.findMany({
      where: { firstName: 'TestDriver' },
    });
    expect(rows).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rows.every((r: any) => r.orgId === tenantAId)).toBe(true);
  });

  it('Clients dropdown: tenant A sees exactly 3 clients, all tenant A', async () => {
    const db = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await db.carrierClient.findMany({
      where: { name: { startsWith: 'TestClient ' } },
    });
    expect(rows).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rows.every((r: any) => r.orgId === tenantAId)).toBe(true);
  });

  it('Facilities dropdown: tenant A sees exactly 3 facilities, all tenant A', async () => {
    const db = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await db.carrierFacility.findMany({
      where: { name: { startsWith: 'TestFacility ' } },
    });
    expect(rows).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rows.every((r: any) => r.orgId === tenantAId)).toBe(true);
  });
});
```

Notes on details that matter:
- The `where` filter in each query (e.g. `startsWith: 'TEST-LOAD-'`) is intentional: it scopes the query to test fixtures only, so a developer running against a non-clean DB still gets a meaningful "exactly 3" assertion. RLS happens in addition to (not instead of) this filter — if RLS were broken, the WHERE clause would still match tenant B's TEST- rows and the assertion would catch it.
- All assertions also check `rows.every(r => r.tenantId === tenantAId)` (or `orgId`) as defense-in-depth.
- Use `prisma.$extends(withTenantRLS(...))` directly (same pattern as `cross-tenant.test.ts`) — not `createTenantClient` — to keep the test harness consistent with the existing tests.
- Do not change response shapes anywhere — only add tests + setup helpers.
- Do not introduce a new test base class — extend the existing `setup.ts` with plain exported functions.

**3. Verify:**

Run from `apps/web/`:
- `npx tsc --noEmit` passes
- `npx vitest run tests/isolation/` — all 17 existing tests still pass AND 5 new tests pass = 22 total
  </action>
  <verify>
From `apps/web/`:
1. `npx tsc --noEmit` exits 0.
2. `npx vitest run tests/isolation/` shows 22 tests passing (17 existing + 5 new), 0 failing, 0 skipped (assuming DATABASE_URL is set; skipped is acceptable in environments without DB).
3. The 5 new test names appear in vitest output: "Loads dropdown", "Trucks dropdown", "Carrier drivers dropdown", "Clients dropdown", "Facilities dropdown".
4. `cleanupTestData()` removes all test fixtures (re-running the suite back-to-back must succeed — proves cleanup is correct).
  </verify>
  <done>
- `apps/web/tests/isolation/setup.ts` exports new helpers: `createTestCustomer`, `createTestLoad`, `createTestTruck`, `createTestCarrierDriver`, `createTestCarrierClient`, `createTestCarrierFacility`
- `cleanupTestData()` removes all 6 new fixture types in dependency order before users/tenants
- `apps/web/tests/isolation/dropdowns.test.ts` exists with 5 passing tests (when DB available) or 5 properly-skipped tests (when DB not available)
- All 17 pre-existing isolation tests still pass
- `tsc --noEmit` passes from `apps/web/`
- Response shapes unchanged — only test files and one setup-helpers file modified
  </done>
</task>

</tasks>

<verification>
End-to-end gate, run from `apps/web/`:

1. `npm run audit:raw-prisma` — exits 0, writes `docs/audits/raw-prisma-usage.md`
2. `npx tsc --noEmit` — exits 0
3. `npx vitest run tests/isolation/` — 22 tests pass (17 existing + 5 new)
4. `npm run build` — succeeds (no schema/type changes were made, so this is a sanity check)
5. Inspect `docs/audits/raw-prisma-usage.md` — `LEAK_RISK` count should be 0 (proves the quick-327 fix held); if non-zero, those are real leaks to fix
6. Inspect `.github/workflows/ci.yml` — new step "Raw Prisma usage audit" exists after Vitest
7. Inspect `docs/runbooks/db-standardization-migration.md` — new "Raw Prisma usage gate (quick-328)" section at end

Negative test (manual sanity — do NOT commit):
- Add `await prisma.user.findMany();` to `apps/web/src/app/page.tsx`
- Run `npm run audit:raw-prisma` → must report 1 LEAK_RISK and exit 1
- Remove the test line
</verification>

<success_criteria>
- `npm run audit:raw-prisma` runs and produces `docs/audits/raw-prisma-usage.md`
- Audit exits 1 on LEAK_RISK, 0 otherwise (verified by negative test above)
- 5 new dropdown isolation tests pass (Load, Truck, CarrierDriver, CarrierClient, CarrierFacility)
- All 17 existing isolation tests still pass
- `tsc --noEmit` passes
- CI workflow runs audit after Vitest and blocks PRs on LEAK_RISK
- Runbook documents the gate and points to the spec section
- Zero new abstractions added; reuses `withTenantRLS`, `prisma`, existing setup harness
- Zero response-shape changes (no edits to API routes, repositories, or schema)
</success_criteria>

<output>
After completion, create `.planning/quick/328-lock-in-cross-tenant-leak-fix-raw-prisma/328-SUMMARY.md` with:
- What was built (scanner, 5 tests, CI hook, runbook note)
- LEAK_RISK count from first audit run (proves quick-327 fix held)
- Files modified (list)
- How to run the audit locally
- Commit SHA
</output>
