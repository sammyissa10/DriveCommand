---
phase: quick-172
plan: 01
subsystem: carrier-ops
tags: [carrier, reports, dashboard, recharts, compliance]
dependency_graph:
  requires:
    - apps/web/src/lib/carrier/reports.ts
    - apps/web/src/app/api/v1/carrier/reports/revenue/route.ts
    - apps/web/src/app/api/v1/carrier/reports/driver-pay/route.ts
    - apps/web/src/app/api/v1/carrier/reports/aging/route.ts
    - apps/web/src/app/api/v1/carrier/reports/performance/route.ts
    - apps/web/src/app/api/v1/carrier/dispatches/route.ts
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
  provides:
    - Carrier dashboard page at /carrier/dashboard
    - Compliance alerts API at /api/v1/carrier/compliance-alerts
    - Revenue report page at /carrier/reports/revenue
    - Driver pay report page at /carrier/reports/driver-pay
    - AR aging report page at /carrier/reports/aging
    - Performance report page at /carrier/reports/performance
  affects: []
tech_stack:
  added: []
  patterns:
    - Client component fetch pattern (useState/useEffect) for all report pages
    - Recharts ResponsiveContainer + BarChart for revenue visualization
    - Prisma findMany with date window comparisons for compliance alerts
    - CSV export via Blob + URL.createObjectURL
key_files:
  created:
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
  modified: []
decisions:
  - Used existing /api/v1/carrier/pay-records/[id]/approve endpoint for bulk approve (already existed)
  - Revenue bar chart groups by month+client with 8-color palette
  - Performance driver filter is client-side from loaded data (avoids separate drivers API call)
  - Compliance alert severity: critical if expired or <7 days, warning otherwise
metrics:
  duration_seconds: 324
  completed_date: "2026-04-05"
  tasks_completed: 2
  tasks_total: 2
  files_created: 10
  files_modified: 0
---

# Quick 172: Carrier Ops Reports Pages and Carrier Dashboard Summary

**One-liner:** Carrier ops dashboard with compliance alert engine + 4 report pages (revenue Recharts chart, driver pay bulk approve, AR aging buckets, performance on-time color coding).

## What Was Built

### Task 1: Compliance Alerts API and Dashboard Page

**`apps/web/src/lib/carrier/compliance.ts`** — `getComplianceAlerts(orgId)` queries 5 expiry types using Prisma findMany with date window comparisons. CDL expiry warns within 60 days; registration/insurance/license/contract expiry warns within 30 days. Severity: critical if expired or <7 days left, warning otherwise. Results sorted critical-first.

**`apps/web/src/app/api/v1/carrier/compliance-alerts/route.ts`** — GET endpoint following the standard carrier API pattern (getSession guard, orgId check, try/catch, logger.error). Returns `{ data: alerts[] }`.

**`apps/web/src/components/carrier/dashboard/AlertBar.tsx`** — Client component that fetches compliance alerts on mount. Renders color-coded chips (red=critical, amber=warning) in a horizontally scrollable bar. Each chip is a Link to the alert's entity page. Shows "All clear" green chip when no alerts. Skeleton loading state with 3 animated placeholders.

**`apps/web/src/components/carrier/dashboard/TodayDispatches.tsx`** — Client component that fetches today's dispatches from `/api/v1/carrier/dispatches`. Renders cards with status badge, driver/truck chips, and stop progress bar. Handles empty state and skeleton loading.

**`apps/web/src/components/carrier/dashboard/KPIStrip.tsx`** — 4-card grid (2-col mobile, 4-col desktop) fetching performance and revenue report APIs for the current week. Cards: Loads This Week, Revenue This Week, Avg Dwell (min), On-Time %. Each has a lucide icon. Shows skeleton rectangles while loading.

**`apps/web/src/app/(owner)/carrier/dashboard/page.tsx`** — Server component with session guard. Layout: page header → AlertBar → KPIStrip → 2/3 + 1/3 grid with TodayDispatches and Quick Actions (New Dispatch / New Load / New Client).

### Task 2: Four Report Pages

**Revenue Report** (`/carrier/reports/revenue`) — Client page with date range + client filters. Recharts BarChart with one bar per client per month, 8-color palette. Summary chips showing total invoiced and outstanding. Client summary table with loads/invoiced/paid/outstanding columns. CSV export button that downloads a file named `revenue-report-{dateFrom}-{dateTo}.csv`.

**Driver Pay Report** (`/carrier/reports/driver-pay`) — Client page with pay period date range and driver select (populated from loaded data). Table with all pay fields + status badge (pending=amber, approved=green, paid=blue). Bulk Approve button appears when pending rows exist — calls `PATCH /api/v1/carrier/pay-records/[id]/approve` for each with toast feedback.

**AR Aging Report** (`/carrier/reports/aging`) — Client page fetching all clients. Bucket columns: 0-30, 31-60, 61-90, 90+ days. Red row highlight when `over_credit_limit === true` (always false currently — logic ready for when credit_limit field is added). Bold summary tfoot row summing all columns.

**Performance Report** (`/carrier/reports/performance`) — Client page with date range (default current month) and driver filter. Table: dispatch #, driver, stops, on-time % (green ≥90%, amber 70-89%, red <70%), avg dwell, actual miles, total expenses.

## Deviations from Plan

None — plan executed exactly as written.

The `PATCH /api/v1/carrier/pay-records/[id]/approve` endpoint already existed so no new file was needed for bulk approve.

## Self-Check

Files created:
- apps/web/src/lib/carrier/compliance.ts — FOUND
- apps/web/src/app/api/v1/carrier/compliance-alerts/route.ts — FOUND
- apps/web/src/components/carrier/dashboard/AlertBar.tsx — FOUND
- apps/web/src/components/carrier/dashboard/TodayDispatches.tsx — FOUND
- apps/web/src/components/carrier/dashboard/KPIStrip.tsx — FOUND
- apps/web/src/app/(owner)/carrier/dashboard/page.tsx — FOUND
- apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx — FOUND
- apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx — FOUND
- apps/web/src/app/(owner)/carrier/reports/aging/page.tsx — FOUND
- apps/web/src/app/(owner)/carrier/reports/performance/page.tsx — FOUND

TypeScript: `npx tsc --noEmit` passed with no errors.

## Self-Check: PASSED
