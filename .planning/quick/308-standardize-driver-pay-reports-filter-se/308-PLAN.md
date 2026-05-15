---
phase: 308-standardize-driver-pay-reports-filter-se
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/driver-pay/reporting.ts
  - apps/web/src/lib/driver-pay/reporting-predicate.ts
  - apps/web/src/lib/driver-pay/__tests__/reporting.test.ts
  - .planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md
autonomous: false

must_haves:
  truths:
    - "Total Payroll KPI on Reports page shows only PAID settlements that overlap the window"
    - "Drivers Paid KPI on Reports page counts distinct drivers with at least one PAID settlement overlapping the window"
    - "Avg Net Pay = Total Payroll / Drivers Paid (returns null, rendered as em dash, when Drivers Paid = 0)"
    - "Total Bonuses KPI sums only bonuses tied to settlements that count for payroll_out (PAID, overlapping window) via DriverBonus.settlementId"
    - "Total Deductions KPI sums DriverSettlement.totalDeductions across counted settlements (period-overlap, PAID-only)"
    - "Net Pay Trend chart bucket aggregates use the same canonical counted settlement set as Total Payroll"
    - "Settlements table lists the same counted settlements as the KPIs for the same period"
    - "VOIDED settlements never contribute to payroll_out anywhere on the page"
    - "Soft-deleted (deletedAt IS NOT NULL) settlements and bonuses are never counted"
    - "Period overlap semantics: a settlement counts when [periodStart, periodEnd] intersects [range.start, range.end]"
    - "For demoteam SAMMY data (May 11-27, 2026): Total Payroll = $641.13, Drivers Paid = 1, Avg Net Pay = $641.13, Total Bonuses = $333.33, Total Deductions = $100.00, Settlements table shows 1 row (PAID May 9-15)"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/reporting-predicate.ts"
      provides: "Canonical countedSettlementsWhere() builder for all reporting aggregations"
      exports: ["countedSettlementsWhere", "COUNTED_FOR_PAYROLL_OUT", "COUNTED_FOR_APPROVED", "CountedScope"]
    - path: "apps/web/src/lib/driver-pay/reporting.ts"
      provides: "All 11 aggregation functions refactored to use canonical predicate"
      contains: "countedSettlementsWhere"
    - path: "apps/web/src/lib/driver-pay/__tests__/reporting.test.ts"
      provides: "Regression tests covering SAMMY data shape (PAID + VOIDED + bonus installment + deduction collection in window)"
      min_lines: 200
    - path: ".planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md"
      provides: "Per-function audit table from Step 1 (status filter, soft-delete, date shape, bonus/deduction source, predicted SAMMY return)"
  key_links:
    - from: "apps/web/src/lib/driver-pay/reporting.ts"
      to: "apps/web/src/lib/driver-pay/reporting-predicate.ts"
      via: "import { countedSettlementsWhere, COUNTED_FOR_PAYROLL_OUT, COUNTED_FOR_APPROVED }"
      pattern: "import .*countedSettlementsWhere.* from .*reporting-predicate"
    - from: "computeOverviewKpis"
      to: "DriverBonus.settlementId"
      via: "Bonus aggregation filters via settlement.id IN (counted PAID settlements)"
      pattern: "settlementId.*in.*settlementIds|settlement:.*status.*PAID"
    - from: "Reports page Net Pay Trend, Settlements table, KPIs"
      to: "Same canonical countedSettlementsWhere predicate"
      via: "All three call paths share the predicate; no per-function date math improvisation"
      pattern: "countedSettlementsWhere"
---

<objective>
Fix the cross-KPI filter inconsistency on the Driver Pay Reports page where the same period
produces different settlement sets for Total Payroll, Drivers Paid, Total Bonuses,
Total Deductions, Net Pay Trend, and the Settlements table. Replace ad-hoc per-function
where clauses with one canonical predicate built around period-overlap semantics and
explicit status scopes (PAID for payroll_out, FINALIZED+PAID for approved).

Purpose: SAMMY on demoteam tenant has 1 PAID settlement ($641.13 net, May 9-15 spanning the
window) and 1 VOIDED settlement (May 16-22). The current code returns the VOIDED row for
Total Payroll, zero for Drivers Paid, $1,500 for Total Bonuses (master DriverBonus rows
not gated on settlement counting), and "no settlements" in the table. All five KPIs and
the trend chart and table must agree on the same set of counted settlements.

Output: A canonical `reporting-predicate.ts` module, all 11 reporting functions refactored
to use it, audit doc proving the shape of every existing filter, 8+ new regression tests
that fail before the refactor and pass after, and production verification on demoteam
for 3 windows (May 11-27, May 1-31, Q2 2026).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Production bug observation — SAMMY on demoteam tenant, May 11-27, 2026:
# - 1 PAID settlement: $641.13 net, period May 9-15, totalDeductions $100, 1 bonus installment $333.33
# - 1 VOIDED settlement: $307.80, period May 16-22
# - DriverBonus master rows total $1,500 across the year (settled + unsettled installments)
# Observed broken Reports page:
#   Total Payroll: $307.80 (returns VOIDED, should be $641.13)
#   Drivers Paid: 0 (should be 1)
#   Avg Net Pay: $0.00 (cascade)
#   Total Deductions: $100.00 (only correct one)
#   Total Bonuses: $1,500.00 (uses master DriverBonus, should be $333.33)
#   Net Pay Trend: single $307.80 point
#   Settlements table: "No settlements in this period"

@apps/web/src/lib/driver-pay/reporting.ts
@apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/KpiCard.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPayTrendChart.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/SettlementsTable.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/DeductionDonut.tsx
@apps/web/src/app/api/driver-pay/reports/overview/route.ts
@apps/web/src/app/api/driver-pay/reports/settlements/route.ts
@apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Per-function audit (read-only) — produce AUDIT.md</name>
  <files>.planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md</files>
  <action>
Read `apps/web/src/lib/driver-pay/reporting.ts` end-to-end. For each public function
exported from that file (expect 11: getPeriodRange, getPriorPeriodRange, computeDeltaPct,
computeOverviewKpis, computeNetPayTrend, computeDeductionBreakdown,
computeOperationalMetrics, computeDriverDetail, isNetPayAnomaly, computeRollingAvgNetPay,
plus the internal `buildSettlementWhere` for completeness) record in a markdown table:

| Function | Status filter | Soft-delete filter | Date filter shape | Bonus source | Deduction source | Predicted SAMMY return (May 11-27) | Why wrong |

Status filter column: exact `status` clause used (e.g., `status: 'PAID'`, `status: { in: ['FINALIZED','PAID'] }`, none).
Soft-delete column: presence/absence of `deletedAt: null` on each model the function queries.
Date filter shape: exact field + operator (e.g., `periodStart >= start AND periodEnd <= end` containment, vs OVERLAP `periodStart <= end AND periodEnd >= start`, vs `updatedAt range`, vs `triggerDate range`).
Bonus source: which model (DriverBonus master rows? Joined via settlementId? Filtered by settlement status?).
Deduction source: same question for deductions (DriverSettlement.totalDeductions? DriverDeduction master? DriverDeduction.amountCollected? updatedAt window?).
Predicted SAMMY return: walk through the actual data (1 PAID May 9-15 = $641.13 net / $100 deductions / $333.33 bonus installment via settlementId; 1 VOIDED May 16-22; total master DriverBonus rows = $1,500; DriverDeduction master with updatedAt during window). Compute what each function would return for SAMMY for May 11-27.

After the table, add a "Root Cause Summary" section listing:
1. The 3 distinct date-filter shapes currently in use (containment, updatedAt, triggerDate)
2. Where status filter is missing entirely (i.e. payroll_out paths that count VOIDED)
3. Where soft-delete is missing on DriverSettlement
4. Where bonus aggregation reads master DriverBonus.amount instead of joining through settlementId

Also note: confirm by reading `apps/web/prisma/schema.prisma` (lines 2694-2800) that:
- DriverBonus has `settlementId String?` FK (line ~2708) and `bonuses DriverBonus[]` back-relation on DriverSettlement (line ~2793)
- There is NO `SettlementBonus` or `SettlementDeduction` join table — the task description's reference to "amount_collected on SettlementBonus/SettlementDeduction" should be reinterpreted as "DriverBonus.amount where settlementId IN counted settlements" and "DriverSettlement.totalDeductions across counted settlements". Document this reinterpretation in AUDIT.md so Task 2 doesn't try to query non-existent tables.

Do NOT modify any production code in this task. Audit only.
  </action>
  <verify>
1. File exists at `.planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md`
2. Markdown table has 11 rows (one per public reporting.ts export) plus 1 row for `buildSettlementWhere`
3. Root Cause Summary names ≥3 distinct date-filter shapes
4. Schema reinterpretation note present
5. SAMMY predicted-returns column populated for every function that touches money
  </verify>
  <done>Audit doc committed; reinterpretation of schema (no SettlementBonus/SettlementDeduction tables) explicitly captured; root causes enumerated. No production files touched.</done>
</task>

<task type="auto">
  <name>Task 2: Build canonical predicate module + refactor reporting.ts</name>
  <files>
apps/web/src/lib/driver-pay/reporting-predicate.ts
apps/web/src/lib/driver-pay/reporting.ts
  </files>
  <action>
**Create `apps/web/src/lib/driver-pay/reporting-predicate.ts`:**

```ts
import type { Prisma, DriverSettlementStatus } from '@/generated/prisma';
import type { PeriodRange, ReportFilters } from './reporting';

// Status scopes — explicit constants, no per-function improvisation.
export const COUNTED_FOR_PAYROLL_OUT = ['PAID'] as const satisfies readonly DriverSettlementStatus[];
export const COUNTED_FOR_APPROVED   = ['FINALIZED', 'PAID'] as const satisfies readonly DriverSettlementStatus[];

export type CountedScope = 'payroll_out' | 'approved';

const SCOPE_TO_STATUSES: Record<CountedScope, readonly DriverSettlementStatus[]> = {
  payroll_out: COUNTED_FOR_PAYROLL_OUT,
  approved:    COUNTED_FOR_APPROVED,
};

/**
 * Canonical settlement filter for ALL driver-pay reporting aggregations.
 *
 * Semantics:
 * - Period OVERLAP (not containment): periodStart <= range.end AND periodEnd >= range.start
 * - Status scope: explicit (payroll_out = PAID only; approved = FINALIZED + PAID)
 * - Soft-delete excluded: deletedAt: null
 * - Tenant + driver/status filters from ReportFilters applied uniformly
 *
 * Every function that asks "what settlements count for this window?" MUST use this.
 * Never inline period containment or status filtering anywhere else in the file.
 */
export function countedSettlementsWhere(
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
  scope: CountedScope,
): Prisma.DriverSettlementWhereInput {
  const statuses = SCOPE_TO_STATUSES[scope];

  const where: Prisma.DriverSettlementWhereInput = {
    tenantId,
    deletedAt: null,
    // Period overlap (NOT containment)
    periodStart: { lte: range.end },
    periodEnd:   { gte: range.start },
    status: { in: [...statuses] },
  };

  if (filters.driverIds && filters.driverIds.length > 0) {
    where.driverId = { in: filters.driverIds };
  }

  // Honour the user-supplied status filter ONLY when it narrows further
  // (e.g. user selects "PAID" while scope is "approved" -> intersect to PAID).
  if (filters.status && filters.status !== 'ALL') {
    const userStatus = filters.status as DriverSettlementStatus;
    if (statuses.includes(userStatus)) {
      where.status = userStatus;
    } else {
      // User selected a status outside the scope (e.g. VOIDED while scope = payroll_out)
      // -> return a where clause that matches nothing.
      where.status = { in: [] };
    }
  }

  return where;
}
```

**Refactor `apps/web/src/lib/driver-pay/reporting.ts`:**

1. Delete the internal `buildSettlementWhere` function entirely.
2. Import `countedSettlementsWhere, COUNTED_FOR_PAYROLL_OUT, COUNTED_FOR_APPROVED` from `./reporting-predicate`.
3. **computeOverviewKpis** — rewrite:
   - Build `payrollWhere = countedSettlementsWhere(tenantId, range, filters, 'payroll_out')`
   - Build `priorPayrollWhere = countedSettlementsWhere(tenantId, priorRange, filters, 'payroll_out')`
   - Query settlements with `select: { id, driverId, netPay, totalDeductions }` (id needed for bonus join)
   - `currentTotal` = sum netPay (already only PAID, so dropping the in-memory `.filter` is correct)
   - `currentPaid` = `new Set(settlements.map(s => s.driverId)).size` (drop the redundant `.filter(s.status==='PAID')` — predicate already enforces)
   - `currentAvg` = `currentPaid > 0 ? currentTotal.div(currentPaid) : null` (return `KpiValue` with `current: '—'` when null, NOT '0.00')
   - `currentDeductions` = sum `totalDeductions` from counted settlements (DriverSettlement.totalDeductions is the source of truth — already only PAID rows after predicate)
   - `currentBonuses` = query `prisma.driverBonus.findMany({ where: { tenantId, deletedAt: null, settlementId: { in: settlements.map(s=>s.id) } }, select: { amount: true } })` then sum. NO `triggerDate` window — settlement membership is the gate.
   - Mirror all four for prior period.
   - Update the `OverviewKpis.avgNetPay` type — change `KpiValue.current: string` to `string | null` if you must, OR keep string and return `'—'` (em dash) when divisor is 0. Pick the latter to minimise downstream churn. Document choice with a comment.
4. **computeNetPayTrend** — use `countedSettlementsWhere(..., 'payroll_out')`. Drop containment. Same select. Same bucketing logic.
5. **computeDeductionBreakdown** — change strategy:
   - Get counted settlements with `select: { id }` using `countedSettlementsWhere(..., 'payroll_out')`.
   - Currently this function uses `DriverDeduction.updatedAt` which is wrong (master record activity, not settlement period). Phase 11 was supposed to fix this. Since there is no `SettlementDeduction` join table, fall back to a documented approximation: aggregate `DriverDeduction.amountCollected` for deductions whose `driverId` is in `{driverIds of counted settlements}` AND `updatedAt` overlaps the window — but add a `TODO(phase-11): replace with SettlementDeduction join when available` comment. Keep behaviour explicit and documented; don't pretend it's perfect.
   - If counted settlements set is empty, return `[]` immediately.
6. **computeDriverDetail** — replace the inline `status: { in: ['FINALIZED','PAID'] }` and `periodEnd: { gte, lte }` containment with `countedSettlementsWhere(tenantId, { start: ytdStart, end: ytdEnd }, { driverIds: [driverId] }, 'approved')`. YTD bonuses for driver detail should still come from `DriverBonus` filtered by `settlementId IN (counted settlement ids for this driver in YTD)` — match the new pattern, not the old `triggerDate` window. Update the bonus query accordingly. Deduction balances stay as-is (they're a balance snapshot, not a period aggregation).
7. **computeRollingAvgNetPay** — already uses `status: { in: ['FINALIZED','PAID'] }` which matches `approved` scope. Leave behaviour, but add a comment noting it intentionally uses `approved` scope (rolling avg is for anomaly detection, not payroll_out reporting). Do not refactor to use countedSettlementsWhere because it doesn't take a PeriodRange (uses `periodEnd: { lt: anchor }` with `take: weeks`).
8. **computeOperationalMetrics** — does not aggregate counted settlements (it queries assignments, disputes, garnishments). Leave untouched but add a top-of-function comment explaining why it's exempt from the predicate.
9. **getPeriodRange, getPriorPeriodRange, computeDeltaPct, isNetPayAnomaly** — pure helpers, no DB calls, no changes needed.

**Wire the settlements table query.** Read `apps/web/src/app/api/driver-pay/reports/settlements/route.ts`. If it builds its own where clause (likely uses the same broken containment), refactor it to use `countedSettlementsWhere(tenantId, range, filters, 'payroll_out')`. This is the fix for "No settlements in this period". If the route delegates to a function in reporting.ts that you've already fixed, no further change needed.

**Run `pnpm --filter web exec tsc --noEmit`** before declaring done. Zero errors.

**Constraints reminder:**
- decimal.js for every monetary sum
- Divide-by-zero returns null (rendered as em dash), never 0
- VOIDED never in payroll_out scope
- Period OVERLAP, not containment
- Bonuses gated via settlementId join, NOT triggerDate
- No SettlementBonus/SettlementDeduction tables exist — don't invent them
  </action>
  <verify>
1. `pnpm --filter web exec tsc --noEmit` exits 0
2. `apps/web/src/lib/driver-pay/reporting-predicate.ts` exists and exports `countedSettlementsWhere`, `COUNTED_FOR_PAYROLL_OUT`, `COUNTED_FOR_APPROVED`, `CountedScope`
3. `grep -n "buildSettlementWhere" apps/web/src/lib/driver-pay/reporting.ts` returns nothing (old function removed)
4. `grep -n "countedSettlementsWhere" apps/web/src/lib/driver-pay/reporting.ts` returns at least 4 call sites (computeOverviewKpis x2 current+prior, computeNetPayTrend, computeDeductionBreakdown, computeDriverDetail)
5. `grep -n "triggerDate" apps/web/src/lib/driver-pay/reporting.ts` shows triggerDate is no longer used as a period filter for bonus aggregation in computeOverviewKpis or computeDriverDetail (still allowed for the bonus list display field)
6. Settlements API route uses the predicate (manual check of `apps/web/src/app/api/driver-pay/reports/settlements/route.ts`)
  </verify>
  <done>
Canonical predicate module exists. All 4 aggregation functions on the Reports page path
(computeOverviewKpis, computeNetPayTrend, computeDeductionBreakdown, computeDriverDetail)
use it. Settlements API route uses it. computeOperationalMetrics and computeRollingAvgNetPay
have justification comments. TypeScript compiles clean. No SettlementBonus/SettlementDeduction
references introduced.
  </done>
</task>

<task type="auto">
  <name>Task 3: Regression tests covering SAMMY data shape</name>
  <files>apps/web/src/lib/driver-pay/__tests__/reporting.test.ts</files>
  <action>
Create `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts` (NEW file — task description's
suggested path `apps/web/__tests__/driver-pay/reporting.test.ts` is wrong for this repo; existing
driver-pay tests live in `apps/web/src/lib/driver-pay/__tests__/` and `apps/web/src/app/api/driver-pay/__tests__/`).
Use Vitest with the same in-memory or mocked Prisma pattern used by the 21 existing tests
(check `apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts` for the existing mock
shape and reuse it — do NOT introduce a new mocking approach).

Write at minimum 8 new test cases. All must FAIL on the pre-refactor reporting.ts and PASS
after Task 2.

**Test fixture — replicate SAMMY's exact data shape:**
- Tenant: `tenant_demoteam`
- Driver: `driver_sammy` (payModel = CONTRACTOR, firstName Sammy, lastName Issa)
- Settlement A (PAID): periodStart May 9 2026, periodEnd May 15 2026, status PAID, netPay 641.13, totalDeductions 100.00, deletedAt null
- Settlement B (VOIDED): periodStart May 16 2026, periodEnd May 22 2026, status VOIDED, netPay 307.80, totalDeductions 0.00, deletedAt null
- DriverBonus C (installment): amount 333.33, settlementId = Settlement A.id, triggerDate May 13 2026, deletedAt null, installmentNumber 1, totalInstallments 4
- DriverBonus D-E-F (master rows for unsettled installments): amount 333.33 each, settlementId = null, triggerDate May 13/20/27 2026, deletedAt null — total of these three = 999.99, plus C = $1,333.32. (Task description says master total is $1,500; add one more $166.68 row or adjust to whatever sums to $1,500 — the exact distribution is irrelevant, what matters is that the SUM of all DriverBonus rows is $1,500 and the sum of rows with settlementId = Settlement A.id is $333.33.)
- DriverDeduction G: amountCollected 100.00, updatedAt May 14 2026, deductionType STANDARD, deletedAt null

**Test window:** range = May 11 2026 → May 27 2026.

**Required test cases (label each with `it.concurrent` or `it`, mirror existing test style):**

1. `computeOverviewKpis returns currentTotal=$641.13 (PAID-only, excludes VOIDED)` — assert `result.totalPayroll.current === '641.13'`.

2. `computeOverviewKpis returns driversPaid=1 (counts the PAID settlement)` — assert `result.driversPaid.current === 1`.

3. `computeOverviewKpis returns avgNetPay=$641.13 when 1 driver paid` — assert `result.avgNetPay.current === '641.13'` (single driver paid: total/1 = total).

4. `computeOverviewKpis returns avgNetPay=null/em-dash when zero drivers paid` — empty fixture, assert returned shape (document whether it's `null`, `'—'`, or `'0.00'`; assert the SHIPPED choice).

5. `computeOverviewKpis returns totalDeductions=$100.00 from PAID settlement only` — assert `result.totalDeductions.current === '100.00'`. Add a second VOIDED settlement with totalDeductions=$50 and confirm it does NOT contribute.

6. `computeOverviewKpis returns totalBonuses=$333.33 via settlementId join (NOT $1,500 from master DriverBonus rows)` — this is the headline regression. Assert `result.totalBonuses.current === '333.33'`.

7. `computeOverviewKpis excludes soft-deleted settlements` — add a 3rd settlement: PAID, netPay $1000, deletedAt = May 10 2026. Assert it does NOT appear in totalPayroll.

8. `computeOverviewKpis honours period overlap (settlement May 9-15 counts for window May 11-27)` — this is the second headline regression. Without overlap semantics, Settlement A (periodStart < range.start) would be excluded.

9. `computeNetPayTrend returns exactly one bucket containing $641.13 for May 11-27 window` — asserts trend chart agrees with KPI.

10. `Settlements list endpoint result == counted settlements` — query the same predicate via `countedSettlementsWhere` directly in the test, count rows, assert 1 row (Settlement A only).

11. `computeOverviewKpis with status filter='VOIDED' returns empty (out of payroll_out scope)` — verify the predicate's intersect-or-empty logic.

12. `computeDriverDetail YTD bonuses for SAMMY count only settled installments via settlementId, not all master rows` — assert YTD bonuses = $333.33, not $1,500.

(8 minimum is the floor; aim for 10-12.)

After writing, run from repo root:
```
pnpm --filter web exec vitest run src/lib/driver-pay/__tests__/reporting.test.ts
pnpm --filter web exec vitest run src/app/api/driver-pay/__tests__/reports-api.test.ts
```
Both must pass. Combined with the 21 existing tests, the total passing count should be 29+
(21 existing + 8+ new). If any of the 21 existing tests now fail, the refactor changed
contract — DO NOT silently update them; flag in the checkpoint below for human review.
  </action>
  <verify>
1. `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts` exists
2. Contains at least 8 `it(...)` blocks (count with grep)
3. `pnpm --filter web exec vitest run src/lib/driver-pay/__tests__/reporting.test.ts` exits 0 with ≥8 passing
4. `pnpm --filter web exec vitest run src/app/api/driver-pay/__tests__/reports-api.test.ts` exits 0 with 21 passing (no regression in existing tests, or any failures explicitly flagged)
5. Total driver-pay test count is ≥29 passing
  </verify>
  <done>New test file passes against refactored code; existing 21 tests still pass; ≥29 total green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Production verification on demoteam tenant</name>
  <files>(no files — verification checkpoint after vercel --prod deploy)</files>
  <action>
Before presenting this checkpoint to the user, Claude MUST:
1. Run `pnpm --filter web exec tsc --noEmit` from repo root — confirm zero errors.
2. Run `pnpm --filter web exec vitest run src/lib/driver-pay src/app/api/driver-pay` — confirm ≥29 tests passing.
3. Deploy via `vercel --prod` from repo root (per project policy — Vercel CLI only, never git push for deploys).
4. After deploy completes, surface the production URL and present the verification instructions in `<how-to-verify>` to the user.

Do NOT skip the deploy — the verification windows below require the fix to be live on production demoteam.
  </action>
  <verify>
User confirms all three verification windows return correct KPIs by typing "approved", OR
flags a specific KPI mismatch which Claude must diagnose before this task can be marked done.
  </verify>
  <done>User has typed "approved" after confirming all three production verification windows (SAMMY May 11-27, May 1-31, Q2 2026) return correct figures and no console/server errors.</done>
  <what-built>
- `apps/web/src/lib/driver-pay/reporting-predicate.ts` (new canonical predicate)
- `apps/web/src/lib/driver-pay/reporting.ts` refactored (4 functions on Reports page path use the predicate; settlements API route uses it; bonus aggregation joined via settlementId)
- `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts` with 8+ regression tests covering SAMMY data shape
- `.planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md` documenting every filter that was wrong
- Deploy via `vercel --prod` after `pnpm --filter web exec tsc --noEmit` passes
  </what-built>
  <how-to-verify>
After Claude deploys (will run `pnpm --filter web exec tsc --noEmit` then `vercel --prod`):

**Verification window 1 — SAMMY, May 11-27, 2026 (the original bug):**

1. Sign in to production as demoteam owner.
2. Go to Driver Pay → Reports.
3. Set period to custom: start = May 11 2026, end = May 27 2026, driver filter = SAMMY.
4. Confirm KPI values exactly:
   - Total Payroll: **$641.13**
   - Drivers Paid: **1**
   - Avg Net Pay: **$641.13**
   - Total Deductions: **$100.00**
   - Total Bonuses: **$333.33**  ← was $1,500, now must be the single settled installment
5. Confirm Net Pay Trend chart shows one data point at $641.13 (NOT $307.80).
6. Confirm Settlements table shows exactly 1 row: PAID, May 9-15, $641.13. No "No settlements in this period" message.
7. Confirm VOIDED settlement (May 16-22, $307.80) does NOT appear anywhere on the page (table, KPIs, chart).

**Verification window 2 — wider window May 1-31, 2026:**

8. Change period to May 1 2026 → May 31 2026, driver = SAMMY.
9. Confirm KPIs still show payroll_out figures excluding VOIDED. Total Bonuses should still gate via settlement-membership (only installments attached to PAID settlements that overlap the window).

**Verification window 3 — quarter Q2 2026 (Apr 1 - Jun 30):**

10. Change period to Q2 (Apr 1 → Jun 30 2026), no driver filter (all drivers).
11. Confirm Total Payroll = sum of all PAID settlements overlapping Q2 for demoteam.
12. Confirm Drivers Paid = distinct count of drivers with ≥1 PAID settlement overlapping Q2.
13. Sanity check: open browser console, confirm no errors. Open Vercel logs, confirm no API 500s.

**Tests passing locally:**

14. Confirm Claude reported ≥29 driver-pay tests passing (21 existing + ≥8 new).

If any KPI is wrong on any of the 3 windows, type the exact mismatch (expected vs actual)
and Claude will diagnose. If all 3 windows pass, type "approved".
  </how-to-verify>
  <resume-signal>Type "approved" to mark complete, or describe any KPI mismatch (window, KPI name, expected value, actual value).</resume-signal>
</task>

</tasks>

<verification>
- `pnpm --filter web exec tsc --noEmit` exits 0
- `pnpm --filter web exec vitest run src/lib/driver-pay` shows ≥29 tests passing
- `pnpm --filter web exec vitest run src/app/api/driver-pay/__tests__/reports-api.test.ts` shows 21 passing (existing tests unchanged)
- Production Reports page for SAMMY May 11-27 shows: $641.13 / 1 / $641.13 / $100.00 / $333.33
- Production Reports page Net Pay Trend shows $641.13 single point (not $307.80)
- Production Settlements table shows 1 row (PAID May 9-15), not "No settlements in this period"
- VOIDED settlement never appears in payroll_out KPIs, chart, or table
- No regressions in the 3 production verification windows
</verification>

<success_criteria>
- One canonical predicate `countedSettlementsWhere` in `reporting-predicate.ts` is the single
  source of truth for "which settlements count for this window in this scope"
- All 4 aggregation functions on the Reports page path (computeOverviewKpis,
  computeNetPayTrend, computeDeductionBreakdown, computeDriverDetail) plus the
  settlements API route use the predicate
- Period semantics = OVERLAP, not containment, everywhere on the Reports page path
- VOIDED settlements never count in payroll_out anywhere
- DriverBonus aggregation gated via `settlementId IN (counted settlements)`, not master
  `triggerDate` window
- Soft-delete (`deletedAt: null`) enforced on settlements and bonuses
- Divide-by-zero in avgNetPay returns null / em dash, not "$0.00"
- 21 existing tests still pass; ≥8 new tests added; total ≥29 passing
- TypeScript compiles clean
- Production verified on 3 windows for demoteam SAMMY data
- AUDIT.md committed with per-function table + root-cause summary
- No changes to: settlement state machine, schema, Phase 11 work, PDF renderer, Driver
  Portal, Mobile app
</success_criteria>

<output>
After completion, create `.planning/quick/308-standardize-driver-pay-reports-filter-se/308-SUMMARY.md` summarising:
- Audit findings (link to AUDIT.md)
- The canonical predicate API surface (function signature, scopes, semantics)
- Before/after numbers for SAMMY on the 3 verification windows
- Tests added (count + list)
- Anything deferred to Phase 11 (e.g. SettlementDeduction join table for true
  computeDeductionBreakdown accuracy)
</output>
