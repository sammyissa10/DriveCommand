---
phase: 12-live-gps-map
plan: 01
subsystem: ui
tags: [leaflet, react-leaflet, react-leaflet-cluster, maps, gps, real-time]

# Dependency graph
requires:
  - phase: 11-navigation-data-foundation
    provides: GPSLocation model with seed data, Truck model with fleet vehicles
provides:
  - Live GPS map page at /live-map with vehicle markers
  - Color-coded vehicle status (green=moving, yellow=idle, red=offline)
  - Automatic marker clustering for fleets with 20+ vehicles
  - Real-time polling (30-second intervals) for GPS updates
  - Server actions with RLS-scoped GPS data queries
  - Map utility functions for bounds calculation and status logic
affects: [12-02-route-history, vehicle-tracking, fleet-monitoring]

# Tech tracking
tech-stack:
  added: [leaflet@1.9.4, react-leaflet@5.0.0, react-leaflet-cluster@4.0.0, @types/leaflet@1.9.21]
  patterns:
    - "Dynamic import with ssr: false in client component wrapper for Leaflet (browser-only library)"
    - "Client component wrapper pattern to handle Next.js 15 SSR restrictions on dynamic imports"
    - "DISTINCT ON raw SQL for per-truck latest GPS position queries (efficient time-series pattern)"
    - "DivIcon with inline SVG for color-coded vehicle markers (no image assets needed)"
    - "router.refresh() polling for real-time updates on serverless platform"
    - "Turf.js bbox calculation for auto-fitting map bounds to vehicle positions"

key-files:
  created:
    - src/lib/maps/vehicle-status.ts
    - src/lib/maps/map-utils.ts
    - src/app/(owner)/live-map/actions.ts
    - src/app/(owner)/live-map/page.tsx
    - src/components/maps/live-map.tsx
    - src/components/maps/vehicle-marker.tsx
    - src/components/maps/live-map-wrapper.tsx
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Use client component wrapper (LiveMapWrapper) for dynamic import to comply with Next.js 15 restriction against ssr: false in server components"
  - "Use react-leaflet-cluster v4.x (latest) for React 19 compatibility instead of v3.x specified in plan"
  - "Use fetchCache: 'force-no-store' instead of dynamic: 'force-dynamic' to avoid naming conflict with next/dynamic import"
  - "Created separate wrapper component (live-map-wrapper.tsx) to encapsulate dynamic import logic and keep page component clean"

patterns-established:
  - "Browser-only library pattern: Create client component wrapper with dynamic import (ssr: false), import wrapper in server component page"
  - "GPS status calculation: offline (10+ min stale), idle (speed < 5 mph), moving (speed >= 5 mph)"
  - "Real-time map updates: 30-second polling with router.refresh() for serverless compatibility (no WebSockets)"
  - "Map initialization: Auto-fit bounds on mount using Turf.js bbox, then allow user pan/zoom"

# Metrics
duration: 4m 44s
completed: 2026-02-15
---

# Phase 12 Plan 01: Live GPS Map Summary

**Live GPS map with color-coded vehicle markers, automatic clustering, and 30-second polling using Leaflet + React-Leaflet**

## Performance

- **Duration:** 4m 44s
- **Started:** 2026-02-15T20:52:25Z
- **Completed:** 2026-02-15T20:57:09Z
- **Tasks:** 2
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- Live map page at /live-map showing all fleet vehicles with OpenStreetMap tiles
- Color-coded vehicle markers (green for moving 5+ mph, yellow for idle <5 mph, red for offline 10+ min)
- Automatic marker clustering with react-leaflet-cluster for efficient rendering of 20+ vehicles
- Auto-fit map bounds on initial load to show all vehicle positions
- Real-time GPS updates via 30-second polling with router.refresh()
- Server actions with RLS tenant isolation using DISTINCT ON raw SQL for efficient per-truck latest position queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Leaflet dependencies and create server actions + utility functions** - `a278c3a` (feat)
2. **Task 2: Create LiveMap client component, VehicleMarker, and map page with clustering** - `d6c8154` (feat)

## Files Created/Modified

### Created
- `src/lib/maps/vehicle-status.ts` - Status calculation logic (moving/idle/offline) with 10-min offline threshold
- `src/lib/maps/map-utils.ts` - VehicleLocation interface, calculateBounds using Turf.js, US default center
- `src/app/(owner)/live-map/actions.ts` - Server action for latest GPS positions with DISTINCT ON raw SQL and RLS isolation
- `src/app/(owner)/live-map/page.tsx` - Server component page with vehicle count and status legend
- `src/components/maps/live-map.tsx` - Client component with MapContainer, TileLayer, clustering, and polling
- `src/components/maps/vehicle-marker.tsx` - DivIcon marker with color-coded truck SVG and status popup
- `src/components/maps/live-map-wrapper.tsx` - Client wrapper for dynamic import with ssr: false

### Modified
- `package.json` - Added leaflet, react-leaflet, react-leaflet-cluster, @types/leaflet
- `package-lock.json` - Updated with new dependencies

## Decisions Made

**1. Use client component wrapper for dynamic import**
- **Rationale:** Next.js 15 prohibits `ssr: false` in server component dynamic imports. Created LiveMapWrapper client component to encapsulate the dynamic import, then imported the wrapper in the server component page. This pattern maintains SSR for the page layout while client-rendering only the map.

**2. Install react-leaflet-cluster v4.x instead of v3.x**
- **Rationale:** Plan specified `react-leaflet-cluster@^3.0.0`, but v3.1.1 requires react-leaflet v4.x (peer dependency conflict). The latest v4.0.0 correctly requires react-leaflet v5.x and works with React 19. Used `npm install react-leaflet-cluster@latest` to resolve conflict.

**3. Rename route config export to avoid naming conflict**
- **Rationale:** `export const dynamic = 'force-dynamic'` conflicts with `import dynamic from 'next/dynamic'` (name shadowing). Changed to `export const fetchCache = 'force-no-store'` which achieves the same result (disables static optimization) without naming conflict.

**4. Created separate wrapper component for dynamic import**
- **Rationale:** Keeps the page component clean and focused on data fetching and layout. The wrapper component encapsulates the Leaflet-specific dynamic import logic, making the pattern reusable for future browser-only libraries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved react-leaflet-cluster peer dependency conflict**
- **Found during:** Task 1 (Installing dependencies)
- **Issue:** Plan specified `react-leaflet-cluster@^3.0.0` which requires react-leaflet v4.x, but plan also specified react-leaflet v5.x. npm install failed with peer dependency conflict.
- **Fix:** Checked npm registry for react-leaflet-cluster latest version. Found v4.0.0 correctly supports react-leaflet v5.x. Changed install command to `react-leaflet-cluster@latest`.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm ls react-leaflet-cluster` shows v4.0.0 with react-leaflet v5.0.0 as peer
- **Committed in:** a278c3a (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed Next.js 15 SSR restriction on dynamic imports**
- **Found during:** Task 2 (Building the application)
- **Issue:** Build failed with error "ssr: false is not allowed with next/dynamic in Server Components". Next.js 15 prohibits ssr: false in server component dynamic imports.
- **Fix:** Created client component wrapper (live-map-wrapper.tsx) with 'use client' directive to handle the dynamic import with ssr: false. Imported the wrapper in the server component page instead of using dynamic import directly.
- **Files modified:** Created src/components/maps/live-map-wrapper.tsx, updated src/app/(owner)/live-map/page.tsx
- **Verification:** `npm run build` succeeds, /live-map route appears in build output
- **Committed in:** d6c8154 (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed naming conflict between route config and dynamic import**
- **Found during:** Task 2 (Building the application)
- **Issue:** Build failed with error "the name 'dynamic' is defined multiple times". Using `export const dynamic = 'force-dynamic'` in same file as `import dynamic from 'next/dynamic'` causes name shadowing.
- **Fix:** Renamed route config export to `export const fetchCache = 'force-no-store'` which achieves the same result (disables static optimization for real-time data) without naming conflict.
- **Files modified:** src/app/(owner)/live-map/page.tsx
- **Verification:** `npm run build` succeeds with no naming errors
- **Committed in:** d6c8154 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking issues)
**Impact on plan:** All deviations were necessary fixes for build errors and dependency conflicts. No scope creep - core functionality matches plan exactly. The client wrapper pattern (deviation 2) is actually a better architectural approach than the research example, as it keeps dynamic import logic encapsulated.

## Issues Encountered

None beyond the auto-fixed blocking issues above. All planned functionality implemented successfully.

## User Setup Required

None - no external service configuration required. The map uses free OpenStreetMap tiles (no API key needed).

## Next Phase Readiness

**Ready for Phase 12 Plan 02:**
- Live map foundation complete with working vehicle markers and clustering
- VehicleLocation interface established for GPS data
- Map state management (selectedVehicleId) already in place for future detail sidebar
- Server actions pattern established for GPS queries with RLS isolation

**Foundation established:**
- Browser-only library pattern documented (client wrapper with ssr: false)
- Real-time polling mechanism working (30-second refresh)
- Map utilities ready for route history trails (calculateBounds, Turf.js integration)
- Color-coded status logic ready for extension (safety events, fuel levels)

---
*Phase: 12-live-gps-map*
*Completed: 2026-02-15*

## Self-Check: PASSED

All claimed files and commits verified:

**Files:**
- ✓ src/lib/maps/vehicle-status.ts
- ✓ src/lib/maps/map-utils.ts
- ✓ src/app/(owner)/live-map/actions.ts
- ✓ src/app/(owner)/live-map/page.tsx
- ✓ src/components/maps/live-map.tsx
- ✓ src/components/maps/vehicle-marker.tsx
- ✓ src/components/maps/live-map-wrapper.tsx

**Commits:**
- ✓ a278c3a - Task 1: Leaflet dependencies and server actions
- ✓ d6c8154 - Task 2: LiveMap components and page
