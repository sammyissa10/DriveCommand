---
phase: quick-163
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/reports.ts
  - apps/web/src/app/api/v1/carrier/reports/revenue/route.ts
  - apps/web/src/app/api/v1/carrier/reports/driver-pay/route.ts
  - apps/web/src/app/api/v1/carrier/reports/aging/route.ts
  - apps/web/src/app/api/v1/carrier/reports/performance/route.ts
autonomous: true
must_haves:
  truths:
    - "GET /api/v1/carrier/reports/revenue returns monthly_by_client aggregation with summary"
    - "GET /api/v1/carrier/reports/driver-pay returns pay records with driver name and dispatch number"
    - "GET /api/v1/carrier/reports/aging returns per-client AR buckets (0-30, 31-60, 61-90, 90+)"
    - "GET /api/v1/carrier/reports/performance returns per-dispatch on_time_pct and avg_dwell_minutes"
    - "All endpoints filter by org_id and reject unauthenticated requests"
  artifacts:
    - path: "apps/web/src/lib/carrier/reports.ts"
      provides: "4 report query functions with SQL aggregation"
    - path: "apps/web/src/app/api/v1/carrier/reports/revenue/route.ts"
      provides: "Revenue report GET endpoint"
    - path: "apps/web/src/app/api/v1/carrier/reports/driver-pay/route.ts"
      provides: "Driver pay report GET endpoint"
    - path: "apps/web/src/app/api/v1/carrier/reports/aging/route.ts"
      provides: "AR aging report GET endpoint"
    - path: "apps/web/src/app/api/v1/carrier/reports/performance/route.ts"
      provides: "Dispatch performance report GET endpoint"
  key_links:
    - from: "apps/web/src/app/api/v1/carrier/reports/*/route.ts"
      to: "apps/web/src/lib/carrier/reports.ts"
      via: "import query functions"
      pattern: "from '@/lib/carrier/reports'"
    - from: "apps/web/src/lib/carrier/reports.ts"
      to: "prisma.$queryRaw"
      via: "raw SQL aggregation queries"
      pattern: "prisma\\.\\$queryRaw"
---

<objective>
Create 4 carrier ops report API endpoints (revenue, driver-pay, aging, performance) backed by a shared reports library with SQL-level aggregation.

Purpose: Provide carrier ops reporting capabilities for revenue analysis, driver pay summaries, accounts receivable aging, and dispatch performance metrics.
Output: 5 new files (1 lib + 4 route handlers)
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/stops.ts (pattern: prisma import, decStr helper, interface exports)
@apps/web/src/app/api/v1/carrier/loads/route.ts (pattern: getSession auth, searchParams parsing, error handling)
@apps/web/src/generated/prisma/schema.prisma (CarrierLoad, CarrierClient, CarrierDispatch, CarrierStop, CarrierExpense, DriverPayRecord models)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create reports.ts library with 4 SQL-aggregation query functions</name>
  <files>apps/web/src/lib/carrier/reports.ts</files>
  <action>
Create `apps/web/src/lib/carrier/reports.ts` following the same pattern as other carrier lib files (import prisma from `@/lib/db/prisma`, import logger from `@/lib/logger`, define interfaces, export functions).

**Schema notes for raw SQL:**
- Table names (from @@map): `loads` (CarrierLoad), `clients` (CarrierClient), `dispatches` (CarrierDispatch), `stops` (CarrierStop), `carrier_expenses` (CarrierExpense), `driver_pay_records` (DriverPayRecord), `carrier_drivers` (CarrierDriver)
- Column names are snake_case in DB: `org_id`, `client_id`, `dispatch_id`, `total_revenue`, `created_at`, `arrived_at`, `departed_at`, `appointment_end`, `actual_miles`, `base_pay`, `bonuses`, `tips`, `deductions`, `reimbursements`, `net_pay`, `loaded_miles`, `empty_miles`, `pay_period_start`, `pay_period_end`, `dispatch_number`, `sequence_order`
- CarrierClient has NO `credit_limit` column in schema — for the aging report, always set `over_credit_limit: false` and add a comment noting the field can be added later via migration
- CarrierStop uses `arrived_at` and `departed_at` (NOT `driver_arrived_at`/`driver_departed_at`)
- Decimal columns come back as strings from $queryRaw — cast or convert as needed

**Function 1: `getRevenueReport(orgId, filters)`**
- Filters interface: `{ dateFrom?: string; dateTo?: string; clientId?: string }`
- Default dateFrom = first day of current month, dateTo = today
- Use `$queryRaw` to SELECT from `loads l JOIN clients c ON l.client_id = c.id` WHERE `l.org_id = orgId` AND `l.status != 'cancelled'` AND `l.created_at BETWEEN dateFrom AND dateTo` (and optionally `l.client_id = clientId`)
- GROUP BY `to_char(l.created_at, 'YYYY-MM')`, `l.client_id`, `c.name`
- SELECT: month, client_id, client_name, COUNT(*) as loads_count, SUM(total_revenue) as total_invoiced
- For total_paid and outstanding: since there's no payment tracking field, set total_paid=0 and outstanding=total_invoiced (add TODO comment for payment integration)
- Return `{ monthly_by_client: [...], summary: { total_invoiced, total_paid: 0, outstanding, period_start, period_end }, csv_url: null }`
- Summary is a second query or computed from monthly_by_client rows

**Function 2: `getDriverPayReport(orgId, filters)`**
- Filters interface: `{ driverId?: string; payPeriodStart?: string; payPeriodEnd?: string; status?: string }`
- Use Prisma `findMany` (NOT raw SQL) on `driverPayRecord` with `where: { orgId }` plus optional filters
- Include `driver: { select: { firstName: true, lastName: true } }` and `dispatch: { select: { dispatchNumber: true } }` (use the Prisma relation names from schema: `driver` -> CarrierDriver, `dispatch` -> CarrierDispatch)
- CarrierDriver fields: check schema for name fields — likely `first_name`, `last_name` or similar. Use `select` to get driver name.
- Order by `payPeriodStart` DESC
- Map results to return: driver_name (firstName + lastName), dispatch_number, total_miles (loadedMiles + emptyMiles), base_pay, bonuses, tips, deductions, reimbursements, net_pay, status

**Function 3: `getAgingReport(orgId)`**
- No filters needed
- Use `$queryRaw` to SELECT from `loads l JOIN clients c ON l.client_id = c.id` WHERE `l.org_id = orgId` AND `l.status NOT IN ('cancelled', 'delivered')` (unpaid = not delivered and not cancelled — or use a simpler heuristic: status NOT IN ('cancelled') AND status != 'paid' if such status exists; safest: just exclude 'cancelled' and let the buckets show all non-cancelled loads)
- Bucket by `EXTRACT(DAY FROM now() - l.created_at)`:
  - bucket_0_30: days <= 30
  - bucket_31_60: days 31-60
  - bucket_61_90: days 61-90
  - bucket_over_90: days > 90
- GROUP BY `l.client_id`, `c.name`
- Use CASE/WHEN with SUM for bucketing in a single query
- Add `total_outstanding` = sum of all buckets
- Set `over_credit_limit: false` for all rows (no credit_limit column exists yet)

**Function 4: `getPerformanceReport(orgId, filters)`**
- Filters interface: `{ dateFrom?: string; dateTo?: string; driverId?: string }`
- Use `$queryRaw` joining `dispatches d`, `carrier_drivers cd`, `stops s`, and LEFT JOIN `carrier_expenses ce`
- WHERE `d.org_id = orgId` and optional date/driver filters on `d.scheduled_departure`
- Per-dispatch aggregation:
  - `d.dispatch_number`, driver name from `cd.first_name || ' ' || cd.last_name`
  - `COUNT(s.id)` as total_stops
  - on_time_pct: `COUNT(CASE WHEN s.arrived_at <= s.appointment_end AND s.appointment_end IS NOT NULL THEN 1 END)::float / NULLIF(COUNT(CASE WHEN s.appointment_end IS NOT NULL THEN 1 END), 0) * 100`
  - avg_dwell_minutes: `AVG(EXTRACT(EPOCH FROM (s.departed_at - s.arrived_at)) / 60) FILTER (WHERE s.arrived_at IS NOT NULL AND s.departed_at IS NOT NULL)`
  - `d.actual_miles`
  - total_expenses from a subquery or LEFT JOIN on `carrier_expenses` grouped by dispatch_id: `COALESCE(SUM(ce.amount), 0)`
- GROUP BY `d.id`, `d.dispatch_number`, driver name, `d.actual_miles`

Check CarrierDriver model for actual name fields before writing (grep for `model CarrierDriver` in schema). Use the actual column names.

All functions: wrap in try/catch, log errors with logger, return typed results.
  </action>
  <verify>Run `npx tsc --noEmit` from the monorepo root to confirm no type errors in the new file.</verify>
  <done>reports.ts exports 4 functions: getRevenueReport, getDriverPayReport, getAgingReport, getPerformanceReport — all with proper types and SQL-level aggregation.</done>
</task>

<task type="auto">
  <name>Task 2: Create 4 report API route handlers</name>
  <files>
    apps/web/src/app/api/v1/carrier/reports/revenue/route.ts
    apps/web/src/app/api/v1/carrier/reports/driver-pay/route.ts
    apps/web/src/app/api/v1/carrier/reports/aging/route.ts
    apps/web/src/app/api/v1/carrier/reports/performance/route.ts
  </files>
  <action>
Create 4 GET route handlers following the exact pattern from `apps/web/src/app/api/v1/carrier/loads/route.ts`:
- Import `{ NextRequest, NextResponse }` from `next/server`
- Import `{ getSession }` from `@/lib/auth/supabase`
- Import `{ logger }` from `@/lib/logger`
- Import the relevant function from `@/lib/carrier/reports`
- Auth: `const session = await getSession(); if (!session) return 401; const orgId = session.tenantId; if (!orgId) return 403;`
- Parse query params from `req.nextUrl.searchParams`
- Call the report function, return JSON response
- Wrap in try/catch, log errors, return 500 on failure

**revenue/route.ts — GET:**
- Params: `date_from` (string, optional), `date_to` (string, optional), `client_id` (string, optional)
- Call `getRevenueReport(orgId, { dateFrom, dateTo, clientId })`
- Return the result as JSON

**driver-pay/route.ts — GET:**
- Params: `driver_id` (optional), `pay_period_start` (optional), `pay_period_end` (optional), `status` (optional)
- Call `getDriverPayReport(orgId, { driverId, payPeriodStart, payPeriodEnd, status })`
- Return the result as JSON

**aging/route.ts — GET:**
- No params needed
- Call `getAgingReport(orgId)`
- Return the result as JSON

**performance/route.ts — GET:**
- Params: `date_from` (optional), `date_to` (optional), `driver_id` (optional)
- Call `getPerformanceReport(orgId, { dateFrom, dateTo, driverId })`
- Return the result as JSON

Each route file should be ~30-40 lines. Keep them thin — all logic lives in reports.ts.
  </action>
  <verify>Run `npx tsc --noEmit` from the monorepo root. Confirm all 4 route files compile without errors and the directory structure is correct with `ls -R apps/web/src/app/api/v1/carrier/reports/`.</verify>
  <done>All 4 report endpoints exist, compile cleanly, use getSession auth, parse query params, delegate to reports.ts functions, and return JSON responses with proper error handling.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors in the new files
- All 5 new files exist at the correct paths
- All routes use getSession auth pattern (consistent with other carrier routes)
- All aggregation happens in SQL via $queryRaw (revenue, aging, performance) or Prisma findMany with includes (driver-pay)
- All queries filter by org_id
</verification>

<success_criteria>
- 4 GET endpoints return structured JSON report data
- Revenue: monthly_by_client array + summary object
- Driver Pay: array of pay records with driver name, dispatch number, totals
- Aging: per-client AR buckets (0-30, 31-60, 61-90, 90+) with total_outstanding
- Performance: per-dispatch metrics (on_time_pct, avg_dwell_minutes, actual_miles, total_expenses)
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/163-carrier-ops-reports-api-endpoints/163-SUMMARY.md`
</output>
