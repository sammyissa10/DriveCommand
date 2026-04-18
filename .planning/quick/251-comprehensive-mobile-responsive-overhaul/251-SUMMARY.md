---
phase: quick-251
plan: "01"
subsystem: owner-portal-mobile-responsive
tags: [responsive, mobile, navigation, live-map, tables, api]
dependency_graph:
  requires: []
  provides:
    - sidebar hidden below lg breakpoint
    - bottom nav as sole mobile navigation
    - live map full-screen mobile with bottom sheet
    - horizontal scroll on load list and revenue tables
    - vehicles API with correct dispatch ordering and load count
  affects:
    - apps/web/src/components/ui/sidebar.tsx
    - apps/web/src/components/navigation/owner-shell.tsx
    - apps/web/src/components/navigation/owner-bottom-nav.tsx
    - apps/web/src/hooks/use-mobile.tsx
    - apps/web/src/components/maps/live-map-wrapper.tsx
    - apps/web/src/app/(owner)/live-map/page.tsx
    - apps/web/src/components/carrier/loads/LoadList.tsx
    - apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
tech_stack:
  added: []
  patterns:
    - lg: breakpoint as unified mobile/desktop boundary
    - bottom sheet overlay for mobile map vehicle list
    - DISTINCT ON SQL for per-truck dispatch deduplication
key_files:
  created: []
  modified:
    - apps/web/src/hooks/use-mobile.tsx
    - apps/web/src/components/ui/sidebar.tsx
    - apps/web/src/components/navigation/owner-shell.tsx
    - apps/web/src/components/navigation/owner-bottom-nav.tsx
    - apps/web/src/components/maps/live-map-wrapper.tsx
    - apps/web/src/app/(owner)/live-map/page.tsx
    - apps/web/src/components/carrier/loads/LoadList.tsx
    - apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
decisions:
  - Set MOBILE_BREAKPOINT to 1024 to eliminate the 768-1024px gap where both sidebar and bottom nav showed simultaneously
  - Return null for mobile sidebar instead of Sheet — bottom nav is the sole navigation on mobile
  - Default sidebarOpen=false in live-map-wrapper so mobile starts map-first
  - Use DISTINCT ON with ORDER BY actual_departure DESC for dispatch query instead of application-level dedup
  - Source load count from loads table (via dispatch_id FK) rather than stops table
metrics:
  duration: "~20 minutes"
  completed: "2026-04-18"
  tasks_completed: 4
  files_modified: 9
---

# Phase quick-251 Plan 01: Comprehensive Mobile Responsive Overhaul Summary

**One-liner:** Eight mobile responsive fixes across sidebar, header, navigation, live map, tables, and vehicles API — unified under the lg (1024px) breakpoint.

## What Was Built

### Fix 1 — Sidebar hidden on mobile
- `MOBILE_BREAKPOINT` changed from 768 to 1024 in `use-mobile.tsx` so `useIsMobile()` returns true below 1024px
- Sidebar returns `null` on mobile instead of rendering a Sheet — eliminates the hamburger/Sheet entirely
- Desktop sidebar breakpoints updated from `md:` to `lg:` (both the outer block wrapper and the inner fixed flex div)

### Fix 2 — Bottom nav More tab active detection
- Added `moreMenuPaths` array covering all More menu destinations
- More tab now highlights (`text-blue-400`) when `isMoreOpen || isOnMorePage` — path-based detection works even when the menu isn't open

### Fix 3 — Header truncation on mobile
- `SidebarTrigger` gets `hidden lg:flex` — invisible on mobile
- `Separator` next to it gets `hidden lg:block`
- Tenant name span gets `hidden lg:block` — only DC logo area + bell + avatar remain on mobile
- Header padding tightened: `px-4 lg:px-6`
- Main content padding tightened: `p-4 lg:p-6`

### Fix 4 — Live map full screen on mobile with bottom sheet
- Page container height adjusted: `h-[calc(100vh-3.5rem-5rem)] lg:h-[calc(100vh-8rem)]` accounts for header (3.5rem) and bottom nav (5rem)
- Desktop left sidebar changes from conditional `hidden md:flex` to always-visible `hidden lg:flex`
- Mobile gets a floating toggle button at `fixed bottom-24 left-4 z-40` (above bottom nav)
- Bottom sheet appears when open: `fixed inset-x-0 bottom-20 z-30`, `60vh` height, rounded top, drag handle, close button, full tab + filter + vehicle list content
- Backdrop tap closes the sheet
- `sidebarOpen` defaults to `false` — map-first on mobile

### Fix 5 — Horizontal scroll on tables
- `LoadList.tsx`: both loading skeleton and data table wrappers changed from `overflow-hidden` to `overflow-x-auto`; table elements get `min-w-[600px]`
- Revenue report `page.tsx`: same treatment on the summary table

### Fix 6 — Bottom nav padding (already present, refined)
- `pb-20 lg:pb-6` was already on main — confirmed correct, no change needed

### Fix 7 — Notification dropdown mobile positioning (already fixed)
- `notification-center.tsx` already had `w-[calc(100vw-2rem)] sm:w-[380px]` at line 146 — verified, no changes needed

### Fix 8 — Vehicles API dispatch query and load count
- Dispatch query changed to use `DISTINCT ON (d.truck_id)` with `ORDER BY d.truck_id, d.actual_departure DESC NULLS LAST, d.scheduled_departure DESC` — guarantees exactly one dispatch per truck (the most recent active one)
- Application-level dedup (`if (!carrierDispatchMap.has(...))`) removed since SQL handles it
- Load count query changed from `stops` table (`stopCount`) to `loads` table (`loadCount`) joining via `dispatch_id`
- `CarrierStopCountRow` interface renamed to `CarrierLoadCountRow`

## Deviations from Plan

None — plan executed exactly as written. Fix 6 and Fix 7 required no code changes (already correct), as anticipated in the plan.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ce4bc32 | fix(quick-251): hide sidebar on mobile, fix header and bottom nav |
| 2 | 9851e9a | fix(quick-251): make live map full screen on mobile with bottom sheet |
| 3 | fff51e4 | fix(quick-251): add horizontal scroll to load list and revenue report tables |
| 4 | 85b69b7 | fix(quick-251): fix vehicles API dispatch query ordering and load count source |

## TypeScript Check

`tsc --noEmit` passed with no new errors. Only pre-existing E2E test errors in `e2e/carrier/clients.spec.ts` and `e2e/carrier/loads.spec.ts` (unrelated to this task).

## Self-Check: PASSED

All modified files confirmed present:
- `apps/web/src/hooks/use-mobile.tsx` — MOBILE_BREAKPOINT = 1024
- `apps/web/src/components/ui/sidebar.tsx` — returns null on mobile, lg: breakpoints
- `apps/web/src/components/navigation/owner-shell.tsx` — header responsive
- `apps/web/src/components/navigation/owner-bottom-nav.tsx` — moreMenuPaths detection
- `apps/web/src/components/maps/live-map-wrapper.tsx` — bottom sheet mobile layout
- `apps/web/src/app/(owner)/live-map/page.tsx` — adjusted container height
- `apps/web/src/components/carrier/loads/LoadList.tsx` — overflow-x-auto tables
- `apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx` — overflow-x-auto table
- `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts` — DISTINCT ON dispatch query
