---
phase: quick-247
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/live-map/history/route.ts
autonomous: true
must_haves:
  truths:
    - "History tab returns GPS trail when a carrier truck is selected"
    - "History tab continues to work for legacy Truck table vehicles"
    - "Speed values appear in history trail data (not all null)"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/live-map/history/route.ts"
      provides: "History endpoint that handles both Truck and CarrierTruck IDs"
  key_links:
    - from: "apps/web/src/components/maps/history-tab.tsx"
      to: "/api/v1/carrier/live-map/history"
      via: "fetch with truckId param"
      pattern: "live-map/history\\?truckId="
    - from: "apps/web/src/app/api/v1/carrier/live-map/history/route.ts"
      to: "GPSLocation"
      via: "Prisma findMany with truckId OR carrierTruckId"
      pattern: "gPSLocation\\.findMany"
---

<objective>
Fix the live map History tab so it returns GPS trail data for carrier trucks (not just legacy Truck table vehicles).

Purpose: The History tab dropdown includes carrier trucks (from the vehicles endpoint), but when one is selected, the history endpoint fails because it only checks the `Truck` table for ownership and only queries `GPSLocation.truckId` — carrier truck GPS data is stored under `GPSLocation.carrierTruckId`.

The gps-ping route already stores speed correctly. No changes needed there.

Output: Working history endpoint that handles both truck types.
</objective>

<context>
@apps/web/src/app/api/v1/carrier/live-map/history/route.ts
@apps/web/src/components/maps/history-tab.tsx
@apps/web/prisma/schema.prisma (GPSLocation model — has both truckId and carrierTruckId FKs)
@apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts (returns both Truck and CarrierTruck as unified VehicleLocation with truckId field)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix history endpoint to handle both Truck and CarrierTruck IDs</name>
  <files>apps/web/src/app/api/v1/carrier/live-map/history/route.ts</files>
  <action>
The history endpoint currently has two bugs:

**Bug 1 — Ownership check only queries Truck table (line 51-56):**
When a carrier truck ID is passed, `db.truck.findFirst({ where: { id: truckId } })` returns null and the endpoint returns 404. Fix by trying Truck first, then falling back to CarrierTruck:

```typescript
// Try legacy Truck table first
const truck = await db.truck.findFirst({
  where: { id: truckId, tenantId: orgId },
  select: { id: true },
});

let isCarrierTruck = false;
if (!truck) {
  // Try CarrierTruck table (uses orgId not tenantId)
  const carrierTruck = await db.carrierTruck.findFirst({
    where: { id: truckId, orgId },
    select: { id: true },
  });
  if (!carrierTruck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
  }
  isCarrierTruck = true;
}
```

**Bug 2 — GPS query uses wrong FK for carrier trucks (line 63-76):**
When the truck is a CarrierTruck, GPS data is stored with `carrierTruckId`, not `truckId`. Use the `isCarrierTruck` flag to build the correct where clause:

```typescript
const rawPoints = await db.gPSLocation.findMany({
  where: {
    ...(isCarrierTruck ? { carrierTruckId: truckId } : { truckId }),
    timestamp: { gte: startOfDay, lte: endOfDay },
  },
  orderBy: { timestamp: 'asc' },
  select: {
    latitude: true,
    longitude: true,
    speed: true,
    heading: true,
    timestamp: true,
  },
});
```

Keep everything else unchanged — the response mapping (latitude/longitude Number conversion) and the frontend (history-tab.tsx) are already correct.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web to confirm no TypeScript errors. Visually inspect the file to ensure both legacy Truck and CarrierTruck paths are handled.
  </verify>
  <done>
History endpoint returns GPS trail data for both legacy trucks (querying truckId FK) and carrier trucks (querying carrierTruckId FK). Returns 404 only when the ID matches neither table. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with no errors
- History endpoint handles carrier truck IDs (queries CarrierTruck table + carrierTruckId FK)
- History endpoint still handles legacy truck IDs (queries Truck table + truckId FK)
- No changes to history-tab.tsx or gps-ping route (both already correct)
</verification>

<success_criteria>
- Selecting a carrier truck in the History tab dropdown returns its GPS trail instead of 404
- Legacy truck history continues to work unchanged
- Speed values appear in trail data (already stored correctly by gps-ping)
</success_criteria>
