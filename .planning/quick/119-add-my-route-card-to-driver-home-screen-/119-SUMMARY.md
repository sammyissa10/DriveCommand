---
phase: quick-119
plan: "01"
subsystem: mobile-driver
tags:
  - mobile
  - driver-portal
  - dashboard
  - route
dependency_graph:
  requires:
    - driverApi.getMyRoute (packages/api-client/src/driver.ts)
    - DriverRoute type (packages/api-client/src/driver.ts)
  provides:
    - My Route card on driver dashboard
  affects:
    - apps/mobile/app/(driver)/index.tsx
tech_stack:
  added: []
  patterns:
    - Parallel useQuery calls sharing cache key ['driver-route'] with my-route.tsx screen
    - Conditional card rendering (hidden when no route assigned)
key_files:
  modified:
    - apps/mobile/app/(driver)/index.tsx
decisions:
  - Copied getRouteBadge helper locally into index.tsx rather than extracting to shared util — keeps changes minimal and self-contained for this quick task
metrics:
  duration: "~5 minutes"
  completed: "2026-03-28"
---

# Quick Task 119: Add My Route Card to Driver Home Screen Summary

Emerald-accented My Route card added to driver dashboard above Active Load, using the existing `['driver-route']` query cache key. Card conditionally renders only when a route is assigned and navigates to `/(driver)/loads/my-route` on tap.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add My Route card to driver dashboard | 95d091f | apps/mobile/app/(driver)/index.tsx |

## What Was Built

- Second `useQuery` call in `DriverDashboard` for `['driver-route']` with `driverApi.getMyRoute`
- My Route card with emerald accent bar (`bg-emerald-500`), `border-emerald-700`, route name (with "Unnamed Route" fallback), origin/destination row, status badge, and "View Route" link
- `getRouteBadge` helper (copied from my-route.tsx) for PENDING/ACTIVE/IN_PROGRESS/COMPLETED/CANCELLED status mapping
- `onRefresh` updated to call both `refetch()` and `refetchRoute()` for pull-to-refresh coverage
- Card is entirely hidden when `routeData?.route` is falsy — no empty state rendered

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/mobile/app/(driver)/index.tsx` — modified, exists
- Commit `95d091f` — exists (`feat(quick-119): add My Route card to driver home screen`)
- TypeScript errors in output are all pre-existing in unrelated files (FlashList type issues in documents.tsx, messages.tsx, fleet.tsx, loads/index.tsx, and ExternalLink.tsx) — none in the modified file
