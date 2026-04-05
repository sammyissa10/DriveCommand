---
phase: quick-163
plan: "01"
subsystem: carrier-ops
tags: [carrier-ops, reports, api, sql-aggregation, revenue, driver-pay, aging, performance]
dependency_graph:
  requires:
    - quick-162 (carrier expenses, pay records, documents API — prerequisite data models)
    - carrier Prisma models: CarrierLoad, CarrierClient, CarrierDispatch, CarrierDriver, CarrierStop, CarrierExpense, DriverPayRecord
  provides:
    - GET /api/v1/carrier/reports/revenue
    - GET /api/v1/carrier/reports/driver-pay
    - GET /api/v1/carrier/reports/aging
    - GET /api/v1/carrier/reports/performance
  affects:
    - apps/web/src/lib/carrier/reports.ts (new shared reports library)
tech_stack:
  added: []
  patterns:
    - $queryRaw with Prisma.sql for SQL-level aggregation (revenue, aging, performance)
    - Prisma findMany with nested include for relational data (driver-pay)
    - regexp_match in PostgreSQL to extract embedded tags from notes field
    - getSession auth pattern consistent with all other /api/v1/carrier/* routes
key_files:
  created:
    - apps/web/src/lib/carrier/reports.ts
    - apps/web/src/app/api/v1/carrier/reports/revenue/route.ts
    - apps/web/src/app/api/v1/carrier/reports/driver-pay/route.ts
    - apps/web/src/app/api/v1/carrier/reports/aging/route.ts
    - apps/web/src/app/api/v1/carrier/reports/performance/route.ts
  modified: []
decisions:
  - "dispatch_number extracted from notes field via regexp_match([DISPATCH_NUMBER=...] tag) — CarrierDispatch schema has no dispatchNumber column; number is embedded in notes by createDispatch()"
  - "over_credit_limit always returns false — CarrierClient has no credit_limit column; field included in interface for forward-compatibility when credit management is added"
  - "Performance report uses 4 branched $queryRaw calls instead of dynamic WHERE building — Prisma.sql requires static SQL fragments; branching avoids string concatenation"
  - "Revenue report sets total_paid=0 and outstanding=total_invoiced — no payment status field exists on CarrierLoad; TODO comment added for payment integration"
metrics:
  duration: 255s
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
---

# Phase quick-163 Plan 01: Carrier Ops Reports API Endpoints Summary

**One-liner:** 4 carrier ops report endpoints (revenue/driver-pay/aging/performance) backed by SQL-level aggregation in a shared reports.ts library.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create reports.ts library with 4 SQL-aggregation query functions | 3f990c9 | apps/web/src/lib/carrier/reports.ts |
| 2 | Create 4 report API route handlers | 3f990c9 | 4 route.ts files under /api/v1/carrier/reports/ |

## What Was Built

**reports.ts** — shared library with 4 exported functions:

1. `getRevenueReport(orgId, filters)` — `$queryRaw` JOIN of `loads` + `clients`, grouped by `to_char(created_at, 'YYYY-MM')` and client. Returns `{ monthly_by_client[], summary, csv_url: null }`. Excludes cancelled loads.

2. `getDriverPayReport(orgId, filters)` — Prisma `findMany` on `driverPayRecord` with `driver` and `dispatch` includes. Dispatch number extracted from `dispatch.notes` via `[DISPATCH_NUMBER=...]` regex. Maps to flat DriverPayRow shape.

3. `getAgingReport(orgId)` — `$queryRaw` with `CASE/WHEN/SUM` bucketing by days since creation (0-30, 31-60, 61-90, 90+). Per-client AR buckets with `total_outstanding`. `over_credit_limit: false` always (no schema column yet).

4. `getPerformanceReport(orgId, filters)` — `$queryRaw` joining `dispatches`, `carrier_drivers`, `stops`, subquery on `carrier_expenses`. On-time % via `COUNT(CASE WHEN arrived_at <= appointment_end)`. Dispatch number via PostgreSQL `regexp_match(d.notes, '\[DISPATCH_NUMBER=([^\]]+)\]')`.

**4 route handlers** — thin GET endpoints following the existing `loads/route.ts` pattern: `getSession` auth, `session.tenantId` for org scoping, query param parsing, delegate to reports.ts, try/catch with 500 fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] dispatch.dispatchNumber does not exist in Prisma schema**
- **Found during:** Task 1 — plan referenced `dispatch: { select: { dispatchNumber: true } }` and `d.dispatch_number` in SQL
- **Issue:** CarrierDispatch model has no `dispatchNumber` field. The dispatch number is stored as `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` embedded in the `notes` field by `createDispatch()` in `dispatches.ts`.
- **Fix:**
  - Driver-pay report: select `dispatch.notes` instead, extract dispatch number at map time with JS regex `/\[DISPATCH_NUMBER=([^\]]+)\]/`
  - Performance report: use PostgreSQL `regexp_match(d.notes, '\[DISPATCH_NUMBER=([^\]]+)\]')` in SELECT, GROUP BY `d.notes` instead of `d.dispatch_number`
- **Files modified:** apps/web/src/lib/carrier/reports.ts
- **Commit:** 3f990c9

## Self-Check: PASSED

- [x] apps/web/src/lib/carrier/reports.ts — exists
- [x] apps/web/src/app/api/v1/carrier/reports/revenue/route.ts — exists
- [x] apps/web/src/app/api/v1/carrier/reports/driver-pay/route.ts — exists
- [x] apps/web/src/app/api/v1/carrier/reports/aging/route.ts — exists
- [x] apps/web/src/app/api/v1/carrier/reports/performance/route.ts — exists
- [x] Commit 3f990c9 — verified
- [x] `npx tsc --noEmit` — passes with no errors
- [x] All queries include WHERE org_id = ${orgId}
- [x] Aging endpoint returns array shape (per-client rows)
