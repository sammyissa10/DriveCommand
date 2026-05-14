---
phase: quick-309
plan: "01"
subsystem: driver-pay/reporting
tags: [driver-pay, reporting, predicate, bonuses, deductions, regression-tests]
dependency_graph:
  requires: [quick-308]
  provides: [computeDeductionBreakdown-settled-money-aggregation, computeDriverDetail-ytdBonuses-hardened]
  affects: [apps/web/src/lib/driver-pay/reporting.ts, apps/web/src/lib/driver-pay/__tests__/reporting.test.ts]
tech_stack:
  added: []
  patterns: [settled-money-aggregation, weighted-apportionment, cascade-revert-guarantee]
key_files:
  modified:
    - apps/web/src/lib/driver-pay/reporting.ts
    - apps/web/src/lib/driver-pay/__tests__/reporting.test.ts
decisions:
  - "computeDeductionBreakdown money source = DriverSettlement.totalDeductions over counted settlements (not DriverDeduction.amountCollected by updatedAt window)"
  - "DriverDeduction queried with NO date filter in computeDeductionBreakdown — purely for type attribution"
  - "Apportion settlement totalDeductions across deduction types weighted by amountCollected; even split when all weights zero"
  - "TODO(phase-11) documents need for SettlementDeduction join table or settlementId FK on DriverDeduction"
metrics:
  duration: "2m 40s"
  completed: "2026-05-14"
  tasks_completed: 2
  files_modified: 2
  tests_added: 4
  tests_total: 22
---

# Phase quick-309 Plan 01: Close Residual Reporting Predicate Gaps Summary

**One-liner:** Hardened computeDriverDetail ytdBonuses comment block and refactored computeDeductionBreakdown to aggregate from DriverSettlement.totalDeductions over counted settlements (no updatedAt gate), with 4 new regression tests locking down cascade-revert, unsettled-installment exclusion, and the new aggregation semantics.

## What Was Built

### Task 1: Harden computeDriverDetail.ytdBonuses + Refactor computeDeductionBreakdown

**File:** `apps/web/src/lib/driver-pay/reporting.ts`

**Edit 1 — computeDriverDetail comment hardening:**

The existing `settlementId: { in: ytdSettlementIds }` join was already correct (from quick-308). The 2-line comment was replaced with a 7-line invariant block that:
- Explicitly documents why triggerDate must never be used (production bug: SAMMY showed $1,500 of master rows when only $333.33 was actually paid out)
- Documents the cascade-revert guarantee: when the PAID settlement is voided, ytdSettlementIds becomes empty, the bonus query is skipped, and ytd.bonuses = $0
- Includes explicit DO NOT warnings against adding a triggerDate fallback

**Edit 2 — computeDeductionBreakdown full refactor:**

The prior implementation approximated deduction breakdowns via `DriverDeduction.updatedAt` window filtering — semantically tied to row activity rather than settled money. The refactored implementation:

1. Fetches counted settlements (payroll_out scope, PAID only, period overlap) selecting `driverId` and `totalDeductions`
2. Aggregates `totalDeductions` per driver from the counted settlement set (source of truth for "deduction money actually paid out")
3. Queries `DriverDeduction` by `driverId IN (counted driver IDs)` with **no date filter** — purely for type attribution
4. Apportions each driver's settlement `totalDeductions` across their active deduction types weighted by `amountCollected`; falls back to even split when all weights are zero
5. Short-circuits and returns `[]` immediately when no counted settlements exist (the DriverDeduction query is never fired)

The `Prisma.DriverDeductionWhereInput` typed variable was removed (no longer needed). A `TODO(phase-11)` comment documents the need for a `SettlementDeduction` join table or `settlementId` FK on `DriverDeduction` to fully attribute individual deduction line items to their settlements.

### Task 2: 4 New Regression Tests

**File:** `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts`

Added `computeDeductionBreakdown` to the top-level import. Four new tests appended in two describe blocks:

**describe: "computeDriverDetail — cascade revert when PAID settlement is voided (quick-309)"**

- **Test 19 — Cascade revert:** When `currentSettlements = []` (settlement voided/not in approved scope), `ytd.bonuses = '0.00'`, `ytd.earnings = '0.00'`, and `prisma.driverBonus.findMany` is never called. Confirms the `ytdSettlementIds.length === 0` early-exit path.
- **Test 20 — Unsettled installment exclusion:** bonusD/E/F (settlementId=null) are excluded because the DB predicate `settlementId: { in: [SETTLEMENT_A_ID] }` filters them out. Mock returns only bonusC. Verifies the bonus where clause contains `settlementId.in` and does NOT contain a `triggerDate` property.

**describe: "computeDeductionBreakdown — counted-settlement gated (quick-309)"**

- **Test 21 — No-overlap window returns []:** April 2026 window with no counted PAID settlements returns `[]`. `driverDeduction.findMany` is never called (short-circuit). deductionG has `updatedAt May 14` which is irrelevant — the old updatedAt-gated approach would have included it incorrectly.
- **Test 22 — Settled-money aggregation source:** May 11-27 window with settlementA (PAID, `totalDeductions $100`) yields `[{ deductionType: 'STANDARD', total: '100.00' }]`. Confirms `driverDeduction.findMany` was called WITHOUT an `updatedAt` property in the where clause, and that the settlement query used `status: { in: [..., 'PAID', ...] }`.

## Test Results

```
reporting.test.ts   22 tests passing (18 prior + 4 new)
Full driver-pay suite: 120 tests passing across 8 files
TypeScript: 0 errors in driver-pay (pre-existing remark-gfm error in render-mdx.ts is unrelated)
```

## Verification Invariants Confirmed

- `grep -n "settlementId: { in:" reporting.ts` — hits at lines 275, 285 (computeOverviewKpis) and 680 (computeDriverDetail)
- `grep -n "updatedAt" reporting.ts` — hits only at lines 498, 575 (both in computeOperationalMetrics, intentionally exempt)
- `grep -n "TODO(phase-11)" reporting.ts` — hit at line 431 inside computeDeductionBreakdown
- `countedSettlementsWhere` in `reporting-predicate.ts` — NOT modified
- `computeOverviewKpis`, `computeNetPayTrend`, `computeOperationalMetrics`, `computeRollingAvgNetPay`, `isNetPayAnomaly`, `getPeriodRange`, `getPriorPeriodRange`, `computeDeltaPct` — NOT modified

## Deviations from Plan

None — plan executed exactly as written. (Note: Task 2 done criteria mentioned "3 new regression tests" but the plan body listed 4 tests covering cascade-revert, unsettled-installment, no-overlap window, and aggregation source. All 4 were added as specified in the task body.)

## Self-Check: PASSED

Files exist:
- FOUND: apps/web/src/lib/driver-pay/reporting.ts
- FOUND: apps/web/src/lib/driver-pay/__tests__/reporting.test.ts

Commits exist:
- FOUND: 6397210 — refactor(quick-309): harden ytdBonuses comment + refactor computeDeductionBreakdown
- FOUND: d065b37 — test(quick-309): add 4 regression tests for residual predicate gaps
