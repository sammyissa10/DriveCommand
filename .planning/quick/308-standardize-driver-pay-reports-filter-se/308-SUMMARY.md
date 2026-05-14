---
phase: quick-308
plan: "01"
subsystem: driver-pay-reports
tags: [reporting, filter, canonicalization, regression-tests, bugfix]
dependency_graph:
  requires: [driver-pay-phase-10]
  provides: [canonical-settlement-predicate]
  affects: [computeOverviewKpis, computeNetPayTrend, computeDeductionBreakdown, computeDriverDetail, settlements-api-route]
tech_stack:
  added: [reporting-predicate.ts]
  patterns: [canonical-predicate, period-overlap-semantics, settlementId-bonus-join]
key_files:
  created:
    - apps/web/src/lib/driver-pay/reporting-predicate.ts
    - apps/web/src/lib/driver-pay/__tests__/reporting.test.ts
    - .planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md
  modified:
    - apps/web/src/lib/driver-pay/reporting.ts
    - apps/web/src/app/api/driver-pay/reports/settlements/route.ts
    - apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts
decisions:
  - avgNetPay returns em-dash string (not null) when driversPaid=0 to avoid downstream interface churn
  - computeRollingAvgNetPay intentionally exempt from canonical predicate (lookback pattern, not period aggregation)
  - computeOperationalMetrics intentionally exempt (queries assignments/disputes, not settlements)
  - computeDeductionBreakdown uses driverId-gated approximation pending Phase 11 SettlementDeduction join
metrics:
  duration: 16 minutes
  completed: 2026-05-14
  tasks: 4
  files_changed: 6
---

# Quick 308: Standardize Driver Pay Reports Filter Semantics — Summary

**One-liner:** Replaced 3 inconsistent ad-hoc date/status filters across 4 reporting functions with a single canonical `countedSettlementsWhere()` predicate enforcing PAID-only scope, period-overlap semantics, and soft-delete exclusion.

---

## The Bug (SAMMY on demoteam, May 11–27 window)

| KPI | Before fix | After fix |
|---|---|---|
| Total Payroll | $307.80 (VOIDED Settlement B) | $641.13 (PAID Settlement A) |
| Drivers Paid | 0 | 1 |
| Avg Net Pay | $0.00 (div-by-zero) | $641.13 |
| Total Deductions | $0.00 | $100.00 |
| Total Bonuses | $1,500.00 (master triggerDate rows) | $333.33 (via settlementId join) |
| Net Pay Trend | $307.80 point (VOIDED) | $641.13 point (PAID) |
| Settlements table | "No settlements in this period" | 1 row: PAID May 9–15 |

**Root causes (from AUDIT.md):**
1. `buildSettlementWhere` used containment (`periodStart >= start, periodEnd <= end`) — excluded Settlement A (periodStart May 9 < window start May 11)
2. No default `status = 'PAID'` filter — VOIDED passed through when `filters.status = 'ALL'` (UI default)
3. No `deletedAt: null` on settlement queries
4. `DriverBonus` aggregation read master rows via `triggerDate` window — counted all $1,500 of installments regardless of settlement membership

---

## Canonical Predicate API

**File:** `apps/web/src/lib/driver-pay/reporting-predicate.ts`

```ts
// Scope constants
export const COUNTED_FOR_PAYROLL_OUT = ['PAID'];   // Reports page KPIs
export const COUNTED_FOR_APPROVED = ['FINALIZED', 'PAID']; // Driver detail YTD

export type CountedScope = 'payroll_out' | 'approved';

// The single source of truth
export function countedSettlementsWhere(
  tenantId: string,
  range: PeriodRange,        // { start, end }
  filters: ReportFilters,    // { driverIds?, status? }
  scope: CountedScope,       // 'payroll_out' | 'approved'
): Prisma.DriverSettlementWhereInput
```

**Semantics enforced:**
- Period **overlap** (not containment): `periodStart <= range.end AND periodEnd >= range.start`
- Status: explicit scope constants — VOIDED never in payroll_out
- Soft-delete: `deletedAt: null` always
- User status filter intersected safely (VOIDED + payroll_out scope → `{ in: [] }` → zero results)

---

## Functions Updated

| Function | Change |
|---|---|
| `computeOverviewKpis` | Uses `countedSettlementsWhere(..., 'payroll_out')` x2 (current + prior); bonuses now fetched via `settlementId IN (counted ids)` not `triggerDate` window |
| `computeNetPayTrend` | Uses `countedSettlementsWhere(..., 'payroll_out')` |
| `computeDeductionBreakdown` | Uses `countedSettlementsWhere` to get counted driverIds; gates deductions on those drivers |
| `computeDriverDetail` | Uses `countedSettlementsWhere(..., 'approved')` for YTD; bonuses via `settlementId IN (ytd settlement ids)` |
| `settlements/route.ts` | Uses `countedSettlementsWhere(..., 'payroll_out')` — fixes "No settlements in this period" table bug |
| `computeRollingAvgNetPay` | Exempt — lookback pattern, not period aggregation; documented with justification comment |
| `computeOperationalMetrics` | Exempt — queries assignments/disputes; documented with justification comment |

**`buildSettlementWhere` removed entirely.**

---

## Tests Added

18 new tests in `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts`:

1. `computeOverviewKpis returns currentTotal=$641.13 (PAID-only, excludes VOIDED Settlement B)`
2. `computeOverviewKpis returns driversPaid=1 (counts distinct driverId from PAID settlements)`
3. `computeOverviewKpis returns avgNetPay=$641.13 when 1 driver paid`
4. `computeOverviewKpis returns avgNetPay="—" (em dash) when zero drivers paid (empty fixture)`
5. `totalDeductions=$100.00 from PAID settlement only; VOIDED settlement with $50 does NOT contribute`
6. `totalBonuses=$333.33 via settlementId join (NOT $1,166.67 from all master DriverBonus rows)` ← headline regression
7. `excludes soft-deleted settlements (deletedAt IS NOT NULL)`
8. `period overlap: Settlement A (May 9-15) counts for window May 11-27 — not containment` ← headline regression
9. `status filter VOIDED returns empty result (out of payroll_out scope)`
10. `bonus query returns zero when no counted settlements (empty window)`
11. `computeNetPayTrend returns exactly one bucket containing $641.13 for May 11-27 window`
12. `computeNetPayTrend uses same PAID-only predicate as KPI (no VOIDED in chart)`
13. `payroll_out scope includes PAID, excludes VOIDED`
14. `approved scope includes PAID and FINALIZED`
15. `always includes deletedAt: null`
16. `uses overlap not containment (periodStart lte end, periodEnd gte start)`
17. `YTD bonuses for SAMMY = $333.33 via settlementId join (not $1,166.67 from master rows)`
18. `YTD earnings = $641.13 (FINALIZED+PAID overlap YTD, Settlement A counts)`

**Total driver-pay tests: 39 passing (21 existing + 18 new)**

---

## Production Verification

Deployed via `vercel --prod` to: **https://drive-command.vercel.app**

**Awaiting user verification on 3 windows** (see Task 4 checkpoint).

---

## Deferred to Phase 11

**`computeDeductionBreakdown` — Deduction type breakdown chart**

The `DriverDeduction` model has no `settlementId` FK, so the deduction breakdown cannot be perfectly tied to counted settlements. Current approximation: filter by `driverId IN (counted settlement driverIds) AND updatedAt overlaps window`. 

A `TODO(phase-11)` comment is in the code. Phase 11 should add a `SettlementDeduction` join table (or `settlementId` FK on `DriverDeduction`) to enable exact per-settlement deduction breakdown.

---

## Audit Doc

See full per-function audit: `.planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md`

---

## Self-Check: PASSED
