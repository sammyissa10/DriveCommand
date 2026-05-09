---
phase: quick-218
plan: 01
subsystem: live-map
tags: [maps, gps, fleet, real-time, leaflet]
dependency_graph:
  requires:
    - GPSLocation model (Prisma)
    - Truck, Route, Load, User models
    - getSession auth helper
    - tenantRawQuery for raw SQL
    - getTenantPrisma for Prisma queries
    - vehicle-status.ts
    - map-utils.ts
  provides:
    - /api/v1/carrier/live-map/vehicles
    - /api/v1/carrier/live-map/history
    - /api/v1/carrier/live-map/trips
    - VehicleSidebar component
    - VehicleFilterBar component
    - HistoryTab component
    - TripsTab component
    - LiveMapTabs component
  affects:
    - live-map page (full rewrite)
    - live-map-wrapper.tsx (full rewrite)
    - live-map.tsx (new props)
    - vehicle-marker.tsx (null safety)
    - map-utils.ts (extended VehicleLocation)
    - vehicle-status.ts (4th status)
    - getLatestVehicleLocations (enriched return type)
    - /api/gps/locations (tagId param removed)
tech_stack:
  added: []
  patterns:
    - LEFT JOIN LATERAL for latest-GPS-per-truck in O(n) instead of DISTINCT ON
    - Two-query driver lookup: active routes first, then active loads fallback
    - Client-side filtering with useEffect + Set state (no re-fetches)
    - Tab-aware polling: 30s interval only when Live tab is active
    - flyToTarget prop pattern for map imperative control from sidebar
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
    - apps/web/src/app/api/v1/carrier/live-map/history/route.ts
    - apps/web/src/app/api/v1/carrier/live-map/trips/route.ts
    - apps/web/src/components/maps/vehicle-sidebar.tsx
    - apps/web/src/components/maps/vehicle-filter-bar.tsx
    - apps/web/src/components/maps/history-tab.tsx
    - apps/web/src/components/maps/trips-tab.tsx
    - apps/web/src/components/maps/live-map-tabs.tsx
  modified:
    - apps/web/src/lib/maps/vehicle-status.ts
    - apps/web/src/lib/maps/map-utils.ts
    - apps/web/src/components/maps/live-map-wrapper.tsx
    - apps/web/src/components/maps/live-map.tsx
    - apps/web/src/components/maps/vehicle-marker.tsx
    - apps/web/src/app/(owner)/live-map/actions.ts
    - apps/web/src/app/(owner)/live-map/page.tsx
    - apps/web/src/app/api/gps/locations/route.ts
decisions:
  - LEFT JOIN LATERAL used for trucks without GPS (DISTINCT ON would exclude them)
  - Two-query driver lookup (routes → loads) avoids complex COALESCE join
  - Client-side filtering avoids server round-trips on every filter change
  - No-location trucks appear in sidebar but not as map markers
  - /api/gps/locations tagId param removed since tag filter moved to client-side filter bar
metrics:
  duration_minutes: 11
  completed_date: "2026-04-14"
  tasks_completed: 2
  files_created: 11
  files_modified: 8
---

# Phase quick-218 Plan 01: Live Fleet Map Upgrade Summary

**One-liner:** Two-panel fleet map with enriched sidebar, client-side filters, GPS history trail, completed trips table, and tab-aware polling — all connected to real Truck/GPSLocation/Route/Load data.

## What Was Built

### Backend (Task 1)

**3 new tenant-isolated API routes:**

- `/api/v1/carrier/live-map/vehicles` — Uses `LEFT JOIN LATERAL` to fetch all trucks (even those with no GPS pings) with their most recent GPS location. Follows with two driver-lookup queries (active routes, then active loads). Returns `VehicleLocation[]` with computed status.
- `/api/v1/carrier/live-map/history?truckId=X&date=YYYY-MM-DD` — Validates UUID + date format, verifies truck belongs to tenant, returns ordered GPS points for the day.
- `/api/v1/carrier/live-map/trips?page=1&pageSize=25` — Paginated completed routes with driver and truck info.

**Updated utilities:**
- `vehicle-status.ts`: Added `'no-location'` as 4th status, updated `getVehicleStatus` to accept `null` timestamp, exported `STATUS_LABELS`.
- `map-utils.ts`: Extended `VehicleLocation` with `driver`, `status`, nullable `lat/lng/timestamp`, and `truck.year/vin`. Updated `calculateBounds` to skip null-coordinate vehicles.
- `actions.ts`: `getLatestVehicleLocations` now returns enriched type (driver + status). Removed `tagId` param (tags filter replaced by client-side filter bar).

### Frontend (Task 2)

**5 new components:**
- `VehicleSidebar`: Truck list with status dots, driver name, last-seen time, click-to-fly. Two sort modes (Status / Unit #). Selected row highlighted.
- `VehicleFilterBar`: Client-side multi-select filters for Vehicles, Drivers, Status, and Dispatched-Only toggle. Active filter count badge + Clear All.
- `LiveMapTabs`: Three-tab navigation bar (Live / History / Trips).
- `HistoryTab`: Truck selector + date picker, fetches `/history` endpoint, renders speed-colored polyline via segment callbacks, timeline strip showing start/end times.
- `TripsTab`: Fetches `/trips`, paginated list of completed routes, clicking a row switches to History tab with pre-filled truck+date.

**Updated components:**
- `LiveMapWrapper`: Fully rewritten. Two-panel layout (320px sidebar + map). Tab-aware polling (30s, Live tab only). `flyToTarget` state to imperatively move map. `vehiclesForMap` excludes no-location vehicles. Handles Trips→History navigation.
- `LiveMap`: Accepts `flyToTarget`, `historySegments`, `historyPoints` props. Shows polyline+endpoint markers in History mode. Shows vehicle markers in Live mode.
- `vehicle-marker.tsx`: Null guard for lat/lng, handles server-computed status, shows driver name in popup.
- `page.tsx`: Simplified to pure SSR fetch + render.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `tenantRawQuery` generic type loss**
- **Found during:** Task 1 TypeScript check
- **Issue:** `tenantRawQuery` receives `tx: any`, so `$queryRaw<TruckRow[]>` generic is lost and return type is `unknown`. TypeScript errors on all row accesses.
- **Fix:** Removed generic from `$queryRaw` calls and cast result with `as TruckRow[]` after the await.
- **Files modified:** `vehicles/route.ts`, `actions.ts`
- **Commit:** df2db9e

**2. [Rule 1 - Bug] Duplicate `divIcon` import in live-map.tsx**
- **Found during:** Task 2 code review
- **Issue:** `divIcon` imported twice (once as default, once as `leafletDivIcon` alias).
- **Fix:** Removed alias import, replaced `leafletDivIcon` references with `divIcon`.
- **Files modified:** `live-map.tsx`
- **Commit:** eb75df7

**3. [Rule 2 - Missing] Updated /api/gps/locations to match new signature**
- **Found during:** Task 1 — existing route called `getLatestVehicleLocations(tagId)` which no longer accepts `tagId`
- **Fix:** Updated the legacy endpoint to call `getLatestVehicleLocations()` without tagId. Tag-based filtering now handled client-side in the new filter bar.
- **Files modified:** `apps/web/src/app/api/gps/locations/route.ts`
- **Commit:** df2db9e

## Self-Check

**Files exist:**
- `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/live-map/history/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/live-map/trips/route.ts` — FOUND
- `apps/web/src/components/maps/vehicle-sidebar.tsx` — FOUND
- `apps/web/src/components/maps/vehicle-filter-bar.tsx` — FOUND
- `apps/web/src/components/maps/history-tab.tsx` — FOUND
- `apps/web/src/components/maps/trips-tab.tsx` — FOUND
- `apps/web/src/components/maps/live-map-tabs.tsx` — FOUND

**Commits exist:**
- `df2db9e` — Task 1: API routes + utilities
- `eb75df7` — Task 2: UI components + two-panel layout

**TypeScript:** `npx tsc --noEmit` passes with zero errors (excluding pre-existing e2e/ test type errors).

## Self-Check: PASSED
