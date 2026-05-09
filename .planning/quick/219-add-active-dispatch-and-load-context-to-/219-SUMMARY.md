---
phase: quick-219
plan: "01"
subsystem: live-map
tags: [live-map, dispatch, sidebar, api, typescript]
dependency_graph:
  requires: []
  provides: [dispatch-context-in-sidebar]
  affects: [live-map-sidebar, live-map-api]
tech_stack:
  added: []
  patterns: [raw-sql-batch-queries, optional-dispatch-field-on-type]
key_files:
  created: []
  modified:
    - apps/web/src/lib/maps/map-utils.ts
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
    - apps/web/src/components/maps/vehicle-sidebar.tsx
    - apps/web/src/app/(owner)/live-map/actions.ts
decisions:
  - "SSR actions.ts path sets dispatch: null rather than duplicating dispatch queries (SSR render is initial load only; polling API handles live dispatch data)"
  - "Route name falls back to 'Route: CityA > CityB' (first comma-segment only) when Route.name is null"
  - "Route name badge capped at max-w-[140px] with truncate to prevent overflow in narrow sidebar"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  files_changed: 4
---

# Phase quick-219 Plan 01: Add Active Dispatch and Load Context to Live Fleet Map Sidebar — Summary

Active route name, load count, and next pending stop address added to live fleet map sidebar rows so dispatchers get operational context per truck without leaving the map.

## What Was Built

- **VehicleDispatch interface** added to `map-utils.ts` with `routeName`, `loadCount`, and `nextStopAddress` fields; `dispatch: VehicleDispatch | null` added to `VehicleLocation`
- **API Step 3.5** in `vehicles/route.ts`: queries routes with `PLANNED` or `IN_PROGRESS` status scheduled today for all truck IDs in one batch; then batch-queries load counts (`COUNT` by `routeId`) and next pending stop (`DISTINCT ON routeId ORDER BY position`) for those routes
- **Sidebar dispatch block** in `vehicle-sidebar.tsx`: route name as a `bg-primary/10 text-primary` badge, muted load count, truncated next stop address; trucks without active routes show "No active route" in muted italic

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend VehicleLocation type and API | 26274eb | map-utils.ts, vehicles/route.ts, actions.ts |
| 2 | Render dispatch context in sidebar rows | 640d384 | vehicle-sidebar.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed type error in SSR actions.ts**
- **Found during:** Task 1 TypeScript check
- **Issue:** `actions.ts` also returns `VehicleLocation[]` objects but was not setting the new required `dispatch` field, causing a TS2322 type error
- **Fix:** Added `dispatch: null` to the mapped return object in `getLatestVehicleLocations()`
- **Files modified:** `apps/web/src/app/(owner)/live-map/actions.ts`
- **Commit:** 26274eb (included in Task 1 commit)

## Self-Check: PASSED

- FOUND: apps/web/src/lib/maps/map-utils.ts
- FOUND: apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
- FOUND: apps/web/src/components/maps/vehicle-sidebar.tsx
- FOUND: commit 26274eb
- FOUND: commit 640d384
- TypeScript: 0 errors (excluding pre-existing e2e spec errors unrelated to this task)
