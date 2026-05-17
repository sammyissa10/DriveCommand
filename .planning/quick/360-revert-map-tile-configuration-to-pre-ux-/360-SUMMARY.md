---
phase: quick-360
plan: 01
subsystem: ui
tags: [leaflet, openstreetmap, maps, tiles, bug-fix]

# Dependency graph
requires:
  - phase: quick-354
    provides: "Map UX refactor that introduced MapStyleConfig.ts"
provides:
  - "Working OpenStreetMap tile layer without authentication errors"
  - "Removed Stadia tile server dependency"
affects: [tracking, fleet-map, live-map]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - apps/web/src/components/maps/live-map.tsx

key-decisions:
  - "Reverted to simple OpenStreetMap tiles to eliminate Stadia 401 production errors"
  - "Removed MapStyleConfig.ts fallback chain complexity"

patterns-established: []

# Metrics
duration: 2min
completed: 2026-05-17
---

# Quick Task 360: Revert Map Tile Configuration

**Restored OpenStreetMap tiles directly to eliminate Stadia 401 authentication errors in production**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-17T08:36:38Z
- **Completed:** 2026-05-17T08:38:31Z
- **Tasks:** 2
- **Files modified:** 2 (1 edited, 1 deleted)

## Accomplishments
- Reverted TileLayer in live-map.tsx to pre-refactor OpenStreetMap configuration
- Deleted MapStyleConfig.ts fallback chain introduced by quick-354
- Eliminated Stadia tile server 401 authentication errors in production
- Restored simple, working tile configuration

## Task Commits

Each task was committed atomically:

1. **Task 1: Revert TileLayer in live-map.tsx to pre-refactor OSM config** - `61ab845b` (fix)
2. **Task 2: Delete MapStyleConfig.ts** - `07e3cc17` (chore)

## Files Created/Modified
- `apps/web/src/components/maps/live-map.tsx` - Removed MapStyleConfig imports, restored direct OSM tile URL, removed CSS filter logic
- `apps/web/src/components/tracking/MapStyleConfig.ts` - DELETED (created by quick-354 refactor)

## Decisions Made
- **Reverted to simple OpenStreetMap tiles:** The MapStyleConfig.ts fallback chain (MapTiler → Stadia → OSM) introduced complexity. Stadia requires authentication in production (causing 401 errors), and MapTiler key was not set. Direct OSM tiles work reliably without authentication.
- **Removed CSS filter complexity:** Pre-refactor version had no desaturation CSS filters. Restored simple tile rendering.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward revert of quick-354 map tile configuration changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Live tracking map now loads OpenStreetMap tiles successfully in production without authentication errors. All other UX updates from quick-354 (KpiStrip, FilterChips, ViewToggle, TruckRow) remain intact.

---
*Phase: quick-360*
*Completed: 2026-05-17*

## Self-Check: PASSED

**Files verified:**
```
FOUND: apps/web/src/components/maps/live-map.tsx
DELETED (as expected): apps/web/src/components/tracking/MapStyleConfig.ts
```

**Commits verified:**
```
FOUND: 61ab845b (fix(quick-360): revert TileLayer to pre-refactor OSM config)
FOUND: 07e3cc17 (chore(quick-360): delete MapStyleConfig.ts)
```

**Technical verification:**
- TypeScript compilation: PASSED
- No MapStyleConfig references: PASSED
- No Stadia tile server references: PASSED
- OpenStreetMap URL present in live-map.tsx: PASSED
