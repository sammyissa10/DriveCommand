---
phase: quick-246
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/driver/driver-gps-ping.tsx
  - apps/web/src/components/driver/driver-dashboard.tsx
  - apps/web/src/app/(driver)/layout.tsx
  - apps/web/src/app/api/driver/gps-ping/route.ts
  - apps/web/src/components/maps/live-map-wrapper.tsx
  - apps/web/src/lib/maps/vehicle-status.ts
autonomous: true
must_haves:
  truths:
    - "GPS pings fire on ALL driver portal pages, not just the dashboard"
    - "Movement detection uses coordinate delta (haversine) with 2mph threshold"
    - "Calculated speed is stored in GPSLocation record and used by live map"
    - "Backup ping fires every 15s via setInterval in addition to watchPosition"
    - "Live map polls every 15s instead of 30s and has manual refresh button"
    - "GPS status dot shows green-pulsing for moving, yellow for idle, grey for off"
  artifacts:
    - path: "apps/web/src/app/(driver)/layout.tsx"
      provides: "DriverGpsPing rendered at layout level for all driver pages"
    - path: "apps/web/src/components/driver/driver-gps-ping.tsx"
      provides: "Haversine speed calculation, backup interval, movement state"
    - path: "apps/web/src/app/api/driver/gps-ping/route.ts"
      provides: "Accepts and stores calculatedSpeed in GPSLocation.speed"
    - path: "apps/web/src/components/maps/live-map-wrapper.tsx"
      provides: "15s polling interval, manual refresh button"
  key_links:
    - from: "driver-gps-ping.tsx"
      to: "/api/driver/gps-ping"
      via: "POST with calculatedSpeed field"
      pattern: "calculatedSpeed"
    - from: "gps-ping/route.ts"
      to: "prisma.gPSLocation.create"
      via: "speed field from calculatedSpeed"
      pattern: "speed.*calculatedSpeed"
---

<objective>
Fix 6 GPS tracking issues in the web driver portal: move GPS ping to layout (all pages), add haversine-based movement detection, store calculated speed, add backup ping interval, speed up live map polling with manual refresh, and improve status dot accuracy.

Purpose: GPS currently only pings from dashboard, uses no movement detection, and the live map updates too slowly.
Output: Reliable GPS tracking across all driver pages with accurate movement/idle/offline status.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/driver/driver-gps-ping.tsx
@apps/web/src/components/driver/driver-dashboard.tsx
@apps/web/src/app/(driver)/layout.tsx
@apps/web/src/app/api/driver/gps-ping/route.ts
@apps/web/src/components/maps/live-map-wrapper.tsx
@apps/web/src/lib/maps/vehicle-status.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move GPS ping to layout, add haversine movement detection and backup interval</name>
  <files>
    apps/web/src/components/driver/driver-gps-ping.tsx
    apps/web/src/components/driver/driver-dashboard.tsx
    apps/web/src/app/(driver)/layout.tsx
  </files>
  <action>
**driver-gps-ping.tsx — Major rewrite:**

1. Add a `prevPingRef` using `useRef<{ lat: number; lng: number; time: number } | null>(null)` to track previous ping position/timestamp.

2. Add a `movementState` state: `'moving' | 'idle' | 'off'` (default `'off'`).

3. Add a `calculateHaversineSpeed(lat1, lng1, lat2, lng2, timeDeltaMs)` function that:
   - Uses haversine formula to calculate distance in miles between two lat/lng points
   - Returns speed in mph = (distance / timeDeltaMs) * 3600000
   - Formula: `a = sin^2(dlat/2) + cos(lat1)*cos(lat2)*sin^2(dlng/2)`, `c = 2*atan2(sqrt(a), sqrt(1-a))`, `d = 3959 * c` (Earth radius in miles)

4. Reduce THROTTLE_MS from 30000 to 15000 (15 seconds).

5. In the watchPosition success callback:
   - Calculate speed: if prevPingRef.current exists, use `calculateHaversineSpeed()` with prev and current coords + timestamps. If no prev (first ping), speed = 0.
   - Update prevPingRef.current with current lat, lng, Date.now().
   - Set movementState: speed > 2 → 'moving', speed <= 2 → 'idle'.
   - Include `calculatedSpeed: Math.round(speed)` in the POST body alongside lat, lng, accuracy.

6. Update watchPosition options: `enableHighAccuracy: true, maximumAge: 10000, timeout: 15000`.

7. Add a `setInterval` backup ping every 15 seconds that calls `navigator.geolocation.getCurrentPosition()` with the same success/error callbacks. Store interval ID in a ref.

8. In cleanup: clear BOTH watchPosition AND the backup setInterval.

9. Add a `lastPingTimeRef` to track when last successful ping was sent, and add a 10-minute timeout check: if `Date.now() - lastPingTimeRef.current > 600000`, set movementState to 'off'.

10. Update the status dot rendering:
    - movementState === 'moving': `bg-green-500 animate-pulse` + "Location on"
    - movementState === 'idle': `bg-yellow-400` (no pulse) + "Location on"
    - movementState === 'off' (denied/unavailable/no position): `bg-muted-foreground/40` + "Location off"
    - Keep the denied warning message as-is.

11. Export the component unchanged (still `DriverGpsPing`). The component renders only the small status indicator — no visual change in size/layout.

**driver-dashboard.tsx:**
- Remove the `import { DriverGpsPing } from './driver-gps-ping'` line.
- Remove the `<DriverGpsPing />` from the header row JSX (lines ~81-83). Keep the greeting `<h1>` but remove the GPS indicator wrapper div. Simplify the header to just show the greeting without the flex justify-between layout (since GPS dot is gone). Change line 79 from `<div className="flex items-start justify-between gap-3">` to just render the `<h1>` directly without the wrapper div. Remove the closing `</div>` for that wrapper too.

**layout.tsx:**
- Add import: `import { DriverGpsPing } from '@/components/driver/driver-gps-ping'`
- Render `<DriverGpsPing />` inside the layout, positioned in the header next to DriverNotificationBell. Place it before the notification bell in the flex container on line 48: `<DriverGpsPing />` then `<DriverNotificationBell />` then `<UserMenu>`.
- Update the comment on line 19 to reflect that GPS pinging IS now at the layout level.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — no type errors. Grep for `DriverGpsPing` to confirm it appears in layout.tsx and NOT in driver-dashboard.tsx (except as removed).
  </verify>
  <done>
DriverGpsPing renders in driver layout (all pages), uses haversine speed calculation with 2mph threshold, has 15s backup interval, shows correct status dot colors (green-pulse=moving, yellow=idle, grey=off).
  </done>
</task>

<task type="auto">
  <name>Task 2: Store calculated speed in GPS ping endpoint, speed up live map polling, add refresh button</name>
  <files>
    apps/web/src/app/api/driver/gps-ping/route.ts
    apps/web/src/components/maps/live-map-wrapper.tsx
    apps/web/src/lib/maps/vehicle-status.ts
  </files>
  <action>
**gps-ping/route.ts:**
- Add `calculatedSpeed` to the destructured body: `const { lat, lng, accuracy, dispatchId, calculatedSpeed } = body as { ..., calculatedSpeed?: number | null }`.
- In the `prisma.gPSLocation.create()` call (line 91-99), add `speed: calculatedSpeed != null ? Math.round(calculatedSpeed) : null` to the `data` object. The GPSLocation model already has a `speed Int?` column — no migration needed.
- Add `calculatedSpeed` to the logger.info call.

**vehicle-status.ts:**
- Update the idle threshold from `speed < 5` to `speed < 3` (to align closer with the 2mph haversine threshold while keeping a small buffer for GPS jitter). This affects how the live map categorizes vehicles.

**live-map-wrapper.tsx:**
- Change `POLL_INTERVAL_MS` from `30_000` to `15_000`.
- Add a manual refresh button next to the "Last updated" text. In the bottom-right overlay (line 208-211), wrap the existing `<p>` and a new button in a flex container:
  ```
  <div className="absolute bottom-1 right-2 flex items-center gap-1.5 bg-background/80 px-1.5 rounded z-10">
    <p className="text-xs text-muted-foreground">Last updated {secondsAgo}s ago</p>
    <button
      onClick={fetchVehicles}
      className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
      aria-label="Refresh vehicles"
    >
      Refresh
    </button>
  </div>
  ```
- Import `RefreshCw` from lucide-react is NOT needed — use text "Refresh" button to keep it simple and small.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — no type errors. Verify `POLL_INTERVAL_MS = 15_000` in live-map-wrapper.tsx. Verify `speed: calculatedSpeed` in gps-ping route. Verify speed threshold in vehicle-status.ts is `< 3`.
  </verify>
  <done>
GPS ping endpoint stores calculatedSpeed in GPSLocation.speed column. Live map polls every 15s with manual refresh button. Vehicle status uses speed < 3 threshold for idle detection.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with zero errors
- `grep -r "DriverGpsPing" apps/web/src/` shows it in layout.tsx and driver-gps-ping.tsx only (not driver-dashboard.tsx)
- `grep "POLL_INTERVAL_MS" apps/web/src/components/maps/live-map-wrapper.tsx` shows 15_000
- `grep "calculatedSpeed" apps/web/src/app/api/driver/gps-ping/route.ts` shows it being accepted and stored
- `grep "calculateHaversineSpeed\|haversine" apps/web/src/components/driver/driver-gps-ping.tsx` shows the haversine function exists
</verification>

<success_criteria>
- GPS pings fire on every driver portal page (layout-level rendering)
- Haversine-based speed calculation determines moving (>2mph) vs idle (<=2mph)
- calculatedSpeed sent to API and stored in GPSLocation.speed
- Backup setInterval ping every 15s alongside watchPosition
- Live map polls every 15s with manual "Refresh" button
- Status dot: green-pulse = moving, yellow = idle, grey = off
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/246-fix-gps-tracking-ping-on-all-pages-accur/246-SUMMARY.md`
</output>
