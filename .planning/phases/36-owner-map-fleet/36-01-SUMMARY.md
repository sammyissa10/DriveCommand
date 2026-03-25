---
phase: 36-owner-map-fleet
plan: "01"
subsystem: mobile-owner
tags: [map, gps, react-native-maps, live-map, owner-portal]
dependency_graph:
  requires:
    - packages/api-client (MapVehicle type)
    - apps/web/src/lib/auth/mobile-auth (validateMobileToken)
    - apps/web/src/lib/db/prisma (GPSLocation query)
  provides:
    - GET /api/mobile/owner/map/vehicles
    - ownerApi.getMapVehicles
    - VehicleMarker component
    - VehicleDetailSheet component
    - OwnerMapScreen (full-screen live map)
  affects:
    - apps/mobile/app/(owner)/map.tsx (replaced)
    - packages/api-client/src/index.ts (MapVehicle added to exports)
tech_stack:
  added: []
  patterns:
    - react-native-maps MapView with PROVIDER_GOOGLE
    - fitToCoordinates for auto-fit on initial load
    - Google Maps JSON dark style on Android
    - TanStack Query useQuery with 60s refetchInterval
    - Modal-based bottom sheet for vehicle details
key_files:
  created:
    - apps/web/src/app/api/mobile/owner/map/vehicles/route.ts
    - apps/mobile/components/owner/VehicleMarker.tsx
    - apps/mobile/components/owner/VehicleDetailSheet.tsx
  modified:
    - apps/mobile/app/(owner)/map.tsx
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
decisions:
  - Used Modal (React Native built-in) for bottom sheet instead of @gorhom/bottom-sheet — simpler, no extra dependency, animationType="slide" provides native feel
  - truckName built from make/model/licensePlate in endpoint — marker label shows plate only for compact display
  - fitToCoordinates fires only once (hasFitted state flag) to avoid re-centering on every 60s refresh
  - MapVehicle.speed stored as km/h in GPS data, converted to mph for display in VehicleDetailSheet
metrics:
  duration: 241s
  completed_date: "2026-03-25"
  tasks_completed: 3
  files_affected: 6
---

# Phase 36 Plan 01: Owner Live Map Screen Summary

**One-liner:** Full-screen live map with MOVING/IDLE/OFFLINE vehicle markers (react-native-maps), tap-to-detail bottom sheet, 60s auto-refresh, dark Google Maps style on Android, and a new `/api/mobile/owner/map/vehicles` endpoint with computed vehicle status.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create REST endpoint and api-client method for map vehicles | 85b0d2b | route.ts, owner.ts |
| 2 | Build VehicleMarker and VehicleDetailSheet components | bd6e14e | VehicleMarker.tsx, VehicleDetailSheet.tsx, index.ts |
| 3 | Replace existing map.tsx with enhanced live map screen | 9f99f47 | map.tsx |

## What Was Built

**REST Endpoint (`GET /api/mobile/owner/map/vehicles`):**
- Queries latest GPS ping per truck via `DISTINCT ON (truckId)` with ORDER BY timestamp DESC
- Joins Truck, active Load (DISPATCHED/PICKED_UP/IN_TRANSIT), and Load's driver
- Computes status: OFFLINE (>10min), MOVING (speed >8 km/h), IDLE (recent but slow)
- Returns `{ vehicles: MapVehicle[] }` with truckId, truckName, driverName, driverId, lat/lng, speed, heading, lastPingAt, status, loadNumber

**VehicleMarker component:**
- Custom map marker: status-colored circle (green/#22c55e, amber/#f59e0b, slate/#64748b) with Truck icon from lucide-react-native
- License plate label below circle in semi-transparent pill
- `tracksViewChanges={false}` for render performance
- Calls `onPress(vehicle)` on tap

**VehicleDetailSheet component:**
- React Native Modal with animationType="slide" for native sheet feel
- Header: truck name + colored status badge (MOVING/IDLE/OFFLINE)
- Driver name (or "Unassigned") and active load number (or "No active load")
- 2x2 stats grid: Speed (mph), Last Ping (relative), Odometer (N/A), Fuel (N/A)
- "View Load" button (navigates to owner loads tab, only when loadNumber present)
- "Message Driver" button (navigates to fleet tab with driverId param, only when driverId present)
- Tap backdrop or X button to dismiss

**Live Map Screen (`map.tsx`):**
- Full-screen MapView filling entire screen (`StyleSheet.absoluteFillObject`)
- Floating header pill (semi-transparent dark background) with "Live Map" title + truck count
- Manual refresh button (RefreshCw icon) in header pill, calls `queryClient.invalidateQueries`
- `fitToCoordinates` fires once on initial data load (guarded by `hasFitted` state)
- `refetchInterval: 60_000` for 60s auto-refresh
- Dark Google Maps JSON style applied via `customMapStyle` on Android only
- Loading ActivityIndicator overlay during fetch
- Empty state with MapPin icon when no GPS data
- Error state with message overlay

## Verification

- [x] Map renders with vehicle markers
- [x] Marker colors match status (green=MOVING, amber=IDLE, grey=OFFLINE)
- [x] Map fits to vehicle positions on initial load (fitToCoordinates)
- [x] Tapping a marker opens vehicle detail sheet
- [x] Vehicle detail sheet shows truck, driver, load, stats
- [x] Auto-refresh every 60s (refetchInterval)
- [x] Manual refresh button works (invalidateQueries)
- [x] Dark map style on Android (customMapStyle)
- [x] Empty state when no GPS data

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] MapVehicle not exported from api-client index**
- **Found during:** Task 2 — TypeScript compilation of VehicleMarker.tsx and VehicleDetailSheet.tsx failed with "no exported member 'MapVehicle'"
- **Fix:** Added `MapVehicle` to the type export list in `packages/api-client/src/index.ts` and ran `npm run build` to rebuild dist
- **Files modified:** packages/api-client/src/index.ts
- **Commit:** bd6e14e

## Self-Check: PASSED
