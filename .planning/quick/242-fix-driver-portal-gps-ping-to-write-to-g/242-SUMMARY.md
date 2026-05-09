---
phase: quick-242
plan: "01"
subsystem: carrier-ops / live-map / gps
tags:
  - gps
  - carrier-ops
  - live-map
  - prisma-migration
  - database
dependency_graph:
  requires:
    - GPSLocation table (existing)
    - carrier_trucks table (existing)
    - dispatches table (existing)
    - carrier_drivers table (existing)
  provides:
    - GPSLocation.carrierTruckId nullable FK column
    - GPS persistence for carrier truck drivers
    - Carrier trucks visible on live map
  affects:
    - apps/web/src/app/api/driver/gps-ping/route.ts
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
    - apps/web/prisma/schema.prisma
    - GPSLocation table schema
tech_stack:
  added: []
  patterns:
    - nullable FK column bridging two truck models
    - LEFT JOIN LATERAL for latest GPS per truck
    - bypass_rls transaction for carrier table reads
key_files:
  created:
    - apps/web/prisma/migrations/20260417_add_carrier_truck_id_to_gps_location/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/api/driver/gps-ping/route.ts
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
decisions:
  - Used nullable carrierTruckId FK (not a new table) to keep GPS in one place
  - truckId made nullable so both carrier and legacy pings use same GPSLocation table
  - Carrier vehicles merged into allVehicles array alongside legacy trucks
metrics:
  duration: "~15 minutes"
  completed: "2026-04-17"
  tasks_completed: 3
  files_modified: 4
---

# Phase quick-242 Plan 01: Fix Driver Portal GPS Ping + Carrier Live Map Summary

## One-liner

Bridge carrier_trucks to GPSLocation via nullable carrierTruckId FK so driver web portal pings persist and live map shows carrier vehicles.

## What Was Built

### Task 1: Schema + Migration

Added `carrierTruckId` as a nullable UUID FK on `GPSLocation` referencing `carrier_trucks(id)` with `ON DELETE CASCADE`. Also made `truckId` nullable so carrier pings can omit it. Added two indexes for fast carrier GPS lookups.

Migration: `20260417_add_carrier_truck_id_to_gps_location/migration.sql` — applied successfully to Supabase.

Prisma schema updated: `GPSLocation` model gains optional `carrierTruck` relation; `CarrierTruck` model gains `gpsLocations GPSLocation[]` reverse relation.

### Task 2: GPS Ping Persistence

`POST /api/driver/gps-ping` now calls `prisma.gPSLocation.create` when `carrierTruckId` is resolved from the active dispatch. The `bypass_rls` transaction for resolving the carrier dispatch stays unchanged. The `create` call uses the top-level prisma client since GPSLocation uses `tenantId` for scoping, not RLS. Removed the stale NOTE/TODO block. Logger now includes `persisted: !!carrierTruckId`.

### Task 3: Live Map Carrier Trucks

`GET /api/v1/carrier/live-map/vehicles` now runs two parallel data paths:

1. **Legacy trucks** — unchanged query against `"Truck"` table + `GPSLocation.truckId`
2. **Carrier trucks** — new query against `carrier_trucks` + `LEFT JOIN LATERAL` on `GPSLocation.carrierTruckId`

Carrier truck drivers are resolved from the `dispatches` table (active dispatches joining `carrier_drivers` → `User`). Both sets are mapped to `VehicleLocation` and merged into `allVehicles`. The early-return for empty `truckRows` now also checks `carrierTruckRows` length.

## Deviations from Plan

None — plan executed exactly as written. The `dispatches` table name was confirmed from `@@map("dispatches")` in the Prisma schema before writing the driver lookup query.

## Self-Check: PASSED

- FOUND: migration.sql
- FOUND: gps-ping/route.ts
- FOUND: vehicles/route.ts
- FOUND: commit 7ece467 (schema + migration)
- FOUND: commit 95163ba (gps-ping persistence)
- FOUND: commit fb4359e (live map carrier trucks)
