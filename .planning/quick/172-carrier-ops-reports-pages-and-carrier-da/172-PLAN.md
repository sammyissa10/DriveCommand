---
phase: quick-172
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/compliance.ts
  - apps/web/src/app/api/v1/carrier/compliance-alerts/route.ts
  - apps/web/src/components/carrier/dashboard/AlertBar.tsx
  - apps/web/src/components/carrier/dashboard/TodayDispatches.tsx
  - apps/web/src/components/carrier/dashboard/KPIStrip.tsx
  - apps/web/src/app/(owner)/carrier/dashboard/page.tsx
  - apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx
  - apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx
  - apps/web/src/app/(owner)/carrier/reports/aging/page.tsx
  - apps/web/src/app/(owner)/carrier/reports/performance/page.tsx
autonomous: true
must_haves:
  truths:
    - "Carrier dashboard shows compliance alerts, today's dispatches, and KPI stats"
    - "Revenue report shows Recharts bar chart with monthly revenue by client plus summary table"
    - "Driver pay report shows filterable table with bulk approve"
    - "Aging report shows AR buckets with credit limit highlighting"
    - "Performance report shows dispatch metrics with filters"
  artifacts:
    - path: "apps/web/src/lib/carrier/compliance.ts"
      provides: "Compliance alert query helpers"
    - path: "apps/web/src/app/api/v1/carrier/compliance-alerts/route.ts"
      provides: "GET endpoint for compliance alerts"
    - path: "apps/web/src/app/(owner)/carrier/dashboard/page.tsx"
      provides: "Carrier dashboard page"
    - path: "apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx"
      provides: "Revenue report with Recharts bar chart"
    - path: "apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx"
      provides: "Driver pay report with bulk approve"
    - path: "apps/web/src/app/(owner)/carrier/reports/aging/page.tsx"
      provides: "AR aging report"
    - path: "apps/web/src/app/(owner)/carrier/reports/performance/page.tsx"
      provides: "Dispatch performance report"
  key_links:
    - from: "dashboard/page.tsx"
      to: "/api/v1/carrier/compliance-alerts"
      via: "AlertBar client fetch"
    - from: "dashboard/page.tsx"
      to: "/api/v1/carrier/dispatches"
      via: "TodayDispatches client fetch"
    - from: "reports/revenue/page.tsx"
      to: "/api/v1/carrier/reports/revenue"
      via: "client-side fetch with date/client filters"
---

<objective>
Build the carrier operations dashboard and four report pages.

Purpose: Give dispatchers a home base with compliance alerts, today's dispatches, KPIs, and quick actions, plus four report pages (revenue, driver-pay, aging, performance) that consume existing API endpoints.

Output: 10 new files — 1 API route, 1 lib helper, 3 dashboard components, 1 dashboard page, 4 report pages.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/reports.ts (RevenueRow, DriverPayRow, AgingRow, PerformanceRow types + all 4 report query functions)
@apps/web/src/app/api/v1/carrier/reports/revenue/route.ts (existing revenue API pattern)
@apps/web/src/app/(owner)/carrier/dispatches/page.tsx (page pattern: getSession, redirect, prisma queries)
@apps/web/src/components/carrier/dispatches/DispatchCard.tsx (STATUS_BADGE color map, card layout pattern)
@apps/web/src/components/carrier/dispatches/DispatchList.tsx (client component fetch pattern with useState/useEffect)
@apps/web/src/app/(owner)/carrier/clients/page.tsx (server page pattern with stat chips)
@apps/web/src/generated/prisma/schema.prisma (CarrierDriver.cdlExpiry, CarrierTruck.registrationExpiry/insuranceExpiry/licenseExpiry, CarrierContract.expirationDate, CarrierClient — no credit_limit column yet)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Compliance alerts API and dashboard page with components</name>
  <files>
    apps/web/src/lib/carrier/compliance.ts
    apps/web/src/app/api/v1/carrier/compliance-alerts/route.ts
    apps/web/src/components/carrier/dashboard/AlertBar.tsx
    apps/web/src/components/carrier/dashboard/TodayDispatches.tsx
    apps/web/src/components/carrier/dashboard/KPIStrip.tsx
    apps/web/src/app/(owner)/carrier/dashboard/page.tsx
  </files>
  <action>
    1. Create `apps/web/src/lib/carrier/compliance.ts`:
       - Export `getComplianceAlerts(orgId: string)` that returns an array of `{ type, severity, message, entityId, entityType, link }`.
       - Query CarrierDriver for cdlExpiry < now + 60 days (type: 'cdl_expiry').
       - Query CarrierTruck for registrationExpiry < now + 30 days (type: 'registration_expiry').
       - Query CarrierTruck for insuranceExpiry < now + 30 days (type: 'insurance_expiry').
       - Query CarrierTruck for licenseExpiry < now + 30 days (type: 'license_expiry').
       - Query CarrierContract for expirationDate < now + 30 days AND status = 'active' (type: 'contract_expiry').
       - NOTE: No medical cert or DOT inspection fields exist in schema — skip those. No credit_limit column on CarrierClient — skip AR > credit_limit check.
       - Each alert has severity: 'critical' (expired or < 7 days) vs 'warning' (7-30/60 days).
       - link field: `/carrier/drivers` for driver alerts, `/carrier/trucks` for truck alerts (trucks page doesn't exist yet but link is forward-looking), `/carrier/contracts/{id}` for contract alerts.
       - Use Prisma findMany with date comparison, NOT raw SQL. Use `import { prisma } from '@/lib/db/prisma'` and `import { logger } from '@/lib/logger'`.

    2. Create `apps/web/src/app/api/v1/carrier/compliance-alerts/route.ts`:
       - Follow exact pattern from existing report routes: getSession guard, orgId check, try/catch, logger.error.
       - GET handler calls `getComplianceAlerts(orgId)` and returns `{ data: alerts }`.

    3. Create `apps/web/src/components/carrier/dashboard/AlertBar.tsx` ('use client'):
       - Fetches `/api/v1/carrier/compliance-alerts` on mount via useEffect.
       - Renders a horizontal scrollable bar of alert chips. Critical alerts: red bg (`bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`). Warning alerts: amber bg (`bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`).
       - Each chip shows alert message and is a Link to the alert's `link` field.
       - If no alerts, render a green "All clear" chip.
       - Show skeleton loading state (3 placeholder chips with `animate-pulse`).

    4. Create `apps/web/src/components/carrier/dashboard/TodayDispatches.tsx` ('use client'):
       - Fetches `/api/v1/carrier/dispatches?date_from={todayISO}&date_to={todayISO}` on mount.
       - Renders a card list of today's dispatches. Each card shows:
         - Status badge (reuse STATUS_BADGE colors from DispatchCard: planned=slate, in_progress=blue, completed=green, cancelled=red, tonu=amber).
         - Driver chip (from dispatch.primaryDriver firstName+lastName or driverMap).
         - Truck chip (from dispatch.truck unitNumber or truckMap).
         - Stops progress bar: a thin bar showing `completedStopsCount / _count.stops` fraction filled (blue bg).
         - dispatch_number extracted from notes via `[DISPATCH_NUMBER=...]` regex.
       - Click navigates to `/carrier/dispatches/{id}`.
       - Empty state: "No dispatches scheduled for today."
       - The dispatches API already returns the needed fields. Parse the response from `{ data: { items, total } }`.

    5. Create `apps/web/src/components/carrier/dashboard/KPIStrip.tsx` ('use client'):
       - Four stat cards in a responsive grid (`grid grid-cols-2 lg:grid-cols-4 gap-4`).
       - Card 1 — "Loads This Week": fetch `/api/v1/carrier/reports/performance?date_from={weekStartISO}&date_to={todayISO}`, count = rows.length.
       - Card 2 — "Revenue This Week": fetch `/api/v1/carrier/reports/revenue?date_from={weekStartISO}&date_to={todayISO}`, use summary.total_invoiced.
       - Card 3 — "Avg Dwell (min)": from performance response, compute average of non-null avg_dwell_minutes values.
       - Card 4 — "On-Time %": from performance response, compute average of non-null on_time_pct values.
       - Each card: rounded border, bg-card, icon (use lucide: Package, DollarSign, Clock, CheckCircle), value in large bold text, label in muted text below.
       - Show skeleton state while loading (gray rectangles with animate-pulse).
       - Helper: `getWeekStartISO()` returns Monday of current week as YYYY-MM-DD.

    6. Create `apps/web/src/app/(owner)/carrier/dashboard/page.tsx`:
       - Server component with getSession/redirect guard (follow clients/page.tsx pattern).
       - Layout: page title "Dashboard" with subtitle "Carrier operations overview", then AlertBar, then KPIStrip, then a two-column layout on lg (TodayDispatches on left taking 2/3 width, Quick Actions panel on right taking 1/3).
       - Quick Actions panel: three buttons — "New Dispatch" (Link to `/carrier/dispatches` with `?new=true` or just the page), "New Load" (Link to `/carrier/loads/new`), "New Client" (Link to `/carrier/clients/new`). Each button: full-width, border, rounded, flex with icon + label, hover bg change. Icons: Send, Package, UserPlus from lucide.
  </action>
  <verify>
    Run `npx tsc --noEmit` from apps/web to confirm no TypeScript errors in the new files. Verify the dashboard page loads at /carrier/dashboard by checking the file exports a valid default React component.
  </verify>
  <done>
    Dashboard page renders AlertBar (fetching compliance alerts API), TodayDispatches (fetching today's dispatches), KPIStrip (4 stat cards from report APIs), and Quick Actions panel with 3 navigation buttons. Compliance alerts API returns alerts for CDL expiry (60d), registration/insurance/license expiry (30d), contract expiry (30d).
  </done>
</task>

<task type="auto">
  <name>Task 2: Four report pages (revenue, driver-pay, aging, performance)</name>
  <files>
    apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx
    apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx
    apps/web/src/app/(owner)/carrier/reports/aging/page.tsx
    apps/web/src/app/(owner)/carrier/reports/performance/page.tsx
  </files>
  <action>
    All four pages are 'use client' components that fetch from existing API endpoints. Follow the DispatchList pattern for client-side fetch (useState, useEffect, loading/error states). All tables use standard HTML table with Tailwind (`border-collapse`, `text-sm`, alternating row bg via `even:bg-muted/50`). All pages include the standard header pattern (h1 + subtitle p). All tables must show "No data for selected period" empty state when the result array is empty.

    1. **Revenue Report** (`/carrier/reports/revenue`):
       - State: dateFrom (default: Jan 1 of current year), dateTo (default: today), clientId (default: all), loading, data.
       - Filters row: two date inputs (`<input type="date">`), a client multi-select (fetch clients from `/api/v1/carrier/clients` on mount, render as `<select>`), and a "Filter" button that re-fetches.
       - Fetch `/api/v1/carrier/reports/revenue?date_from=X&date_to=Y` (add `&client_id=Z` if selected).
       - **Bar Chart**: Use `import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'`.
         - Transform `monthly_by_client` data: group by month, create one bar per unique client. Data shape: `[{ month: 'Jan', 'ClientA': 5000, 'ClientB': 3000 }, ...]`.
         - Wrap in `<ResponsiveContainer width="100%" height={400}>`. Use `CartesianGrid strokeDasharray="3 3"`. XAxis dataKey="month". YAxis with dollar formatter.
         - Generate distinct colors for each client using a palette array (blue, green, amber, purple, rose, cyan, orange — at least 7 colors).
       - **Summary Table** below chart: columns — Client, Loads, Total Invoiced, Total Paid, Outstanding, Avg Days to Pay (show "N/A" — not tracked yet).
         - Format dollar values with `$` prefix and 2 decimal places.
       - **CSV Export** button: onClick creates a CSV string from the table data (headers + rows), creates a Blob, triggers download via `URL.createObjectURL` + temporary `<a>` click. File name: `revenue-report-{dateFrom}-{dateTo}.csv`.

    2. **Driver Pay Report** (`/carrier/reports/driver-pay`):
       - Fetch `/api/v1/carrier/reports/driver-pay` with optional `?driver_id=X&pay_period_start=Y&pay_period_end=Z`.
       - Filters: driver select (fetch drivers from `/api/v1/carrier/dispatches` is wrong — instead fetch from a simple Prisma query... Actually, use the driver-pay API without filter first, then extract unique driver names for the filter dropdown. OR fetch drivers inline. Simplest: add driver filter as a `<select>` populated from unique driver_name values in the response data).
       - Date range: two date inputs for pay period filtering.
       - Table columns: Driver Name, Pay Period (start - end), Dispatches (show dispatch_number or "—"), Total Miles, Base Pay, Bonuses, Tips, Deductions, Reimbursements, Net Pay, Status (badge styled like dispatch status badges — pending=amber, approved=green, paid=blue).
       - **Bulk Approve** button: visible when any rows have status="pending". On click, iterate all pending record IDs and call `PATCH /api/v1/carrier/pay-records/{id}` with `{ status: 'approved' }` for each. Show toast on success/error. Note: The PATCH endpoint at `/api/v1/carrier/pay-records/[id]` may not exist yet. If so, create it in the same file pattern as other carrier API routes — getSession guard, find record by id+orgId, update status to 'approved' + set approvedBy to session.userId + approvedAt to now(). File: `apps/web/src/app/api/v1/carrier/pay-records/[id]/route.ts`.

    3. **Aging Report** (`/carrier/reports/aging`):
       - Fetch `/api/v1/carrier/reports/aging` (no filters needed — it returns all clients).
       - Table columns: Client Name, 0-30 Days, 31-60 Days, 61-90 Days, 90+ Days, Total Outstanding.
       - Format all amounts with `$` prefix and 2 decimal places.
       - Red highlight: apply `bg-red-50 dark:bg-red-900/20` to rows where `over_credit_limit === true`. Note: currently this is always false (credit_limit not in schema). The highlighting logic should still be implemented so it works when the field is added later.
       - Summary row at bottom: bold, `border-t-2`, sums each bucket column and total. Compute sums client-side from the data array.

    4. **Performance Report** (`/carrier/reports/performance`):
       - Fetch `/api/v1/carrier/reports/performance` with optional `?date_from=X&date_to=Y&driver_id=Z`.
       - Filters: date range (two date inputs, default: current month), driver select (populated from unique driver_name values in response).
       - Table columns: Dispatch #, Driver Name, Stops, On-Time % (format as "XX.X%" or "—" if null), Avg Dwell (min) (format as number or "—"), Actual Miles (or "—"), Total Expenses ($ formatted).
       - On-time % cell color: >= 90% green text, 70-89% amber text, < 70% red text.
  </action>
  <verify>
    Run `npx tsc --noEmit` from apps/web. Verify all four report page files export valid default components. Check that the revenue page imports from 'recharts' correctly.
  </verify>
  <done>
    Four report pages render with data from existing API endpoints. Revenue page has Recharts bar chart + summary table + CSV export. Driver-pay page has filterable table + bulk approve button. Aging page has AR bucket table with credit limit row highlighting + summary row. Performance page has dispatch metrics table with on-time % color coding. All pages show empty states and loading skeletons.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with no errors in the 10 new files.
- Dashboard page at `/carrier/dashboard` renders all 4 sections (AlertBar, KPIStrip, TodayDispatches, Quick Actions).
- Compliance alerts API at `/api/v1/carrier/compliance-alerts` returns `{ data: [...] }`.
- All 4 report pages render tables/charts with proper empty states.
- Revenue page bar chart renders via Recharts.
- CSV export downloads a file.
</verification>

<success_criteria>
- 10 new files created, 0 existing files modified
- TypeScript compiles without errors
- Dashboard shows compliance alerts, today's dispatches, 4 KPI cards, and 3 quick action buttons
- Revenue report has Recharts bar chart, summary table, and CSV export
- Driver pay report has bulk approve functionality
- Aging report has bucket columns with summary row
- Performance report has on-time % color coding
</success_criteria>

<output>
After completion, create `.planning/quick/172-carrier-ops-reports-pages-and-carrier-da/172-SUMMARY.md`
</output>
