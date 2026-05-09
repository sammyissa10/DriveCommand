---
phase: quick-244
plan: 01
subsystem: live-map
tags: [carrier-trucks, live-map, diagnostics, dispatch, bug-fix]
dependency_graph:
  requires: []
  provides: [carrier-truck-diagnostics, carrier-truck-dispatch-context]
  affects: [live-map-sidebar, vehicle-details-sheet]
tech_stack:
  added: []
  patterns: [tenantRawQuery raw SQL fallback for non-Prisma tables, carrier_trucks diagnostics shape]
key_files:
  modified:
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
    - apps/web/src/app/(owner)/live-map/actions.ts
decisions:
  - Use IIFE for dispatch computation inline in carrierVehicles.map() to keep code readable
  - Return odometer:0 and estimatedFuelLevel:50 for carrier trucks (no fuel/odometer tracking)
  - Reuse VehicleDispatch interface: routeName=dispatch number, loadCount=stop count, nextStopAddress=facility name
metrics:
  duration: "~20 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 244: Fix Live Map Vehicle Detail Panel and Sidebar for Carrier Trucks

Carrier trucks (from `carrier_trucks` table) now display real dispatch context in the live map sidebar and show full diagnostics in the detail panel, instead of "No active route" and "No data available".

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add carrier truck dispatch context to live-map vehicles API | 3af4cd9 | apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts |
| 2 | Fix getVehicleDiagnostics to handle carrier trucks | 15bab2b | apps/web/src/app/(owner)/live-map/actions.ts |

## What Was Done

### Task 1: Carrier Dispatch Context in Vehicles API

Added three new interfaces (`CarrierDispatchRow`, `CarrierStopCountRow`, `CarrierNextStopRow`) and a new query block (Step 2c) after the carrier driver map is built:

1. Queries `dispatches` table for carrier trucks with `planned` or `in_progress` status
2. Extracts dispatch number from `notes` field using regex `/\[DISPATCH_NUMBER=([^\]]+)\]/`
3. Batches stop count query per active dispatch IDs
4. Batches next pending stop query (joining `carrier_facilities` for facility name)
5. Replaces `dispatch: null` in `carrierVehicles` mapping with real dispatch data using IIFE pattern

All queries guarded by `if (carrierTruckIds.length > 0)` and `if (activeCarrierDispatchIds.length > 0)`.

### Task 2: Carrier Truck Diagnostics Fallback

Modified `getVehicleDiagnostics()` to fall through to `getCarrierTruckDiagnostics()` when `db.truck.findUnique` returns null (carrier trucks are not in the `Truck` Prisma model).

New private function `getCarrierTruckDiagnostics()`:
1. Queries `carrier_trucks` via `tenantRawQuery` raw SQL for truck info
2. Queries `GPSLocation` via Prisma using `carrierTruckId` field
3. Queries `dispatches` for active dispatch with `planned`/`in_progress` status
4. Queries assigned driver via `carrier_drivers` → `User` join
5. Returns same `DiagnosticsData` shape — odometer set to 0, fuel set to null/50%, activeLoad mapped from dispatch

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (only pre-existing e2e test errors unrelated to these files)
- No new TypeScript errors introduced in modified files

## Self-Check: PASSED

Files exist:
- apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts - FOUND
- apps/web/src/app/(owner)/live-map/actions.ts - FOUND

Commits exist:
- 3af4cd9 - FOUND
- 15bab2b - FOUND
