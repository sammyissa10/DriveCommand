---
phase: 12-live-gps-map
plan: 02
subsystem: ui
tags: [vehicle-diagnostics, route-history, polyline, sheet, real-time-data]

# Dependency graph
requires:
  - phase: 12-live-gps-map
    plan: 01
    provides: Live map foundation with vehicle markers and selectedVehicleId state
  - phase: 11-navigation-data-foundation
    provides: GPSLocation and FuelRecord models with seed data
provides:
  - Vehicle detail sidebar with diagnostics (fuel level, speed, engine state, odometer, DEF, last GPS update)
  - Route history trail as color-coded polyline showing past 24 hours of vehicle movement
  - Auto-refreshing diagnostics (30-second polling while sheet is open)
  - Speed-based color coding for route trails (blue=slow, yellow=moderate, orange=fast, red=very fast)
affects: [fleet-monitoring, vehicle-tracking, diagnostics-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Polyline segment grouping for smooth color transitions (overlap points between segments)"
    - "30-second polling interval for live diagnostics updates in sheet component"
    - "Fuel level estimation heuristic (6 MPG, 150 gallon tank) for truck diagnostics"
    - "Engine state derivation from GPS speed (running >5 mph, idle >0 mph, off otherwise)"
    - "Conditional rendering of map layers based on selectedVehicleId state"
    - "Sheet component with auto-refresh lifecycle (mount/unmount interval management)"

key-files:
  created:
    - src/components/maps/route-history-layer.tsx
    - src/components/vehicle/vehicle-details-sheet.tsx
  modified:
    - src/app/(owner)/live-map/actions.ts
    - src/components/maps/live-map.tsx

key-decisions:
  - "Use explicit 'any' type annotation for Prisma query result mapping to avoid implicit any TypeScript errors"
  - "Overlap route segment points for continuity — last point of segment N becomes first point of segment N+1"
  - "Show DEF level as 'N/A - Sensor not connected' (honest placeholder for unavailable data)"
  - "Estimate fuel level using milesSinceLastFill / 6 MPG heuristic with 150 gallon tank assumption"
  - "Derive engine state from GPS speed instead of actual engine telemetry (which doesn't exist in schema)"

patterns-established:
  - "Polyline color segmentation: Group consecutive points by color, add overlapping points for smooth transitions"
  - "Diagnostics data fetching: Parallel Promise.all for truck/GPS/fuel queries, derive computed fields (engine state, fuel %)"
  - "Sheet lifecycle: Auto-refresh polling starts on open, clears on close with proper cleanup"
  - "Route history rendering: Conditional layer rendering based on parent component state (selectedVehicleId)"

# Metrics
duration: 3m 52s
completed: 2026-02-15
---

# Phase 12 Plan 02: Vehicle Details & Route History Summary

**Interactive vehicle diagnostics sheet and 24-hour route history trail with speed-based color coding**

## Performance

- **Duration:** 3m 52s
- **Started:** 2026-02-15T21:00:31Z
- **Completed:** 2026-02-15T21:04:23Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Server actions for vehicle route history (24h GPS trail with Decimal conversion) and diagnostics (truck info, GPS, fuel, engine state, fuel level estimation)
- RouteHistoryLayer component with Polyline segments color-coded by speed (blue for slow, yellow for moderate, orange for fast, red for very fast)
- VehicleDetailsSheet sidebar with comprehensive diagnostics: fuel level progress bar, speed, engine state indicator, odometer, DEF level placeholder, last GPS update
- Auto-refreshing diagnostics (30-second polling interval while sheet is open)
- Smooth route trail rendering with overlapping segment points for continuity
- Full integration into LiveMap — clicking vehicle marker opens sheet and renders trail, closing sheet clears both

## Task Commits

Each task was committed atomically:

1. **Task 1: Add server actions for vehicle diagnostics and route history** - `89bd66b` (feat)
2. **Task 2: Create route history layer, vehicle details sheet, and wire into LiveMap** - `0c414af` (feat)

## Files Created/Modified

### Created
- `src/components/maps/route-history-layer.tsx` - Polyline layer showing past 24h GPS trail with speed-based color coding (blue/yellow/orange/red), segments grouped with overlapping points
- `src/components/vehicle/vehicle-details-sheet.tsx` - Slide-out sheet with vehicle diagnostics (speed, fuel level progress bar, engine state indicator, odometer, DEF placeholder, last GPS update), auto-refreshes every 30s

### Modified
- `src/app/(owner)/live-map/actions.ts` - Added getVehicleRouteHistory (returns GPS trail points for last 24h) and getVehicleDiagnostics (returns truck info, latest GPS, fuel estimation, engine state)
- `src/components/maps/live-map.tsx` - Wired in RouteHistoryLayer and VehicleDetailsSheet via selectedVehicleId state

## Decisions Made

**1. Use explicit 'any' type annotation for Prisma query result mapping**
- **Rationale:** TypeScript build failed with "Parameter 'loc' implicitly has an 'any' type" error when mapping Prisma query results. Added explicit `(loc: any) =>` type annotation to satisfy TypeScript strict mode without complex type gymnastics. This is consistent with existing pattern in getLatestVehicleLocations function.

**2. Overlap route segment points for continuity**
- **Rationale:** When color changes between segments, the last point of segment N becomes the first point of segment N+1. This ensures smooth visual transitions without gaps in the polyline trail. Matches industry-standard GPS trail rendering.

**3. Show DEF level as 'N/A - Sensor not connected'**
- **Rationale:** Plan requires showing DEF level in diagnostics, but schema has no DEF data. Honest placeholder acknowledges the requirement while being truthful about data availability. Better than fake data or omitting the section entirely.

**4. Estimate fuel level using 6 MPG heuristic with 150 gallon tank**
- **Rationale:** No real-time fuel level sensors in schema. Calculate estimate from last fuel fill quantity, odometer delta, and assumed consumption rate. Simplified heuristic matches plan requirements. Real implementation would use actual fuel sensors.

**5. Derive engine state from GPS speed**
- **Rationale:** Schema has no engine telemetry (ignition state, RPM, etc.). Derive state from GPS speed: >5 mph = running, >0 mph = idle, otherwise off. Reasonable proxy for engine state in absence of direct telemetry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript implicit any error in route history mapping**
- **Found during:** Task 1 (Building application after adding server actions)
- **Issue:** TypeScript compilation failed with error "Parameter 'loc' implicitly has an 'any' type" when mapping Prisma query results in getVehicleRouteHistory. Implicit any types are not allowed in strict mode.
- **Fix:** Added explicit type annotation `(loc: any) =>` to the map function. This matches the existing pattern in getLatestVehicleLocations which uses `(results as any[]).map((row) =>...)`.
- **Files modified:** src/app/(owner)/live-map/actions.ts
- **Verification:** `npm run build` succeeds with no TypeScript errors
- **Committed in:** 89bd66b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minimal - single TypeScript fix to satisfy strict mode. No scope creep. All planned functionality implemented exactly as specified.

## Issues Encountered

None beyond the auto-fixed TypeScript error above. All planned functionality implemented successfully.

## User Setup Required

None - feature works with existing seed data. GPS trails and diagnostics will display for all trucks with GPSLocation and FuelRecord data.

## Next Phase Readiness

**Ready for Phase 12 Plan 03 (if exists) or Phase 13:**
- Interactive map features complete: markers, clustering, details sheet, route history
- Real-time polling established (30-second intervals for both map markers and diagnostics)
- Color-coded visualizations working (vehicle status markers, speed-based route trails)
- Server actions pattern established for time-series GPS queries and diagnostics aggregation

**Foundation established:**
- Polyline rendering pattern for GPS trails (can be reused for route planning, geofencing)
- Diagnostics data aggregation pattern (parallel queries + computed fields)
- Auto-refresh lifecycle management (polling intervals with proper cleanup)
- Sheet component pattern for contextual details (can be reused for safety events, maintenance alerts)

---
*Phase: 12-live-gps-map*
*Completed: 2026-02-15*

## Self-Check: PASSED

All claimed files and commits verified:

**Files:**
- ✓ src/components/maps/route-history-layer.tsx
- ✓ src/components/vehicle/vehicle-details-sheet.tsx

**Commits:**
- ✓ 89bd66b - Task 1: Add vehicle diagnostics and route history server actions
- ✓ 0c414af - Task 2: Create route history layer, vehicle details sheet, and wire into LiveMap
