---
phase: quick-24
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/gps/locations/route.ts
  - src/components/maps/live-map-wrapper.tsx
  - src/components/maps/live-map.tsx
  - src/components/tracking/tracking-poller.tsx
  - src/app/track/[token]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Live map vehicle markers update every 30s without full page reload"
    - "Customer tracking page updates GPS position, status badge, and last-updated timestamp every 30s"
    - "Polling pauses when browser tab is hidden and resumes when visible"
    - "A 'Last updated X seconds ago' indicator is visible on both pages"
  artifacts:
    - path: "src/app/api/gps/locations/route.ts"
      provides: "Authenticated GET endpoint returning current vehicle positions for tenant"
      exports: ["GET"]
    - path: "src/components/maps/live-map-wrapper.tsx"
      provides: "Client-side polling of /api/gps/locations, passes updated vehicles to LiveMap"
    - path: "src/components/tracking/tracking-poller.tsx"
      provides: "Client component polling /api/track/[token] every 30s with visibility pause"
  key_links:
    - from: "src/components/maps/live-map-wrapper.tsx"
      to: "/api/gps/locations"
      via: "fetch in useEffect setInterval"
      pattern: "fetch.*api/gps/locations"
    - from: "src/components/tracking/tracking-poller.tsx"
      to: "/api/track/[token]"
      via: "fetch in useEffect setInterval"
      pattern: "fetch.*api/track"
---

<objective>
Add 30-second client-side GPS polling to the live fleet map and customer tracking page.

Purpose: Both pages currently show static positions from server render. Real-time polling keeps vehicle positions current without manual refresh, which is critical for fleet monitoring and customer shipment visibility.
Output: Two polling implementations — one authenticated (live map) and one public (tracking page) — both with visibility-aware pause and "last updated" indicators.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/maps/live-map-wrapper.tsx
@src/components/maps/live-map.tsx
@src/app/(owner)/live-map/page.tsx
@src/app/(owner)/live-map/actions.ts
@src/lib/maps/map-utils.ts
@src/app/track/[token]/page.tsx
@src/app/api/track/[token]/route.ts
@src/components/tracking/tracking-map-wrapper.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create GPS locations API endpoint and add polling to live map</name>
  <files>
    src/app/api/gps/locations/route.ts
    src/components/maps/live-map-wrapper.tsx
    src/components/maps/live-map.tsx
  </files>
  <action>
1. **Create `src/app/api/gps/locations/route.ts`** — a GET endpoint that:
   - Calls `getSession()` from `@/lib/auth/session` and returns 401 if not authenticated
   - Calls `requireRole([UserRole.OWNER, UserRole.MANAGER])` from `@/lib/auth/server`
   - Reads optional `tagId` from `req.nextUrl.searchParams`
   - Calls existing `getLatestVehicleLocations(tagId)` from `@/app/(owner)/live-map/actions`
   - Returns `NextResponse.json(vehicles)` with the `VehicleLocation[]` array
   - Wrap in try/catch returning 500 on error

2. **Rewrite `src/components/maps/live-map-wrapper.tsx`** to add client-side polling:
   - Keep the existing dynamic import of LiveMap with `ssr: false`
   - Add `useState<VehicleLocation[]>` initialized from `initialVehicles` prop
   - Add `useState<Date>` for `lastUpdated` initialized to `new Date()`
   - Add a `useEffect` with `setInterval` at 30000ms that:
     - Checks `document.visibilityState === 'hidden'` and skips fetch if hidden
     - Fetches `GET /api/gps/locations` (include `tagId` searchParam from `window.location.search` if present)
     - On success, calls `setVehicles(data)` and `setLastUpdated(new Date())`
     - On error, console.error (do NOT break polling)
   - Add a second `useEffect` that listens to `document.addEventListener('visibilitychange', handler)` — when tab becomes visible again, immediately trigger one fetch to catch up
   - Clean up both interval and event listener on unmount
   - Render a small "Last updated X seconds ago" text below the map using a 1-second `setInterval` that updates a `secondsAgo` counter (reset to 0 on each successful fetch)
   - Pass `vehicles` state (not `initialVehicles`) to `LiveMapDynamic`
   - Accept an optional `tagId?: string` prop from the server page so the polling URL includes the tag filter

3. **Update `src/components/maps/live-map.tsx`**:
   - REMOVE the existing `router.refresh()` polling `useEffect` (lines 56-63) — no longer needed since wrapper handles polling
   - REMOVE `useRouter` import if no longer used
   - Keep the `useEffect` that syncs `setVehicles(initialVehicles)` when props change — this is how polled data flows in
   - Everything else (MapContainer, MarkerClusterGroup, VehicleMarker, VehicleDetailsSheet) stays unchanged — markers update in place because they use `key={vehicle.id}` and Leaflet handles position changes

4. **Update `src/app/(owner)/live-map/page.tsx`** to pass `tagId` prop to `LiveMapWrapper`:
   - Add `tagId={tagId}` to the `<LiveMapWrapper>` JSX
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors. Visit `/live-map` in browser, observe markers updating every 30s in Network tab (GET /api/gps/locations calls). Confirm "Last updated" counter increments between polls.
  </verify>
  <done>
Live map polls /api/gps/locations every 30s, updates vehicle markers without remounting the map, shows "Last updated X seconds ago", and pauses polling when the tab is hidden.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add polling to customer tracking page with TrackingPoller component</name>
  <files>
    src/components/tracking/tracking-poller.tsx
    src/app/track/[token]/page.tsx
  </files>
  <action>
1. **Create `src/components/tracking/tracking-poller.tsx`** — a 'use client' component that:
   - Props: `token: string`, `initialData: { status: string; latestGPS: { latitude: number; longitude: number; speed: number | null; heading: number | null; timestamp: string } | null; loadNumber: string; origin: string; destination: string; pickupDate: string | null; deliveryDate: string | null; truck: { make: string; model: string; licensePlate: string } | null; driverFirstName: string | null }`, plus `children?: React.ReactNode` (not used — this component renders its own UI)
   - Internal state: `data` (initialized from `initialData`), `lastUpdated` (Date), `secondsAgo` (number)
   - Polling `useEffect`: `setInterval` at 30000ms that fetches `GET /api/track/${token}`, updates `data` state and resets `lastUpdated`. Skip fetch when `document.visibilityState === 'hidden'`. On visibility change back to visible, do an immediate fetch.
   - Seconds counter `useEffect`: 1-second interval updating `secondsAgo` from `Date.now() - lastUpdated.getTime()`
   - Renders the full live-updating section of the tracking page:
     - **Status badge** using `data.status` (same badge styling as current page — copy the STATUS_BADGE_STYLES and STATUS_DISPLAY_LABELS maps into this component or import from a shared location)
     - **Status stepper** (same 4-step DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED progress UI as current page)
     - **Shipment details card** (origin, destination, delivery date, truck, driver)
     - **Live map** via `TrackingMapWrapper` using `data.latestGPS.latitude/longitude`
     - **"Last updated X seconds ago"** indicator below the map (subtle text-xs text-muted-foreground)
   - Clean up all intervals and event listeners on unmount

2. **Simplify `src/app/track/[token]/page.tsx`**:
   - Keep it as an async server component for initial data fetch (SEO, fast first paint)
   - After fetching `load` and `latestGPS` from prisma (keep existing queries), construct the `initialData` object matching `TrackingPoller` props
   - Replace the entire JSX body (status badge, stepper, details card, map section) with `<TrackingPoller token={token} initialData={initialData} />`
   - Keep the header (`DriveCommand / Shipment Tracking`) and footer (`Powered by DriveCommand`) in the server component
   - The `TRACKING_STEPS`, `STATUS_BADGE_STYLES`, `STATUS_DISPLAY_LABELS`, `getActiveStepIndex` helpers move INTO `tracking-poller.tsx` (they are needed client-side for re-rendering)
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors. Visit `/track/[valid-token]` in browser, observe Network tab showing GET /api/track/[token] every 30s. Status badge, map position, and "Last updated" timestamp update on each poll. Switch to another tab for 60s+, return, and see an immediate catch-up fetch.
  </verify>
  <done>
Customer tracking page polls /api/track/[token] every 30s, updates map position + status badge + "Last updated" indicator, and pauses polling when the tab is not visible.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Live map page (`/live-map`): Network tab shows periodic GET /api/gps/locations calls every 30s
- Customer tracking page (`/track/[token]`): Network tab shows periodic GET /api/track/[token] calls every 30s
- Both pages show "Last updated X seconds ago" that counts up between polls
- Switching tabs pauses polling; returning resumes with immediate fetch
- Live map markers move without the entire MapContainer re-mounting
</verification>

<success_criteria>
- Two pages have 30-second client-side GPS polling
- New GET /api/gps/locations endpoint serves authenticated tenant vehicle positions
- Existing GET /api/track/[token] endpoint reused for customer tracking polling
- Visibility-aware polling (pauses on hidden, resumes on visible)
- "Last updated" indicator visible on both pages
- No full page reloads — only marker/state updates
</success_criteria>

<output>
After completion, create `.planning/quick/24-real-time-gps-polling-on-live-map-and-cu/24-SUMMARY.md`
</output>
