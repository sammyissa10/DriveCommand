---
phase: quick-278
plan: 01
subsystem: carrier-dashboard
tags: [dashboard, kpi, alerts, activity-feed, messaging, ui]
dependency_graph:
  requires: [carrier-ops-schema, fleet-messages, hos-entries, driver-pay-records]
  provides: [dashboard-kpi-revenue, dashboard-alerts, dashboard-activity, dashboard-driver-status, dashboard-messages]
  affects: [carrier-dashboard-page]
tech_stack:
  added: []
  patterns: [promise-all-parallel-queries, client-polling-setinterval, distinct-on-raw-query, revenue-fallback-calculation]
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/dashboard/alerts/route.ts
    - apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts
    - apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts
    - apps/web/src/app/api/v1/carrier/dashboard/messages/route.ts
    - apps/web/src/components/carrier/dashboard/DriverStatusStrip.tsx
    - apps/web/src/components/carrier/dashboard/RecentActivity.tsx
    - apps/web/src/components/carrier/dashboard/QuickMessageBoard.tsx
  modified:
    - apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
    - apps/web/src/components/carrier/dashboard/KPIStrip.tsx
    - apps/web/src/components/carrier/dashboard/AlertBar.tsx
    - apps/web/src/app/(owner)/carrier/dashboard/page.tsx
decisions:
  - Revenue fallback: when totalRevenue is null or 0, sum rateAmount + fuelSurcharge + detentionAmount + otherCharges per load
  - HOS status lookup: raw SQL with DISTINCT ON for efficient latest-per-driver query
  - Activity feed: merge 6 sources in memory (not SQL UNION) for simplicity, sort by timestamp DESC
  - Alerts API: returns empty array when all clear (client shows green banner)
  - Messages endpoint: no carrier-specific messages page yet, "View All" shows tooltip "Coming soon"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-22"
  tasks_completed: 2
  files_changed: 11
---

# Phase quick-278: Comprehensive Carrier Dashboard Overhaul Summary

**One-liner:** Added 5 new dashboard API endpoints (revenue KPI fix, actionable alerts, activity feed, driver HOS status, messages) and 3 new UI components assembled into a responsive two-column layout.

## What Was Built

### Task 1: API Endpoints (commit aa1276f)

**kpi/route.ts — Revenue KPI fix**
Added `revenueThisWeek` field. Queries all non-cancelled loads for the current week, sums `totalRevenue` per row with a fallback to `rateAmount + fuelSurcharge + detentionAmount + otherCharges` when `totalRevenue` is null/zero. Returns a non-null number.

**alerts/route.ts — Actionable alert strip**
Runs 7 parallel Prisma count queries via `Promise.all`: expired CDLs (critical), expired truck registrations (critical), pending pay approvals, CDLs expiring in 30 days, registrations expiring in 30 days, contracts expiring in 30 days, and today's planned-but-unstarted dispatches. Returns only items with count > 0.

**activity/route.ts — Recent activity feed**
Aggregates last 7 days from 6 data sources in parallel: dispatch status changes, completed stops, new loads, pay records, uploaded documents, new dispatches. Merges into unified `ActivityItem[]`, sorts by timestamp DESC, returns top 15.

**drivers-status/route.ts — Driver HOS status**
Fetches active `CarrierDriver` records with their linked `User` ID and current in-progress dispatch. Uses `DISTINCT ON ("driverId")` raw SQL to efficiently retrieve each driver's latest HOS status. Returns `hosStatus`, `dispatchId`, and `dispatchNumber`.

**messages/route.ts — Fleet message board**
GET returns last 5 `FleetMessage` records for the tenant with sender names resolved. POST creates a broadcast or targeted message using `session.userId` as sender.

### Task 2: UI Components (commit e647c24)

**KPIStrip.tsx** — Simplified from two fetches to one. Removed the `getWeekStartISO`/`getTodayISO` helpers and the separate revenue report fetch. Reads `revenueThisWeek` directly from the KPI endpoint.

**AlertBar.tsx** — Switched data source from `/api/v1/carrier/compliance-alerts` to the new `/api/v1/carrier/dashboard/alerts`. Redesigned as larger card chips with `AlertTriangle`, label, and `ChevronRight`. Critical items use red, warnings use amber.

**DriverStatusStrip.tsx** — New component. Horizontal scrollable row of driver chips with initials circle, first name, optional dispatch number, and status dot (green = DRIVING/ON_DUTY, blue = has active dispatch, grey = off duty/null).

**RecentActivity.tsx** — New component. Vertical list inside a card. Each row has a type-specific icon (Truck/MapPin/Package/CreditCard/FileText/Send), description text, and relative timestamp computed without date-fns.

**QuickMessageBoard.tsx** — New component. Polls messages endpoint every 30 seconds via `setInterval` with cleanup on unmount. Shows last 5 messages with sender, truncated body, and relative timestamp. Bottom compose area sends broadcast messages to all drivers.

**page.tsx** — New two-column layout: `lg:grid-cols-5` with `lg:col-span-3` (left: dispatches + activity) and `lg:col-span-2` (right: messages + quick actions). Single column on mobile.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts` — exists, updated
- [x] `apps/web/src/app/api/v1/carrier/dashboard/alerts/route.ts` — exists, created
- [x] `apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts` — exists, created
- [x] `apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts` — exists, created
- [x] `apps/web/src/app/api/v1/carrier/dashboard/messages/route.ts` — exists, created
- [x] `apps/web/src/components/carrier/dashboard/DriverStatusStrip.tsx` — exists, created
- [x] `apps/web/src/components/carrier/dashboard/RecentActivity.tsx` — exists, created
- [x] `apps/web/src/components/carrier/dashboard/QuickMessageBoard.tsx` — exists, created
- [x] `apps/web/src/components/carrier/dashboard/KPIStrip.tsx` — exists, updated
- [x] `apps/web/src/components/carrier/dashboard/AlertBar.tsx` — exists, updated
- [x] `apps/web/src/app/(owner)/carrier/dashboard/page.tsx` — exists, updated
- [x] Commit aa1276f — exists
- [x] Commit e647c24 — exists
- [x] `tsc --noEmit` — passes with no errors

## Self-Check: PASSED
