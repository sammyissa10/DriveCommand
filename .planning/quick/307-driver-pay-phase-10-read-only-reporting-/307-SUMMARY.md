---
phase: quick-307
plan: "01"
subsystem: driver-pay-reporting
tags: [driver-pay, reporting, recharts, decimal.js, vitest, rbac]
dependency_graph:
  requires: [quick-306-driver-pay-phase-9]
  provides: [driver-pay-reports-dashboard, driver-pay-per-driver-detail, reports-api-routes]
  affects: [carrier-driver-pay-nav]
tech_stack:
  added: []
  patterns: [server-component-direct-query, client-fetch-on-state-change, recharts-line-donut-sparkline, decimal-aggregation-helpers]
key_files:
  created:
    - apps/web/src/lib/driver-pay/reporting.ts
    - apps/web/src/app/api/driver-pay/reports/overview/route.ts
    - apps/web/src/app/api/driver-pay/reports/settlements/route.ts
    - apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts
    - apps/web/src/app/api/driver-pay/reports/operational-metrics/route.ts
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/KpiCard.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/PeriodSelector.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/FilterBar.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPayTrendChart.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/DeductionDonut.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/SettlementsTable.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/OperationalMetrics.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPaySparkline.tsx
    - apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts
  modified: []
decisions:
  - "CarrierDriver queries use RLS-scoped getTenantPrisma without explicit orgId filter (matches existing pattern in bonuses/deductions routes)"
  - "computeDeductionBreakdown uses updatedAt as proxy for period activity — TODO Phase 7 join table"
  - "Garnishment cap hit rate uses simplified heuristic (maxPercentageOfNet > 0) pending Phase 7 DeductionApplication table"
  - "JS-side week bucketing in computeNetPayTrend (no raw SQL) for testability; Phase 11 can optimize"
metrics:
  duration: "~35 minutes"
  completed: "2026-05-14"
  tasks: 4
  files: 16
---

# Quick Task 307: Driver Pay Phase 10 — Read-Only Reporting Summary

**One-liner:** Read-only driver pay reporting layer with KPI dashboard, per-driver detail, 4 RBAC-gated API routes, recharts charts, anomaly detection, and 21-test Vitest suite.

## Files Created

### Aggregation Library
- `apps/web/src/lib/driver-pay/reporting.ts` — 11 exported functions: `getPeriodRange`, `getPriorPeriodRange`, `computeDeltaPct`, `computeOverviewKpis`, `computeNetPayTrend`, `computeDeductionBreakdown`, `computeOperationalMetrics`, `computeDriverDetail`, `computeRollingAvgNetPay`, `isNetPayAnomaly`. All money: `decimal.js`. All dates: `date-fns`.

### API Routes (4 routes, all read-only)
- `GET /api/driver-pay/reports/overview` — KPIs + trend + donut; period + filter params
- `GET /api/driver-pay/reports/settlements` — paginated/sorted list with `isAnomaly` per row
- `GET /api/driver-pay/reports/drivers/[driverId]` — per-driver YTD detail (Next.js 15 `await ctx.params`)
- `GET /api/driver-pay/reports/operational-metrics` — velocity/disputes/garnishment/carryover

### Pages (2 server components)
- `/carrier/driver-pay/reports` — 5 KPI cards, period selector, filter bar, charts, settlements table, operational metrics
- `/carrier/driver-pay/reports/[driverId]` — YTD KPIs, settlements, bonuses, deduction progress bars, sparkline

### Components (8 components)
- `KpiCard` — server-safe, Intl.NumberFormat, ArrowUp/Down/Minus delta
- `PeriodSelector` — client, shadcn Select + custom date inputs
- `FilterBar` — client, driver multi-select popover + employment type + status selects
- `NetPayTrendChart` — recharts LineChart, $-compact Y axis
- `DeductionDonut` — recharts PieChart (innerRadius=50), scrollable legend
- `SettlementsTable` — client, pagination+sorting, anomaly Badge, Skeleton loading
- `OperationalMetrics` — client, 4 metric cards, Skeleton loading
- `NetPaySparkline` — recharts tiny line (h=60), no axes

## Test Results

21 tests, 21 passed, 0 failed.

```
Test Files  1 passed (1)
Tests       21 passed (21)
```

### Test Coverage Breakdown
- **RBAC (overview)**: 401 no session, 403 DRIVER, 200 OWNER — 3 tests
- **KPI fixture**: totalPayroll sum, driversPaid count, avgNetPay, delta computation, null delta — 3 tests
- **Period boundaries**: this_week range days, gte boundary inclusion, day-before exclusion — 3 tests
- **Delta %**: +50%, -50%, null (div-by-zero), 0% — 4 tests
- **Tenant isolation**: where.tenantId spy, cross-tenant 404 — 2 tests
- **Per-driver RBAC**: DRIVER→403, MANAGER→200, unauthed→401 — 3 tests
- **Settlements RBAC**: 401, 403, 200 paginated — 3 tests

### KPI Fixture Totals (Proven by Tests)
- 5 settlements: netPay=[1800, 1500, 2000, 900, 1200] → totalPayroll=7400.00
- 3 distinct PAID driverIds (d1, d2, d3) → driversPaid=3
- avgNetPay = 7400/3 = 2466.67
- totalDeductions = 200+100+300+50+150 = 800.00
- 2 bonuses: [250, 500] → totalBonuses=750.00

## Routes and RBAC Posture

| Route | OWNER | MANAGER | SYSTEM_ADMIN | DRIVER | Unauthed |
|-------|-------|---------|--------------|--------|----------|
| GET /api/driver-pay/reports/overview | 200 | 200 | 200 | 403 | 401 |
| GET /api/driver-pay/reports/settlements | 200 | 200 | 200 | 403 | 401 |
| GET /api/driver-pay/reports/drivers/[driverId] | 200 | 200 | 200 | 403 | 401 |
| GET /api/driver-pay/reports/operational-metrics | 200 | 200 | 200 | 403 | 401 |

All routes: `export const dynamic = 'force-dynamic'`

## Open Items for Phase 11 (CSV Export Wiring)

Three `TODO(phase-11)` locations:
1. `SettlementsTable.tsx:156` — "Export CSV" button with `alert('CSV export wires up in Phase 11')`
2. `reports/[driverId]/page.tsx:132` — "Export CSV" button on per-driver settlement table
3. `reports/page.tsx:181` — disabled "Export Metrics CSV (Phase 11)" button near OperationalMetrics

Phase 11 export engine needs to wire real CSV generation to these 3 call sites.

## Deviations from Plan

None - plan executed exactly as written, with one clarification:

**CarrierDriver tenant scoping**: The existing codebase queries `carrierDriver.findFirst({ where: { id: driverId } })` without explicit `orgId` filter, relying on `getTenantPrisma()` RLS. This was adopted to match the pattern in `apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts`. The per-driver detail route adds an explicit 404 check before calling helpers.

## Self-Check: PASSED

All 16 files created and confirmed present on disk. All 4 git commits verified:
- `d93cd19` feat(quick-307): add driver pay reporting aggregation library
- `347fb84` feat(quick-307): add 4 driver pay reports API routes
- `52c0aa9` feat(quick-307): add driver pay reports dashboard + per-driver detail page
- `5749394` test(quick-307): add vitest suite for driver pay reports API

TypeScript: 0 errors (only pre-existing render-mdx.ts error unrelated to this task).
Tests: 21/21 passed.
