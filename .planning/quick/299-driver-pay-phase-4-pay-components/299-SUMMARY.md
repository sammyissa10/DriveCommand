---
phase: quick-299
plan: "05"
subsystem: driver-pay
tags: [testing, vitest, decimal, driver-pay, pay-components]
dependency_graph:
  requires:
    - apps/web/src/lib/driver-pay/calculator.ts
    - apps/web/src/lib/driver-pay/detention.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
  provides:
    - 26 passing tests covering formula correctness, detention boundaries, API behavior
  affects: []
tech_stack:
  added: []
  patterns:
    - Penny-exact Decimal.toFixed(2) assertions — no toBeCloseTo or Number coercion
    - vi.mock hoisting for Next.js API route testing
    - computeGrossAmount mock returns object with .neg() chain for DEDUCTION verification
key_files:
  created:
    - apps/web/src/lib/driver-pay/__tests__/calculator.test.ts
    - apps/web/src/lib/driver-pay/__tests__/detention.test.ts
    - apps/web/src/lib/driver-pay/__tests__/components.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts
  modified: []
decisions:
  - "calculator.test.ts: 13 tests written (plan spec 12 + 1 computeGrossAmount dispatcher
    inline in calculator describe block, not duplicated in components.test.ts)"
  - "detention test 3: correct expected grossAmount is '0.50' (not '0.42') — 1/60 hr
    rounds to 0.02hr × $25 = $0.50 per plan note"
  - "components-api.test.ts: computeGrossAmount mock returns { neg: () => { toString:
    '-50.00' } } — DEDUCTION negation verified via .toString() on create data arg"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-11"
  tasks_completed: 2
  files_created: 4
  tests_added: 26
  tests_total_in_suite: 34
---

# Phase quick-299 Plan 05: Driver Pay — Test Suite Summary

**One-liner:** 26 penny-exact Vitest tests covering formula correctness, detention boundaries, DEDUCTION sign enforcement, PAID immutability, soft-delete, and tenant isolation.

## What Was Built

Four test files forming the complete Phase 4 test suite for the driver pay components feature:

1. **`calculator.test.ts`** — 13 tests across all formula functions (calcCpm, calcFuelSurcharge, calcHourly, calcFlat, calcPercentage, calcDaily, calcSplit, calcDetention, calcFederalOT, calcStateDailyOT) plus one computeGrossAmount dispatcher test. All assertions use `Decimal.toFixed(2)`.

2. **`detention.test.ts`** — 5 `suggestDetention` boundary tests: earned detention (4hr elapsed, 2hr free), within-free-time returns null, 1-minute-over returns non-null with 0.02hr and $0.50, exact boundary (= free time) returns null, and 2.5hr detention with correct $62.50 gross.

3. **`components.test.ts`** — 3 tests: DEDUCTION sign convention (calculator returns positive, API negates), mixed-component total accumulation, and BASE_PAY_MILEAGE dispatch.

4. **`components-api.test.ts`** — 6 API handler tests: driver visibility filter (visibleToDriver: true in WHERE), DEDUCTION category negation in POST (.neg() result stored), PATCH 409 on PAID, DELETE 409 on PAID, soft-delete sets deletedAt, and tenant isolation 403 for mismatched driverId.

## Test Results

```
 ✓ calculator.test.ts     (13 tests)
 ✓ detention.test.ts      (5 tests)
 ✓ components.test.ts     (3 tests)
 ✓ components-api.test.ts (6 tests)

 Test Files  5 passed (5)   [includes pre-existing snapshot.test.ts]
       Tests 34 passed (34)
```

26 new tests, all passing. Zero failures.

## Key Implementation Notes

- **Penny-exact assertions:** Every money comparison uses `result.toFixed(2)` on a `Decimal` — never `toBeCloseTo` or `Number()` coercion.
- **DEDUCTION sign:** `computeGrossAmount` always returns a positive value. The API POST handler calls `.neg()` for `category === 'DEDUCTION'` before storing. Test 2 in the API suite verifies the `.toString()` of the negated mock value is `'-50.00'`.
- **Detention boundary:** `suggestDetention` returns `null` when `billableHours <= 0` (exact boundary included). The 1-minute-over case: 1/60 hr = 0.0167, `toDecimalPlaces(2)` = 0.02, × $25 = $0.50.
- **PAID immutability:** Both PATCH and DELETE check `payStatus === 'PAID'` before doing any work and return 409 immediately.
- **Soft-delete:** DELETE calls `prisma.loadPayComponent.update({ data: { deletedAt: new Date() } })` — verified with `expect.any(Date)`.
- **Tenant isolation:** Driver GET checks `assignment.driverId !== session.userId` and returns 403.

## Deviations from Plan

### Note on test count

The plan specified 12 tests for `calculator.test.ts`. The file contains 13 because the `computeGrossAmount` dispatcher test was included directly in `calculator.test.ts` (where it naturally belongs alongside the other formula tests) rather than as a separate describe block — consistent with `snapshot.test.ts` convention. The `components.test.ts` still has its own 3 tests covering sign convention, mixed totalling, and dispatcher dispatch verification, with no duplication.

### Pre-existing TypeScript error

`apps/web/src/lib/docs/render-mdx.ts` has a pre-existing `Cannot find module 'remark-gfm'` error that predates this plan. Zero new TypeScript errors were introduced.

## Commits

- `47545c0` — `test(quick-299): add calculator.test.ts, detention.test.ts, components.test.ts`
- `6572829` — `test(quick-299): add components-api.test.ts API handler tests`
