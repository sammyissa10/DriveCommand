---
phase: 33
plan: "01"
subsystem: mobile-gps
tags: [gps, background-location, expo-task-manager, expo-battery, react-native, driver-mobile]
dependency_graph:
  requires: [phase-30-auth, phase-31-api, phase-32-hos]
  provides: [background-gps-reporting, gps-status-indicator, tracking-token-fetch]
  affects: [driver-layout, api-mobile-driver]
tech_stack:
  added: [expo-battery, expo-task-manager]
  patterns: [background-task-manager, adaptive-polling, mmkv-token-cache]
key_files:
  created:
    - apps/mobile/lib/gps-task.ts
    - apps/mobile/hooks/useBackgroundGPS.ts
    - apps/mobile/components/driver/GPSPermissionModal.tsx
    - apps/web/src/app/api/mobile/driver/tracking-token/route.ts
  modified:
    - apps/mobile/app/(driver)/_layout.tsx
    - packages/api-client/src/driver.ts
    - apps/mobile/package.json
decisions:
  - "trackingToken is per-load (Load.trackingToken), not per-driver — endpoint returns active load token"
  - "GPS interval adapts to HOSStatus: 30s DRIVING/ON_DUTY, 5min idle, 10min low-battery"
  - "GPSStatusDot placed on home tab icon rather than a separate header bar"
  - "Tracking token fetch and HOS fetch are best-effort — GPS starts regardless"
metrics:
  duration: 257s
  tasks_completed: 7
  files_created: 4
  files_modified: 3
  completed_date: "2026-03-23"
---

# Phase 33 Plan 01: Background GPS Reporting Summary

Background GPS reporting with adaptive intervals based on HOS duty status and battery level, using expo-task-manager for foreground service, with status indicator in the driver tab bar.

## What Was Built

### Background GPS Task (`apps/mobile/lib/gps-task.ts`)
Registers `DRIVECOMMAND_GPS_BACKGROUND` with expo-task-manager at module scope (required — must be in global scope for background execution). On each location update, reads the session token from MMKV, fetches the cached tracking token, and POSTs coordinates to `/api/gps/report` via `apiClient.reportGPS`. Failures are silenced (best-effort reporting).

### GPS Hook (`apps/mobile/hooks/useBackgroundGPS.ts`)
`useBackgroundGPS(hosStatus?)` manages the full location permission + update lifecycle:
- Requests foreground then background permissions (Android 10+ requires both)
- Interval: 30s for DRIVING/ON_DUTY, 5min for other statuses, 10min when battery < 20%
- Configures foreground service notification (Android) and background indicator (iOS)
- Also triggers on 50m movement (significant location change)
- Restarts with updated interval when HOS status changes
- Returns `{ gpsStatus, startGPS, stopGPS }` where `gpsStatus` is `'active' | 'paused' | 'no-permission' | 'off'`

### Permission Modal (`apps/mobile/components/driver/GPSPermissionModal.tsx`)
Pre-permission explanation modal per app store guidelines. Allow button chains fg + bg permission requests. Not Now dismisses without requesting. Styled to driver dark theme.

### Tracking Token Endpoint (`GET /api/mobile/driver/tracking-token`)
Returns the active load's `trackingToken` for the authenticated driver. Used as supplementary context in GPS reports — the GPS endpoint itself authenticates via Bearer token, not this tracking token. Returns `{ trackingToken: string | null }`.

### Driver Layout Wiring (`apps/mobile/app/(driver)/_layout.tsx`)
On mount, fetches HOS status (calibrates interval) and active load tracking token (cached in MMKV). Calls `useBackgroundGPS(hosStatus)` — GPS starts automatically. GPSStatusDot (8x8 circle, green/grey/red) overlaid on the home tab icon.

### API Client (`packages/api-client/src/driver.ts`)
Added `driverApi.getTrackingToken(token)` method.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AuthContext usage in driver layout**
- **Found during:** Task 6 (wiring GPS into layout)
- **Issue:** Plan referenced `session.token` but AuthContext exposes `token` directly (not `session`)
- **Fix:** Used `const { token } = useAuthContext()` matching the actual AuthContext API
- **Files modified:** `apps/mobile/app/(driver)/_layout.tsx`
- **Commit:** 56fa280

**2. [Rule 2 - Missing functionality] Battery API wrapped in try/catch**
- **Found during:** Task 2 (GPS hook)
- **Issue:** Battery API unavailable on some platforms/simulators; uncaught error would stop GPS
- **Fix:** Wrapped `getBatteryLevelAsync()` in try/catch, falls back to base interval
- **Files modified:** `apps/mobile/hooks/useBackgroundGPS.ts`
- **Commit:** ec679c2

**3. [Rule 1 - Clarification] trackingToken is per-load, not per-driver**
- **Found during:** Task 5 (tracking token endpoint)
- **Issue:** Plan said "driver's GPS tracking token" but the schema has `trackingToken` on the `Load` model, not User/Driver. The GPS report endpoint ignores the tracking token field entirely (uses Bearer auth).
- **Fix:** Endpoint returns the active load's `trackingToken` — correct semantic behavior (associates GPS reports with the load being transported)
- **Files modified:** `apps/web/src/app/api/mobile/driver/tracking-token/route.ts`
- **Commit:** 404aa8f

## Verification Checklist

- [x] GPS task registers with expo-task-manager at module scope
- [x] POST /api/gps/report receives coordinates via Bearer token auth
- [x] Interval: 30s DRIVING/ON_DUTY, 5min idle, 10min low battery
- [x] Background operation: foreground service notification configured
- [x] GPS status dot shows in driver tab bar (green/grey/red)
- [x] Permission denial handled gracefully (gpsStatus = 'no-permission', no crash)
- [x] Tracking token fetched from active load and stored in MMKV on login
- [x] TypeScript: no new errors in GPS-related files

## Self-Check

Files exist:
- apps/mobile/lib/gps-task.ts — FOUND
- apps/mobile/hooks/useBackgroundGPS.ts — FOUND
- apps/mobile/components/driver/GPSPermissionModal.tsx — FOUND
- apps/web/src/app/api/mobile/driver/tracking-token/route.ts — FOUND

Commits:
- 1638838 — gps-task.ts + expo-battery install
- ec679c2 — useBackgroundGPS hook
- 1bbfd30 — GPSPermissionModal
- 404aa8f — tracking-token endpoint + api-client
- 56fa280 — driver layout wiring

## Self-Check: PASSED
