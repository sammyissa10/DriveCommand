---
phase: quick-471
plan: 471
subsystem: route-finance
tags: [routes, finance, loads, decimal-arithmetic]
dependency-graph:
  requires: []
  provides:
    - "calculateRouteFinancials(loads) with loadRevenue + loadCount"
    - "Route Financial Summary UI linked-load revenue line"
  affects:
    - apps/web/src/lib/finance/route-calculator.ts
    - apps/web/src/app/(owner)/actions/route-analytics.ts
    - apps/web/src/components/routes/route-financial-summary.tsx
    - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
    - apps/web/src/app/(owner)/routes/[id]/page.tsx
tech-stack:
  added: []
  patterns:
    - "Decimal-only arithmetic (Prisma.Decimal) throughout financial calculators — never JS number math"
key-files:
  created: []
  modified:
    - apps/web/src/lib/finance/route-calculator.ts
    - apps/web/src/app/(owner)/actions/route-analytics.ts
    - apps/web/src/components/routes/route-financial-summary.tsx
    - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
    - apps/web/src/app/(owner)/routes/[id]/page.tsx
decisions:
  - "Manual RoutePayment records are ADDED on top of linked load rates (additive, not deduplicated) — matches accessorials/adjustments use case"
  - "totalPendingRevenue redefined as totalRevenue - totalPaidRevenue (clamped >= 0), replacing the old PENDING-payments-only sum, so it reflects the full unpaid balance including unpaid load revenue"
metrics:
  duration: "~6 min"
  completed: 2026-07-17
---

# Quick Task 471: Route Financial Summary Auto-Includes Linked Load Rates Summary

Route Financial Summary now folds non-cancelled linked-load rates into Total Revenue automatically, eliminating the need to double-enter load income as a manual Payment.

## What Changed

**`route-calculator.ts`** — `calculateRouteFinancials` gained a `loads` parameter (inserted before `profitMarginThreshold`). It filters out `CANCELLED` loads, sums their `rate` via Decimal-only arithmetic, and returns two new fields: `loadRevenue` (string) and `loadCount` (number). `totalRevenue` is now `paymentsRevenue + loadRevenue` (the old payments-only sum was renamed to the internal `paymentsRevenue` variable). `totalPendingRevenue` was redefined from "PENDING payments only" to `totalRevenue - totalPaidRevenue`, clamped to `>= 0` with `Decimal.isNegative()` — this correctly captures unpaid load revenue that has no corresponding Payment record yet. `totalPaidRevenue` (PAID payments only) and the `profit`/`marginPercent`/`isLowMargin` formulas were left unchanged in meaning; they simply now operate on the enlarged `totalRevenue`.

**`route-analytics.ts`** — `getRouteFinancialAnalytics` fetches non-cancelled `Load` rows scoped to the route (`routeId`, `status: { not: 'CANCELLED' } `, selecting only `rate` + `status`) via the tenant-scoped Prisma client, and passes them into `calculateRouteFinancials` in the new parameter position. `getFleetAverageCostPerMile` was left untouched (expenses/miles only, unaffected by this change).

**`route-financial-summary.tsx`** — Added `loadRevenue`/`loadCount` props. Under the existing "paid / pending" line, a new conditional line renders only when `loadCount > 0`: `Includes $X from N linked load(s)` with correct singular/plural.

**`route-page-client.tsx`** — Extended the inline `analytics.financials` type with `loadRevenue`/`loadCount` and passed the two new props at both `<RouteFinancialSummary>` call sites (edit-mode context view and the main view-mode render).

**`page.tsx`** — Extended the `safeAnalytics` fallback default (`analytics ?? {...}`) with `loadRevenue: '0.00'` and `loadCount: 0` so the shape matches `RouteFinancials` when `getRouteFinancialAnalytics` throws/returns null.

## Verification

- `cd apps/web && npx tsc --noEmit` — exit code 0, zero errors across the entire project (no pre-existing baseline errors remained at time of this run; no regressions introduced by the 5 touched files).
- `calculateRouteFinancials` has exactly one caller (`route-analytics.ts`), now passing 4 args (`expenses, payments, loads, profitMarginThreshold`).
- Logic trace confirmed by inspection: route with 2 non-cancelled loads ($1,000 + $1,500) and one manual PAID payment ($200) → `totalRevenue` = $2,700, `loadRevenue` = $2,500, `loadCount` = 2, `totalPaidRevenue` = $200, `totalPendingRevenue` = $2,500 (clamped, not negative), `profit` = $2,700 − expenses.
- Route with zero linked loads → `loadRevenue` = "0.00", `loadCount` = 0, `totalRevenue` unchanged (payments only), no "Includes..." line renders (guarded by `loadCount > 0`).
- Cancelled loads excluded from both `loadRevenue` and `loadCount` via the `status !== 'CANCELLED'` filter (defensive — the action-layer query already excludes them at the DB level, but the calculator re-filters so it stays correct regardless of caller behavior).

## Deviations from Plan

None — plan executed exactly as written. No architectural changes, no schema/migration changes.

## Commits

- `ef0bc4c0` — feat(quick-471): auto-include linked load rates in route financials (Task 1: calculator + action)
- `55aa4870` — feat(quick-471): surface linked load revenue in Route Financial Summary UI (Task 2: UI + type threading)

## Self-Check: PASSED

- FOUND: apps/web/src/lib/finance/route-calculator.ts (loadRevenue present)
- FOUND: apps/web/src/app/(owner)/actions/route-analytics.ts (prisma.load.findMany present)
- FOUND: apps/web/src/components/routes/route-financial-summary.tsx (linked load line present)
- FOUND: apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx (loadRevenue/loadCount props present, both call sites)
- FOUND: apps/web/src/app/(owner)/routes/[id]/page.tsx (safeAnalytics fallback updated)
- FOUND commit ef0bc4c0
- FOUND commit 55aa4870
