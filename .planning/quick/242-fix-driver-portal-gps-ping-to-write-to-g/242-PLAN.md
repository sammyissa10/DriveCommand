---
phase: quick-242
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260417100001_gpslocation_carrier_truck_fk/migration.sql
  - apps/web/prisma/schema.prisma
  - apps/web/src/app/api/driver/gps-ping/route.ts
  - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
autonomous: true
must_haves:
  truths:
    - "Driver GPS ping from web portal writes a GPSLocation row with carrierTruckId set"
    - "Owner live map shows carrier trucks with their latest GPS coordinates"
    - "Legacy Truck GPS pings continue working unchanged (truckId still accepted)"
  artifacts:
    - path: "apps/web/prisma/migrations/20260417100001_gpslocation_carrier_truck_fk/migration.sql"
      provides: "carrierTruckId nullable FK column on GPSLocation, truckId made nullable, indexes"
    - path: "apps/web/prisma/schema.prisma"
      provides: "GPSLocation model with optional carrierTruckId + CarrierTruck reverse relation"
    - path: "apps/web/src/app/api/driver/gps-ping/route.ts"
      provides: "Actual GPSLocation.create call when carrierTruckId is resolved"
    - path: "apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts"
      provides: "Carrier trucks included in live map vehicle list with GPS data"
  key_links:
    - from: "apps/web/src/app/api/driver/gps-ping/route.ts"
      to: "GPSLocation table"
      via: "prisma.gPSLocation.create with carrierTruckId"
      pattern: "gPSLocation\\.create"
    - from: "apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts"
      to: "GPSLocation table"
      via: "LEFT JOIN LATERAL on carrierTruckId"
      pattern: "carrierTruckId"
---

<objective>
Fix driver portal GPS ping to actually persist coordinates to GPSLocation for carrier trucks, and update the live map vehicles endpoint to display carrier trucks with their GPS data.

Purpose: Currently GPS pings from carrier-ops drivers are logged but never saved, so carrier trucks never appear on the live map. This bridges the gap between the carrier_trucks table and GPSLocation.
Output: Working GPS persistence for carrier trucks + live map showing carrier trucks.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (GPSLocation model at line ~456, CarrierTruck model at line ~1404)
@apps/web/src/app/api/driver/gps-ping/route.ts
@apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
@apps/web/src/lib/maps/map-utils.ts (VehicleLocation interface)
@apps/web/src/lib/context/tenant-context.ts (tenantRawQuery)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add carrierTruckId FK to GPSLocation schema + migration</name>
  <files>
    apps/web/prisma/migrations/20260417100001_gpslocation_carrier_truck_fk/migration.sql
    apps/web/prisma/schema.prisma
  </files>
  <action>
1. Create migration file `apps/web/prisma/migrations/20260417100001_gpslocation_carrier_truck_fk/migration.sql`:

```sql
-- Add carrier_truck_id nullable FK to GPSLocation
ALTER TABLE "GPSLocation"
  ADD COLUMN "carrierTruckId" UUID REFERENCES "carrier_trucks"(id) ON DELETE CASCADE;

-- Make truckId nullable (carrier pings have no legacy truck)
ALTER TABLE "GPSLocation"
  ALTER COLUMN "truckId" DROP NOT NULL;

-- Indexes for carrier truck GPS lookups
CREATE INDEX "GPSLocation_carrierTruckId_idx" ON "GPSLocation"("carrierTruckId");
CREATE INDEX "GPSLocation_carrierTruckId_timestamp_idx" ON "GPSLocation"("carrierTruckId", "timestamp");
```

2. Update `apps/web/prisma/schema.prisma` GPSLocation model (around line 456):
   - Change `truckId String @db.Uuid` to `truckId String? @db.Uuid` (nullable)
   - Add field: `carrierTruckId String? @db.Uuid`
   - Add relation: `carrierTruck CarrierTruck? @relation(fields: [carrierTruckId], references: [id], onDelete: Cascade)`
   - Change existing truck relation to optional: `truck Truck? @relation(fields: [truckId], references: [id])`
   - Add indexes: `@@index([carrierTruckId])` and `@@index([carrierTruckId, timestamp])`

3. Update CarrierTruck model (around line 1404) to add reverse relation:
   - Add `gpsLocations GPSLocation[]` after the existing relation fields (before the `@@index` lines)

4. Run `npx prisma generate` from `apps/web/` to regenerate the Prisma client.
  </action>
  <verify>
    Run `cd apps/web && npx prisma generate` — must succeed with no errors.
    Run `cd apps/web && npx prisma migrate deploy` — migration must apply cleanly.
    Run `cd apps/web && npx tsc --noEmit` — no type errors from schema changes.
  </verify>
  <done>
    GPSLocation table has nullable carrierTruckId FK column, truckId is nullable, both indexed. Prisma client regenerated with updated types.
  </done>
</task>

<task type="auto">
  <name>Task 2: Write GPS pings to GPSLocation for carrier trucks</name>
  <files>apps/web/src/app/api/driver/gps-ping/route.ts</files>
  <action>
In `apps/web/src/app/api/driver/gps-ping/route.ts`:

1. Remove the file-level NOTE/TODO comment block (lines 13-19) about not being able to write to GPSLocation.

2. Replace the logging-only section (lines 93-103, the comment "6. Log GPS coordinates..." and `logger.info`) with actual GPS persistence. Keep the logger.info call for observability but ADD a `prisma.gPSLocation.create` call:

```typescript
// 6. Persist GPS coordinates
if (carrierTruckId) {
  await prisma.gPSLocation.create({
    data: {
      tenantId,
      carrierTruckId,
      latitude: lat,
      longitude: lng,
      accuracy: accuracy ?? null,
      timestamp: new Date(),
    },
  });
}

logger.info('driver-gps-ping', {
  driverId: userId,
  lat,
  lng,
  accuracy,
  dispatchId,
  carrierTruckId,
  orgId: tenantId,
  source: 'web_driver_portal',
  persisted: !!carrierTruckId,
});
```

3. Update the file-level JSDoc comment to reflect that GPS pings are now persisted to GPSLocation with carrierTruckId when the driver has an active carrier dispatch.

4. The existing `bypass_rls` transaction for resolving carrierTruckId stays as-is. The `prisma.gPSLocation.create` call uses the top-level prisma client (NOT inside the bypass_rls transaction) since GPSLocation does not have RLS policies — it uses tenantId in the data directly.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep the file for "TODO" — should find none related to GPSLocation.
    Grep for `gPSLocation.create` — should find the new create call.
  </verify>
  <done>
    Driver GPS pings persist a GPSLocation row with carrierTruckId when driver has an active carrier dispatch. Logger still fires for observability. No TODO comments remain.
  </done>
</task>

<task type="auto">
  <name>Task 3: Show carrier trucks on live map with GPS data</name>
  <files>apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts</files>
  <action>
In `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts`:

1. Add a new interface `CarrierTruckRow` alongside existing `TruckRow`:

```typescript
interface CarrierTruckRow {
  truckId: string;
  unitNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  licensePlate: string | null;
  gpsId: string | null;
  latitude: unknown;
  longitude: unknown;
  speed: number | null;
  heading: number | null;
  timestamp: Date | null;
}

interface CarrierDriverRow {
  truckId: string;
  firstName: string;
  lastName: string;
}
```

2. After Step 1 (legacy truck query, around line 95), add a Step 1b query for carrier trucks with latest GPS:

```typescript
// Step 1b: Fetch carrier trucks with their latest GPS ping
const carrierTruckRows = (await tenantRawQuery((tx) =>
  tx.$queryRaw`
    SELECT
      ct.id AS "truckId",
      ct.unit_number AS "unitNumber",
      ct.make,
      ct.model,
      ct.year,
      ct.vin,
      ct.license_plate AS "licensePlate",
      gps.id AS "gpsId",
      gps.latitude,
      gps.longitude,
      gps.speed,
      gps.heading,
      gps.timestamp
    FROM carrier_trucks ct
    LEFT JOIN LATERAL (
      SELECT g.id, g.latitude, g.longitude, g.speed, g.heading, g.timestamp
      FROM "GPSLocation" g
      WHERE g."carrierTruckId" = ct.id
      ORDER BY g.timestamp DESC
      LIMIT 1
    ) gps ON TRUE
    WHERE ct.org_id = ${orgId}::uuid
      AND ct.status = 'active'
    ORDER BY ct.license_plate ASC
  `
)) as CarrierTruckRow[];
```

3. If carrier trucks exist, query their assigned drivers from active dispatches:

```typescript
const carrierTruckIds = carrierTruckRows.map((r) => r.truckId);

// Step 2b: Find carrier truck drivers from active dispatches
const carrierDriverMap = new Map<string, string>();
if (carrierTruckIds.length > 0) {
  const carrierDriverRows = (await tenantRawQuery((tx) =>
    tx.$queryRaw`
      SELECT cd.truck_id AS "truckId", u."firstName", u."lastName"
      FROM dispatches cd
      JOIN carrier_drivers cdr ON cd.primary_driver_id = cdr.id
      JOIN "User" u ON cdr.user_id = u.id
      WHERE cd.org_id = ${orgId}::uuid
        AND cd.status IN ('planned', 'in_progress')
        AND cd.truck_id = ANY(${carrierTruckIds}::uuid[])
    `
  )) as CarrierDriverRow[];

  for (const row of carrierDriverRows) {
    if (!carrierDriverMap.has(row.truckId)) {
      carrierDriverMap.set(row.truckId, `${row.firstName} ${row.lastName}`);
    }
  }
}
```

4. After the existing `vehicles` mapping (Step 4), map carrier trucks to VehicleLocation and concat:

```typescript
// Step 4b: Map carrier trucks to VehicleLocation and merge
const carrierVehicles: VehicleLocation[] = carrierTruckRows.map((row) => {
  const lat = row.latitude != null ? Number(row.latitude) : null;
  const lng = row.longitude != null ? Number(row.longitude) : null;
  const spd = row.speed != null ? Number(row.speed) : null;
  const hdg = row.heading != null ? Number(row.heading) : null;
  const ts = row.timestamp ?? null;
  const driverName = carrierDriverMap.get(row.truckId) ?? null;
  const status = getVehicleStatus(spd, ts ? new Date(ts) : null);

  return {
    id: row.gpsId ?? row.truckId,
    truckId: row.truckId,
    latitude: lat,
    longitude: lng,
    speed: spd,
    heading: hdg,
    timestamp: ts,
    truck: {
      make: row.make ?? 'Unknown',
      model: row.model ?? '',
      licensePlate: row.licensePlate ?? row.unitNumber,
      year: row.year ?? 0,
      vin: row.vin ?? '',
    },
    driver: driverName ? { name: driverName } : null,
    status,
    dispatch: null, // Carrier dispatches use different structure; omit for now
  };
});

const allVehicles = [...vehicles, ...carrierVehicles];
```

5. Update the return statement to use `allVehicles` instead of `vehicles`:
```typescript
return NextResponse.json({ data: allVehicles });
```

6. Update the early return for empty results — remove the `truckRows.length === 0` early return (line 97-99) since carrier trucks may still exist. Instead, let both queries run and return empty if both are empty.

Important: The `tenantRawQuery` uses `set_config('app.current_tenant_id', ...)` which enables RLS. The carrier_trucks table uses `org_id` but the RLS policy checks `current_tenant_id = org_id`, so this works correctly within `tenantRawQuery`. Use `${orgId}::uuid` in the WHERE clause as belt-and-suspenders.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep file for `carrierTruckRows` — confirms carrier truck query added.
    Grep file for `allVehicles` — confirms merged array used in response.
  </verify>
  <done>
    Live map vehicles endpoint returns both legacy trucks and carrier trucks. Carrier trucks show their latest GPS ping from GPSLocation.carrierTruckId. Carrier truck drivers resolved from active dispatches. Legacy truck display completely unchanged.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. GPSLocation table has nullable carrierTruckId column with FK to carrier_trucks
3. GPSLocation table has nullable truckId (was NOT NULL)
4. `POST /api/driver/gps-ping` creates GPSLocation row when carrierTruckId resolved
5. `GET /api/v1/carrier/live-map/vehicles` returns carrier trucks alongside legacy trucks
6. No TODO comments remain in gps-ping/route.ts about GPSLocation
</verification>

<success_criteria>
- Driver opens web portal dashboard, browser geolocation fires, GPSLocation row created with carrierTruckId set and truckId null
- Owner opens live map, carrier truck appears as a vehicle marker with last known coordinates
- Legacy truck GPS display continues working identically (truckId-based pings unaffected)
- TypeScript compiles cleanly across the entire web app
</success_criteria>

<output>
After completion, create `.planning/quick/242-fix-driver-portal-gps-ping-to-write-to-g/242-SUMMARY.md`
</output>
