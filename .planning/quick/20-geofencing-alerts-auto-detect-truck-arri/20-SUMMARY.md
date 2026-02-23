---
phase: quick-20
plan: 01
subsystem: api
tags: [geofencing, gps, turf, nominatim, resend, prisma, load-management]

# Dependency graph
requires:
  - phase: quick-8
    provides: Load model, LoadStatus enum, dispatch workflow
  - phase: quick-9
    provides: sendLoadStatusEmail customer notification helper
  - phase: quick-18
    provides: GPS report API endpoint at /api/gps/report
provides:
  - GPS-triggered automatic load status transitions (DISPATCHED->PICKED_UP, IN_TRANSIT->DELIVERED)
  - Dispatcher arrival email alerts via React Email + Resend
  - Idempotent geofence tracking via geofenceFlags JSON on Load
  - Geocoded coordinate caching on Load records (pickupLat/Lng, deliveryLat/Lng)
affects: [loads, gps, dispatch, email]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget geofence check after GPS ping — never blocks HTTP response"
    - "Lazy geocoding via Nominatim on first ping — coordinates cached on Load for future pings"
    - "Idempotent alert tracking via geofenceFlags JSONB — same stop never alerts twice"
    - "RLS bypass in geofence transactions (set_config app.bypass_rls on TRUE) — same pattern as all API routes"

key-files:
  created:
    - src/lib/geofencing/geofence-check.ts
    - src/lib/email/send-geofence-alert.ts
    - src/emails/geofence-arrival-alert.tsx
  modified:
    - prisma/schema.prisma
    - src/app/api/gps/report/route.ts

key-decisions:
  - "Use @turf/turf distance() for Haversine calculation — already installed, battle-tested"
  - "Nominatim (OpenStreetMap) for geocoding — free, no API key, adequate for low-volume fleet use"
  - "Lazy geocode on first ping, then cache on Load record — avoids geocoding every ping"
  - "geofenceFlags JSONB on Load (not separate table) — lightweight idempotency without schema complexity"
  - "Fire-and-forget pattern for geofence check — GPS ping response never delayed by geocoding/email latency"
  - "Dynamic import for sendLoadStatusEmail — avoids potential circular dependency between geofence and customer-notifications modules"
  - "Dispatcher alert sent to ALL OWNER+MANAGER users in tenant (not single user) — all dispatchers need real-time visibility"

patterns-established:
  - "Geofence check: checkGeofenceAndAlert() called after DB write, errors caught and logged"
  - "500m radius (GEOFENCE_RADIUS_KM = 0.5) as standard fleet arrival detection threshold"

# Metrics
duration: ~8min
completed: 2026-02-23
---

# Quick-20: Geofencing Alerts — Auto-Detect Truck Arrival Summary

**GPS geofencing with Nominatim geocoding auto-advances load status (DISPATCHED->PICKED_UP, IN_TRANSIT->DELIVERED) and emails dispatcher + customer on truck arrival within 500m of stop**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-23T00:00:00Z
- **Completed:** 2026-02-23T00:08:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- GPS pings now trigger geofence checks against load pickup/delivery coordinates — dispatchers no longer manually update load status when drivers arrive
- Dispatcher arrival emails (React Email template, blue for pickup / green for delivery) sent to all OWNER+MANAGER users in tenant
- Customer receives existing load-status notification email automatically on status transition
- Idempotent via geofenceFlags JSONB — same stop never triggers double alerts even if truck circles the zone
- Geocoded coordinates cached on Load record — Nominatim called once per stop, not on every ping

## Task Commits

1. **Task 1: Schema migration — geofence coordinate fields** - `2a5ed18` (feat)
2. **Task 2: Geofence library, dispatcher email, GPS report extension** - `92c69f0` (feat)

## Files Created/Modified

- `prisma/schema.prisma` - Added pickupLat, pickupLng, deliveryLat, deliveryLng (Decimal nullable), geofenceFlags (Json nullable) to Load model
- `src/lib/geofencing/geofence-check.ts` - Core geofence logic: Nominatim geocoding, @turf/turf Haversine distance, status transitions, idempotency checks, customer notification
- `src/emails/geofence-arrival-alert.tsx` - React Email template for dispatcher arrival alerts (blue header for pickup, green for delivery)
- `src/lib/email/send-geofence-alert.ts` - Sends arrival email to all OWNER+MANAGER users in tenant via Resend
- `src/app/api/gps/report/route.ts` - Extended with fire-and-forget checkGeofenceAndAlert() call after GPS location saved

## Decisions Made

- Used `@turf/turf` distance() for Haversine calculation — already in package.json, battle-tested
- Nominatim (OpenStreetMap) for geocoding — free, no API key required, adequate for low-volume fleet GPS pings
- Lazy geocode: address geocoded on first ping, then lat/lng cached on Load record to avoid Nominatim rate limits
- `geofenceFlags` JSONB on Load (not a separate GeofenceAlert table) — lightweight idempotency without schema complexity
- Fire-and-forget pattern: geofence check runs after `return NextResponse.json(...)` equivalent — GPS endpoint always responds instantly
- Dynamic import for `sendLoadStatusEmail` inside `notifyCustomer()` — prevents circular dependency between geofence-check and customer-notifications modules
- Dispatcher alert targets ALL OWNER+MANAGER users in tenant — all dispatchers get real-time arrival visibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled clean on first pass, `next build` succeeded without errors.

## User Setup Required

None - no external service configuration required beyond existing RESEND_API_KEY (already set from quick-9).

## Next Phase Readiness

- Geofencing fully operational: any GPS ping within 500m of a load's stop will auto-advance status and notify stakeholders
- Geocoded coordinates are cached on Load records permanently — once geocoded, no further Nominatim calls needed for that stop
- The `geofenceFlags` JSONB shape is extensible — can add `pickupArrivedAt`, `deliveryArrivedAt` timestamps in future if needed

---
*Phase: quick-20*
*Completed: 2026-02-23*

## Self-Check: PASSED
