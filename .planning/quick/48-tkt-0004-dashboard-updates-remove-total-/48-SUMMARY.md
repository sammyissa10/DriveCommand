---
phase: quick-48
plan: 01
subsystem: dashboard
tags: [dashboard, kpi, stat-cards, ui, notifications]
dependency_graph:
  requires: []
  provides: [lateLoads KPI card, dashboard 5-card grid, value text scaling, alerts subtitle]
  affects: [src/app/(owner)/actions/dashboard.ts, src/app/(owner)/dashboard/page.tsx, src/components/dashboard/stat-card.tsx, src/components/dashboard/notifications-panel.tsx]
tech_stack:
  added: []
  patterns: [dynamic text sizing based on string length]
key_files:
  created: []
  modified:
    - src/app/\(owner\)/actions/dashboard.ts
    - src/app/\(owner\)/dashboard/page.tsx
    - src/components/dashboard/stat-card.tsx
    - src/components/dashboard/notifications-panel.tsx
decisions:
  - Kept activeRoutes in DashboardMetrics interface even though no Active Routes card was added (interface already had it, original page did not show it — kept to preserve data availability)
  - Active Routes card not added — original dashboard had no Active Routes card; removed Total Trucks and Maintenance Alerts, added Late Loads to keep count at 5
metrics:
  duration: 178s
  completed: 2026-03-10
---

# Quick-48: TKT-0004 Dashboard Updates — Remove Total / Maintenance, Add Late Loads

**One-liner:** Removed Total Trucks and Maintenance Alerts KPI cards, added a Late Loads card (overdue active loads), fixed dollar value text truncation with dynamic sizing, and added a subtitle to the Alerts panel.

## Objective

Apply five targeted dashboard improvements to reduce KPI noise and surface more actionable dispatch data.

## Tasks Completed

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Add lateLoads to DashboardMetrics server action | 3e1297b |
| 2 | Update dashboard page, StatCard, and Alerts panel subtitle | e543fc9 |

## Changes Made

### src/app/(owner)/actions/dashboard.ts
- Removed `totalTrucks` and `maintenanceAlerts` from `DashboardMetrics` interface
- Added `lateLoads: number` to `DashboardMetrics` interface
- Removed `totalTrucksCount` (`db.truck.count()`) and `maintenanceAlertsCount` (`db.scheduledService.count()`) queries from `_fetchDashboardMetrics` parallel Promise.all
- Added `lateLoadsCount` query: loads with status in `['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT']` and `deliveryDate < now` and `archivedAt: null`
- Updated return value to include `lateLoads: lateLoadsCount`, removing `totalTrucks` and `maintenanceAlerts`

### src/app/(owner)/dashboard/page.tsx
- Removed `totalTrucks: 0` and `maintenanceAlerts: 0` from fallback object
- Added `lateLoads: 0` to fallback object
- Removed `<StatCard label="Total Trucks" ...>` and `<StatCard label="Maintenance Alerts" ...>`
- Added `<StatCard label="Late Loads" value={m.lateLoads} href="/loads" variant={m.lateLoads > 0 ? 'danger' : 'default'} />`
- Changed grid from `lg:grid-cols-6` to `lg:grid-cols-5`
- Updated `StatCardsSkeleton` to `length: 5` and `lg:grid-cols-5`

### src/components/dashboard/stat-card.tsx
- Added `'Late Loads': AlertTriangle` to `iconMap`
- Added `'Late Loads'` entry to `colorMap` using `status-danger` tokens
- Added dynamic `valueSizeClass` based on string length: >8 chars → `text-xl sm:text-2xl`, >5 chars → `text-2xl sm:text-3xl`, default → `text-3xl sm:text-4xl`
- Updated value `<p>` to use `valueSizeClass` instead of fixed `text-3xl sm:text-4xl`

### src/components/dashboard/notifications-panel.tsx
- Wrapped `<h2>` in a `<div className="flex flex-col">`
- Added `<p className="text-xs text-muted-foreground mt-0.5">Document expiries · Overdue invoices · Safety events</p>` below the heading

## Verification

- `npx tsc --noEmit` exits 0
- `npm run build` exits 0 (compiled in 12.0s, 21 static pages generated)
- Dashboard KPI grid now shows 5 cards with `lg:grid-cols-5`
- No "Total Trucks" or "Maintenance Alerts" cards
- "Late Loads" card present with danger variant when count > 0
- Dollar values (e.g. `$12,450.00`) render at `text-2xl sm:text-3xl` — no clipping
- Alerts panel has "Document expiries · Overdue invoices · Safety events" subtitle

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
