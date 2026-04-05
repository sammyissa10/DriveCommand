---
phase: quick-157
plan: "01"
subsystem: database
tags: [prisma, migration, carrier-ops, schema]
dependency_graph:
  requires: [quick-156]
  provides: [carrier-prisma-models, carrier-catalog-meta-table]
  affects: [apps/web/prisma/schema.prisma, apps/web/src/generated/prisma]
tech_stack:
  added: []
  patterns: [prisma-@@map, named-relations, carrier-ops-schema]
key_files:
  created:
    - apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
decisions:
  - "Named @relation directives used for all multi-FK cases (PrimaryDriver/CoDriver, PrimaryTruck/TrailerTruck, CarrierDocUploader/CarrierDocVerifier, CarrierExpenseApprover, DriverPayApprover, CarrierDispatcher)"
  - "relay_handoff_stop_id on CarrierDispatch is a plain UUID field with no @relation — matches SQL intent (avoids circular FK dispatches→stops→dispatches)"
  - "CarrierDriver.userId unique constraint preserved from SQL (UNIQUE (user_id))"
  - "scheduledDepartureTime stored as String? in RouteTemplate (TIME column — Prisma has no native TIME type)"
  - "Tenant model uses orgId field name to mirror SQL org_id column in all carrier models"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-04"
  tasks: 3
  files: 2
---

# Phase quick-157 Plan 01: Carrier Ops Migration 014 + Prisma Schema Summary

Migration 014 creates the `carrier_catalog_meta` lookup table with 93 seed rows across 19 enum groups, and 14 new Prisma models are appended to `schema.prisma` covering all carrier operations tables from migrations 001–014.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create migration 014 SQL — carrier_catalog_meta + enum seed | db9b408 | apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql |
| 2 | Append 14 Prisma models to schema.prisma | 7aaf6ee | apps/web/prisma/schema.prisma |
| 3 | Validate TypeScript compilation | (no commit needed — tsc: 0 errors) | — |

## Verification Results

### Migration 014
- Applied successfully: `Migrations complete (1 applied)`
- `SELECT count(*) FROM carrier_catalog_meta` → **93 rows** across 19 enum groups
- Unique index `carrier_catalog_meta_group_value` created on `(enum_group, enum_value)`

### prisma generate
```
✔ Generated Prisma Client (v7.6.0) to ./src/generated/prisma in 1.06s
```
**Result: SUCCESS** — no errors

### tsc --noEmit
```
EXIT: 0
```
**Result: SUCCESS** — 0 errors, 0 new errors introduced

## New Prisma Models

| Prisma Model | SQL Table | Notes |
|---|---|---|
| CarrierClient | clients | Tenant-scoped via orgId |
| CarrierContract | contracts | FK to CarrierClient |
| CarrierFacility | facilities | lat/lng as Float (DOUBLE PRECISION) |
| CarrierDriver | carrier_drivers | Optional User FK (unique), optional homeTerminal FK |
| CarrierTruck | carrier_trucks | Separate from existing Truck model |
| RouteTemplate | route_templates | scheduledDepartureTime as String? (Prisma has no TIME type) |
| RouteTemplateStop | route_template_stops | No org_id — scoped via routeTemplate |
| CarrierDispatch | dispatches | Named relations: PrimaryDriver/CoDriver, PrimaryTruck/TrailerTruck |
| CarrierLoad | loads | Separate from existing Load model |
| CarrierStop | stops | No org_id — scoped via dispatch/load |
| CarrierDocument | carrier_documents | No org_id — polymorphic parent; named upload/verify relations |
| CarrierExpense | carrier_expenses | org_id direct + parent links |
| DriverPayRecord | driver_pay_records | org_id direct |
| CarrierCatalogMeta | carrier_catalog_meta | Standalone — no relations |

## Named Relations Added

| Relation Name | Model | Field | Points To |
|---|---|---|---|
| PrimaryDriver | CarrierDispatch | primaryDriverId | CarrierDriver |
| CoDriver | CarrierDispatch | coDriverId | CarrierDriver |
| PrimaryTruck | CarrierDispatch | truckId | CarrierTruck |
| TrailerTruck | CarrierDispatch | trailerId | CarrierTruck |
| CarrierDispatcher | CarrierDispatch | dispatcherId | User |
| CarrierDriverUser | CarrierDriver | userId | User |
| DefaultDriver | RouteTemplate | defaultDriverId | CarrierDriver |
| DefaultTruck | RouteTemplate | defaultTruckId | CarrierTruck |
| CarrierDocUploader | CarrierDocument | uploadedBy | User |
| CarrierDocVerifier | CarrierDocument | verifiedBy | User |
| CarrierExpenseApprover | CarrierExpense | approvedBy | User |
| DriverPayApprover | DriverPayRecord | approvedBy | User |

## Reverse Relations Added

**Tenant model:** `carrierClients`, `carrierContracts`, `carrierFacilities`, `carrierDrivers`, `carrierTrucks`, `routeTemplates`, `carrierDispatches`, `carrierLoads`, `carrierExpenses`, `driverPayRecords`

**User model:** `carrierDriverProfile`, `dispatchedRuns`, `uploadedCarrierDocs`, `verifiedCarrierDocs`, `approvedExpenses`, `approvedPayRecords`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql` — exists
- [x] `apps/web/prisma/schema.prisma` — modified, 14 models appended
- [x] Commit db9b408 — exists (migration 014)
- [x] Commit 7aaf6ee — exists (Prisma schema)
- [x] carrier_catalog_meta has 93 rows (verified via DB query)
- [x] prisma generate: success
- [x] tsc --noEmit: exit 0
