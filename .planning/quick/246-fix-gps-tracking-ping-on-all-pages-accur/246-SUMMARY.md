---
phase: quick-246
plan: "01"
subsystem: web-driver-gps
tags: [gps, tracking, live-map, driver-portal, web]
dependency_graph:
  requires: []
  provides: [layout-level-gps-ping, haversine-speed, calculated-speed-storage, live-map-15s-polling]
  affects: [driver-portal, live-map, gps-location-records]
tech_stack:
  added: []
  patterns: [haversine-formula, backup-setinterval, movement-state-machine]
key_files:
  created: []
  modified:
    - apps/web/src/components/driver/driver-gps-ping.tsx
    - apps/web/src/components/driver/driver-dashboard.tsx
    - apps/web/src/app/(driver)/layout.tsx
    - apps/web/src/app/api/driver/gps-ping/route.ts
    - apps/web/src/components/maps/live-map-wrapper.tsx
    - apps/web/src/lib/maps/vehicle-status.ts
decisions:
  - "Backup setInterval every 15s alongside watchPosition prevents stalled GPS tracking"
  - "Haversine formula preferred over browser-provided speed for consistency across devices"
  - "Idle threshold set to < 3 mph (not 2 mph) to add buffer for GPS coordinate jitter"
  - "GPS status dot shows 'Location on' for both moving and idle states (position known)"
metrics:
  duration: "2m 7s"
  completed: "2026-04-18"
  tasks_completed: 2
  files_modified: 6
---

# Phase quick-246 Plan 01: Fix GPS Tracking Ping on All Pages Summary

GPS tracking moved to driver layout level with haversine speed calculation, backup interval, and 15s live map polling.

## What Was Built

### Task 1: Move GPS ping to layout, add haversine movement detection and backup interval

- **driver-gps-ping.tsx** — Complete rewrite:
  - Layout-level rendering so pings fire on every driver portal page
  - `calculateHaversineSpeed()` function using Earth radius 3959 miles
  - `movementState`: `'moving'` (>2mph), `'idle'` (<=2mph), `'off'` (no GPS)
  - Status dot: green-pulse = moving, yellow = idle, grey = off
  - Both states show "Location on", off state shows "Location off"
  - Backup `setInterval` every 15s calls `getCurrentPosition` (catches watchPosition stalls)
  - `prevPingRef` tracks previous lat/lng/timestamp for speed delta calculation
  - 10-minute offline timeout resets state to 'off'
  - `calculatedSpeed` (Math.round'd mph) sent in POST body
  - THROTTLE_MS reduced from 30s to 15s
  - watchPosition options: `maximumAge: 10_000`, `timeout: 15_000`

- **driver-dashboard.tsx** — Removed `DriverGpsPing` import and usage from header row; simplified header to just the greeting `<h1>`

- **layout.tsx** — Added `DriverGpsPing` import and rendered it before `DriverNotificationBell` in the header flex container; updated comment to reflect layout-level GPS

### Task 2: Store calculated speed, speed up live map polling, add refresh button

- **gps-ping/route.ts** — Added `calculatedSpeed?: number | null` to destructured body; stores `speed: calculatedSpeed != null ? Math.round(calculatedSpeed) : null` in `GPSLocation.create`; added to logger.info output

- **vehicle-status.ts** — Changed idle threshold from `speed < 5` to `speed < 3` mph to align with 2mph haversine threshold while allowing GPS jitter buffer

- **live-map-wrapper.tsx** — `POLL_INTERVAL_MS` changed from `30_000` to `15_000`; added manual "Refresh" button next to "Last updated Xs ago" overlay in bottom-right of live map

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All 6 modified files present on disk. Both task commits (55d95cb, ffae094) confirmed in git log.
