---
phase: 19-multi-stop-routes
plan: 03
subsystem: geofencing, driver-portal
tags: [geofencing, driver-app, route-stops, server-actions, client-component]
dependency_graph:
  requires:
    - phase: 19-01
      provides: [RouteStop table, routeStopSchema, stop CRUD in server actions]
    - phase: 19-02
      provides: [Stop editor in route-form.tsx, stop timeline in route-detail.tsx]
  provides:
    - RouteStop auto-arrival via GPS geofence (500m, status=ARRIVED)
    - Lazy geocoding of stop addresses with lat/lng caching on RouteStop row
    - markStopDeparted server action with driver ownership validation
    - Active stop panel in driver portal (first non-DEPARTED stop, highlighted blue card)
    - Mark Departed button (ARRIVED->DEPARTED manual transition only)
    - Full stop list in driver portal with position badges and status color coding
  affects:
    - src/lib/geofencing/geofence-check.ts
    - src/app/(driver)/actions/driver-routes.ts
    - src/components/driver/route-detail-readonly.tsx
tech_stack:
  added: []
  patterns:
    - RLS-bypass prisma.$transaction with set_config('app.bypass_rls', 'on', TRUE) for RouteStop updates
    - take:1 + orderBy position asc to query only the next pending stop
    - Lazy geocode on first geofence ping, cache result on RouteStop.lat/lng
    - 'use client' on route-detail-readonly.tsx for useState in MarkDepartedButton
    - Dynamic import of markStopDeparted inside button handler (avoids server action in client bundle)
    - activeStop derivation: filter(!DEPARTED).sort(position)[0]
key_files:
  created: []
  modified:
    - src/lib/geofencing/geofence-check.ts
    - src/app/(driver)/actions/driver-routes.ts
    - src/components/driver/route-detail-readonly.tsx
decisions:
  - "DEPARTED is manual-only: geofence exit does NOT trigger departed status — driver must press button"
  - "markStopDeparted validates stop.route.driverId === user.id — no stopId injection risk"
  - "MarkDepartedButton uses dynamic import for markStopDeparted to avoid server action in 'use client' module boundary"
  - "stopTruckPoint variable name used (not truckPoint) to avoid conflict with Load check scope in same try block"
  - "No dispatcher alert for RouteStop arrival — stop-level tracking only, not load-level status change"
metrics:
  duration: 113s
  completed: 2026-02-27
  tasks_completed: 2
  files_affected: 3
---

# Phase 19 Plan 03: Driver App Active-Stop View Summary

GPS ping auto-marks next pending RouteStop as ARRIVED within 500m using lazy geocoding; driver portal shows active stop as highlighted card with manual Mark Departed button; full stop list with PENDING/ARRIVED/DEPARTED color-coded badges.

## Performance

- **Duration:** 113s
- **Started:** 2026-02-27T06:04:07Z
- **Completed:** 2026-02-27T06:05:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- GPS pings now trigger RouteStop arrival detection: geofence-check.ts finds the next PENDING stop (lowest position, geofenceHit=false) and auto-marks ARRIVED + arrivedAt + geofenceHit=true when truck is within 500m
- Stop addresses are lazy-geocoded via Nominatim on first geofence check then cached on RouteStop.lat/lng for subsequent pings
- Driver portal (my-route page) shows the active stop as a highlighted blue card above Route Details, with address, stop type, scheduled time, and PENDING/ARRIVED status badge
- "Mark Departed" button appears only when stop status is ARRIVED — driver taps to confirm departure (manual-only per locked decision)
- markStopDeparted server action validates stop belongs to driver's route (driverId check), enforces ARRIVED->DEPARTED-only transition, and revalidates /my-route
- Full stop list below route details shows all stops with numbered position badges (green=DEPARTED, blue=ARRIVED, gray=PENDING)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend geofence-check.ts for RouteStop arrival detection** - `5b0a541` (feat)
2. **Task 2: Driver portal active stop panel + Mark Departed action** - `0969408` (feat)

## Files Created/Modified

- `src/lib/geofencing/geofence-check.ts` — Added RouteStop geofence section after Load delivery check: queries next PENDING stop via RLS-bypass transaction, lazy geocodes address, caches lat/lng, marks ARRIVED atomically when within 500m (GEOFENCE_RADIUS_KM = 0.5)
- `src/app/(driver)/actions/driver-routes.ts` — Added stops include to getMyAssignedRoute (orderBy position asc), added markStopDeparted action with ownership validation and ARRIVED->DEPARTED enforcement, added revalidatePath import
- `src/components/driver/route-detail-readonly.tsx` — Converted to 'use client', added RouteStop interface, activeStop derivation, active stop blue card panel, MarkDepartedButton sub-component with dynamic import + pending state, All Stops list with position badge color coding

## Decisions Made

- DEPARTED status is manual-only: driver must press "Mark Departed" — geofence exit does not trigger it. This is a locked decision from the research phase.
- `markStopDeparted` validates ownership via `route.driverId = user.id` in the WHERE clause — stopId cannot be spoofed to access another driver's stops.
- `MarkDepartedButton` uses dynamic import (`await import('@/app/(driver)/actions/driver-routes')`) to call the server action from the client component without violating the 'use server' module boundary.
- `stopTruckPoint` variable name chosen (not `truckPoint`) to avoid shadowing the `truckPoint` variable in the Load check scope within the same outer try block.
- No dispatcher alert on RouteStop arrival — stop-level tracking is a driver-facing feature only; load-level status changes (PICKED_UP, DELIVERED) are what trigger dispatcher and customer notifications.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/lib/geofencing/geofence-check.ts` | FOUND |
| `src/app/(driver)/actions/driver-routes.ts` | FOUND |
| `src/components/driver/route-detail-readonly.tsx` | FOUND |
| Commit 5b0a541 (geofence RouteStop) | FOUND |
| Commit 0969408 (driver portal active stop) | FOUND |
| `npx tsc --noEmit` passes | CONFIRMED |
| RouteStop section uses GEOFENCE_RADIUS_KM constant | CONFIRMED (line 237) |
| take: 1 + PENDING filter on stops query | CONFIRMED (lines 202-204) |
| 'use client' directive in route-detail-readonly.tsx | CONFIRMED (line 1) |
| activeStop derivation exists | CONFIRMED (lines 109-112) |
| MarkDepartedButton renders only when status === ARRIVED | CONFIRMED (line 139-141) |
| markStopDeparted validates stop.route.driverId === user.id | CONFIRMED |
