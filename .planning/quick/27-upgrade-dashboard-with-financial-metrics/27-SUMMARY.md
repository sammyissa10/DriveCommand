---
phase: quick-27
plan: 01
subsystem: dashboard
tags: [dashboard, financial-metrics, notifications, stat-cards, owner-portal]
dependency_graph:
  requires: [prisma/schema.prisma, src/app/(owner)/actions/notifications.ts]
  provides: [getDashboardMetrics, getNotificationAlerts, NotificationsPanel]
  affects: [src/app/(owner)/dashboard/page.tsx]
tech_stack:
  added: []
  patterns: [Promise.all parallel queries, Prisma.Decimal aggregation, severity-sorted alerts]
key_files:
  created:
    - src/components/dashboard/notifications-panel.tsx
  modified:
    - src/app/(owner)/actions/dashboard.ts
    - src/components/dashboard/stat-card.tsx
    - src/app/(owner)/dashboard/page.tsx
decisions:
  - Used Prisma.Decimal for all financial aggregations (unpaid/overdue sums, revenue per mile) — no floating-point errors
  - getNotificationAlerts queries 4 sources in Promise.all (truck JSONB docs, driver documents, overdue invoices, safety events)
  - Kept getFleetStats for backwards compatibility; getDashboardMetrics is the new primary function
  - Overdue subtitle only shown when overdueTotal != '$0.00' — avoids clutter when no overdue invoices
  - NotificationsPanel show-more defaults to 10 items with expandable button for remaining
metrics:
  duration: 189s
  completed: 2026-02-24
  tasks: 2
  files: 5
---

# Quick Task 27: Upgrade Dashboard with Financial Metrics — Summary

**One-liner:** Dashboard upgraded with 6 financial stat cards (active loads, unpaid invoices with overdue highlight, revenue per mile) and a unified notifications panel aggregating expiring documents, overdue invoices, and safety events by severity.

## What Was Built

### Task 1: Financial Metrics + Updated StatCard
**Commits:** `263738b`

Extended `src/app/(owner)/actions/dashboard.ts`:
- New `getDashboardMetrics()` function returning all 8 DashboardMetrics fields in one Promise.all call
- **Unpaid invoices query:** sums `totalAmount` for DRAFT/SENT/OVERDUE invoices where `paidDate` IS NULL using `Prisma.Decimal` addition
- **Overdue invoices query:** separate sum for OVERDUE only — displayed as red subtitle on the card
- **Active loads count:** counts loads with status IN ('DISPATCHED', 'PICKED_UP', 'IN_TRANSIT')
- **Revenue per mile:** queries COMPLETED routes with both odometer readings + their `RoutePayment` records, divides total revenue by total miles using `Prisma.Decimal`
- Kept original `getFleetStats()` for backwards compatibility

Updated `src/components/dashboard/stat-card.tsx`:
- `value` prop now accepts `string | number`
- Added `danger` variant (red border/ring)
- Added `subtitle` optional prop rendered in red below value
- New iconMap entries: `DollarSign` for Unpaid Invoices, `Package` for Active Loads, `TrendingUp` for Revenue / Mile
- New colorMap entries with appropriate status colors for each new card

### Task 2: Notifications Panel + Dashboard Page
**Commits:** `244af36`

Added `getNotificationAlerts()` to `src/app/(owner)/actions/dashboard.ts`:
- Queries 4 data sources in parallel: truck JSONB documentMetadata (registration/insurance), driver Document records with `expiryDate`, overdue Invoice records, SafetyEvent records from last 7 days
- Document expiry severity: expired = `critical`, within 14 days = `warning`, within 60 days = `info`
- Safety event severity: CRITICAL = `critical`, HIGH = `warning`, others = `info`
- Overdue invoices always = `critical`
- Sorted: critical first, then warning, then info; within same severity most recent first
- Returns max 20 alerts

Created `src/components/dashboard/notifications-panel.tsx`:
- Header: Bell icon with red badge showing critical count
- Each alert row: severity icon (AlertOctagon red / AlertTriangle amber / Info blue), title, description, relative timestamp
- Empty state: CheckCircle icon with "No active alerts"
- Shows 10 initially with expandable "and N more..." button
- All rows are clickable Links to relevant pages

Updated `src/app/(owner)/dashboard/page.tsx`:
- Calls `getDashboardMetrics()` + `getNotificationAlerts()` in Promise.all (replaced `getFleetStats`)
- 6-card grid: Total Trucks, Active Drivers, Active Loads, Maintenance Alerts, Unpaid Invoices, Revenue / Mile
- Unpaid Invoices: `danger` variant + red overdue subtitle when overdue > $0
- 3-column bottom section: NotificationsPanel | UpcomingMaintenanceWidget | ExpiringDocumentsWidget

## Commits

| Hash | Message |
|------|---------|
| `263738b` | feat(quick-27): add financial metrics server actions and update stat card |
| `244af36` | feat(quick-27): build notifications panel and wire up upgraded dashboard |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- src/app/(owner)/actions/dashboard.ts — FOUND (getDashboardMetrics + getNotificationAlerts exported)
- src/components/dashboard/stat-card.tsx — FOUND (string|number value, danger variant, subtitle prop)
- src/components/dashboard/notifications-panel.tsx — FOUND (new file created)
- src/app/(owner)/dashboard/page.tsx — FOUND (6 stat cards + 3-column bottom grid)
- Build: PASSED (npm run build completed without errors)
