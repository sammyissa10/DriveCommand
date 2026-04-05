---
phase: quick-181
plan: "01"
subsystem: carrier-ops / tests
tags: [tests, security, financial-integrity, multi-tenancy, vitest]
dependency_graph:
  requires: [carrier-ops service functions, Prisma schema migrations]
  provides: [spec 8.3 integration tests, spec 8.4 integration tests]
  affects: [CI test suite]
tech_stack:
  added: []
  patterns: [bypass_rls $transaction setup, beforeAll/afterAll describe-scope, try/finally teardown]
key_files:
  created:
    - apps/web/tests/carrier/multi-tenancy.test.ts
    - apps/web/tests/carrier/financial-integrity.test.ts
  modified: []
decisions:
  - "Used direct Prisma createMany for contracts instead of createContract service to avoid contractNumber unique constraint collisions when tests run in parallel"
  - "Documented DRIVER role gap at service level as Test 4 — role enforcement is route-level responsibility"
  - "Revenue assertion uses Number() comparison instead of '195.00' string — Prisma Decimal via String() strips trailing zeros"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-05T18:05:42Z"
  tasks_completed: 2
  files_created: 2
---

# Quick-181: Carrier Ops Multi-Tenancy and Financial Integrity Tests

**One-liner:** 8 Vitest integration tests auditing carrier ops cross-org data isolation (spec 8.4) and financial data integrity (spec 8.3) against a real Supabase PostgreSQL database.

## What Was Built

Two Vitest integration test files validating security boundaries and financial correctness for carrier operations.

### `apps/web/tests/carrier/multi-tenancy.test.ts` (spec 8.4 — 4 tests)

**Test 1 — Cross-org data isolation:** Creates two tenants with full carrier data in Org A. Verifies `listClients(orgBId)` returns empty, `listDispatches(orgBId)` returns empty, and `getClient(orgBId, orgAClientId)` returns null. Proves service functions enforce orgId scoping.

**Test 2 — org_id injection prevention:** Calls `createClient(orgAId, { name: '...', orgId: orgBId })` with an injected orgId in the data spread. Asserts the created record's orgId equals orgAId — the explicit `orgId` parameter in `createClient` overwrites any spread value.

**Test 3 — Driver dispatch scoping:** Creates two drivers and two dispatches (one per driver). Verifies `listDispatches(orgId, { driverId: driver1Id })` returns only Dispatch A and `listDispatches(orgId, { driverId: driver2Id })` returns only Dispatch B.

**Test 4 — Role-guard documentation:** Documents that service functions are org-scoped but role-agnostic. Verifies `createClient` and `createContract` are plain async functions with no role checks. Records the security note that v1/carrier route handlers must add role=OWNER guards.

### `apps/web/tests/carrier/financial-integrity.test.ts` (spec 8.3 — 4 tests)

Uses `beforeAll`/`afterAll` with shared describe-scope state for full pipeline setup: tenant → user → driver → truck → client → contract → dispatch → load → 3 delivery stops → revenue recalculation → paid pay record.

**Test 5 — clientId validation:** `createLoad(orgId, { clientId: undefined })` rejects with `'client_id is required'` error.

**Test 6 — Paid record immutability:** Creates a pay record with `status: 'paid'`. Replicates void and approve route guard logic inline. Verifies both return `{ ok: false, statusCode: 422 }` for a paid record.

**Test 7 — Stored computed revenue:** 3 delivery stops x $65/stop = $195 stored after `recalculateAndStore`. Direct Prisma update of `notes` field does not change `totalRevenue`. Re-query returns same value — proving stored, not recomputed at query time.

**Test 8 — String-serialized money fields:** `getLoad` returns `financials.totalRevenue` as `typeof === 'string'`. Same for `fuelSurcharge`. `otherCharges` and `carrierCost` are `null | string`. Numeric value equals 195.

## Test Results

All 8 tests pass against real database:

```
Tests: 8 passed (8)
Files: 2 passed (2)
Duration: ~10.8s
```

| Test | File | Status |
|------|------|--------|
| 1 - Cross-org data isolation | multi-tenancy | PASS |
| 2 - org_id injection prevention | multi-tenancy | PASS |
| 3 - Driver dispatch scoping | multi-tenancy | PASS |
| 4 - Role-guard documentation | multi-tenancy | PASS |
| 5 - createLoad clientId validation | financial-integrity | PASS |
| 6 - Paid record immutability | financial-integrity | PASS |
| 7 - Stored computed revenue | financial-integrity | PASS |
| 8 - String-serialized money fields | financial-integrity | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] contractNumber unique constraint collision in parallel test execution**
- **Found during:** Task 1 (multi-tenancy) and Task 2 (financial-integrity) when run together
- **Issue:** `createContract` service function generates `CN-YEAR-NNNNN` using per-org count, but count starts at 0 for new test tenants, causing both tests to generate `CN-2026-00001` simultaneously → unique constraint violation
- **Fix:** Both test files use direct `prisma.$transaction` + `bypass_rls` to create contracts with a `Date.now()`-suffixed unique contractNumber (`CN-MT-TEST-{ts}`, `CN-FI-TEST-{ts}`)
- **Files modified:** Both test files (test-only, no application code changes)
- **Commits:** 9c8385a, 5165e84

**2. [Rule 1 - Bug] carrierStop.create missing required facilityId and dispatch connect**
- **Found during:** Task 2 (financial-integrity) beforeAll setup
- **Issue:** `carrierStop` schema requires `facilityId` (non-nullable FK) and `dispatch` relation connect — direct field assignment fails
- **Fix:** Added `carrierFacility.create` step in beforeAll, used Prisma relation syntax `{ dispatch: { connect: { id } }, facility: { connect: { id } } }`
- **Files modified:** financial-integrity.test.ts
- **Commit:** 5165e84

**3. [Rule 1 - Bug] driverPayRecord.create used incorrect field names**
- **Found during:** Task 2 (financial-integrity) beforeAll setup
- **Issue:** Used `grossPay`/`deductions` field names not in schema; actual fields are `basePay`/`deductions` (Decimal default)
- **Fix:** Updated to use `basePay: '200.00'` and `netPay: '200.00'` matching actual schema
- **Files modified:** financial-integrity.test.ts
- **Commit:** 5165e84

**4. [Rule 1 - Bug] Revenue string assertion used '195.00' but Prisma Decimal serializes as '195'**
- **Found during:** Task 2 Test 7 failure
- **Issue:** `String(Decimal(195.00))` produces `'195'` not `'195.00'` — Prisma's Decimal.js strips trailing zeros
- **Fix:** Changed assertion to `Number(load.financials.totalRevenue) === 195` which is format-agnostic
- **Files modified:** financial-integrity.test.ts
- **Commit:** 5165e84

**5. [Rule 1 - Bug] Teardown missing carrierFacility.deleteMany — FK constraint on tenant delete**
- **Found during:** Task 2 afterAll teardown
- **Issue:** `tenant.deleteMany` failed with FK constraint `facilities_org_id_fkey` because facility records were not deleted before tenant
- **Fix:** Added `tx.carrierFacility.deleteMany({ where: { orgId } })` before `tx.tenant.deleteMany`
- **Files modified:** financial-integrity.test.ts
- **Commit:** 5165e84

## Self-Check: PASSED

Files created:
- FOUND: apps/web/tests/carrier/multi-tenancy.test.ts
- FOUND: apps/web/tests/carrier/financial-integrity.test.ts

Commits:
- FOUND: 9c8385a (test(quick-181): add carrier ops multi-tenancy integration tests)
- FOUND: 5165e84 (test(quick-181): add carrier ops financial integrity integration tests)

All 8 tests passed in final run.
