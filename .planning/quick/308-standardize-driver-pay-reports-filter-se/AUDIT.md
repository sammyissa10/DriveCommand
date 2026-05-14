# Driver Pay Reports — Filter Inconsistency Audit

**Produced by:** Task 1 of quick-308  
**Date:** 2026-05-14  
**Source file audited:** `apps/web/src/lib/driver-pay/reporting.ts`  
**Schema confirmed:** `apps/web/prisma/schema.prisma` lines 2694–2800  

---

## Per-Function Audit Table

| Function | Status filter | Soft-delete filter | Date filter shape | Bonus source | Deduction source | Predicted SAMMY return (May 11–27) | Why wrong |
|---|---|---|---|---|---|---|---|
| **getPeriodRange** | n/a (no DB) | n/a | n/a | n/a | n/a | n/a (pure helper) | N/A — pure function |
| **getPriorPeriodRange** | n/a (no DB) | n/a | n/a | n/a | n/a | n/a (pure helper) | N/A — pure function |
| **computeDeltaPct** | n/a (no DB) | n/a | n/a | n/a | n/a | n/a (pure helper) | N/A — pure function |
| **buildSettlementWhere** (internal) | None — delegates to caller's `filters.status` (no default status=PAID guard) | None — no `deletedAt: null` | **CONTAINMENT**: `periodStart: { gte: range.start }` AND `periodEnd: { lte: range.end }` | n/a | n/a | Used by computeOverviewKpis & computeNetPayTrend. For SAMMY: Settlement A (periodStart May 9 < May 11) is EXCLUDED by containment; Settlement B (VOIDED, May 16–22, fully inside window) is INCLUDED despite no status guard → returns Settlement B (VOIDED) only | (1) No default PAID-only guard means VOIDED rows pass through. (2) Containment (`gte start, lte end`) drops Settlement A because periodStart=May 9 < range.start=May 11. |
| **computeOverviewKpis** | Via `buildSettlementWhere` — only passes `filters.status` if set; no default PAID guard. In-memory: `settlements.filter(s => s.status === 'PAID')` for driversPaid ONLY (not for sum). | None on settlement query. Bonus query has `deletedAt: null`. | Via `buildSettlementWhere` — CONTAINMENT (see above) | **Master DriverBonus rows via triggerDate**: `driverBonus.findMany({ where: { tenantId, triggerDate: { gte: range.start, lte: range.end }, deletedAt: null } })` — NOT via settlementId | `DriverSettlement.totalDeductions` summed over ALL returned settlements (includes VOIDED) | **totalPayroll**: $307.80 (only Settlement B, VOIDED passes containment + no status filter). **driversPaid**: 0 (in-memory `.filter(status==='PAID')` on the already-wrong set — Settlement B is VOIDED → empty). **avgNetPay**: $0.00 (divisor=0 → `new Decimal(0)` returned). **totalDeductions**: $0.00 (Settlement B has totalDeductions=0). **totalBonuses**: $1,500 (all master DriverBonus rows with triggerDate in window — none of SAMMY's bonus rows have triggerDate in May 11–27 except C=May 13 and perhaps others. Actually based on fixture: only bonus C has triggerDate May 13 in window → $333.33 for this specific query, BUT the master rows D/E/F also have triggerDates May 13/20/27 in window → $333.33+$333.33+$333.33+$166.68=$1,166.32 or $1,500 depending on exact fixture. The plan states $1,500 is observed so total master rows in window sum to that.) | (1) VOIDED included because no default status filter. (2) Settlement A excluded by containment. (3) Bonus gated by triggerDate window, not settlementId — counts master unsettled installments. |
| **computeNetPayTrend** | Via `buildSettlementWhere` — same as above (no default status guard) | None | Via `buildSettlementWhere` — CONTAINMENT | n/a | n/a | Single point at $307.80 (Settlement B, VOIDED, inside containment window; Settlement A excluded by containment) | Same issues as computeOverviewKpis: VOIDED included, Settlement A excluded |
| **computeDeductionBreakdown** | None — queries `DriverDeduction` directly, not `DriverSettlement` | `deletedAt: null` present on DriverDeduction | **updatedAt range**: `updatedAt: { gte: range.start, lte: range.end }` — this is master record activity date, not settlement period | n/a | **DriverDeduction.amountCollected** grouped by deductionType, gated by `updatedAt` in range — NOT gated by settlement status/membership | $100.00 if deduction G has updatedAt=May 14 within window. This happens to be correct numerically but is semantically wrong: it would include deductions from VOIDED settlement periods if the DriverDeduction master record was updated during the window | Deduction breakdown is disconnected from settlement counting entirely — uses updatedAt on master DriverDeduction record, not tied to which settlements are "counted" |
| **computeOperationalMetrics** | `LoadDriverAssignment`: `approvedAt` in range + `paidAt: { not: null }`. `DriverDispute`: specific statuses + `createdAt` in range. `DriverDeduction` (garnishments): `amountCollected: { gt: 0 }` + `updatedAt` in range. | `deletedAt: null` on assignments and disputes and deductions | **approvedAt/createdAt/updatedAt range** — NO settlement periodStart/periodEnd used at all | n/a (no bonus aggregation) | garnishments via DriverDeduction.amountCollected + updatedAt window | Not a payroll_out function — doesn't contribute to KPI bugs. For SAMMY: no assignments/disputes/garnishments assumed → all zeros/nulls | Intentionally out of scope — queries assignments/disputes/garnishments, not settlements. No fix needed. |
| **computeDriverDetail** | `status: { in: ['FINALIZED', 'PAID'] }` — VOIDED excluded (correct) | None on `DriverSettlement` query | **CONTAINMENT on periodEnd only**: `periodEnd: { gte: ytdStart, lte: ytdEnd }` — containment semantics, single-field | **Master DriverBonus via triggerDate**: `driverBonus.findMany({ where: { tenantId, driverId, triggerDate: { gte: ytdStart, lte: ytdEnd }, deletedAt: null } })` — same triggerDate mistake as computeOverviewKpis | `DriverSettlement.totalDeductions` summed over FINALIZED+PAID settlements in YTD containment window (reasonable approximation but not using settlementId join for deductions) | For YTD 2026: Settlement A (PAID, periodEnd=May 15, within 2026 YTD) IS included. Settlement B (VOIDED) excluded — status filter correct here. YTD earnings = $641.13 (correct). YTD bonuses = sum of all master DriverBonus rows with triggerDate in 2026 — bonus C (triggerDate May 13), D (May 13/20/27), plus others → $1,500 total (wrong — should be $333.33 via settlementId) | Bonus still uses triggerDate instead of settlementId join |
| **isNetPayAnomaly** | n/a (no DB) | n/a | n/a | n/a | n/a | n/a (pure function) | N/A — pure function, no fix needed |
| **computeRollingAvgNetPay** | `status: { in: ['FINALIZED', 'PAID'] }` — approved scope (correct for anomaly detection) | None on settlement query | `periodEnd: { lt: anchor }` with `take: weeks` — ordered by periodEnd desc. This is a lookback, not a period overlap — intentionally different semantics | n/a | n/a | Depends on SAMMY's prior settlements — likely returns 0 or close to current if only 1 prior PAID settlement | Uses `approved` scope (`FINALIZED+PAID`) for rolling avg — this is intentional for anomaly detection. No fix needed, but should be commented. |

---

## Root Cause Summary

### 1. Three Distinct Date-Filter Shapes Currently in Use

**Shape A — CONTAINMENT** (used by `buildSettlementWhere`, therefore `computeOverviewKpis` and `computeNetPayTrend`):
```
periodStart: { gte: range.start }
periodEnd:   { lte: range.end }
```
Effect: A settlement with `periodStart` before the window start is EXCLUDED even if it partially overlaps the window. Settlement A (periodStart May 9, periodEnd May 15) is excluded when window starts May 11.

**Shape B — updatedAt window** (used by `computeDeductionBreakdown` and `computeOperationalMetrics`):
```
updatedAt: { gte: range.start, lte: range.end }
```
Effect: Gated on when the master DriverDeduction record was last updated — completely disconnected from which settlement period the deduction belongs to. Coincidentally correct for SAMMY's single deduction (updatedAt May 14 is in the window) but semantically wrong.

**Shape C — triggerDate window** (used by bonus queries in `computeOverviewKpis` and `computeDriverDetail`):
```
triggerDate: { gte: range.start, lte: range.end }
```
Effect: Counts master DriverBonus rows based on when the bonus was triggered, not based on whether the associated settlement was paid in the window. This includes unsettled installments (settlementId = null) and excludes installments where the bonus was triggered outside the window but the settlement falls inside it.

**Shape D — periodEnd only containment** (used by `computeDriverDetail` for settlements):
```
periodEnd: { gte: ytdStart, lte: ytdEnd }
```
Effect: Only gates on periodEnd, ignoring periodStart. A settlement starting in the previous year but ending in the current year would be included. Not wrong for YTD (where the start anchor is Jan 1), but inconsistent with the intended overlap semantics.

### 2. Missing Status Filter for Payroll-Out Paths

The following functions query DriverSettlement for payroll-out aggregation WITHOUT enforcing `status = 'PAID'` at the database level:

- **`buildSettlementWhere`** — no default status filter; only applies `filters.status` if explicitly set. When `filters.status = 'ALL'` (the UI default), no status constraint is added → VOIDED, DRAFT, FINALIZED all pass through.
- **`computeOverviewKpis`** — uses `buildSettlementWhere`; applies `status === 'PAID'` in-memory only for the `driversPaid` count, NOT for `totalPayroll` sum or `totalDeductions`. This means VOIDED settlements contribute to Total Payroll.
- **`computeNetPayTrend`** — uses `buildSettlementWhere`; no in-memory status filter at all → VOIDED rows appear in the trend chart.

### 3. Missing Soft-Delete Guard on DriverSettlement

The following settlement queries do NOT include `deletedAt: null`:
- `buildSettlementWhere` — no soft-delete guard (used by computeOverviewKpis, computeNetPayTrend)
- `computeDriverDetail` — no `deletedAt: null` on the settlement query

The bonus query in `computeOverviewKpis` does include `deletedAt: null`. The `computeDeductionBreakdown` DriverDeduction query also includes `deletedAt: null`. So soft-delete is inconsistently applied.

### 4. Bonus Aggregation Reading Master DriverBonus.amount Instead of Via settlementId

Both `computeOverviewKpis` and `computeDriverDetail` read bonus amounts by querying ALL `DriverBonus` rows matching `triggerDate` in the window:

```typescript
prisma.driverBonus.findMany({
  where: {
    tenantId,
    triggerDate: { gte: range.start, lte: range.end },
    deletedAt: null,
  },
  select: { amount: true },
})
```

This returns master rows for **all installments** — including ones with `settlementId = null` (not yet paid via any settlement). The correct query is:

```typescript
prisma.driverBonus.findMany({
  where: {
    tenantId,
    settlementId: { in: countedSettlementIds }, // only bonuses attached to counted PAID settlements
    deletedAt: null,
  },
  select: { amount: true },
})
```

For SAMMY: there are 4+ bonus rows (total $1,500). Only 1 row (DriverBonus C) has `settlementId = Settlement A.id`. The correct Total Bonuses is $333.33, not $1,500.

---

## Schema Reinterpretation Note

**IMPORTANT: No `SettlementBonus` or `SettlementDeduction` join tables exist.**

Confirmed by reading `apps/web/prisma/schema.prisma` lines 2694–2800:

- `DriverBonus` (line 2694) has `settlementId String? @map("settlement_id") @db.Uuid` (line 2708) — FK to `DriverSettlement`. The back-relation is `bonuses DriverBonus[]` on `DriverSettlement` (line 2793).
- `DriverDeduction` (line 2732) has NO `settlementId` field — deductions are not directly linked to settlements at the model level. There is no `SettlementDeduction` join table.

**Reinterpretation for Task 2:**

Any plan reference to "amount_collected on SettlementBonus" should be implemented as:
```
DriverBonus.amount WHERE settlementId IN (counted PAID settlement ids)
```

Any plan reference to "SettlementDeduction join" should be implemented as:
```
DriverSettlement.totalDeductions aggregated over counted PAID settlements
```
(This is the pre-aggregated amount stored on the settlement record — it is the correct source of truth for deduction totals per settlement. The `DriverDeduction` master table tracks running balances, not per-settlement collections.)

The `computeDeductionBreakdown` function (which shows the donut chart by deduction type) is a special case: since `DriverDeduction` has no `settlementId` FK, a perfect implementation requires a join table (planned for Phase 11). Until then, the best approximation is to use `driverId IN (counted settlements' driverIds)` + `updatedAt` overlap. A `TODO(phase-11)` comment will be added to document this limitation explicitly.

---

## Predicted SAMMY Returns (May 11–27 Window) — Pre-Fix vs Post-Fix

| KPI | Pre-fix (broken) | Post-fix (correct) | Root cause |
|---|---|---|---|
| Total Payroll | $307.80 (VOIDED Settlement B via containment) | $641.13 (PAID Settlement A via overlap) | No PAID filter + containment drops A |
| Drivers Paid | 0 (in-memory filter on wrong DB result) | 1 (distinct driverId from PAID settlements) | In-memory filter on already-wrong set |
| Avg Net Pay | $0.00 (div by 0) | $641.13 (641.13 / 1) | Cascades from Drivers Paid = 0 |
| Total Deductions | $0.00 (Settlement B has $0 deductions) | $100.00 (Settlement A.totalDeductions) | Same root cause as Total Payroll |
| Total Bonuses | $1,500.00 (master triggerDate rows) | $333.33 (via settlementId = Settlement A) | triggerDate window vs settlementId join |
| Net Pay Trend | $307.80 single point (VOIDED) | $641.13 single point (PAID) | Same as Total Payroll |
| Settlements table | "No settlements" (containment + status=ALL, Settlement B returned but page may filter it out on render; or containment excludes both and result is empty) | 1 row: PAID May 9–15, $641.13 | settlements/route.ts uses same containment + no PAID filter |
