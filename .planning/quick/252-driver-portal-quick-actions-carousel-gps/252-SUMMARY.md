---
phase: "252"
plan: "01"
subsystem: "driver-portal, owner-portal"
tags: ["ui", "carousel", "gps", "kpi", "mobile-header"]
dependency_graph:
  requires: []
  provides:
    - "Driver quick actions scroll-snap carousel with real badge data"
    - "GPS pill indicator below greeting on driver dashboard"
    - "Owner mobile header: DC logo + bell + avatar only"
    - "Owner KPI strip: Loads This Week, Revenue This Week, Pending Pay, Open Invoices"
  affects:
    - "apps/web/src/components/driver/driver-quick-actions.tsx"
    - "apps/web/src/components/driver/driver-dashboard.tsx"
    - "apps/web/src/components/driver/driver-gps-ping.tsx"
    - "apps/web/src/app/(driver)/layout.tsx"
    - "apps/web/src/app/(driver)/home/page.tsx"
    - "apps/web/src/app/(driver)/actions/driver-dashboard.ts"
    - "apps/web/src/app/globals.css"
    - "apps/web/src/components/navigation/owner-shell.tsx"
    - "apps/web/src/components/carrier/dashboard/KPIStrip.tsx"
    - "apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts"
tech_stack:
  added: []
  patterns:
    - "CSS scroll-snap carousel (snap-x snap-mandatory, snap-center, paddingInline)"
    - "DriverGpsPing variant prop pattern (header | pill | silent)"
    - "Server action badge data fetch in parallel with dashboard data"
    - "KPI API endpoint consolidating count queries"
key_files:
  created:
    - "apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts"
  modified:
    - "apps/web/src/components/driver/driver-quick-actions.tsx"
    - "apps/web/src/components/driver/driver-dashboard.tsx"
    - "apps/web/src/components/driver/driver-gps-ping.tsx"
    - "apps/web/src/app/(driver)/layout.tsx"
    - "apps/web/src/app/(driver)/home/page.tsx"
    - "apps/web/src/app/(driver)/actions/driver-dashboard.ts"
    - "apps/web/src/app/globals.css"
    - "apps/web/src/components/navigation/owner-shell.tsx"
    - "apps/web/src/components/carrier/dashboard/KPIStrip.tsx"
decisions:
  - "Used variant='silent' on DriverGpsPing in layout to keep GPS pinging on all driver pages without showing any visual in the header"
  - "Documents action still links to /hours (no /documents route exists in driver portal yet) — noted as TODO"
  - "stopsRemaining uses bypass_rls transaction because CarrierDispatch/CarrierStop tables require it"
  - "unreadMessages counts all messages visible to driver (broadcast + direct) as a proxy for unread — no separate read-tracking table exists"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-18"
  tasks_completed: 2
  files_modified: 10
---

# Phase 252 Plan 01: Driver Portal Quick Actions Carousel + GPS Reposition Summary

CSS scroll-snap carousel for driver quick actions with real DB badge data, GPS pill repositioned below greeting, owner mobile header cleaned to logo+bell+avatar, and KPI strip updated with Pending Pay Approvals and Open Invoices counts.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Driver carousel with badges + GPS pill | 1a223ad |
| 2 | Owner mobile header + KPI replacements | 616dd8e |

## What Was Built

### Fix 1 — Driver Quick Actions Carousel
- Replaced horizontal tile row with CSS scroll-snap carousel using `snap-x snap-mandatory`
- One 160x128px tile visible at a time; adjacent tiles peek via `paddingInline: calc(50% - 80px)`
- Five tiles: My Route (blue), Messages (green), Hours (purple), Documents (amber), Report Incident (red)
- Badge data fetched via new `getDriverQuickActionBadges()` server action called in parallel with existing dashboard data
- Badges: stops remaining on active dispatch, unread message count, HOS short status label, expiring doc count

### Fix 2 — GPS Indicator Repositioned
- Added `variant` prop to `DriverGpsPing`: `'header' | 'pill' | 'silent'`
- Layout now uses `variant='silent'` — GPS pinging fires on all driver pages, no visual in header
- Dashboard renders `<DriverGpsPing variant="pill" />` below the greeting h1
- Pill shows pulsing green dot when active, gray dot when inactive, with "Location sharing on/off" label

### Fix 3 — Owner Portal Mobile Header
- Added `AppLogo size={28}` at start of header, visible on all screen sizes
- `SidebarTrigger` remains `hidden lg:flex`
- Tenant name already `hidden lg:block` — unchanged
- Added `compactOnMobile` prop to `UserMenu` — hides name/email text, shows avatar circle only on mobile
- Result: DC logo | [spacer] | bell | avatar on mobile; full header on desktop

### Fix 4 — Owner Dashboard KPI Replacements
- Created `/api/v1/carrier/dashboard/kpi` GET endpoint returning `loadsThisWeek`, `pendingPayApprovals`, `openInvoices`
- Removed `avgDwellMinutes` and `onTimePct` from KPIStrip entirely (removed performance API fetch)
- Kept revenue API fetch for `revenueThisWeek`
- New card order: Loads This Week | Revenue This Week | Pending Pay | Open Invoices
- All cards have `cursor-pointer active:scale-95 transition-transform`
- Pending Pay navigates to `/carrier/reports/driver-pay`, Open Invoices to `/carrier/loads?status=invoiced`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Exist
- `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts` — FOUND
- `apps/web/src/components/driver/driver-quick-actions.tsx` — FOUND (modified)
- `apps/web/src/components/driver/driver-gps-ping.tsx` — FOUND (modified)
- `apps/web/src/components/navigation/owner-shell.tsx` — FOUND (modified)
- `apps/web/src/components/carrier/dashboard/KPIStrip.tsx` — FOUND (modified)

### Commits Exist
- `1a223ad` — feat(quick-252): driver carousel with badges + GPS pill reposition — FOUND
- `616dd8e` — feat(quick-252): owner mobile header + KPI strip replacements — FOUND

### TypeScript
- `tsc --noEmit` passes with zero source errors

## Self-Check: PASSED
