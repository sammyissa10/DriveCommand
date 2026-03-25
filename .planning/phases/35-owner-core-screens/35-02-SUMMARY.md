---
phase: 35-owner-core-screens
plan: "02"
subsystem: ui, api
tags: [react-native, expo-router, tanstack-query, prisma, flashlist, nativewind]

# Dependency graph
requires:
  - phase: 35-01
    provides: owner dashboard, ownerApi foundation, owner route group layout
  - phase: 31-driver-core-screens
    provides: StopTimelineItem component, BottomSheet UI, Badge component
provides:
  - GET /api/mobile/owner/loads with 4-tab filter (all|active|pending|delivered)
  - POST /api/mobile/owner/loads — create load with auto load number generation
  - PATCH /api/mobile/owner/loads/[id] — status change, driver assign, notes
  - GET /api/mobile/owner/customers — customer picker data
  - GET /api/mobile/owner/drivers/active — driver picker data
  - CreateLoadSheet component with customer/driver/date/rate fields
  - Owner load list screen with FAB and 4 status tabs
  - Owner load detail with assign driver, status change, cancel actions
affects:
  - 35-03 (owner drivers screen — reuses ownerApi.getActiveDrivers pattern)
  - 36-owner-financials (load rate data already present)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Nested BottomSheet for picker-within-sheet (CustomerPicker, DriverPicker opened from CreateLoadSheet)
    - updateLoad PATCH mutation invalidates both owner-load and owner-loads query caches
    - Cancelled load guard: actions hidden, banner shown, truck/driver buttons disabled

key-files:
  created:
    - apps/web/src/app/api/mobile/owner/customers/route.ts
    - apps/web/src/app/api/mobile/owner/drivers/active/route.ts
    - apps/mobile/components/owner/CreateLoadSheet.tsx
  modified:
    - apps/web/src/app/api/mobile/owner/loads/route.ts
    - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    - apps/mobile/app/(owner)/loads/index.tsx
    - apps/mobile/app/(owner)/loads/[id].tsx
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts

key-decisions:
  - "Status tabs use query param (all|active|pending|delivered) — active maps to DISPATCHED+PICKED_UP+IN_TRANSIT, pending=PENDING, delivered=DELIVERED+INVOICED"
  - "Load creation uses inline load number generation (LD-NNNN pattern) matching web owner portal"
  - "Owner can change load to any status (no restriction) — more permissive than driver who follows sequential flow"
  - "Nested BottomSheet pattern: CreateLoadSheet hosts customer/driver pickers as separate Modal overlays"
  - "Cancel confirmation sheet separate from status picker to prevent accidental cancels"

patterns-established:
  - "Mutation invalidates both item-level and list-level query caches on success"
  - "isCancelled guard disables all mutating actions and shows read-only banner"

# Metrics
duration: 5min
completed: 2026-03-24
---

# Phase 35 Plan 02: Owner Loads Management Summary

**Full owner loads management: 4-tab filtered list with FAB create-load sheet, PATCH endpoint for driver assignment/status change/cancel, and owner-only action cards on load detail.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-24T07:26:32Z
- **Completed:** 2026-03-24T07:31:49Z
- **Tasks:** 6
- **Files modified:** 9

## Accomplishments
- Built 4-tab loads list (All/Active/Pending/Delivered) with FlashList, pull-to-refresh, and FAB for creating loads
- CreateLoadSheet with customer picker, origin/dest, pickup date (MM/DD/YYYY), rate ($prefix), and optional driver picker using nested BottomSheet pattern
- Owner load detail extended with Assign Driver, Change Status, and Cancel Load actions; cancelled loads show read-only banner

## Task Commits

1. **Tasks 1, 4, 5: REST endpoints + api-client** - `d96cda5` (feat)
2. **Tasks 2, 3: Loads list + CreateLoadSheet** - `f51d4c1` (feat)
3. **Task 6: Load detail owner actions** - `2679baf` (feat)

## Files Created/Modified
- `apps/web/src/app/api/mobile/owner/loads/route.ts` - GET (4 tabs) + POST (create load with load number gen)
- `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts` - Added PATCH (status/driver/notes update)
- `apps/web/src/app/api/mobile/owner/customers/route.ts` - GET customer list for pickers
- `apps/web/src/app/api/mobile/owner/drivers/active/route.ts` - GET active driver list for pickers
- `apps/mobile/app/(owner)/loads/index.tsx` - 4-tab filter, OwnerLoadCard with rate/unassigned badge, FAB
- `apps/mobile/app/(owner)/loads/[id].tsx` - Assign driver, change status, cancel load + sheets
- `apps/mobile/components/owner/CreateLoadSheet.tsx` - Full create-load form with nested pickers
- `packages/api-client/src/owner.ts` - Added createLoad, updateLoad, getCustomers, getActiveDrivers + types
- `packages/api-client/src/index.ts` - Exported new types (CustomerOption, DriverOption, CreateLoadPayload, UpdateLoadPayload)

## Decisions Made
- Status tabs use backend query params: `active` maps to DISPATCHED+PICKED_UP+IN_TRANSIT; `pending` = PENDING; `delivered` = DELIVERED+INVOICED; `all` = no filter.
- Load number generation in POST endpoint uses same `LD-NNNN` pattern as the web owner portal action.
- Owner PATCH endpoint allows any status transition (no restriction), unlike driver which follows sequential flow.
- Nested BottomSheet: customer and driver pickers are separate Modal overlays opened from within CreateLoadSheet — avoids z-index conflicts.
- Cancel confirmation is a distinct sheet (not part of status picker) to prevent accidental cancellation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GET loads endpoint: pre-existing 'active|history' groups replaced with plan's 4-tab model**
- **Found during:** Task 1 (REST endpoint review)
- **Issue:** Existing GET used `active` (PENDING+DISPATCHED+PICKED_UP+IN_TRANSIT) and `history` (DELIVERED+INVOICED+CANCELLED), which didn't match plan's 4-tab spec (all|active|pending|delivered)
- **Fix:** Rewrote status filter mapping; `active` now means DISPATCHED+PICKED_UP+IN_TRANSIT, `pending` = PENDING only, `delivered` = DELIVERED+INVOICED. `all` passes no filter.
- **Files modified:** apps/web/src/app/api/mobile/owner/loads/route.ts
- **Committed in:** d96cda5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — behavioral mismatch between existing code and plan spec)
**Impact on plan:** Necessary correction. Old 2-tab grouping was incompatible with 4-tab UI. No scope creep.

## Issues Encountered
None — existing TruckPickerSheet and BottomSheet components reused cleanly for driver picker and status picker.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Owner loads management complete end-to-end
- `ownerApi.getActiveDrivers` and `ownerApi.getCustomers` available for reuse in Phase 35-03 (drivers screen)
- Load detail PATCH endpoint ready for any future owner feature needing load mutation

---
*Phase: 35-owner-core-screens*
*Completed: 2026-03-24*
