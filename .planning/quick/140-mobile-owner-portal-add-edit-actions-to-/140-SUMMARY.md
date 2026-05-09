---
phase: quick-140
plan: 01
subsystem: mobile-owner-portal
tags: [mobile, owner-portal, edit, drivers, trucks, bottom-sheet, api]
dependency_graph:
  requires:
    - apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts (GET existed)
    - apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts (GET existed)
    - packages/api-client/src/owner.ts
    - apps/mobile/components/ui/BottomSheet.tsx
  provides:
    - PATCH /api/mobile/owner/drivers/[id]
    - PATCH /api/mobile/owner/trucks/[id]
    - ownerApi.updateDriver
    - ownerApi.updateTruck
    - Edit bottom sheet on driver detail screen
    - Edit bottom sheet on truck detail screen
  affects:
    - apps/mobile/app/(owner)/drivers/[id].tsx
    - apps/mobile/app/(owner)/more/trucks/[id].tsx
tech_stack:
  added: []
  patterns:
    - PATCH API route with bypass_rls transaction
    - Inline bottom sheet component pattern (same as StatusPickerSheet in loads/[id].tsx)
    - useMutation with query invalidation on success
key_files:
  created: []
  modified:
    - apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
    - apps/mobile/app/(owner)/drivers/[id].tsx
    - apps/mobile/app/(owner)/more/trucks/[id].tsx
decisions:
  - Used snapPoint="80%" for both sheets (BottomSheet only supports 40%/60%/80%/full — plan specified 70%/85% which are not valid values)
  - Driver detail API returns a combined `name` string; parse it into firstName/lastName on client for form pre-fill
  - Truck edit sheet only sends changed fields to minimize API payload (diff against initialData)
  - Added UpdateDriverPayload and UpdateTruckPayload to api-client/src/index.ts exports and rebuilt dist/
metrics:
  duration: ~25 minutes
  completed: 2026-03-31
  tasks_completed: 3
  files_modified: 6
---

# Quick Task 140: Mobile Owner Portal — Add Edit Actions to Driver and Truck Detail Screens

**One-liner:** PATCH API routes and inline edit bottom sheets for Driver (name, license) and Truck (make, model, year, plate, VIN, odometer) detail screens in the mobile owner portal.

## What Was Built

### Task 1: PATCH API Routes + API Client Methods

Added `PATCH` handlers to both existing GET-only route files:

- **`PATCH /api/mobile/owner/drivers/[id]`** — Accepts `{ firstName?, lastName?, licenseNumber? }`. Validates at least one field present, non-empty strings for name fields. Updates `user` where `{ id, tenantId, role: 'DRIVER' }` via bypass_rls transaction.

- **`PATCH /api/mobile/owner/trucks/[id]`** — Accepts `{ make?, model?, year?, licensePlate?, vin?, odometer? }`. Validates year 1900–2100, odometer >= 0. Sets `updatedById`. Updates `truck` where `{ id, tenantId, archivedAt: null }`.

Added `UpdateDriverPayload` and `UpdateTruckPayload` interfaces plus `updateDriver` and `updateTruck` methods to `ownerApi`. Exported both new types from `packages/api-client/src/index.ts`.

### Task 2: Driver Detail Edit Sheet

Added to `apps/mobile/app/(owner)/drivers/[id].tsx`:
- `parseName()` helper splits the API's `name` string into firstName/lastName for form pre-fill
- `EditDriverSheet` inline component (style matching `invite.tsx` — style objects, not className)
- Pencil icon button in nav bar between back arrow and compliance icon
- `useMutation` → `ownerApi.updateDriver` with haptic feedback, toast, and query invalidation

### Task 3: Truck Detail Edit Sheet

Added to `apps/mobile/app/(owner)/more/trucks/[id].tsx`:
- `EditTruckSheet` inline component (NativeWind className style matching existing file)
- Pencil icon button in header after the status pill
- Diff logic: only sends fields that changed from initial values
- `useMutation` → `ownerApi.updateTruck` with same success/error handling pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] BottomSheet snapPoint values**
- **Found during:** Task 2
- **Issue:** Plan specified `snapPoint="70%"` and `snapPoint="85%"` but `BottomSheet` component only accepts `'40%' | '60%' | '80%' | 'full'`
- **Fix:** Used `snapPoint="80%"` for both sheets — closest valid value that provides enough space
- **Files modified:** apps/mobile/app/(owner)/drivers/[id].tsx, apps/mobile/app/(owner)/more/trucks/[id].tsx

**2. [Rule 3 - Blocking] Missing api-client index.ts exports**
- **Found during:** Task 2 type check
- **Issue:** `UpdateDriverPayload` and `UpdateTruckPayload` were defined in `owner.ts` but not re-exported from `index.ts`, causing TS2305 errors in the mobile app
- **Fix:** Added both types to the export line in `packages/api-client/src/index.ts` and rebuilt dist/
- **Files modified:** packages/api-client/src/index.ts

## Verification

All TypeScript checks pass:
- `cd apps/web && npx tsc --noEmit` — PASS
- `cd packages/api-client && npx tsc --noEmit` — PASS
- `cd apps/mobile && npx tsc --noEmit` — PASS (pre-existing FlashList errors unrelated to this task)

## Commits

| Hash | Message |
|------|---------|
| 0eb7620 | feat(quick-140): add PATCH API routes for drivers/trucks + api-client methods |
| a12b5cc | feat(quick-140): add edit bottom sheet to Driver detail screen |
| 3783bd6 | feat(quick-140): add edit bottom sheet to Truck detail screen |

## Self-Check: PASSED

All 5 key files exist on disk. All 3 task commits verified in git log.
