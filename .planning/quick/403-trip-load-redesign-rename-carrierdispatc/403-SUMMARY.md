---
phase: quick
plan: 403
subsystem: database, ui, api
tags: [prisma, trip, dispatch, drag-drop, react, next.js]

# Dependency graph
requires:
  - phase: quick-402
    provides: READ-ONLY investigation of trip/load data model
provides:
  - Prisma model rename CarrierDispatch -> Trip
  - CarrierStop checklist fields (checklistStatus, deferredReason, checklistEntityId)
  - trips.ts library with reorderTripStops, addLoadToTrip functions
  - DispatchLoadModal with new/existing trip modes
  - Trip Plan screen with drag-drop stop reorder
  - Load cancellation modal with stop removal prompt
  - Driver trip list page
affects: [workflow-engine, mobile-app, trip-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prisma model rename via @@map (DB table unchanged)"
    - "HTML5 drag-and-drop for stop reordering"
    - "Backward-compat lib wrappers for gradual migration"

key-files:
  created:
    - apps/web/src/lib/carrier/trips.ts
    - apps/web/src/components/carrier/trips/TripPlanEditor.tsx
    - apps/web/src/components/carrier/trips/StopCard.tsx
    - apps/web/src/components/carrier/loads/CancelLoadModal.tsx
    - apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx
    - apps/web/src/app/(driver)/carrier/driver/trips/page.tsx
    - apps/web/src/app/api/v1/carrier/trips/[id]/loads/route.ts
    - apps/web/src/app/api/v1/carrier/trips/[id]/reorder/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/cancel/route.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/components/carrier/loads/DispatchLoadModal.tsx
    - apps/web/src/components/carrier/loads/LoadDetailActions.tsx
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx

key-decisions:
  - "Keep DB table 'dispatches' via @@map - no data migration required"
  - "dispatches.ts becomes re-export wrapper for backward compatibility"
  - "Trip Plan uses native HTML5 drag-drop (no external deps like dnd-kit)"
  - "Stop reorder auto-saves on drop via API call"
  - "Load cancellation prompts for stop removal when load is on a trip"

patterns-established:
  - "Prisma model rename: rename model, update relations, keep @@map for DB compat"
  - "Gradual migration: old lib exports re-export from new lib with aliases"

# Metrics
duration: 20min
completed: 2026-05-24
---

# Quick 403: Trip/Load Redesign - Rename CarrierDispatch to Trip

**Renamed CarrierDispatch -> Trip in Prisma schema, added stop checklist fields, built Trip Plan screen with drag-drop reorder, enhanced DispatchLoadModal with add-to-existing-trip mode, and added load cancellation with stop removal prompt**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-24T16:30:29Z
- **Completed:** 2026-05-24T16:50:53Z
- **Tasks:** 7
- **Files modified:** 43

## Accomplishments
- Prisma model renamed from CarrierDispatch to Trip (DB table unchanged via @@map)
- Added checklistStatus, deferredReason, checklistEntityId to CarrierStop for future workflow engine integration
- Built Trip Plan screen with drag-and-drop stop reordering
- Enhanced DispatchLoadModal to support adding loads to existing planned trips
- Created load cancellation modal with checkbox to remove pending stops from trip
- Added driver trip list page at /carrier/driver/trips

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema rename + checklist fields** - `6371ab5d` (feat)
2. **Task 2: trips.ts + Prisma reference updates** - `00c3c456` (refactor)
3. **Task 3: Update page/component imports** - `26bbd950` (refactor)
4. **Task 4: Enhance DispatchLoadModal** - `fae64609` (feat)
5. **Task 5: Trip Plan screen with drag-drop** - `d559fa38` (feat)
6. **Task 6: Load cancellation modal** - `403ff1b4` (feat)
7. **Task 7: Driver trip view** - `d8c62d1c` (feat)

## Files Created/Modified

### Created
- `apps/web/prisma/migrations/20260524113337_rename_carrier_dispatch_to_trip_add_stop_checklist_fields/migration.sql` - DB migration for checklist fields
- `apps/web/src/lib/carrier/trips.ts` - New library with Trip CRUD + reorderTripStops + addLoadToTrip
- `apps/web/src/components/carrier/trips/TripPlanEditor.tsx` - Drag-drop stop reorder component
- `apps/web/src/components/carrier/trips/StopCard.tsx` - Stop display component for plan editor
- `apps/web/src/components/carrier/loads/CancelLoadModal.tsx` - Load cancellation with stop removal prompt
- `apps/web/src/app/(owner)/carrier/trips/page.tsx` - Redirects to /carrier/dispatches
- `apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx` - Redirects to dispatch detail
- `apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx` - Trip Plan screen
- `apps/web/src/app/(driver)/carrier/driver/trips/page.tsx` - Driver trip list
- `apps/web/src/app/api/v1/carrier/trips/[id]/loads/route.ts` - Add load to trip endpoint
- `apps/web/src/app/api/v1/carrier/trips/[id]/reorder/route.ts` - Reorder stops endpoint
- `apps/web/src/app/api/v1/carrier/loads/[id]/cancel/route.ts` - Cancel load endpoint

### Modified
- `apps/web/prisma/schema.prisma` - Renamed CarrierDispatch to Trip, added checklist fields to CarrierStop
- `apps/web/src/lib/carrier/dispatches.ts` - Now re-exports from trips.ts with aliases
- `apps/web/src/lib/carrier/loads.ts` - Added removeLoadFromTrip function
- `apps/web/src/lib/carrier/stop-completion.ts` - Updated prisma.trip references
- `apps/web/src/lib/carrier/pay-calculator.ts` - Updated prisma.trip references
- `apps/web/src/lib/carrier/notifications.ts` - Updated prisma.trip references
- `apps/web/src/components/carrier/loads/DispatchLoadModal.tsx` - Added new/existing trip modes
- `apps/web/src/components/carrier/loads/LoadDetailActions.tsx` - Added cancel button, new props
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` - Pass new props to LoadDetailActions
- 24 additional files updated with prisma.carrierDispatch -> prisma.trip

## Decisions Made
- **Keep DB table name:** Used @@map("dispatches") to avoid data migration - model rename is Prisma-client-only change
- **Backward compatibility:** dispatches.ts re-exports from trips.ts with original function names as aliases
- **HTML5 drag-drop:** Used native drag-and-drop instead of external library like dnd-kit for simplicity
- **Auto-save reorder:** Stop order saves automatically on drop (no explicit save button)
- **Checklist fields future-ready:** Added checklistEntityId as plain UUID for future PlaybookInstance FK

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed incorrect variable reference in live-map API**
- **Found during:** Task 2 (Prisma reference updates)
- **Issue:** sed replaced dispatchMap with tripMap but a reference to carrierDispatchMap was missed
- **Fix:** Changed `tripMap.values()` back to `carrierDispatchMap.values()`
- **Files modified:** apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 00c3c456 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor fix required after bulk sed replacement. No scope creep.

## Issues Encountered
- Prisma migrate dev failed due to shadow database issue with RLS - worked around by creating migration manually and using migrate deploy
- Bulk sed replacement missed some edge cases - fixed with targeted edits

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Trip model and supporting infrastructure ready for workflow engine integration
- CarrierStop checklist fields in place for future DVIR/inspection workflows
- UI patterns established for trip planning and load management
- Driver trip list ready for mobile app integration

---
*Phase: quick*
*Completed: 2026-05-24*

## Self-Check: PASSED
- [x] All 12 new files exist
- [x] All 7 task commits verified in git log
- [x] TypeScript compiles without errors
- [x] Migration applied to database
