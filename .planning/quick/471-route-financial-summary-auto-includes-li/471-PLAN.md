---
phase: quick-471
plan: 471
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/finance/route-calculator.ts
  - apps/web/src/app/(owner)/actions/route-analytics.ts
  - apps/web/src/components/routes/route-financial-summary.tsx
  - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
autonomous: true

must_haves:
  truths:
    - "A route with linked non-cancelled loads shows Total Revenue = load rates + manual payments"
    - "The Financial Summary shows a line 'Includes $X from N linked load(s)' when loadCount > 0"
    - "totalPendingRevenue = totalRevenue − totalPaidRevenue (clamped >= 0)"
    - "A route with zero linked loads shows unchanged payments-only revenue"
    - "profit = totalRevenue − totalExpenses recomputed with load rates included"
  artifacts:
    - path: "apps/web/src/lib/finance/route-calculator.ts"
      provides: "calculateRouteFinancials accepting linked loads, returning loadRevenue + loadCount"
      contains: "loadRevenue"
    - path: "apps/web/src/app/(owner)/actions/route-analytics.ts"
      provides: "Fetches non-cancelled loads and passes to calculator"
      contains: "prisma.load.findMany"
    - path: "apps/web/src/components/routes/route-financial-summary.tsx"
      provides: "Renders linked-load revenue line"
      contains: "linked load"
  key_links:
    - from: "route-analytics.ts"
      to: "route-calculator.ts"
      via: "calculateRouteFinancials(expenses, payments, loads, threshold)"
      pattern: "calculateRouteFinancials\\("
    - from: "route-page-client.tsx"
      to: "RouteFinancialSummary"
      via: "loadRevenue + loadCount props"
      pattern: "loadRevenue"
---

<objective>
Make a Route's Financial Summary auto-include the rates of Loads linked to that route (via Load.routeId), so carrier revenue reflects load rates without double-entering manual Payment records. Manual RoutePayment records remain supported for accessorials/adjustments and are added on top.

Purpose: Eliminate double-entry — carrier revenue should reflect linked load rates automatically.
Output: Updated calculator, action, summary component, and type threading. Total Revenue = Σ(non-cancelled load rates) + Σ(manual payments), with a UI line surfacing the load-derived portion. Pure calculation + display; no DB/schema change.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/lib/finance/route-calculator.ts
@apps/web/src/app/(owner)/actions/route-analytics.ts
@apps/web/src/components/routes/route-financial-summary.tsx
@apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
@apps/web/src/app/(owner)/routes/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend calculator + action to include linked load rates</name>
  <files>
    apps/web/src/lib/finance/route-calculator.ts
    apps/web/src/app/(owner)/actions/route-analytics.ts
  </files>
  <action>
**route-calculator.ts:**

1. Add a load data interface near the top (after `RoutePaymentData`):
   ```ts
   interface RouteLoadData {
     rate: Prisma.Decimal | string;
     status: string;
   }
   ```

2. Change the `calculateRouteFinancials` signature to insert `loads` BEFORE the threshold param:
   ```ts
   export function calculateRouteFinancials(
     expenses: RouteExpenseData[],
     payments: RoutePaymentData[],
     loads: RouteLoadData[],
     profitMarginThreshold: number = 10
   ): RouteFinancials
   ```

3. Compute `loadRevenue` using Decimal-ONLY arithmetic (match existing `.reduce` + `new Decimal()` style), summing rates where status !== 'CANCELLED':
   ```ts
   const activeLoads = loads.filter((l) => l.status !== 'CANCELLED');
   const loadRevenue = activeLoads.reduce(
     (sum, l) => sum.add(new Decimal(l.rate)),
     new Decimal(0)
   );
   const loadCount = activeLoads.length;
   ```
   NOTE: Callers already pass only non-cancelled loads (see action), but keep the defensive `!== 'CANCELLED'` filter here so the function is correct regardless of input.

4. Redefine `totalRevenue` to be payments + loadRevenue. Rename the existing payments-only sum to `paymentsRevenue`, then:
   ```ts
   const totalRevenue = paymentsRevenue.add(loadRevenue);
   ```

5. Keep `totalPaidRevenue` as the sum of PAID payments only (meaning unchanged — actually collected).

6. Replace the PENDING-payments-only `totalPendingRevenue` with: everything not yet collected = totalRevenue − totalPaidRevenue, clamped to >= 0 using Decimal:
   ```ts
   let totalPendingRevenue = totalRevenue.sub(totalPaidRevenue);
   if (totalPendingRevenue.isNegative()) {
     totalPendingRevenue = new Decimal(0);
   }
   ```

7. `profit`, `marginPercent`, `isLowMargin` formulas stay identical (they read the new `totalRevenue`).

8. Extend the `RouteFinancials` interface + return object with:
   ```ts
   loadRevenue: string; // Sum of non-cancelled linked load rates
   loadCount: number;   // Count of non-cancelled linked loads
   ```
   Return `loadRevenue: loadRevenue.toFixed(2)` and `loadCount`.

9. Add a brief comment above the loadRevenue computation noting the by-design additive double-count caveat:
   ```ts
   // By design: manual RoutePayment records are ADDED on top of linked load rates.
   // If a user records a manual payment for a load already counted here, that is
   // intentional/additive (accessorials/adjustments) — not deduplicated.
   ```

**route-analytics.ts:**

1. After the existing `payments` findMany, fetch non-cancelled linked loads:
   ```ts
   // Fetch non-cancelled loads linked to this route (Load is tenant-scoped
   // and NOT RLS-exempt, so getTenantPrisma auto-injects tenantId).
   const loads = await prisma.load.findMany({
     where: {
       routeId,
       status: { not: 'CANCELLED' },
     },
     select: {
       rate: true,
       status: true,
     },
   });
   ```

2. Update the `calculateRouteFinancials` call to pass `loads` in the new position:
   ```ts
   const financials = calculateRouteFinancials(
     expenses,
     payments,
     loads,
     profitMarginThreshold
   );
   ```

Do NOT touch `getFleetAverageCostPerMile` (expenses/miles only — unaffected). Do NOT touch lane/dashboard revenue calcs (out of scope).
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit`. Confirm no NEW errors in route-calculator.ts or route-analytics.ts (repo has ~35 pre-existing baseline errors; only regressions in touched files count). Confirm `calculateRouteFinancials` has exactly one caller (route-analytics.ts) and it passes 4 args.
  </verify>
  <done>
calculateRouteFinancials accepts `loads` and returns `loadRevenue` (string) + `loadCount` (number). totalRevenue = payments + non-cancelled load rates. totalPendingRevenue = totalRevenue − totalPaidRevenue (clamped >= 0). Decimal-only arithmetic throughout. route-analytics.ts fetches non-cancelled loads and passes them through.
  </done>
</task>

<task type="auto">
  <name>Task 2: Surface load revenue in the summary UI + thread types/defaults</name>
  <files>
    apps/web/src/components/routes/route-financial-summary.tsx
    apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
    apps/web/src/app/(owner)/routes/[id]/page.tsx
  </files>
  <action>
**route-financial-summary.tsx:**

1. Add `loadRevenue: string;` and `loadCount: number;` to `RouteFinancialSummaryProps` and destructure them in the component signature.

2. Under the Total Revenue block (after the existing "paid / pending" `<div>` at ~L48-50), add a conditional line shown only when `loadCount > 0`:
   ```tsx
   {loadCount > 0 && (
     <div className="text-xs text-muted-foreground mt-1">
       Includes {formatCurrency(loadRevenue)} from {loadCount} linked load
       {loadCount === 1 ? '' : 's'}
     </div>
   )}
   ```
   Keep the existing "paid / pending" line intact above it.

**route-page-client.tsx:**

1. In the inline `analytics.financials` type (~L85-94), add:
   ```ts
   loadRevenue: string;
   loadCount: number;
   ```

2. Both `<RouteFinancialSummary ... />` usages (edit-context ~L233 and view ~L381) must add the two new props:
   ```tsx
   loadRevenue={analytics.financials.loadRevenue}
   loadCount={analytics.financials.loadCount}
   ```

**page.tsx:**

1. In the `safeAnalytics` fallback default `financials` object (~L112-120), add:
   ```ts
   loadRevenue: '0.00',
   loadCount: 0,
   ```
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit`. Confirm no NEW type errors in the three touched files — in particular RouteFinancialSummary prop types now satisfied at both call sites and the safeAnalytics fallback matches the RouteFinancials shape.
  </verify>
  <done>
RouteFinancialSummary accepts loadRevenue + loadCount and renders "Includes $X from N linked load(s)" when loadCount > 0 (singular/plural correct). Both call sites in route-page-client.tsx pass the props; the inline type and page.tsx safeAnalytics fallback include the new fields. tsc clean of regressions.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` shows no new errors in the 5 touched files (baseline ~35 pre-existing errors unchanged).
- Logic trace: route with 2 non-cancelled loads ($1,000 + $1,500) and one manual PAID payment ($200) → totalRevenue = $2,700, loadRevenue = $2,500, loadCount = 2, totalPaidRevenue = $200, totalPendingRevenue = $2,500, profit = $2,700 − expenses.
- Route with zero linked loads → loadRevenue = $0.00, loadCount = 0, revenue = payments only (unchanged behavior), no "Includes..." line rendered.
- Cancelled loads excluded from both loadRevenue and loadCount.
</verification>

<success_criteria>
- Total Revenue on the Route Financial Summary includes non-cancelled linked load rates + manual payments.
- UI shows "Includes $X from N linked load(s)" when loadCount > 0, alongside the unchanged paid/pending line.
- Pending = total − paid (clamped >= 0); profit/margin recomputed off the new total.
- Decimal-only arithmetic; single caller of calculateRouteFinancials updated.
- No schema/migration change. Executor commits only (no git push, no deploy).
</success_criteria>

<output>
After completion, create `.planning/quick/471-route-financial-summary-auto-includes-li/471-SUMMARY.md`
</output>
