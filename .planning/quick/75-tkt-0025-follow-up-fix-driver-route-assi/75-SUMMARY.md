---
phase: quick-75
plan: "01"
subsystem: drivers
tags: [driver-routes, route-assignments, DriverRouteJoin, driver-detail]
dependency_graph:
  requires: [quick-74]
  provides: [complete-driver-route-visibility]
  affects: [src/app/(owner)/drivers/[id]]
tech_stack:
  added: []
  patterns: [server-action, parallel-fetch, discriminated-union-display]
key_files:
  created: []
  modified:
    - src/app/(owner)/actions/driver-route-joins.ts
    - src/app/(owner)/drivers/[id]/page.tsx
    - src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx
decisions:
  - DriverRouteJoin entries win over Route.driverId duplicates because join records carry payment data
  - Primary Driver entries have no delete button — they are controlled via the route form, not via the join table
  - Role badges shown on every entry: indigo Primary Driver, emerald Main Driver (star icon), amber Co-Driver
metrics:
  duration: 148s
  completed: "2026-03-15"
  tasks: 2
  files: 3
---

# Quick-75: TKT-0025 Follow-up — Fix Driver Route Assignments (Both Sources)

**One-liner:** Added `listDriverPrimaryRoutes` server action and merged Route.driverId routes with DriverRouteJoin entries on the driver detail page, with per-role badges and deduplication.

## What Was Done

The driver detail page's Route Assignments section only showed routes from the `DriverRouteJoin` table. Drivers assigned via the route create/edit form (`Route.driverId`) were invisible on their own detail page.

This fix queries both sources, merges them with deduplication, and displays a role badge on every entry.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add listDriverPrimaryRoutes server action | 96baf24 | driver-route-joins.ts |
| 2 | Update page and component to merge both route sources | 7903d3c | page.tsx, driver-route-assignments-section.tsx |

## Changes Made

### driver-route-joins.ts
- Added `listDriverPrimaryRoutes(driverId)` — queries `Route.driverId` where `archivedAt = null`, selects id/name/origin/destination/scheduledDate/status, orders by scheduledDate desc

### page.tsx
- Imports `listDriverPrimaryRoutes`
- Fetches it in parallel in the `Promise.all` alongside existing calls
- Passes `primaryRoutes` as a new prop to `DriverRouteAssignmentsSection`

### driver-route-assignments-section.tsx
- Added `PrimaryRouteInfo` type matching the new action's return shape
- Added `primaryRoutes: PrimaryRouteInfo[]` to component props interface
- Builds a unified `DisplayItem` discriminated union (source: `'join'` | `'primary'`)
- Deduplication: builds a Set of routeIds from DriverRouteJoin entries; primary routes already in the set are excluded
- Combined list sorted by scheduledDate descending
- Role badges on every entry:
  - `'primary'` source: indigo "Primary Driver" badge
  - `'join'` with isMainDriver=true: emerald "Main Driver" badge with Star icon
  - `'join'` with isMainDriver=false: amber "Co-Driver" badge
- Primary entries render only route link, status badge, role badge, and scheduled date — no payment info, no delete button
- Empty state uses combined list length

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Type error in routeDisplayName call for PrimaryDisplayItem**
- **Found during:** Task 2 TypeScript verification
- **Issue:** `routeDisplayName(item)` was called with a `PrimaryDisplayItem` which has `routeId`/`routeName` fields, not `id`/`name` as the function signature expects
- **Fix:** Replaced `routeDisplayName(item)` with inline expression `item.routeName ?? \`${item.origin} → ${item.destination}\`` at the call site for primary items
- **Files modified:** driver-route-assignments-section.tsx
- **Commit:** 7903d3c (included in same commit)

## Verification

- `npx tsc --noEmit` passes with no errors
- `npm run build` succeeds
- Both route data sources fetched in parallel, merged, deduplicated, and displayed with role badges

## Self-Check: PASSED
