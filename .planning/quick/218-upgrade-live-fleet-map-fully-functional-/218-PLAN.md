---
phase: quick-218
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/maps/vehicle-status.ts
  - apps/web/src/lib/maps/map-utils.ts
  - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
  - apps/web/src/app/api/v1/carrier/live-map/history/route.ts
  - apps/web/src/app/api/v1/carrier/live-map/trips/route.ts
  - apps/web/src/app/(owner)/live-map/page.tsx
  - apps/web/src/app/(owner)/live-map/actions.ts
  - apps/web/src/components/maps/live-map-wrapper.tsx
  - apps/web/src/components/maps/live-map.tsx
  - apps/web/src/components/maps/vehicle-marker.tsx
  - apps/web/src/components/maps/route-history-layer.tsx
  - apps/web/src/components/maps/vehicle-sidebar.tsx
  - apps/web/src/components/maps/vehicle-filter-bar.tsx
  - apps/web/src/components/maps/live-map-tabs.tsx
  - apps/web/src/components/maps/history-tab.tsx
  - apps/web/src/components/maps/trips-tab.tsx
autonomous: true
must_haves:
  truths:
    - "Owner sees a left sidebar listing all trucks with status dots, driver names, and last seen time"
    - "Clicking a truck in the sidebar flies the map to that truck's location"
    - "Owner can filter the Live tab by vehicle, driver, and status without re-fetching"
    - "History tab shows GPS trail for a selected truck on a selected date"
    - "Trips tab shows completed routes with driver, truck, dates, miles"
    - "Trucks with no GPS data show grey 'No Location' badge and no map marker"
    - "All endpoints enforce tenant isolation via session.tenantId"
    - "30-second polling only runs on Live tab"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts"
      provides: "Enriched vehicle list with GPS, driver, status"
      exports: ["GET"]
    - path: "apps/web/src/app/api/v1/carrier/live-map/history/route.ts"
      provides: "GPS trail for truck on date"
      exports: ["GET"]
    - path: "apps/web/src/app/api/v1/carrier/live-map/trips/route.ts"
      provides: "Completed routes list"
      exports: ["GET"]
    - path: "apps/web/src/components/maps/vehicle-sidebar.tsx"
      provides: "Left panel vehicle list"
    - path: "apps/web/src/components/maps/vehicle-filter-bar.tsx"
      provides: "Client-side filter bar for Live tab"
    - path: "apps/web/src/components/maps/live-map-tabs.tsx"
      provides: "Tabbed navigation (Live / History / Trips)"
  key_links:
    - from: "apps/web/src/components/maps/live-map-wrapper.tsx"
      to: "/api/v1/carrier/live-map/vehicles"
      via: "fetch polling"
      pattern: "fetch.*live-map/vehicles"
    - from: "apps/web/src/components/maps/vehicle-sidebar.tsx"
      to: "live-map.tsx map.flyTo"
      via: "onClick callback"
      pattern: "flyTo"
    - from: "apps/web/src/components/maps/history-tab.tsx"
      to: "/api/v1/carrier/live-map/history"
      via: "fetch on truck+date change"
      pattern: "fetch.*live-map/history"
---

<objective>
Upgrade the Live Fleet Map from a simple marker-only map into a fully functional fleet management view with 7 features: two-panel layout, enriched vehicle sidebar, tabbed navigation (Live/History/Trips), client-side filters, no-location-data handling, driver-vehicle associations, and tenant-isolated endpoints.

Purpose: Give fleet owners real-time and historical visibility into every truck's location, status, and driver assignment — connected end-to-end with real database queries (no mock data).

Output: 3 new API routes, 5 new UI components, updated map components, all wired to real GPSLocation/Truck/Route/User data.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma

Key schema facts (confirmed from reading schema):
- GPS model: `GPSLocation` — fields: id, tenantId, truckId, latitude (Decimal 10,8), longitude (Decimal 11,8), speed (Int?), heading (Int?), altitude (Int?), accuracy (Decimal?), timestamp. Indexed on [tenantId], [truckId], [timestamp], [tenantId, timestamp].
- Truck model: `Truck` — fields: id, tenantId, make, model, year, vin, licensePlate, odometer, inMaintenance. NO unitNumber field on Truck.
- User model: `User` — fields: id, tenantId, email, role, firstName, lastName, licenseNumber, isActive.
- Route model: `Route` — fields: id, tenantId, driverId, truckId, origin, destination, scheduledDate, status (PLANNED/IN_PROGRESS/COMPLETED), completedAt, distanceMiles, name. Has stops: RouteStop[].
- Load model: `Load` — fields: id, tenantId, loadNumber, driverId, truckId, origin, destination, pickupDate, deliveryDate, status (PENDING/DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED/INVOICED/CANCELLED).
- Driver-truck association: Route has both driverId and truckId. Active route = status IN_PROGRESS with matching truckId. Also: Load has driverId + truckId for active loads (DISPATCHED/PICKED_UP/IN_TRANSIT).

Existing map infrastructure:
@apps/web/src/app/(owner)/live-map/page.tsx
@apps/web/src/app/(owner)/live-map/actions.ts
@apps/web/src/components/maps/live-map-wrapper.tsx
@apps/web/src/components/maps/live-map.tsx
@apps/web/src/components/maps/vehicle-marker.tsx
@apps/web/src/components/maps/route-history-layer.tsx
@apps/web/src/lib/maps/map-utils.ts
@apps/web/src/lib/maps/vehicle-status.ts
@apps/web/src/app/api/gps/locations/route.ts

Auth pattern (from carrier routes):
```typescript
const session = await getSession();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const orgId = session.tenantId;
if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });
```

Important: GPSLocation.truckId references the original Truck model (not CarrierTruck). All queries in this plan use the original model system (Truck, Route, Load, User) to stay consistent with existing GPS infrastructure.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create 3 backend API routes (/vehicles, /history, /trips) and update vehicle-status utility</name>
  <files>
    apps/web/src/lib/maps/vehicle-status.ts
    apps/web/src/lib/maps/map-utils.ts
    apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
    apps/web/src/app/api/v1/carrier/live-map/history/route.ts
    apps/web/src/app/api/v1/carrier/live-map/trips/route.ts
  </files>
  <action>
**1a. Update `apps/web/src/lib/maps/vehicle-status.ts`:**

Add a 4th status `'no-location'` to the `VehicleStatus` type. Update `getVehicleStatus` to accept an optional `lastUpdate` parameter — if null/undefined, return `'no-location'`. Keep existing logic for moving/idle/offline unchanged.

Add STATUS_COLORS entry for `'no-location'`:
```
'no-location': { bg: 'bg-gray-400', border: 'border-gray-600' }
```

Export a `STATUS_LABELS` map: `{ moving: 'Moving', idle: 'Idle', offline: 'Offline', 'no-location': 'No Location' }`.

**1b. Update `apps/web/src/lib/maps/map-utils.ts`:**

Extend `VehicleLocation` interface to add optional fields needed by the sidebar:
```typescript
export interface VehicleLocation {
  id: string;
  truckId: string;
  latitude: number | null;    // null when no GPS data
  longitude: number | null;   // null when no GPS data
  speed: number | null;
  heading: number | null;
  timestamp: Date | null;     // null when no GPS data
  truck: {
    make: string;
    model: string;
    licensePlate: string;
    year: number;
    vin: string;
  };
  driver: {                   // NEW
    name: string;
  } | null;
  status: 'moving' | 'idle' | 'offline' | 'no-location';  // NEW — computed server-side
}
```

Update `calculateBounds` to filter out vehicles with null lat/lng before computing bounds.

**1c. Create `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts`:**

GET handler. Auth: `getSession()` → `session.tenantId` → 401/403 if missing.

Query strategy (use `tenantRawQuery` for the main query, same pattern as existing `getLatestVehicleLocations`):

```sql
SELECT
  t.id AS "truckId",
  t.make, t.model, t.year, t.vin, t."licensePlate",
  gps.id AS "gpsId",
  gps.latitude, gps.longitude, gps.speed, gps.heading, gps.timestamp
FROM "Truck" t
LEFT JOIN LATERAL (
  SELECT g.id, g.latitude, g.longitude, g.speed, g.heading, g.timestamp
  FROM "GPSLocation" g
  WHERE g."truckId" = t.id
  ORDER BY g.timestamp DESC
  LIMIT 1
) gps ON TRUE
WHERE t."tenantId" = $1::uuid
  AND t."archivedAt" IS NULL
```

This LEFT JOIN ensures trucks with NO GPS pings are included (gps columns will be null).

After the main query, find the currently assigned driver for each truck. Do a second query:
```sql
SELECT r."truckId", u."firstName", u."lastName"
FROM "Route" r
JOIN "User" u ON r."driverId" = u.id
WHERE r."tenantId" = $1::uuid
  AND r.status = 'IN_PROGRESS'
  AND r."truckId" = ANY($2::uuid[])
```
Where $2 is the array of truck IDs from the first query. Build a Map<truckId, driverName>.

If no active route, also check for active loads:
```sql
SELECT l."truckId", u."firstName", u."lastName"
FROM "Load" l
JOIN "User" u ON l."driverId" = u.id
WHERE l."tenantId" = $1::uuid
  AND l.status IN ('DISPATCHED', 'PICKED_UP', 'IN_TRANSIT')
  AND l."truckId" = ANY($2::uuid[])
  AND l."truckId" NOT IN (SELECT "truckId" FROM "Route" WHERE "tenantId" = $1::uuid AND status = 'IN_PROGRESS')
```

For each truck, compute status using `getVehicleStatus(speed, timestamp)` (passing null timestamp if no GPS). Return array of `VehicleLocation` objects.

Response: `{ data: VehicleLocation[] }`.

**1d. Create `apps/web/src/app/api/v1/carrier/live-map/history/route.ts`:**

GET handler with query params: `truckId` (required, UUID), `date` (required, YYYY-MM-DD format).

Auth: same pattern.

Validate truckId is a valid UUID. Validate date format. Verify the truck belongs to the tenant:
```typescript
const truck = await db.truck.findFirst({ where: { id: truckId, tenantId: orgId } });
if (!truck) return 404;
```

Query GPS pings for that truck on that date (use Prisma, not raw SQL):
```typescript
const startOfDay = new Date(`${date}T00:00:00Z`);
const endOfDay = new Date(`${date}T23:59:59.999Z`);

const points = await db.gPSLocation.findMany({
  where: { truckId, timestamp: { gte: startOfDay, lte: endOfDay } },
  orderBy: { timestamp: 'asc' },
  select: { latitude: true, longitude: true, speed: true, heading: true, timestamp: true },
});
```

Convert Decimal lat/lng to Number. Response: `{ data: { truckId, date, points: [...] } }`.

**1e. Create `apps/web/src/app/api/v1/carrier/live-map/trips/route.ts`:**

GET handler with optional query params: `page` (default 1), `pageSize` (default 25).

Auth: same pattern.

Query completed routes with driver and truck info:
```typescript
const routes = await db.route.findMany({
  where: { tenantId: orgId, status: 'COMPLETED', archivedAt: null },
  orderBy: { completedAt: 'desc' },
  take: pageSize,
  skip: (page - 1) * pageSize,
  select: {
    id: true,
    name: true,
    origin: true,
    destination: true,
    scheduledDate: true,
    completedAt: true,
    distanceMiles: true,
    driver: { select: { firstName: true, lastName: true } },
    truck: { select: { make: true, model: true, licensePlate: true } },
  },
});

const total = await db.route.count({
  where: { tenantId: orgId, status: 'COMPLETED', archivedAt: null },
});
```

Response: `{ data: { trips: [...], total, page, pageSize } }`.

Import logger from `@/lib/logger`. Wrap all handlers in try/catch, log errors with `logger.error`.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` — no type errors in new files.
Verify all 3 route files export a GET function.
Verify vehicle-status.ts exports the `'no-location'` status type.
  </verify>
  <done>
Three tenant-isolated API routes exist and type-check: /vehicles returns enriched truck list with GPS + driver + computed status, /history returns GPS trail for truck+date, /trips returns completed routes with pagination. Vehicle status utility supports 4 states including no-location.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build two-panel layout, vehicle sidebar, filter bar, and tabbed navigation UI</name>
  <files>
    apps/web/src/app/(owner)/live-map/page.tsx
    apps/web/src/app/(owner)/live-map/actions.ts
    apps/web/src/components/maps/live-map-wrapper.tsx
    apps/web/src/components/maps/live-map.tsx
    apps/web/src/components/maps/vehicle-marker.tsx
    apps/web/src/components/maps/vehicle-sidebar.tsx
    apps/web/src/components/maps/vehicle-filter-bar.tsx
    apps/web/src/components/maps/live-map-tabs.tsx
    apps/web/src/components/maps/history-tab.tsx
    apps/web/src/components/maps/trips-tab.tsx
  </files>
  <action>
**2a. Create `apps/web/src/components/maps/vehicle-sidebar.tsx` (client component):**

Props: `vehicles: VehicleLocation[]`, `onVehicleClick: (vehicle: VehicleLocation) => void`, `selectedVehicleId: string | null`.

Two sort options: "Status" (default) and "Unit #" (by licensePlate alphabetically). Use `useState` for sort mode, sort client-side.

Status sort priority: moving > idle > offline > no-location.

Each row renders:
- License plate as primary identifier (bold) — since original Truck model has no unitNumber
- `{truck.year} {truck.make} {truck.model}` as secondary text
- Driver name or "Unassigned" (muted text)
- Status dot (colored circle using STATUS_COLORS from vehicle-status.ts) + status label from STATUS_LABELS
- "Last seen" relative time (e.g., "2 min ago", "3 hours ago") — show "Never" if timestamp is null

Highlight selected row with `bg-accent`. Use Tailwind `overflow-y-auto` for scrolling.

Width: `w-80` (320px). Full height of parent.

**2b. Create `apps/web/src/components/maps/vehicle-filter-bar.tsx` (client component):**

Props: `vehicles: VehicleLocation[]`, `onFilteredChange: (filtered: VehicleLocation[]) => void`.

Filters (all client-side, no API calls):
- **Vehicles** multi-select: dropdown with checkboxes, list all truck licensePlates. Use shadcn Popover + Command for searchable multi-select.
- **Drivers** multi-select: dropdown with checkboxes, list all unique driver names. Use same Popover+Command pattern.
- **Status** multi-select: checkboxes for Moving, Idle, Offline, No Location.
- **Has Dispatch** toggle: filter to only trucks with driver assigned (driver !== null).

Show active filter count badge (e.g., "3 active"). "Clear All" button resets all filters.

When any filter changes, compute filtered list from `vehicles` prop and call `onFilteredChange(filtered)`. Use `useEffect` with dependencies on filter state + vehicles.

**2c. Create `apps/web/src/components/maps/history-tab.tsx` (client component):**

Props: `orgTrucks: Array<{ truckId: string; licensePlate: string; make: string; model: string }>` (passed from parent).

State: `selectedTruckId`, `selectedDate` (default: today), `points: Array<{lat,lng,speed,timestamp}>`, `loading`.

UI:
- Top bar: truck selector (shadcn Select with licensePlate + make model), date picker (shadcn DatePicker or `<input type="date">`).
- When both truck and date are selected, fetch `GET /api/v1/carrier/live-map/history?truckId=X&date=YYYY-MM-DD`.
- Pass points to a `Polyline` rendered via callback/state lift (the parent LiveMap will render the polyline). Use the same speed-color segment logic from existing `route-history-layer.tsx` — extract `groupIntoSegments` and `getSpeedColor` into a shared util or duplicate in this component.
- Also render start marker (green) and end marker (red) at first and last points.
- Below the map area (or overlaid), show a simple timeline strip: horizontal bar showing the time range with start time on left, end time on right, and total point count.
- Show "No GPS data for this date" empty state.

Communicate points to parent via callback: `onHistoryPoints: (points: LatLng[]) => void` and `onHistorySegments: (segments: RouteSegment[]) => void`.

**2d. Create `apps/web/src/components/maps/trips-tab.tsx` (client component):**

Props: `onViewTrip: (truckId: string, date: string) => void` (switches to History tab with pre-filled truck+date).

Fetches `GET /api/v1/carrier/live-map/trips?page=1&pageSize=25` on mount.

Renders a table (use shadcn Table):
- Columns: Route Name, Origin, Destination, Driver, Truck, Scheduled Date, Completed Date, Miles
- Click row: calls `onViewTrip(trip.truck.id, trip.completedAt date formatted as YYYY-MM-DD)`.
- Pagination at bottom if total > pageSize.

Show loading skeleton while fetching. Show "No completed trips" empty state.

**2e. Create `apps/web/src/components/maps/live-map-tabs.tsx` (client component):**

Props: `activeTab: 'live' | 'history' | 'trips'`, `onTabChange: (tab) => void`, `truckSummary: Array<{truckId, licensePlate, make, model}>`.

Renders 3 tab buttons (use shadcn Tabs component). The content below depends on the active tab:
- Live: renders nothing (the map + sidebar are already shown by the parent)
- History: renders `<HistoryTab />`
- Trips: renders `<TripsTab />`

**2f. Rewrite `apps/web/src/components/maps/live-map-wrapper.tsx`:**

This is the main orchestrator. Replace existing implementation.

State:
- `vehicles` (from polling /vehicles endpoint — NOT the old /api/gps/locations)
- `filteredVehicles` (after client-side filtering)
- `activeTab` ('live' | 'history' | 'trips')
- `selectedVehicleId`
- `historyData` (points + segments for History tab overlay)
- `sidebarOpen` (for mobile toggle, default true on desktop)

Polling: 30s interval, ONLY when `activeTab === 'live'`. Fetch from `/api/v1/carrier/live-map/vehicles`. On tab change away from Live, stop polling. On tab change to Live, restart polling and do immediate fetch.

Change the initial data loading: the page.tsx server component will still do initial SSR fetch, but the wrapper will poll the new `/api/v1/carrier/live-map/vehicles` endpoint instead of `/api/gps/locations`.

Layout:
```
<div className="h-full flex">
  {/* Mobile toggle button */}
  <button className="md:hidden fixed z-50 ..." onClick={toggleSidebar}>
    <PanelLeftOpen / PanelLeftClose icon />
  </button>

  {/* Left sidebar — 320px fixed */}
  <div className={cn("w-80 border-r flex flex-col shrink-0", !sidebarOpen && "hidden md:flex")}>
    <LiveMapTabs activeTab={activeTab} onTabChange={setActiveTab} ... />
    
    {activeTab === 'live' && (
      <>
        <VehicleFilterBar vehicles={vehicles} onFilteredChange={setFilteredVehicles} />
        <VehicleSidebar vehicles={filteredVehicles} onVehicleClick={handleFlyTo} selectedVehicleId={selectedVehicleId} />
      </>
    )}
    
    {activeTab === 'history' && <HistoryTab ... />}
    {activeTab === 'trips' && <TripsTab ... />}
  </div>

  {/* Right panel — map fills remaining width */}
  <div className="flex-1 min-w-0 relative">
    <LiveMapDynamic vehicles={vehiclesForMap} ... />
    <p className="text-xs ...">Last updated {secondsAgo}s ago</p>
  </div>
</div>
```

`handleFlyTo` callback: sets `selectedVehicleId` and passes coordinates to `LiveMapDynamic` via a new `flyToTarget` prop.

`vehiclesForMap`: filter out vehicles with `status === 'no-location'` (null lat/lng) so they are NOT rendered as markers. They still show in the sidebar with grey badge.

When `onViewTrip` is called from TripsTab, switch `activeTab` to 'history' and pre-fill the truck+date in HistoryTab via state.

**2g. Update `apps/web/src/components/maps/live-map.tsx`:**

Accept new props:
- `flyToTarget: { lat: number; lng: number } | null` — when set, call `map.flyTo([lat, lng], 14)` via a useEffect.
- `historySegments: RouteSegment[] | null` — when set (History tab active), render polyline segments instead of vehicle markers. Show start/end markers.

Keep existing MapContainer, TileLayer, MarkerClusterGroup, FitBoundsOnMount. The vehicle markers should only render when `historySegments` is null (i.e., Live tab).

**2h. Update `apps/web/src/components/maps/vehicle-marker.tsx`:**

Import updated VehicleLocation type. Handle the case where `speed` is null and `timestamp` is null (skip rendering — this shouldn't happen since we filter no-location vehicles from the map, but be defensive).

Add driver name to the Popup if available:
```
{vehicle.driver && (
  <div className="text-sm">Driver: {vehicle.driver.name}</div>
)}
```

**2i. Update `apps/web/src/app/(owner)/live-map/page.tsx`:**

Simplify: the page still does SSR initial fetch via the server action (keep `getLatestVehicleLocations` for SSR), passes `initialVehicles` to `LiveMapWrapper`. Remove the TagFilter and header — the header/legend moves inside the wrapper's sidebar area.

The wrapper handles all tab switching, sidebar, filters, and polling. The page is just:
```tsx
export default async function LiveMapPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const vehicles = await getLatestVehicleLocations().catch(() => []);
  return (
    <div className="h-[calc(100vh-8rem)]">
      <LiveMapWrapper initialVehicles={vehicles} />
    </div>
  );
}
```

Remove `searchParams` handling (tags filter is removed in favor of the new filter bar).

**2j. Update `apps/web/src/app/(owner)/live-map/actions.ts`:**

Update `getLatestVehicleLocations` to return the enriched VehicleLocation type (with driver, status, nullable lat/lng). Use the same SQL pattern as the /vehicles API route. The action is used for SSR initial render; the API route is used for client-side polling.

Add driver lookup (same two-query approach as the API route). Compute status server-side.

Note: keep `getVehicleRouteHistory` and `getVehicleDiagnostics` as-is — they're still used by RouteHistoryLayer and VehicleDetailsSheet.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` — no type errors.
Run `npm run build` from project root to verify the build succeeds.
Open the live map page in browser — verify two-panel layout renders, sidebar shows trucks, tabs switch, clicking a truck flies the map.
  </verify>
  <done>
Two-panel layout with 320px sidebar and map. Vehicle sidebar lists all trucks with status dots, driver names, last seen times, and click-to-fly. Filter bar filters vehicles client-side by vehicle, driver, status, and dispatch toggle. Three tabs (Live/History/Trips) all functional with real data. History tab shows GPS trail with date picker and truck selector. Trips tab shows completed routes table with click-to-view-history. 30s polling only on Live tab. Trucks with no GPS data show grey badge in sidebar but no map marker.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors from apps/web
2. All 3 API endpoints return real data (not mocks) when called with valid auth:
   - `curl /api/v1/carrier/live-map/vehicles` returns trucks with GPS + driver + status
   - `curl /api/v1/carrier/live-map/history?truckId=X&date=2026-04-14` returns GPS points array
   - `curl /api/v1/carrier/live-map/trips` returns completed routes with pagination
3. All endpoints return 401 without auth and scope queries to session.tenantId
4. Live map page renders with two-panel layout (sidebar + map)
5. Sidebar vehicle list shows real trucks from database
6. Clicking a vehicle in sidebar flies the map to that location
7. Filter bar filters vehicles client-side (no network requests on filter change)
8. History tab fetches and renders GPS polyline for selected truck + date
9. Trips tab shows completed routes table, clicking a row navigates to History tab
10. Trucks with no GPS data appear in sidebar with grey "No Location" badge but NOT as map markers
11. 30-second polling is active on Live tab only, stops on History/Trips tabs
</verification>

<success_criteria>
- All 7 features fully functional with real database data
- Zero mock data or hardcoded arrays anywhere
- Tenant isolation enforced on all 3 new endpoints
- TypeScript compiles without errors
- No new npm packages required (uses existing Leaflet, react-leaflet, shadcn/ui)
</success_criteria>

<output>
After completion, create `.planning/quick/218-upgrade-live-fleet-map-fully-functional-/218-SUMMARY.md`
</output>
