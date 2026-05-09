---
phase: quick-220
plan: "01"
subsystem: web/live-map
tags:
  - bug-fix
  - server-actions
  - accessibility
  - tenant-isolation
dependency_graph:
  requires: []
  provides:
    - getVehicleDiagnostics returns null for missing/invalid trucks
    - VehicleDetailsSheet handles null diagnostics and surfaces errors
  affects:
    - apps/web/src/app/(owner)/live-map/actions.ts
    - apps/web/src/components/vehicle/vehicle-details-sheet.tsx
tech_stack:
  added: []
  patterns:
    - UUID validation guard before DB queries
    - Explicit tenantId WHERE clause on all parallel Prisma queries
    - sr-only SheetHeader for accessible Sheet states
key_files:
  modified:
    - apps/web/src/app/(owner)/live-map/actions.ts
    - apps/web/src/components/vehicle/vehicle-details-sheet.tsx
decisions:
  - Return null from server action instead of throwing — client already handles null gracefully
  - Add UUID regex guard at function entry — avoids DB round-trip for clearly invalid IDs
  - Use Tailwind sr-only on SheetHeader for loading/error states — avoids @radix-ui/react-visually-hidden dependency
metrics:
  duration: "~10 minutes"
  completed: "2026-04-15T04:49:46Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-220 Plan 01: Fix Truck-Not-Found 500 Error on Live Map Summary

Null-return and tenant-scoped query fix for getVehicleDiagnostics plus accessible Sheet states for VehicleDetailsSheet.

## What Was Built

Fixed two root causes of the "Truck not found" 500 error and Radix accessibility warnings on the Live Fleet Map vehicle detail panel.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Fix getVehicleDiagnostics error handling and tenant isolation | be5343c | apps/web/src/app/(owner)/live-map/actions.ts |
| 2 | Fix VehicleDetailsSheet accessibility and error resilience | be5343c | apps/web/src/components/vehicle/vehicle-details-sheet.tsx |

## Changes Made

### Task 1 — actions.ts

- Added UUID regex validation at the top of `getVehicleDiagnostics` — returns `null` immediately for empty strings or malformed IDs, avoiding unnecessary DB queries.
- Added `requireTenantId()` call and threaded `tenantId` into all four Prisma queries (`truck.findUnique`, `gPSLocation.findFirst`, `fuelRecord.findFirst`, `load.findFirst`) for explicit tenant isolation.
- Replaced `throw new Error('Truck not found')` with `return null` — the client handles null gracefully with a "No data available" message.

### Task 2 — vehicle-details-sheet.tsx

- Added `error` state (`useState(false)`) to track fetch failures.
- Reset `error` to false at the start of each fetch; set to true in the catch block.
- Added `sr-only` `SheetHeader`/`SheetTitle`/`SheetDescription` to both the loading and no-data render branches — prevents Radix `DialogTitle` accessibility warning in all Sheet states.
- In the no-data state, renders "Failed to load vehicle data" when `error === true` instead of the generic "No data available".

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` from `apps/web`: only pre-existing errors in e2e test files, zero errors in modified files.
- All four Prisma queries now include explicit `tenantId` WHERE clause.
- `getVehicleDiagnostics` returns `null` for invalid UUIDs and for trucks not belonging to the tenant.
- `SheetContent` has accessible `SheetTitle` in all three render states (loading, loaded, error/no-data).

## Self-Check: PASSED

- `apps/web/src/app/(owner)/live-map/actions.ts` — modified, committed in be5343c
- `apps/web/src/components/vehicle/vehicle-details-sheet.tsx` — modified, committed in be5343c
- Commit be5343c exists in git log
