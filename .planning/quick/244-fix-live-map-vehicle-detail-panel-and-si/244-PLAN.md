---
phase: quick-244
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
  - apps/web/src/app/(owner)/live-map/actions.ts
autonomous: true
must_haves:
  truths:
    - "Clicking a carrier truck marker/sidebar row opens the detail panel with truck info, GPS, engine state, and active dispatch"
    - "Sidebar shows dispatch name, stop count, and next stop for carrier trucks with in_progress dispatches"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts"
      provides: "Carrier truck dispatch context in VehicleLocation.dispatch"
      contains: "dispatch_number"
    - path: "apps/web/src/app/(owner)/live-map/actions.ts"
      provides: "Carrier truck diagnostics fallback in getVehicleDiagnostics"
      contains: "carrier_trucks"
  key_links:
    - from: "vehicle-details-sheet.tsx"
      to: "actions.ts getVehicleDiagnostics"
      via: "server action call with carrier truckId"
      pattern: "carrier_trucks"
    - from: "vehicle-sidebar.tsx"
      to: "/api/v1/carrier/live-map/vehicles"
      via: "vehicle.dispatch object"
      pattern: "dispatch.*routeName"
---

<objective>
Fix two bugs on the Live Fleet Map where carrier trucks (from `carrier_trucks` table) show broken data:
1. Vehicle detail panel shows "No data available" because `getVehicleDiagnostics()` only queries the legacy `Truck` table
2. Sidebar shows "No active route" because the vehicles API endpoint hardcodes `dispatch: null` for carrier trucks

Purpose: Carrier trucks are the primary truck type now (carrier operations). Both bugs make the live map useless for carrier fleet monitoring.
Output: Both files patched so carrier trucks display diagnostics and dispatch context correctly.
</objective>

<context>
@apps/web/src/app/(owner)/live-map/actions.ts
@apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
@apps/web/src/lib/maps/map-utils.ts
@apps/web/src/components/vehicle/vehicle-details-sheet.tsx
@apps/web/src/components/maps/vehicle-sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add carrier truck dispatch context to live-map vehicles API</name>
  <files>apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts</files>
  <action>
After Step 2b (carrier driver query, around line 335), add a new step that queries dispatch context for carrier trucks, mirroring how Step 3.5 works for legacy trucks.

Add new interface at top of file:
```typescript
interface CarrierDispatchRow {
  truckId: string;
  dispatchId: string;
  notes: string | null;
  status: string;
}

interface CarrierStopCountRow {
  dispatchId: string;
  stopCount: number;
}

interface CarrierNextStopRow {
  dispatchId: string;
  nextStopName: string;
}
```

After the carrier driver map is built (~line 335), add a new query block:

1. Query `dispatches` for carrier trucks with status `in_progress` or `planned`:
   ```sql
   SELECT d.id AS "dispatchId", d.truck_id AS "truckId", d.notes, d.status
   FROM dispatches d
   WHERE d.org_id = ${orgId}::uuid
     AND d.status IN ('planned', 'in_progress')
     AND d.truck_id = ANY(${carrierTruckIds}::uuid[])
   ```

2. Build a `carrierDispatchMap` (Map<string, { dispatchId: string; dispatchNumber: string }>). Extract the dispatch number from `notes` using regex: `/\[DISPATCH_NUMBER=([^\]]+)\]/`. If no match, use `Dispatch` as fallback name.

3. Gather stop counts per dispatch:
   ```sql
   SELECT s.dispatch_id AS "dispatchId", COUNT(*)::int AS "stopCount"
   FROM stops s
   WHERE s.dispatch_id = ANY(${activeDispatchIds}::uuid[])
   GROUP BY s.dispatch_id
   ```

4. Gather next pending stop per dispatch (first pending by sequence_order), joining `carrier_facilities` for name:
   ```sql
   SELECT DISTINCT ON (s.dispatch_id)
     s.dispatch_id AS "dispatchId",
     COALESCE(f.name, f.city || ', ' || f.state, 'Unknown') AS "nextStopName"
   FROM stops s
   LEFT JOIN carrier_facilities f ON s.facility_id = f.id
   WHERE s.dispatch_id = ANY(${activeDispatchIds}::uuid[])
     AND s.status = 'pending'
   ORDER BY s.dispatch_id, s.sequence_order ASC
   ```

5. In the `carrierVehicles` map (Step 4b, ~line 338), replace `dispatch: null` with:
   ```typescript
   const carrierDisp = carrierDispatchMap.get(row.truckId);
   const dispatch = carrierDisp
     ? {
         routeName: carrierDisp.dispatchNumber,
         loadCount: carrierStopCountMap.get(carrierDisp.dispatchId) ?? 0,
         nextStopAddress: carrierNextStopMap.get(carrierDisp.dispatchId) ?? null,
       }
     : null;
   ```

Guard all new queries with `if (carrierTruckIds.length > 0)` to avoid empty array queries. The `VehicleDispatch` interface (routeName, loadCount, nextStopAddress) is reused as-is -- `routeName` will hold the dispatch number (e.g., "DC-2026-00004"), `loadCount` will hold the stop count, and `nextStopAddress` will hold the next facility name.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` to confirm no type errors. Then verify the API returns dispatch data:
```bash
curl -s http://localhost:3000/api/v1/carrier/live-map/vehicles | jq '.data[] | select(.dispatch != null) | {truckId, dispatch}'
```
  </verify>
  <done>Carrier trucks in the sidebar show dispatch number, stop count, and next stop instead of "No active route" when they have an active dispatch.</done>
</task>

<task type="auto">
  <name>Task 2: Fix getVehicleDiagnostics to handle carrier trucks</name>
  <files>apps/web/src/app/(owner)/live-map/actions.ts</files>
  <action>
In `getVehicleDiagnostics()` (line 188), after the existing `Promise.all` block that queries `db.truck.findUnique` (line 201-255), add a carrier truck fallback when `truck` is `null`.

After line 257 (`if (!truck) { return null; }`), replace that block with:

```typescript
if (!truck) {
  // Fallback: try carrier_trucks table
  return getCarrierTruckDiagnostics(truckId, tenantId, db);
}
```

Add a new private async function `getCarrierTruckDiagnostics(truckId: string, tenantId: string, db: any)` below `getVehicleDiagnostics`. This function:

1. Query `carrier_trucks` via raw SQL (since it's a snake_case table not in the Prisma client as a standard model):
   ```typescript
   const carrierTruckRows = await db.$queryRaw`
     SELECT ct.unit_number, ct.make, ct.model, ct.year, ct.license_plate, ct.vin
     FROM carrier_trucks ct
     WHERE ct.id = ${truckId}::uuid AND ct.org_id = ${tenantId}::uuid
   `;
   ```
   If no rows, return null.

2. Query latest GPSLocation where `carrierTruckId = truckId`:
   ```typescript
   const latestGPS = await db.gPSLocation.findFirst({
     where: { carrierTruckId: truckId },
     orderBy: { timestamp: 'desc' },
     select: { latitude: true, longitude: true, speed: true, heading: true, timestamp: true },
   });
   ```

3. Query active dispatch from `dispatches` table via raw SQL:
   ```typescript
   const dispatchRows = await db.$queryRaw`
     SELECT d.id, d.notes, d.status, d.scheduled_departure, d.planned_miles
     FROM dispatches d
     WHERE d.truck_id = ${truckId}::uuid
       AND d.org_id = ${tenantId}::uuid
       AND d.status IN ('planned', 'in_progress')
     ORDER BY d.scheduled_departure DESC
     LIMIT 1
   `;
   ```

4. If dispatch found, query assigned driver:
   ```typescript
   const driverRows = await db.$queryRaw`
     SELECT u."firstName", u."lastName"
     FROM dispatches d
     JOIN carrier_drivers cd ON d.primary_driver_id = cd.id
     JOIN "User" u ON cd.user_id = u.id
     WHERE d.id = ${dispatchId}::uuid
   `;
   ```

5. Extract dispatch number from `notes` using regex `/\[DISPATCH_NUMBER=([^\]]+)\]/`.

6. Return the same shape as the legacy function but adapted for carrier data:
   ```typescript
   return {
     truck: {
       make: ct.make ?? 'Unknown',
       model: ct.model ?? '',
       year: ct.year ?? 0,
       licensePlate: ct.license_plate ?? ct.unit_number,
       odometer: 0, // carrier_trucks doesn't track odometer
     },
     latestGPS: latestGPS ? {
       latitude: Number(latestGPS.latitude),
       longitude: Number(latestGPS.longitude),
       speed: latestGPS.speed,
       heading: latestGPS.heading,
       timestamp: latestGPS.timestamp,
     } : null,
     latestFuel: null, // No fuel records for carrier trucks
     engineState, // Derive from GPS speed same as legacy
     estimatedFuelLevel: 50, // Default, no fuel data
     activeLoad: dispatch ? {
       id: dispatch.id,
       loadNumber: dispatchNumber,
       origin: 'Dispatch', // Will be overridden if stops are queried later
       destination: dispatch.status,
       status: dispatch.status,
       pickupDate: dispatch.scheduled_departure,
       deliveryDate: null,
       driverName,
     } : null,
   };
   ```

Use `tenantRawQuery` instead of `db.$queryRaw` for carrier queries to maintain RLS context. Import it at the top if not already imported (it IS already imported on line 5).

Important: The `DiagnosticsData` interface in `vehicle-details-sheet.tsx` expects `truck.odometer` as a number. Set it to `0` for carrier trucks. The component handles `activeLoad: null` gracefully, so if no dispatch exists it will just not show the active load section.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web`. Then test by opening the live map and clicking a carrier truck marker -- the detail panel should show truck info (make, model, year, unit number as plate) and GPS data instead of "No data available".
  </verify>
  <done>Clicking a carrier truck on the live map opens the detail panel with truck info, GPS location, engine state, and active dispatch info instead of showing "No data available".</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with no errors
2. Live map sidebar shows dispatch number and stop info for carrier trucks with active dispatches
3. Clicking a carrier truck marker opens the detail sheet with truck diagnostics (not "No data available")
4. Legacy trucks continue to work exactly as before (no regression)
</verification>

<success_criteria>
- Carrier trucks show dispatch context in sidebar (dispatch number, stop count, next stop)
- Carrier truck detail panel shows truck info, GPS, engine state, and active dispatch
- Legacy Truck table vehicles are completely unaffected
- TypeScript compiles cleanly
</success_criteria>
