---
phase: quick-227
plan: 01
subsystem: carrier/dispatches
tags: [dispatch, assignment, driver, truck, loads, tenant-isolation]
dependency_graph:
  requires: [carrier/dispatches API, carrier/loads API, DispatchHeader, DispatchLoadsPanel]
  provides: [dispatch assignment editing, load detachment with active-stop guard]
  affects: [dispatch detail page, load status flow]
tech_stack:
  added: []
  patterns: [nullable schema fields, active-stop guard, tenant isolation on update]
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts
  modified:
    - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    - apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    - apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/lib/carrier/loads.ts
decisions:
  - "Kept load status as 'pending' on attach (not 'assigned') — 'assigned' is not a valid carrier load status in the schema, avoiding silent API validation failure"
  - "Restricted Attach Load button to planned dispatches only (was planned+in_progress)"
metrics:
  duration: ~15 minutes
  completed: 2026-04-17
  tasks: 2
  files_modified: 7
  files_created: 1
---

# Quick Task 227: Allow Editing Driver, Truck, and Load Assignments on Planned Dispatches

## One-liner
Dispatch edit dialog now exposes driver/truck/co-driver dropdowns and per-load remove buttons, all locked to planned-only with tenant isolation and active-stop guard.

## What Was Built

### Task 1: Driver/Truck/Co-Driver Dropdowns in Edit Dialog

**DispatchHeader.tsx**
- Added `allDrivers` and `allTrucks` optional props
- Extended `editForm` state with `primaryDriverId`, `coDriverId`, `truckId` fields
- `openEditDialog()` now initializes assignment fields from existing dispatch values
- Dialog renders three additional dropdowns (Primary Driver, Co-Driver, Truck) when `dispatch.status === 'planned'`
- Co-Driver select excludes the currently selected Primary Driver from its options
- `handleEditSave` validates co-driver !== primary driver before saving (client-side toast error)
- Assignment fields (`primaryDriverId`, `coDriverId`, `truckId`) included in PATCH payload only when `status === 'planned'`
- Sending `coDriverId: null` clears the co-driver

**page.tsx**
- Removed `void trucksForAttach` placeholder
- Passes `allDrivers={driversForPanels}` and `allTrucks={trucksForAttach}` to `<DispatchHeader>`

**dispatches.ts**
- `DispatchUpdateInput` type: omit `coDriverId` from base partial, re-declare as `string | null | undefined`
- `updateDispatch()` now validates tenant ownership for changed driver, co-driver, and truck
- If `primaryDriverId` changed and new driver not in org → `{ error: 'Invalid driver' }`
- If `coDriverId` provided and not in org → `{ error: 'Invalid co-driver' }`
- If `coDriverId === effectivePrimaryId` server-side → `{ error: 'Co-driver cannot be the same as primary driver' }`
- If `truckId` changed and new truck not in org → `{ error: 'Invalid truck' }`
- Existing `after(() => sendDispatchAssignedNotification(...))` on primaryDriverId change left intact

**dispatches/[id]/route.ts**
- `coDriverId` changed from `z.string().uuid().optional()` to `z.string().uuid().nullable().optional()`

### Task 2: Load Removal with Active-Stop Guard

**remove-load/route.ts** (new)
- `POST /api/v1/carrier/dispatches/[id]/remove-load` with `{ loadId: uuid }`
- Auth + orgId check
- Verifies dispatch exists and belongs to org
- Returns 400 if dispatch status is not `planned`
- Returns 404 if load not found on this dispatch
- Checks `carrierStop.status IN ('arrived', 'completed')` — returns 400 "Cannot remove a load with active stops" if found
- Updates load: `dispatchId: null, status: 'pending'`

**DispatchLoadsPanel.tsx**
- `canAttach` restricted to `status === 'planned'` only (was `planned || in_progress`)
- Added `canRemove` flag (`status === 'planned'`)
- `handleRemove()` calls the new remove-load endpoint, toasts success/error, calls `router.refresh()`
- Remove (X) button rendered on each load row when `canRemove` is true

**loads/[id]/route.ts**
- `dispatchId` changed to `z.string().uuid().nullable().optional()`

**loads.ts**
- `LoadUpdateInput` now omits `dispatchId` from base partial, re-declares as `string | null | undefined`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Load status 'assigned' not valid in carrier load schema**
- **Found during:** Task 2, when adding `status: 'assigned'` to handleAttach payload
- **Issue:** The `LoadUpdateSchema` validates status against `z.enum(['pending', 'in_transit', 'delivered', 'cancelled', 'invoiced'])`. 'assigned' is not a valid value; the PATCH would silently fail schema validation with a 400 error
- **Fix:** Kept attach payload as `{ dispatchId }` only — load stays at 'pending' until the trip starts and moves to 'in_transit'. This is semantically correct: the load is assigned to a dispatch but hasn't been picked up yet
- **Files modified:** apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx

## Self-Check: PASSED

Files created:
- apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts — FOUND

Commits:
- e3185a4: feat(quick-227): add driver/truck/co-driver dropdowns to dispatch edit dialog
- 02e4759: feat(quick-227): add load removal from dispatch with active-stop guard
