---
phase: quick-178
plan: 01
subsystem: carrier-ops
tags: [carrier, fleet, drivers, trucks, crud, api-routes, compliance]
dependency_graph:
  requires:
    - carrier facilities lib (listFacilities used in driver detail page)
    - CarrierDriver / CarrierTruck Prisma models (migrations already applied)
  provides:
    - fleet-drivers.ts CRUD module
    - fleet-trucks.ts CRUD module
    - /carrier/fleet/drivers pages
    - /carrier/fleet/trucks pages
    - REST API for carrier drivers and trucks
  affects:
    - apps/web/src/lib/carrier/
    - apps/web/src/app/(owner)/carrier/fleet/
    - apps/web/src/app/api/v1/carrier/fleet/
tech_stack:
  added: []
  patterns:
    - Server component pages with getSession + redirect auth
    - Client list components with inline search/filter
    - Client form components with fetch POST/PATCH
    - Expiry color coding utility (green >90d, amber 30-90d, red <30d)
key_files:
  created:
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/lib/carrier/fleet-trucks.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
    - apps/web/src/components/carrier/fleet/CarrierDriverList.tsx
    - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
    - apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
    - apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
    - apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx
    - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx
    - apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx
  modified: []
decisions:
  - Expiry color helper defined inline in each component (driver list, truck list) rather than a shared util file — avoids creating an extra module for a 4-line function
  - Dispatch history on driver detail combines primaryDispatches + coDispatches with a role label column; sorted by scheduledDeparture descending
  - payRate stored as Decimal in DB; converted via Number() at display time to avoid Decimal serialization issues
  - createCarrierDriver checks userId uniqueness before insert rather than relying on DB unique constraint error parsing — produces a clean 400 with message "User already linked to a carrier driver"
metrics:
  duration: ~25 minutes
  completed: "2026-04-05T16:06:02Z"
  tasks_completed: 3
  files_created: 14
---

# Phase quick-178: Carrier Fleet Management Pages Summary

**One-liner:** Carrier driver and truck CRUD pages with CDL/registration expiry color coding (green/amber/red), duplicate-user-link protection, and dispatch history tables.

## What Was Built

### Task 1: Lib modules + API routes (6 files)

**fleet-drivers.ts** exports:
- `listCarrierDrivers(orgId, filters)` — filtered list with user email + homeTerminal includes
- `getCarrierDriver(orgId, id)` — detail with primaryDispatches, coDispatches, homeTerminal
- `createCarrierDriver(orgId, data)` — duplicate userId check throws "User already linked to a carrier driver"
- `updateCarrierDriver(orgId, id, data)` — partial update, returns null if not found

**fleet-trucks.ts** exports:
- `listCarrierTrucks(orgId, filters)` — filtered by status/truckType/search
- `getCarrierTruck(orgId, id)` — detail with primaryDispatches including primaryDriver name
- `createCarrierTruck(orgId, data)` — all truck fields with date coercion
- `updateCarrierTruck(orgId, id, data)` — partial update, returns null if not found

**API routes** (all using getSession auth pattern from facilities):
- `GET/POST /api/v1/carrier/fleet/drivers` — list with ?status/?search, create with 400 on duplicate user
- `GET/PATCH /api/v1/carrier/fleet/drivers/[id]`
- `GET/POST /api/v1/carrier/fleet/trucks` — list with ?status/?truck_type/?search
- `GET/PATCH /api/v1/carrier/fleet/trucks/[id]`

### Task 2: Components (4 files)

**CarrierDriverList** — Table with: driver name (link), CDL class badge, CDL expiry (color-coded + days remaining), pay model badge, status badge. AlertTriangle icon on rows where CDL < 30 days. Search + status filter dropdown.

**CarrierDriverForm** — CDL section (number/state/class/expiry), pay config section (model + dynamic label + rate + period), home terminal select, linked user ID field, status select (edit mode only).

**CarrierTruckList** — Table with: unit # (link + alert icon), VIN, year/make/model combined, truck type badge, odometer, registration expiry (color-coded), license expiry (color-coded), status badge. Search + status + truckType filters.

**CarrierTruckForm** — Basic info (unit/VIN/year/make/model/type), weight & capacity section (GVWR/payload/odometer), registration & compliance section (plate/state/3 expiry dates/status).

### Task 3: Pages (4 files)

**`/carrier/fleet/drivers`** — Server component, stat row with status counts (active/inactive/suspended), CarrierDriverList.

**`/carrier/fleet/drivers/[id]`** — Compliance card (CDL number/class/state/expiry with days callout), pay configuration card (model/rate/period/terminal), inline CarrierDriverForm edit, dispatch history table (primary + co-driver combined, sorted by date, with role column).

**`/carrier/fleet/trucks`** — Server component, stat row with truck type counts, CarrierTruckList.

**`/carrier/fleet/trucks/[id]`** — Detail card (VIN/type/GVWR/payload/odometer/plate), compliance dates section (registration/license/insurance expiry), inline CarrierTruckForm edit, dispatch history table (with driver name column).

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 1f3c9e0 | feat(quick-178): lib modules + API routes for carrier drivers and trucks |
| 8c2a1a0 | feat(quick-178): list and form components for carrier drivers and trucks |
| 246585a | feat(quick-178): page routes for carrier fleet drivers and trucks |

## Self-Check: PASSED

All 14 files confirmed present. All 3 commits confirmed in git log. TypeScript `--noEmit` passes with 0 errors.
