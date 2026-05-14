---
phase: quick-309
plan: "01"
type: execute
wave: 1
depends_on: [quick-308]
files_modified:
  - apps/web/src/lib/driver-pay/reporting.ts
  - apps/web/src/lib/driver-pay/__tests__/reporting.test.ts
autonomous: true

must_haves:
  truths:
    - "computeDriverDetail.ytdBonuses for SAMMY returns $333.33 (only the bonus tied to the PAID settlement via settlementId), not $1,500 of master rows"
    - "computeDriverDetail.ytdBonuses returns $0 when the PAID settlement is voided (cascade revert — no counted settlements means no counted bonuses)"
    - "computeDeductionBreakdown aggregates DriverSettlement.totalDeductions over counted settlements (payroll_out scope), with DriverDeduction used only for per-driver type lookup — never DriverDeduction.updatedAt as the period anchor"
    - "computeDeductionBreakdown returns empty for windows that don't overlap any PAID settlement, even when DriverDeduction.updatedAt is recent"
    - "All 39 prior reporting tests still pass; 3 new regression tests added (total 42+)"
    - "tsc --noEmit clean for apps/web"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/reporting.ts"
      provides: "computeDriverDetail + computeDeductionBreakdown gated entirely on countedSettlementsWhere"
      contains: "settlementId: { in: ytdSettlementIds }"
    - path: "apps/web/src/lib/driver-pay/__tests__/reporting.test.ts"
      provides: "3 new regression tests for residual predicate gaps"
      contains: "describe('computeDeductionBreakdown — counted-settlement gated"
  key_links:
    - from: "apps/web/src/lib/driver-pay/reporting.ts (computeDriverDetail)"
      to: "countedSettlementsWhere(..., 'approved')"
      via: "ytdSettlementIds derived from countedSettlementsWhere result, then DriverBonus.settlementId IN that set"
      pattern: "settlementId:\\s*\\{\\s*in:\\s*ytdSettlementIds"
    - from: "apps/web/src/lib/driver-pay/reporting.ts (computeDeductionBreakdown)"
      to: "countedSettlementsWhere(..., 'payroll_out')"
      via: "aggregate DriverSettlement.totalDeductions over counted settlement set; DriverDeduction queried only by driverId for type lookup (no updatedAt window)"
      pattern: "countedSettlementsWhere.*payroll_out"
---

<objective>
Close the two residual reporting predicate gaps surfaced by the quick-308 audit:

1. **computeDriverDetail.ytdBonuses** — Re-confirm and harden the existing settlementId-join implementation. The code currently uses `settlementId: { in: ytdSettlementIds }` (good), but the task spec flags that production behavior still returns $1,500 for SAMMY. Verify the join path is truly gated (no triggerDate fallback), and add regression tests that catch:
   - Cascade revert: when the PAID settlement is voided, ytdBonuses must drop to $0
   - That unsettled master installments (settlementId = null) are never included

2. **computeDeductionBreakdown** — Currently approximates via `DriverDeduction.updatedAt` window + driverId gate. This is semantically tied to row activity, not settled money. Refactor to aggregate `DriverSettlement.totalDeductions` over the counted settlement set, then use DriverDeduction only to look up the type per driver (since DriverDeduction has no settlementId FK). Document the limitation with a `TODO(phase-11)` comment requesting a `SettlementDeduction` join table or `settlementId` FK on `DriverDeduction`.

Purpose: Lock down the canonical predicate semantics so all four payroll-out reporting functions agree on what counts as "settled money" — not what counts as "rows updated in this window".

Output: Refactored `reporting.ts` (surgical edits to 2 functions only), 3 new regression tests, all 39 prior tests still green, tsc clean.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/308-standardize-driver-pay-reports-filter-se/308-SUMMARY.md
@.planning/quick/308-standardize-driver-pay-reports-filter-se/AUDIT.md

# Files this plan modifies (read before editing)
@apps/web/src/lib/driver-pay/reporting.ts
@apps/web/src/lib/driver-pay/reporting-predicate.ts
@apps/web/src/lib/driver-pay/__tests__/reporting.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Harden computeDriverDetail.ytdBonuses + refactor computeDeductionBreakdown to settled-money aggregation</name>
  <files>apps/web/src/lib/driver-pay/reporting.ts</files>
  <action>
Make TWO surgical edits to `apps/web/src/lib/driver-pay/reporting.ts`. Do NOT touch any other function.

**Edit 1 — computeDriverDetail (lines ~584-739): Harden the existing ytdBonuses join.**

The code already uses `settlementId: { in: ytdSettlementIds }` (good). Verify and tighten:

a) Confirm the conditional skip works correctly: when `ytdSettlementIds.length === 0`, the bonus findMany is replaced with `Promise.resolve([])` (already in place at lines 631-649). Leave as-is — this is the cascade-revert guarantee.

b) Add an explicit comment block above the bonus query (replacing the existing one at line 626-627) stating:
```
// YTD bonus aggregation — gated ENTIRELY on settlementId IN (counted YTD settlement ids).
// Why: DriverBonus master rows include unsettled installments (settlementId = null).
//   Querying by triggerDate would over-count those master rows (production bug — SAMMY
//   showed $1,500 of master rows when only $333.33 was actually paid out).
// Cascade revert: if the PAID settlement is voided, it leaves the 'approved' scope,
//   ytdSettlementIds becomes empty, and the bonus query is skipped → ytd.bonuses = $0.
// DO NOT add a triggerDate fallback. DO NOT widen this to all DriverBonus rows for the driver.
```

c) No other behavior changes to computeDriverDetail.

**Edit 2 — computeDeductionBreakdown (lines ~402-452): Refactor to aggregate DriverSettlement.totalDeductions, with DriverDeduction used only for per-driver type lookup.**

Replace the entire function body with the following approach:

```ts
export async function computeDeductionBreakdown(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
): Promise<DeductionBreakdownItem[]> {
  // Get counted settlements (payroll_out scope, period overlap, PAID only)
  const countedWhere = countedSettlementsWhere(tenantId, range, filters, 'payroll_out');
  const countedSettlements = await prisma.driverSettlement.findMany({
    where: countedWhere,
    select: { driverId: true, totalDeductions: true },
  });

  if (countedSettlements.length === 0) return [];

  // Aggregate the total deduction $ per driver from counted settlements.
  // This is the source of truth for "deduction money actually paid out".
  const totalsByDriver = new Map<string, Decimal>();
  for (const s of countedSettlements) {
    const prev = totalsByDriver.get(s.driverId) ?? new Decimal(0);
    totalsByDriver.set(s.driverId, prev.plus(new Decimal(s.totalDeductions.toString())));
  }

  const countedDriverIds = [...totalsByDriver.keys()];

  // Look up which deduction TYPES each counted driver has (for breakdown labelling).
  // No date filter here — we only use this for type attribution, not period gating.
  // The MONEY comes from DriverSettlement.totalDeductions above; the TYPES come from here.
  //
  // TODO(phase-11): Add a SettlementDeduction join table (or settlementId FK on
  //   DriverDeduction) so each deduction line item can be tied to its settlement.
  //   Until then we attribute a driver's full counted-settlement totalDeductions
  //   to the deduction types active for that driver. If a driver has multiple
  //   active deduction types, we apportion their settlement totalDeductions
  //   proportionally to each type's amountCollected weighting.
  const driverDeductions = await prisma.driverDeduction.findMany({
    where: {
      tenantId,
      driverId: { in: countedDriverIds },
      deletedAt: null,
    },
    select: { driverId: true, deductionType: true, amountCollected: true },
  });

  // Group deduction rows by driver
  const deductionsByDriver = new Map<string, Array<{ deductionType: string; amountCollected: Decimal }>>();
  for (const d of driverDeductions) {
    const list = deductionsByDriver.get(d.driverId) ?? [];
    list.push({
      deductionType: d.deductionType,
      amountCollected: new Decimal(d.amountCollected.toString()),
    });
    deductionsByDriver.set(d.driverId, list);
  }

  // Apportion each driver's counted totalDeductions across their deduction types,
  // weighted by amountCollected. Drivers with no DriverDeduction rows are skipped
  // (no type → can't attribute → omitted from the breakdown).
  const buckets = new Map<string, Decimal>();
  for (const [driverId, settlementTotal] of totalsByDriver.entries()) {
    const driverRows = deductionsByDriver.get(driverId);
    if (!driverRows || driverRows.length === 0) continue;
    if (settlementTotal.isZero()) continue;

    const weightSum = driverRows.reduce(
      (acc, r) => acc.plus(r.amountCollected),
      new Decimal(0),
    );

    if (weightSum.isZero()) {
      // No weights — split evenly across types
      const evenShare = settlementTotal.div(new Decimal(driverRows.length));
      for (const r of driverRows) {
        const prev = buckets.get(r.deductionType) ?? new Decimal(0);
        buckets.set(r.deductionType, prev.plus(evenShare));
      }
    } else {
      for (const r of driverRows) {
        const share = settlementTotal.mul(r.amountCollected).div(weightSum);
        const prev = buckets.get(r.deductionType) ?? new Decimal(0);
        buckets.set(r.deductionType, prev.plus(share));
      }
    }
  }

  return Array.from(buckets.entries())
    .map(([deductionType, total]) => ({ deductionType, total: total.toFixed(2) }))
    .sort((a, b) => new Decimal(b.total).minus(new Decimal(a.total)).toNumber());
}
```

Key invariants:
- Money source = `DriverSettlement.totalDeductions` over counted (PAID, overlap, soft-delete-safe) settlements. NEVER `DriverDeduction.amountCollected` summed directly across a date window.
- `DriverDeduction.updatedAt` is NOT used anywhere in this function.
- `DriverDeduction` is queried with NO date filter — purely for type lookup per counted driver.
- If `countedSettlements` is empty, return `[]` immediately (no DriverDeduction query fired).
- Decimal.js for all monetary math.

Keep the `Prisma` import already present at line 50. Remove the unused `Prisma.DriverDeductionWhereInput` typed variable if it's no longer needed.

**Verification commands after edit:**
- Open `apps/web/src/lib/driver-pay/reporting.ts` and confirm:
  - computeDriverDetail still uses `settlementId: { in: ytdSettlementIds }` (no triggerDate filter on bonus query)
  - computeDeductionBreakdown no longer references `updatedAt` anywhere
  - `TODO(phase-11)` comment is present with the SettlementDeduction join request
- Run `cd apps/web && pnpm exec tsc --noEmit` — must be clean (zero errors).
  </action>
  <verify>
cd apps/web && pnpm exec tsc --noEmit
# Expected: no TypeScript errors

# Grep checks:
# 1. computeDriverDetail still uses settlementId join (not triggerDate window)
grep -n "settlementId: { in: ytdSettlementIds" apps/web/src/lib/driver-pay/reporting.ts
# Expected: 1 hit inside computeDriverDetail

# 2. computeDeductionBreakdown no longer uses updatedAt
grep -nA2 "function computeDeductionBreakdown" apps/web/src/lib/driver-pay/reporting.ts | grep -c "updatedAt" || echo "0 hits — correct"
# Expected: 0 hits between function start and next function

# 3. TODO(phase-11) marker present
grep -n "TODO(phase-11)" apps/web/src/lib/driver-pay/reporting.ts
# Expected: at least 1 hit inside computeDeductionBreakdown
  </verify>
  <done>
- computeDriverDetail.ytdBonuses query path is gated only on `settlementId IN (ytdSettlementIds)`; no triggerDate window filter remains. Explicit comment block documents the invariant + cascade-revert behavior.
- computeDeductionBreakdown aggregates from `DriverSettlement.totalDeductions` over counted settlements (payroll_out scope), apportioned by DriverDeduction type weighting. `DriverDeduction.updatedAt` is no longer referenced.
- `TODO(phase-11)` comment requests a `SettlementDeduction` join table or `settlementId` FK on `DriverDeduction`.
- No other functions in `reporting.ts` were modified.
- `pnpm exec tsc --noEmit` is clean in apps/web.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add 3 regression tests for residual predicate gaps + verify full suite</name>
  <files>apps/web/src/lib/driver-pay/__tests__/reporting.test.ts</files>
  <action>
Append 3 new tests to `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts`. Reuse the existing SAMMY fixture constants (`settlementA`, `settlementB`, `bonusC`, `bonusD`, `bonusE`, `bonusF`, `deductionG`, `RANGE_MAY_11_27`, `TENANT`, `DRIVER_ID`, `SETTLEMENT_A_ID`) and the existing `makePrisma` mock builder. Do NOT modify existing tests or fixtures.

Add this `describe` block at the bottom of the file (after the existing `computeDriverDetail — YTD bonuses via settlementId` block ending around line 514):

```ts
// ---------------------------------------------------------------------------
// computeDriverDetail — cascade revert & unsettled-installment exclusion (quick-309)
// ---------------------------------------------------------------------------

import { computeDeductionBreakdown } from '../reporting';

describe('computeDriverDetail — cascade revert when PAID settlement is voided (quick-309)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('19. YTD bonuses = $0.00 when the PAID settlement is voided (cascade revert via settlementId)', async () => {
    // Scenario: Settlement A is VOIDED instead of PAID.
    // 'approved' scope = FINALIZED + PAID → Settlement A NOT counted → ytdSettlementIds = []
    // Bonus query is skipped (Promise.resolve([])) → ytd.bonuses = $0.00
    //
    // Even though bonusC has settlementId = SETTLEMENT_A_ID, the predicate filters
    // out the settlement first, so the bonus has no counted parent → not aggregated.
    const prisma = makePrisma({
      currentSettlements: [],          // Settlement A is VOIDED, not in 'approved' scope
      bonusesForCurrentIds: [],        // bonus query should be skipped
      deductions: [],
      carrierDriver: { id: DRIVER_ID, firstName: 'Sammy', lastName: 'Issa', payModel: 'CONTRACTOR' },
    });

    const result = await computeDriverDetail(prisma as never, TENANT, DRIVER_ID, 2026);
    expect(result).not.toBeNull();
    expect(result!.ytd.bonuses).toBe('0.00');
    expect(result!.ytd.earnings).toBe('0.00');

    // The bonus query must NOT be called when no settlements are counted
    expect(prisma.driverBonus.findMany).not.toHaveBeenCalled();
  });

  it('20. YTD bonuses excludes unsettled master installments (settlementId = null) even when triggerDate is in YTD', async () => {
    // bonusD/E/F all have triggerDate in 2026 AND settlementId = null.
    // A pre-fix triggerDate-window query would sum these into ytd.bonuses.
    // The fixed code uses settlementId join — DB-level filter excludes settlementId=null rows
    // when settlementId: { in: [SETTLEMENT_A_ID] } is applied → mock returns only [bonusC].
    const prisma = makePrisma({
      currentSettlements: [settlementA],
      // Mock represents DB result: only bonusC matches settlementId IN ([SETTLEMENT_A_ID]).
      // bonusD/E/F (settlementId=null) are filtered out by the DB and never reach the function.
      bonusesForCurrentIds: [bonusC],
      deductions: [],
      carrierDriver: { id: DRIVER_ID, firstName: 'Sammy', lastName: 'Issa', payModel: 'CONTRACTOR' },
    });

    const result = await computeDriverDetail(prisma as never, TENANT, DRIVER_ID, 2026);
    expect(result).not.toBeNull();
    expect(result!.ytd.bonuses).toBe('333.33');

    // Verify the bonus query passes settlementId IN ([SETTLEMENT_A_ID]) — not triggerDate.
    expect(prisma.driverBonus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          settlementId: expect.objectContaining({
            in: expect.arrayContaining([SETTLEMENT_A_ID]),
          }),
        }),
      }),
    );
    const bonusCallArg = (prisma.driverBonus.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(bonusCallArg.where).not.toHaveProperty('triggerDate');
  });
});

// ---------------------------------------------------------------------------
// computeDeductionBreakdown — counted-settlement gated (quick-309)
// ---------------------------------------------------------------------------

describe('computeDeductionBreakdown — counted-settlement gated (quick-309)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('21. returns [] for a window with no counted PAID settlements, even when DriverDeduction.updatedAt is recent', async () => {
    // SCENARIO: A window that does NOT overlap Settlement A (PAID May 9-15).
    // E.g. April 1 - April 30 — no PAID settlement overlaps.
    // deductionG has updatedAt May 14 (recent), but the function must IGNORE it
    // because there are no counted settlements driving the aggregation.
    //
    // Pre-fix bug: queried DriverDeduction by updatedAt window — would have returned
    //   the $100.00 STANDARD bucket for an April window because updatedAt May 14 was
    //   "recent enough" (depending on exact filter — but conceptually wrong).
    // Post-fix: countedSettlements is empty → function returns [] immediately.

    const APRIL_WINDOW: PeriodRange = {
      start: new Date('2026-04-01'),
      end:   new Date('2026-04-30'),
    };

    const prisma = makePrisma({
      currentSettlements: [],          // No PAID settlements overlap April 2026
      deductions: [deductionG],        // updatedAt May 14 — irrelevant to April window
    });

    const result = await computeDeductionBreakdown(prisma as never, TENANT, APRIL_WINDOW, {});
    expect(result).toEqual([]);

    // The function must NOT fall back to DriverDeduction.updatedAt — verify by checking
    // that driverDeduction.findMany was never even called (short-circuited at empty settlements).
    expect(prisma.driverDeduction.findMany).not.toHaveBeenCalled();
  });

  it('22. aggregates DriverSettlement.totalDeductions over counted settlements (NOT DriverDeduction.amountCollected by updatedAt window)', async () => {
    // SCENARIO: May 11-27 window. Settlement A (PAID, $100 totalDeductions) is counted.
    // SAMMY has one DriverDeduction row (STANDARD, amountCollected $100).
    // Expected breakdown: [{ deductionType: 'STANDARD', total: '100.00' }]
    //   (100% of the $100 settlement totalDeductions attributed to the single STANDARD type)
    //
    // Verifies:
    //   - Money source is DriverSettlement.totalDeductions (not DriverDeduction.amountCollected sum)
    //   - DriverDeduction is queried WITHOUT an updatedAt filter (type lookup only)

    const prisma = makePrisma({
      currentSettlements: [settlementA],   // PAID, totalDeductions $100
      deductions: [deductionG],             // STANDARD type for SAMMY
    });

    const result = await computeDeductionBreakdown(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ deductionType: 'STANDARD', total: '100.00' });

    // Verify DriverDeduction was queried by driverId (no updatedAt window)
    expect(prisma.driverDeduction.findMany).toHaveBeenCalled();
    const deductionCallArg = (prisma.driverDeduction.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(deductionCallArg.where).not.toHaveProperty('updatedAt');
    expect(deductionCallArg.where).toHaveProperty('driverId');

    // Verify settlement query uses the canonical payroll_out predicate (PAID only)
    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: expect.arrayContaining(['PAID']) }),
        }),
      }),
    );
  });
});
```

**Important notes on the import:**
- `computeDeductionBreakdown` is NOT currently in the top-level import on line 23-28. Either:
  - Add `computeDeductionBreakdown` to the existing top-level `import { ... } from '../reporting'` statement, OR
  - Use the inline `import { computeDeductionBreakdown } from '../reporting';` shown above (placed at the top of the new describe section).
- Prefer adding it to the top-level import — cleaner.

**Run the full suite:**
```bash
cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/reporting.test.ts
```

All 39 prior tests must still pass + 3 new tests pass = 42 total in this file. Then run the full driver-pay test suite to confirm no cross-file regressions:
```bash
cd apps/web && pnpm exec vitest run src/lib/driver-pay
```

Then tsc:
```bash
cd apps/web && pnpm exec tsc --noEmit
```
  </action>
  <verify>
cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/reporting.test.ts
# Expected: 42 tests passing (39 prior + 3 new). Zero failures.

cd apps/web && pnpm exec vitest run src/lib/driver-pay
# Expected: full driver-pay suite green. No new failures introduced.

cd apps/web && pnpm exec tsc --noEmit
# Expected: zero TypeScript errors.
  </verify>
  <done>
- 3 new tests appended to `reporting.test.ts`:
  - Test 19: cascade revert — YTD bonuses = $0 when PAID settlement is voided
  - Test 20: unsettled installment exclusion — bonusD/E/F (settlementId=null) never included
  - Test 21: April window with no counted settlements returns `[]`, deduction.findMany never called
  - Test 22: May window aggregates DriverSettlement.totalDeductions ($100), DriverDeduction queried without updatedAt
- (Note: 4 tests added not 3 — the cascade revert + unsettled-installment scenarios are split for clarity per task spec which mentions both. Total 22 tests in file.)
- `pnpm exec vitest run src/lib/driver-pay/__tests__/reporting.test.ts` shows 22 passing.
- Full driver-pay suite green.
- `pnpm exec tsc --noEmit` clean.
  </done>
</task>

</tasks>

<verification>
**End-of-plan verification (run all):**

1. **Type check:**
   ```bash
   cd apps/web && pnpm exec tsc --noEmit
   ```
   Zero errors.

2. **Targeted test file:**
   ```bash
   cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/reporting.test.ts
   ```
   All tests pass (39 prior + 3-4 new).

3. **Full driver-pay test suite (no cross-file regressions):**
   ```bash
   cd apps/web && pnpm exec vitest run src/lib/driver-pay
   ```
   Green.

4. **Grep invariants:**
   - `grep -n "updatedAt" apps/web/src/lib/driver-pay/reporting.ts` — must show ZERO hits inside `computeDeductionBreakdown` (other functions like `computeOperationalMetrics` are exempt and may still reference updatedAt — that's fine).
   - `grep -n "TODO(phase-11)" apps/web/src/lib/driver-pay/reporting.ts` — must show at least 1 hit inside `computeDeductionBreakdown`.
   - `grep -n "settlementId: { in:" apps/web/src/lib/driver-pay/reporting.ts` — must show hits in BOTH `computeOverviewKpis` AND `computeDriverDetail`.

5. **Untouched-function check (smoke):**
   - `computeOverviewKpis`, `computeNetPayTrend`, `computeOperationalMetrics`, `computeRollingAvgNetPay`, `isNetPayAnomaly`, `getPeriodRange`, `getPriorPeriodRange`, `computeDeltaPct` must be byte-identical to the pre-309 version (only `computeDriverDetail` and `computeDeductionBreakdown` changed, plus a comment block added).
</verification>

<success_criteria>
- [ ] `apps/web/src/lib/driver-pay/reporting.ts` modified: `computeDriverDetail` has hardened comment block; `computeDeductionBreakdown` refactored to aggregate `DriverSettlement.totalDeductions` over counted settlements, with `DriverDeduction` used only for type lookup. `TODO(phase-11)` comment present.
- [ ] No other function in `reporting.ts` modified.
- [ ] `DriverDeduction.updatedAt` no longer referenced inside `computeDeductionBreakdown`.
- [ ] `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts` has 3-4 new tests covering: cascade revert ($0 when voided), unsettled-installment exclusion, no-counted-settlements returns `[]`, and the new aggregation source verification.
- [ ] `countedSettlementsWhere` from `reporting-predicate.ts` is NOT modified.
- [ ] `pnpm exec tsc --noEmit` clean in apps/web.
- [ ] `pnpm exec vitest run src/lib/driver-pay/__tests__/reporting.test.ts` shows 42+ tests passing.
- [ ] `pnpm exec vitest run src/lib/driver-pay` shows full driver-pay suite green.
- [ ] No schema, migration, state-machine, or other-reporting-function changes.
</success_criteria>

<output>
After completion, create `.planning/quick/309-close-residual-reporting-predicate-gaps-/309-SUMMARY.md` describing:
- The two surgical refactors (computeDriverDetail comment-hardening + computeDeductionBreakdown rewrite)
- The 3-4 new regression tests and what production behavior they lock down
- The `TODO(phase-11)` for SettlementDeduction join table
- Final test count (42+ passing)
- Confirmation that `countedSettlementsWhere` and other reporting functions were untouched
</output>
