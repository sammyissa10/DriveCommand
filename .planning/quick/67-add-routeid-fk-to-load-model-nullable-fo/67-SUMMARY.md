---
phase: quick-67
plan: "01"
subsystem: loads-routes
tags: [loads, routes, dispatch, driver-portal, foreign-key, refactor]
dependency_graph:
  requires: [prisma/schema.prisma routeId FK already migrated]
  provides: [routeId saved on dispatch, driver portal uses explicit FK links, owner route detail shows linked loads]
  affects: [dispatch-modal, loads-action, driver-load-action, driver-routes-action, my-load-page, my-route-page, route-detail-page]
tech_stack:
  added: []
  patterns: [explicit FK over driverId cross-referencing]
key_files:
  created: []
  modified:
    - src/lib/validations/load.schemas.ts
    - src/app/(owner)/actions/loads.ts
    - src/components/loads/dispatch-modal.tsx
    - src/app/(owner)/loads/[id]/page.tsx
    - src/app/(driver)/actions/driver-load.ts
    - src/app/(driver)/actions/driver-routes.ts
    - src/app/(driver)/my-route/page.tsx
    - src/app/(driver)/my-load/page.tsx
    - src/app/(owner)/routes/[id]/page.tsx
    - src/app/(owner)/routes/[id]/route-page-client.tsx
decisions:
  - "Keep getMyAssignedRouteSummary in driver-routes.ts — remove only the call site in my-load/page.tsx to avoid breaking potential future callers"
  - "Route dropdown in dispatch modal is optional with 'No route' default — fully backwards compatible"
metrics:
  duration: 287s
  completed: 2026-03-14
  tasks_completed: 2
  files_modified: 10
---

# Phase quick-67 Plan 01: Add routeId FK to Load Model (Nullable) Summary

Replaced fragile driverId-based cross-referencing between loads and routes with explicit routeId FK on the Load model, enabling dispatch to optionally link a load to a route and fixing driver portal pages to use direct FK lookups.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add routeId to dispatch flow and update driver portal queries | 306e45e | load.schemas.ts, loads.ts, dispatch-modal.tsx, driver-load.ts, driver-routes.ts, my-route/page.tsx, my-load/page.tsx |
| 2 | Add Loads on this Route section to owner route detail page | c165ba5 | routes/[id]/page.tsx, route-page-client.tsx |

## What Was Built

**Dispatch flow:** `dispatchLoadSchema` now accepts an optional `routeId` field. The `dispatchLoad` server action extracts it from FormData and saves it to the Load record (null when not provided). `DispatchModal` renders an optional Route dropdown populated with PLANNED/IN_PROGRESS routes fetched by the load detail page.

**Driver portal — /my-load:** Removed the `getMyAssignedRouteSummary()` driverId-based call. The "Your Active Route" card now uses `load.route` from the updated `getMyActiveLoad` query (which includes the route relation via routeId FK). If no routeId is set, the route card simply does not render.

**Driver portal — /my-route:** Removed the `getMyActiveLoadSummary()` driverId-based call. The cross-reference section now shows "Loads on this Route" using `route.loads` from the updated `getMyAssignedRoute` query (which includes loads where routeId = route.id). Each load card shows load number, status badge, and origin/destination. Empty state shown when no loads are linked.

**Owner route detail:** Server page fetches `prisma.load.findMany({ where: { routeId: id } })` and passes results as `linkedLoads` to `RoutePageClient`. Both view and edit modes display a "Loads on this Route" section with load number (linked to load detail), customer name, route, status badge, and rate. Empty state with dispatch guidance when no loads are linked.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Created Files
- No new files created (only modifications)

### Modified Files
- `src/lib/validations/load.schemas.ts` — routeId field added
- `src/app/(owner)/actions/loads.ts` — routeId saved in dispatchLoad
- `src/components/loads/dispatch-modal.tsx` — route dropdown added
- `src/app/(owner)/loads/[id]/page.tsx` — routes fetched and passed
- `src/app/(driver)/actions/driver-load.ts` — route included in queries
- `src/app/(driver)/actions/driver-routes.ts` — loads included in getMyAssignedRoute
- `src/app/(driver)/my-route/page.tsx` — uses route.loads instead of driverId
- `src/app/(driver)/my-load/page.tsx` — uses load.route instead of driverId
- `src/app/(owner)/routes/[id]/page.tsx` — linkedLoads fetched
- `src/app/(owner)/routes/[id]/route-page-client.tsx` — Loads section rendered

### Commits
- 306e45e: feat(quick-67): add routeId to dispatch flow and update driver portal queries
- c165ba5: feat(quick-67): add Loads on this Route section to owner route detail page

## Self-Check: PASSED
