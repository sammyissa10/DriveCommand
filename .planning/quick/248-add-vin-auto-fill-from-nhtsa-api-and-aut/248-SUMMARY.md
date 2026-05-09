---
phase: quick-248
plan: 01
subsystem: carrier-fleet
tags: [vin-lookup, nhtsa, vehicle-id, display-name, carrier-trucks]
dependency_graph:
  requires: []
  provides: [vehicleId on CarrierTruck, displayName on CarrierTruck, NHTSA VIN auto-fill]
  affects: [CarrierTruckForm, CarrierTruckList, DispatchHeader, live-map, driver-routes]
tech_stack:
  added: [NHTSA vpic API (client-side fetch)]
  patterns: [VH-YYYY-NNNNN vehicle ID format, displayName || unitNumber fallback pattern]
key_files:
  created:
    - apps/web/prisma/migrations/20260417100001_add_vehicle_id_display_name/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/fleet-trucks.ts
    - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
    - apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
    - apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
    - apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx
    - apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
    - apps/web/src/app/(driver)/my-route/page.tsx
    - apps/web/src/app/(driver)/actions/driver-routes.ts
    - apps/web/src/components/driver/route-detail-readonly.tsx
    - apps/web/src/components/driver/completed-route-history.tsx
    - apps/web/src/components/driver/driver-dispatch-card.tsx
    - apps/web/scripts/seed-qa-accounts.ts
decisions:
  - "Vehicle ID format: VH-YYYY-NNNNN (year-prefixed sequential, globally unique per tenant)"
  - "displayName defaults to unitNumber on create if not provided"
  - "Live map uses displayName as the licensePlate display field for carrier trucks"
  - "VIN lookup uses NHTSA vpic API client-side (no CORS issues)"
metrics:
  duration: "~30 minutes"
  completed: "2026-04-18"
  tasks_completed: 3
  files_modified: 16
---

# Quick Task 248: VIN Auto-fill from NHTSA API and Auto-generated Vehicle ID

VIN lookup fills make/model/year/truckType/GVWR from NHTSA, every carrier truck gets a permanent VH-YYYY-NNNNN vehicle ID, and displayName is shown across live map/dispatch/driver route surfaces.

## What Was Built

### Task 1: Schema migration + backend
- Added `vehicleId` (unique, `VH-YYYY-NNNNN`) and `displayName` (optional) to `CarrierTruck` Prisma model
- Migration SQL backfills existing rows: `vehicle_id = VH-2026-NNNNN` (ordered by created_at), `display_name = unit_number`
- `generateVehicleId()` in `fleet-trucks.ts` queries the max existing ID and increments the sequence
- `createCarrierTruck` auto-calls `generateVehicleId()` and defaults `displayName` to `unitNumber`
- API POST and PATCH both accept `displayName` as an optional field

### Task 2: VIN Lookup in CarrierTruckForm
- "Lookup" button (Search icon) added next to the VIN input field
- Calls `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}?format=json` client-side
- Parses NHTSA `Results` array: fills `make`, `model`, `year`, `truckType` (from Body Class), and `grossWeightLbs` (from GVWR range string)
- Success toast: "Vehicle details filled from VIN"; error toast on no-data or fetch failure
- Spinner (`Loader2`) shown on button while fetching; button disabled when VIN length != 17
- `displayName` field added below Unit Number (optional, with helpful placeholder)
- `vehicleId` shown as read-only `Badge` above form fields in edit mode only

### Task 3: Display across all surfaces
- **Truck list**: Added "Vehicle ID" column (monospace, muted); link text shows `displayName || unitNumber` with `unitNumber` as subtitle when different; search now matches `vehicleId` and `displayName`
- **Dispatch detail**: Truck chip shows `displayName || unitNumber`; truck reassign dropdown also uses `displayName || unitNumber`
- **Live map API**: `display_name` added to carrier truck SQL SELECT; used as the `licensePlate` display field (with `licensePlate || unitNumber` fallback)
- **Driver my-route page**: Header subtitle shows `displayName || unitNumber` instead of raw `unitNumber`
- **Driver components**: `route-detail-readonly`, `completed-route-history`, `driver-dispatch-card` all updated with `displayName` fallback pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] seed-qa-accounts.ts missing vehicleId on prisma.carrierTruck.create**
- **Found during:** Task 2 TypeScript check
- **Issue:** `prisma.carrierTruck.create` in the seed script was missing the now-required `vehicleId` field
- **Fix:** Added `vehicleId: \`VH-${new Date().getFullYear()}-QA001\`` and `displayName: 'QA Truck 01'` to the seed data
- **Files modified:** `apps/web/scripts/seed-qa-accounts.ts`
- **Commit:** ede912b

**2. [Rule 2 - Missing functionality] displayName propagated to driver-side components**
- **Found during:** Task 3 audit of all `truck.unitNumber` references
- **Issue:** `route-detail-readonly.tsx`, `completed-route-history.tsx`, and `driver-dispatch-card.tsx` all referenced `truck.unitNumber` directly without displayName awareness
- **Fix:** Added `displayName?: string | null` to relevant interfaces and applied `displayName || unitNumber` fallback pattern in all three components
- **Files modified:** above three components
- **Commit:** c9a9776

## Commits

| Hash | Message |
|------|---------|
| b1db907 | feat(quick-248): add vehicle_id and display_name to CarrierTruck schema + backend |
| ede912b | feat(quick-248): add VIN lookup and vehicle_id/display_name to CarrierTruckForm |
| c9a9776 | feat(quick-248): show vehicle_id and display_name across list, live map, dispatch, driver route |

## Self-Check: PASSED

All files verified present. All commits verified in git log.
