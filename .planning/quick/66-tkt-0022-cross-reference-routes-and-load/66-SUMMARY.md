---
phase: quick-66
plan: 01
subsystem: driver-portal
tags: [driver, routes, loads, cross-reference, navigation, ui]
dependency_graph:
  requires: []
  provides:
    - getMyActiveLoadSummary server action
    - getMyAssignedRouteSummary server action
    - Active Load card on /my-route
    - Active Route card on /my-load
  affects:
    - src/app/(driver)/my-route/page.tsx
    - src/app/(driver)/my-load/page.tsx
    - src/app/(driver)/actions/driver-load.ts
    - src/app/(driver)/actions/driver-routes.ts
tech_stack:
  added: []
  patterns:
    - Lightweight select queries for cross-reference summaries
    - Conditional rendering (card only when linked record exists)
    - Left-border accent cards for visual distinction
key_files:
  created: []
  modified:
    - src/app/(driver)/actions/driver-load.ts
    - src/app/(driver)/actions/driver-routes.ts
    - src/app/(driver)/my-route/page.tsx
    - src/app/(driver)/my-load/page.tsx
decisions:
  - Fetch route summary independently in my-load (try/catch, no Promise.all) to avoid blocking load render if summary fails
  - Load summary added to existing Promise.all in my-route (documents already parallel)
  - Blue left-border accent for load card, emerald for route card — consistent with domain color conventions
metrics:
  duration: ~8 minutes
  completed: 2026-03-14
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 66: TKT-0022 Cross-Reference Routes and Loads Summary

**One-liner:** Cross-reference info cards on /my-route and /my-load linking drivers between their active load and assigned route with status badges and direct navigation links.

## What Was Built

Two lightweight summary server actions and two cross-reference info cards added to the driver portal, so drivers can see at a glance whether they have a corresponding load or route without navigating away.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add summary server actions for cross-referencing | c60d5cd | driver-load.ts, driver-routes.ts |
| 2 | Add cross-reference info cards to both pages | 1c06c97 | my-route/page.tsx, my-load/page.tsx |

## Key Changes

### Server Actions (Task 1)

**`getMyActiveLoadSummary`** added to `driver-load.ts`:
- Returns `{ id, loadNumber, origin, destination, status }` using `select` (no customer join)
- Same security pattern as `getMyActiveLoad`: requireRole DRIVER, getCurrentUser, driverId filter
- Status filter: DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED

**`getMyAssignedRouteSummary`** added to `driver-routes.ts`:
- Returns `{ id, name, origin, destination, status }` using `select`
- Same security pattern as `getMyAssignedRoute`: requireRole DRIVER, getCurrentUser, driverId filter
- Status filter: PLANNED, IN_PROGRESS

### UI Cards (Task 2)

**`/my-route` page** — "Your Active Load" card:
- Blue left-border accent (`border-l-blue-500`)
- Package icon + uppercase header
- Load number (bold), origin → destination, status badge
- Link to `/my-load`
- Only rendered when `loadSummary` is non-null
- Added to `Promise.all` alongside document fetches

**`/my-load` page** — "Your Active Route" card:
- Emerald left-border accent (`border-l-emerald-500`)
- MapPin icon + uppercase header
- Route name (or "Unnamed Route" if null), origin → destination, status badge
- Link to `/my-route`
- Only rendered when `routeSummary` is non-null
- Fetched separately with its own try/catch (doesn't block load render on failure)

**Status badge colors:**
- IN_PROGRESS / IN_TRANSIT → green
- DISPATCHED → blue
- PLANNED / PICKED_UP → yellow
- Other → muted gray

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compiles without errors (`npx tsc --noEmit`)
- Next.js production build succeeds
- Cards conditionally rendered (no empty state when linked record absent)
- No schema changes, no new dependencies

## Self-Check: PASSED

All 4 modified files exist on disk. Both task commits (c60d5cd, 1c06c97) verified in git history.
