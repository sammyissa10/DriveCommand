---
phase: quick-57
plan: 01
subsystem: ui
tags: [trucks, status-badge, tanstack-table, prisma-includes, computed-status]

# Dependency graph
requires: []
provides:
  - "computeTruckStatus pure function with In Use / In Maintenance / Expired Docs / Ready to Use priority logic"
  - "Status badge column in trucks list table"
  - "Status badge next to truck title on detail page"
  - "listTrucks and getTruck server actions enriched with assignedRoutes, loads, scheduledServices, documents includes"
affects: [trucks-list, truck-detail, fleet-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Computed status derived from pre-fetched Prisma includes — no extra DB round-trip, no schema changes"
    - "TruckWithRelations interface exported from utility; consumed by wrapper, list, and detail page for type safety"
    - "Prisma where filters pushed into includes so only relevant rows are fetched (IN_PROGRESS routes, active loads, isCompleted:false services, expiry-dated docs)"

key-files:
  created:
    - src/lib/trucks/compute-truck-status.ts
  modified:
    - src/app/(owner)/actions/trucks.ts
    - src/app/(owner)/trucks/truck-list-wrapper.tsx
    - src/components/trucks/truck-list.tsx
    - src/app/(owner)/trucks/[id]/page.tsx

key-decisions:
  - "Status is computed, not stored — no schema changes required"
  - "Pre-filter includes at query level (where clauses inside include blocks) to minimise data transfer"
  - "Status column inserted between License Plate and Odometer in the TanStack Table column array"
  - "Truck detail page uses the same computeTruckStatus function via a cast to TruckWithRelations"

patterns-established:
  - "Computed badge pattern: pure function + pre-filtered includes — reusable for drivers/routes if needed"

# Metrics
duration: 8min
completed: 2026-03-13
---

# Quick Task 57: TKT-0015 — Automated Truck Status Badges Summary

**Computed status badges (In Use / In Maintenance / Expired Docs / Ready to Use) added to the trucks list table and truck detail page, derived from existing Prisma relations with no schema changes.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-13T00:00:00Z
- **Completed:** 2026-03-13T00:08:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `src/lib/trucks/compute-truck-status.ts` — pure function with correct priority ordering and exported `TruckWithRelations` type
- Updated `listTrucks()` and `getTruck()` to include assignedRoutes, loads, scheduledServices, and documents (with targeted where filters)
- Added a colored Status badge column to the TruckList TanStack Table (blue / amber / red / green pill badges)
- Added a status badge inline with the truck title `<h1>` on the detail page
- TypeScript compiles cleanly; `npm run build` passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create status computation utility and update server actions** - `00c70c5` (feat)
2. **Task 2: Add status badge to trucks list table and detail page** - `3f851d0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/lib/trucks/compute-truck-status.ts` — TruckStatus type, TruckStatusInfo, TruckWithRelations interface, computeTruckStatus pure function
- `src/app/(owner)/actions/trucks.ts` — added include blocks to listTrucks() and getTruck()
- `src/app/(owner)/trucks/truck-list-wrapper.tsx` — switched from Truck[] to TruckWithRelations[]
- `src/components/trucks/truck-list.tsx` — added Status column definition, updated ColumnDef generic, imported computeTruckStatus
- `src/app/(owner)/trucks/[id]/page.tsx` — imported computeTruckStatus, added status badge next to h1

## Decisions Made

- Status is computed at render time from pre-fetched includes — avoids a separate status column in the DB and keeps data always fresh
- Where clauses inside the include blocks (e.g. `status: 'IN_PROGRESS'`, `isCompleted: false`) reduce the rows Prisma fetches to only what matters for status computation
- Status column positioned after License Plate and before Odometer to keep high-priority fleet info visible together
- On the detail page, the status badge is placed inside a flex container alongside the `<h1>` rather than below it, keeping the header compact

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Truck status badges are live and will reflect real operational data (routes, loads, maintenance services, documents) immediately
- Pattern can be reused for driver or route status badges if needed
- No blockers

---
*Phase: quick-57*
*Completed: 2026-03-13*

## Self-Check: PASSED

All created files verified on disk. All task commits verified in git log.
