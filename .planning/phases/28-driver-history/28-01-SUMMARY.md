---
phase: 28-driver-history
plan: "01"
subsystem: driver-actions
tags: [server-actions, driver-portal, history, loads, routes]
dependency_graph:
  requires: []
  provides: [getMyCompletedLoads, getMyCompletedRoutes]
  affects: [src/app/(driver)/actions/driver-load.ts, src/app/(driver)/actions/driver-routes.ts]
tech_stack:
  added: []
  patterns: [requireRole-getCurrentUser-getTenantPrisma security chain, findMany with tenant-scoped Prisma client]
key_files:
  created: []
  modified:
    - src/app/(driver)/actions/driver-load.ts
    - src/app/(driver)/actions/driver-routes.ts
decisions:
  - archivedAt confirmed present on Route model (prisma/schema.prisma:268) — filter included as planned
metrics:
  duration: 67s
  completed: 2026-03-21
---

# Phase 28 Plan 01: Driver History Server Actions Summary

**One-liner:** Two driver-scoped server actions fetching completed load/route history via getTenantPrisma with requireRole security guard.

## What Was Built

Appended two new exported async functions to existing driver action files:

1. `getMyCompletedLoads()` in `src/app/(driver)/actions/driver-load.ts` — returns all DELIVERED and INVOICED loads assigned to the authenticated driver, ordered by deliveryDate desc / pickupDate desc, with customer companyName and route id/name included.

2. `getMyCompletedRoutes()` in `src/app/(driver)/actions/driver-routes.ts` — returns all COMPLETED routes assigned to the authenticated driver, ordered by completedAt desc / scheduledDate desc, with truck details, stops (ordered by position), and their delivered/invoiced loads included.

Both functions follow the established security pattern: `requireRole([UserRole.DRIVER])` → `getCurrentUser()` → `getTenantPrisma()` — identity always resolved from the database, never from parameters.

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Add getMyCompletedLoads() to driver-load.ts | 0d1020b | src/app/(driver)/actions/driver-load.ts |
| 2 | Add getMyCompletedRoutes() to driver-routes.ts | 29ef961 | src/app/(driver)/actions/driver-routes.ts |

## Verification

- `npx tsc --noEmit` passes with no errors
- `getMyCompletedLoads` confirmed at line 158 of driver-load.ts
- `getMyCompletedRoutes` confirmed at line 167 of driver-routes.ts
- Both functions filter by `driverId: user.id` (never accepts driverId as input)

## Deviations from Plan

None - plan executed exactly as written. (Note: archivedAt pre-flight check confirmed the Route model has the field at prisma/schema.prisma:268, so no fallback comment was needed.)

## Self-Check: PASSED

- [x] src/app/(driver)/actions/driver-load.ts — modified, getMyCompletedLoads at line 158
- [x] src/app/(driver)/actions/driver-routes.ts — modified, getMyCompletedRoutes at line 167
- [x] Commit 0d1020b exists (Task 1)
- [x] Commit 29ef961 exists (Task 2)
