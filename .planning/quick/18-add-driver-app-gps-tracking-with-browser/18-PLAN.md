---
phase: quick-18
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/gps/report/route.ts
  - src/components/driver/gps-tracker.tsx
  - src/app/(driver)/layout.tsx
  - src/components/driver/driver-nav.tsx
autonomous: true

must_haves:
  truths:
    - "Driver with active route sees a GPS tracking toggle in their portal"
    - "Enabling tracking requests browser geolocation permission"
    - "While tracking, driver's phone GPS position is sent to server every 30 seconds"
    - "GPS records are written to GPSLocation table with correct tenantId and truckId"
    - "Owner's live map automatically shows driver positions (no changes needed — polls existing data)"
  artifacts:
    - path: "src/app/api/gps/report/route.ts"
      provides: "POST endpoint for GPS location reports"
      exports: ["POST"]
    - path: "src/components/driver/gps-tracker.tsx"
      provides: "Client component with tracking toggle and geolocation interval"
  key_links:
    - from: "src/components/driver/gps-tracker.tsx"
      to: "/api/gps/report"
      via: "fetch POST every 30s with lat/lng/speed/heading/altitude/accuracy"
      pattern: "fetch.*api/gps/report"
    - from: "src/app/api/gps/report/route.ts"
      to: "GPSLocation table"
      via: "prisma.gPSLocation.create"
      pattern: "gPSLocation\\.create"
---

<objective>
Add browser-based GPS tracking to the driver portal. When a driver has an active route, they can toggle GPS tracking on/off. While enabled, the browser's Geolocation API sends the phone's position to a POST /api/gps/report endpoint every 30 seconds. The endpoint writes GPSLocation records using the driver's assigned truck, so the owner's existing live map picks up driver positions automatically.

Purpose: Enable real-time fleet tracking from driver phones without requiring external hardware or telematics providers.
Output: GPS report API endpoint + client-side tracking component integrated into driver layout.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(driver)/layout.tsx
@src/app/(driver)/actions/driver-routes.ts
@src/app/(owner)/live-map/actions.ts
@src/lib/auth/session.ts
@src/lib/auth/server.ts
@src/lib/context/tenant-context.ts
@src/components/driver/driver-nav.tsx
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create POST /api/gps/report endpoint</name>
  <files>src/app/api/gps/report/route.ts</files>
  <action>
Create a Next.js API route at src/app/api/gps/report/route.ts that:

1. Authenticates via getSession() from @/lib/auth/session — return 401 if no session.
2. Validates session.role === 'DRIVER' — return 403 if not a driver.
3. Accepts JSON body: { latitude: number, longitude: number, speed: number | null, heading: number | null, altitude: number | null, accuracy: number | null }.
4. Validates latitude (-90 to 90), longitude (-180 to 180) are present and in range — return 400 on invalid.
5. Looks up the driver's active route to get the truckId:
   - Use prisma.$transaction with RLS bypass (set_config('app.bypass_rls', 'on', TRUE)) since API routes need explicit RLS handling.
   - Query Route where driverId = session.userId AND tenantId = session.tenantId AND status IN ('PLANNED', 'IN_PROGRESS').
   - If no active route found, return 404 with { error: 'No active route' }.
6. Creates a GPSLocation record:
   - id: auto-generated UUID
   - tenantId: session.tenantId
   - truckId: from the route lookup
   - latitude, longitude: from request body
   - speed, heading, altitude, accuracy: from request body (nullable)
   - timestamp: new Date() (server timestamp, not client-provided)
7. Return 201 with { ok: true }.

Use prisma from @/lib/db/prisma directly (not getTenantPrisma which uses headers() — not available in API routes the same way). Use $transaction with bypass_rls + set_config pattern matching the accept-invitation route pattern.

Keep the endpoint lightweight — no extra queries, no response data beyond { ok: true }.
  </action>
  <verify>Build passes: `npx next build` or `npx tsc --noEmit`. Manual test: `curl -X POST http://localhost:3000/api/gps/report -H "Content-Type: application/json" -d '{"latitude":40.7128,"longitude":-74.006}' -b "session=..."` returns 201.</verify>
  <done>POST /api/gps/report accepts GPS coordinates from authenticated drivers, resolves their truckId from active route, and writes GPSLocation records that the live map query picks up.</done>
</task>

<task type="auto">
  <name>Task 2: Create GPS tracker component and integrate into driver layout</name>
  <files>src/components/driver/gps-tracker.tsx, src/app/(driver)/layout.tsx</files>
  <action>
Create src/components/driver/gps-tracker.tsx as a 'use client' component:

1. Props: { truckId: string } (passed from layout to confirm driver has active route; if no truckId, render nothing).
2. State: isTracking (boolean), lastUpdate (Date | null), error (string | null), permissionState ('prompt' | 'granted' | 'denied' | null).
3. On mount, check navigator.geolocation exists. If not, set error = "GPS not supported".
4. Check navigator.permissions.query({ name: 'geolocation' }) to show current permission state.
5. Toggle button (use shadcn Switch from @/components/ui/switch):
   - Label: "GPS Tracking" with status indicator (green dot when active, gray when off).
   - When toggled ON:
     a. Call navigator.geolocation.getCurrentPosition first to trigger permission prompt and get immediate position.
     b. Send first position immediately via sendPosition() helper.
     c. Start setInterval every 30000ms calling navigator.geolocation.getCurrentPosition, then sendPosition().
     d. Store interval ID in a ref.
   - When toggled OFF:
     a. Clear the interval.
     b. Set isTracking = false.
6. sendPosition(position: GeolocationPosition) helper:
   - POST to /api/gps/report with JSON body: { latitude: position.coords.latitude, longitude: position.coords.longitude, speed: position.coords.speed, heading: position.coords.heading, altitude: position.coords.altitude, accuracy: position.coords.accuracy }.
   - On success, update lastUpdate = new Date().
   - On 404 (no active route), auto-disable tracking and show "No active route" message.
   - On other errors, show brief error but keep tracking active (transient network issues).
7. Display section:
   - Compact card-style UI with: toggle, status text ("Tracking active" / "Tracking off"), last update time (relative like "5s ago"), error message if any.
   - Use MapPin icon from lucide-react.
8. Cleanup: useEffect return clears interval on unmount.
9. Use high accuracy option in getCurrentPosition: { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }.

Integrate into src/app/(driver)/layout.tsx:
1. Import GpsTracker component.
2. Before rendering children, fetch the driver's active route to check if they have a truckId. Use a server action or inline query:
   - Import getCurrentUser from @/lib/auth/server and prisma from @/lib/db/prisma.
   - Query Route where driverId = user.id, status IN ('PLANNED', 'IN_PROGRESS'), select truckId only.
   - Use $transaction with RLS bypass (same pattern as getCurrentUser).
3. Pass truckId (or null) to GpsTracker. Component renders in the header area, after the nav, as a small fixed-bottom bar or inline in the header.
4. Place GpsTracker below the DriverNav in the header section, inside a subtle container: `<div className="border-t border-border px-6 py-2">`.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Start dev server, sign in as a driver with an active route. GPS tracking toggle appears in the header. Enabling it triggers browser permission prompt. After granting, check Network tab — POST /api/gps/report fires immediately and every 30s. Check database: `SELECT * FROM "GPSLocation" ORDER BY timestamp DESC LIMIT 5` shows new records with correct truckId.</verify>
  <done>Driver portal shows GPS tracking toggle. When enabled, browser geolocation sends position to server every 30s. GPSLocation records are created and visible on the owner's live map via existing getLatestVehicleLocations() query.</done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `npx tsc --noEmit`
2. Driver without active route: toggle not visible or gracefully hidden
3. Driver with active route: toggle visible, enabling starts geolocation
4. GPS positions written to GPSLocation table with correct tenantId and truckId
5. Owner live map at /live-map shows driver positions after tracking is enabled
6. Disabling toggle stops geolocation and interval
7. Page navigation / unmount properly cleans up interval
</verification>

<success_criteria>
- POST /api/gps/report authenticates driver, validates coordinates, writes GPSLocation
- GPS tracker component uses browser Geolocation API with 30s interval
- Tracking toggle appears in driver portal header when driver has active route
- Written GPSLocation records are picked up by existing live map (no live map changes needed)
- Clean error handling: no GPS support, permission denied, no active route, network errors
</success_criteria>

<output>
After completion, create `.planning/quick/18-add-driver-app-gps-tracking-with-browser/18-SUMMARY.md`
</output>
