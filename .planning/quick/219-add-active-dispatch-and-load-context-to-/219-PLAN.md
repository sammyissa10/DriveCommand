---
phase: quick-219
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/maps/map-utils.ts
  - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
  - apps/web/src/components/maps/vehicle-sidebar.tsx
autonomous: true
must_haves:
  truths:
    - "Sidebar rows for trucks with an active route show the route name, load count, and next pending stop address"
    - "Sidebar rows for trucks without an active route show 'No active route' in muted text"
    - "All existing sidebar functionality (sort, click, status dot, timestamps) still works"
  artifacts:
    - path: "apps/web/src/lib/maps/map-utils.ts"
      provides: "Extended VehicleLocation type with dispatch context fields"
      contains: "dispatchName"
    - path: "apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts"
      provides: "Route + load count + next stop data in vehicle response"
      contains: "loadCount"
    - path: "apps/web/src/components/maps/vehicle-sidebar.tsx"
      provides: "Dispatch context rendered below driver name in sidebar rows"
      contains: "No active route"
  key_links:
    - from: "apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts"
      to: "Route + RouteStop + Load tables"
      via: "raw SQL JOIN"
      pattern: "RouteStop.*PENDING"
    - from: "apps/web/src/components/maps/vehicle-sidebar.tsx"
      to: "VehicleLocation.dispatch"
      via: "conditional render"
      pattern: "vehicle\\.dispatch"
---

<objective>
Add active route context (route name, load count, next pending stop) to the Live Fleet Map sidebar rows so dispatchers can see what each truck is doing without leaving the map.

Purpose: Operational awareness — dispatchers currently must click into individual trucks or leave the map to check route assignments.
Output: Updated API response and sidebar UI showing dispatch context per truck.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
@apps/web/src/components/maps/vehicle-sidebar.tsx
@apps/web/src/lib/maps/map-utils.ts
@apps/web/prisma/schema.prisma (Route, RouteStop, Load models)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend VehicleLocation type and API to include route context</name>
  <files>
    apps/web/src/lib/maps/map-utils.ts
    apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
  </files>
  <action>
1. In `apps/web/src/lib/maps/map-utils.ts`, extend the `VehicleLocation` interface to add an optional `dispatch` field:

```ts
dispatch: {
  routeName: string;      // Route.name or "Route: Origin > Destination" fallback
  loadCount: number;       // count of Load records with this routeId
  nextStopAddress: string | null; // address of first PENDING RouteStop by position, null if all stops completed
} | null;
```

2. In `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts`:

- Add a new interface `DispatchRow` with fields: `truckId`, `routeName` (nullable), `origin`, `destination`, `routeId`.

- After the existing driver queries (Step 3), add Step 3.5: query active routes for all trucks in a single query:

```sql
SELECT r.id AS "routeId", r."truckId", r.name AS "routeName", r.origin, r.destination
FROM "Route" r
WHERE r."tenantId" = ${orgId}::uuid
  AND r.status IN ('PLANNED', 'IN_PROGRESS')
  AND r."truckId" = ANY(${truckIds}::uuid[])
  AND r."scheduledDate"::date = CURRENT_DATE
```

- Build a `dispatchMap: Map<string, { routeId, routeName, origin, destination }>` from the results. For routeName, use `row.routeName ?? 'Route: ' + row.origin + ' > ' + row.destination` (truncate origin/destination to city only if they contain commas — split on comma, take first part).

- For each route in dispatchMap, gather load counts and next pending stop in two batch queries:

Load counts query:
```sql
SELECT l."routeId", COUNT(*)::int AS "loadCount"
FROM "Load" l
WHERE l."routeId" = ANY(${routeIds}::uuid[])
  AND l."tenantId" = ${orgId}::uuid
  AND l."archivedAt" IS NULL
GROUP BY l."routeId"
```

Next pending stop query:
```sql
SELECT DISTINCT ON (rs."routeId")
  rs."routeId", rs.address AS "nextStopAddress"
FROM "RouteStop" rs
WHERE rs."routeId" = ANY(${routeIds}::uuid[])
  AND rs."tenantId" = ${orgId}::uuid
  AND rs.status = 'PENDING'
ORDER BY rs."routeId", rs.position ASC
```

- Build the final dispatch data per truck and include it in the VehicleLocation mapping (Step 4). For trucks not in dispatchMap, set `dispatch: null`.

- Tenant isolation note: all queries already filter by `tenantId = orgId`. The RouteStop query also filters by tenantId directly.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web to confirm type safety. Manually curl the endpoint (or check via browser dev tools on the live map page) to confirm the response includes `dispatch` field on vehicle objects.
  </verify>
  <done>
The /api/v1/carrier/live-map/vehicles response includes a `dispatch` field on each vehicle: either `{ routeName, loadCount, nextStopAddress }` for trucks with an active route scheduled today, or `null` for trucks without one. All queries are tenant-scoped.
  </done>
</task>

<task type="auto">
  <name>Task 2: Render dispatch context in sidebar rows</name>
  <files>
    apps/web/src/components/maps/vehicle-sidebar.tsx
  </files>
  <action>
In `apps/web/src/components/maps/vehicle-sidebar.tsx`, add a dispatch context line between the driver row and the bottom of each vehicle button:

After the existing "Row bottom: driver + last seen" div (line ~121-130), add a new div:

```tsx
{/* Dispatch context */}
<div className="mt-1 text-xs truncate">
  {vehicle.dispatch ? (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {vehicle.dispatch.routeName}
        </span>
        <span className="text-muted-foreground">
          {vehicle.dispatch.loadCount} {vehicle.dispatch.loadCount === 1 ? 'load' : 'loads'}
        </span>
      </div>
      {vehicle.dispatch.nextStopAddress && (
        <span className="text-muted-foreground truncate">
          Next: {vehicle.dispatch.nextStopAddress}
        </span>
      )}
    </div>
  ) : (
    <span className="text-muted-foreground italic">No active route</span>
  )}
</div>
```

Key requirements:
- The route name badge uses `bg-primary/10 text-primary` for subtle emphasis
- Load count is plain muted text next to the badge
- Next stop address truncates with the existing `truncate` class
- "No active route" shown in muted italic for trucks without dispatch context
- Do NOT change the existing license plate, make/model, driver, or status elements
- Do NOT change the sort logic, click handler, or selection behavior
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web. Open the live fleet map page in the browser and verify sidebar rows show the dispatch context line.
  </verify>
  <done>
Sidebar rows show route name badge + load count + next stop for trucks with active routes. Trucks without active routes show "No active route" in muted italic. All existing sidebar functionality is preserved.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — no type errors
2. Open the live fleet map page — sidebar loads with vehicle data
3. Trucks with active routes (PLANNED or IN_PROGRESS, scheduled today) show route name badge, load count, and next pending stop address
4. Trucks without active routes show "No active route" in muted text
5. Existing features work: sort by status/unit, click to select, status dots, timestamps
</verification>

<success_criteria>
- API returns dispatch context (routeName, loadCount, nextStopAddress) for trucks with active routes
- API returns null dispatch for trucks without active routes
- Sidebar renders dispatch info as a second content block below driver name
- No TypeScript errors
- No regressions to existing sidebar functionality
</success_criteria>

<output>
After completion, create `.planning/quick/219-add-active-dispatch-and-load-context-to-/219-SUMMARY.md`
</output>
