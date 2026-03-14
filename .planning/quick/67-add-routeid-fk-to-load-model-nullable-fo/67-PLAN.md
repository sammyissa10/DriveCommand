---
phase: quick-67
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/validations/load.schemas.ts
  - src/app/(owner)/actions/loads.ts
  - src/components/loads/dispatch-modal.tsx
  - src/app/(owner)/loads/[id]/page.tsx
  - src/app/(driver)/actions/driver-load.ts
  - src/app/(driver)/actions/driver-routes.ts
  - src/app/(driver)/my-route/page.tsx
  - src/app/(driver)/my-load/page.tsx
  - src/app/(owner)/routes/[id]/page.tsx
  - src/app/(owner)/routes/[id]/route-page-client.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can optionally select a route when dispatching a load"
    - "Dispatched load stores routeId linking it to the selected route"
    - "Driver /my-route page shows loads linked via routeId (not driverId guessing)"
    - "Driver /my-load page shows linked route via routeId (not driverId guessing)"
    - "Owner route detail page shows a Loads on this Route section"
  artifacts:
    - path: "src/lib/validations/load.schemas.ts"
      provides: "dispatchLoadSchema with optional routeId"
      contains: "routeId"
    - path: "src/app/(owner)/actions/loads.ts"
      provides: "dispatchLoad saves routeId"
      contains: "routeId"
    - path: "src/components/loads/dispatch-modal.tsx"
      provides: "Optional route selector in dispatch form"
      contains: "routeId"
    - path: "src/app/(driver)/actions/driver-load.ts"
      provides: "getMyActiveLoad uses routeId for route lookup"
      contains: "routeId"
  key_links:
    - from: "src/components/loads/dispatch-modal.tsx"
      to: "src/app/(owner)/actions/loads.ts"
      via: "FormData routeId field"
      pattern: "routeId"
    - from: "src/app/(driver)/my-route/page.tsx"
      to: "src/app/(driver)/actions/driver-load.ts"
      via: "getMyActiveLoadSummary uses routeId"
      pattern: "routeId"
    - from: "src/app/(owner)/routes/[id]/page.tsx"
      to: "prisma.load.findMany"
      via: "query loads where routeId = route.id"
      pattern: "routeId.*id"
---

<objective>
Add explicit routeId foreign key linking between Load and Route, replacing fragile driverId-based guessing.

Purpose: The current cross-reference between loads and routes relies on matching driverId, which breaks when drivers are reassigned or have multiple loads/routes. An explicit routeId FK provides a reliable, direct link.

Output: Dispatch modal with optional route picker, driver portal queries using routeId, owner route detail showing linked loads.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma (Load model already has routeId nullable FK and Route relation — DB column already exists via prior db push)
@src/lib/validations/load.schemas.ts
@src/app/(owner)/actions/loads.ts (dispatchLoad server action)
@src/components/loads/dispatch-modal.tsx
@src/app/(owner)/loads/[id]/page.tsx (load detail page — renders DispatchModal when PENDING)
@src/app/(driver)/actions/driver-load.ts (getMyActiveLoad, getMyActiveLoadSummary)
@src/app/(driver)/actions/driver-routes.ts (getMyAssignedRoute, getMyAssignedRouteSummary)
@src/app/(driver)/my-route/page.tsx
@src/app/(driver)/my-load/page.tsx
@src/app/(owner)/routes/[id]/page.tsx (route detail server page)
@src/app/(owner)/routes/[id]/route-page-client.tsx (RoutePageClient component)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add routeId to dispatch flow and update driver portal queries</name>
  <files>
    src/lib/validations/load.schemas.ts
    src/app/(owner)/actions/loads.ts
    src/components/loads/dispatch-modal.tsx
    src/app/(owner)/loads/[id]/page.tsx
    src/app/(driver)/actions/driver-load.ts
    src/app/(driver)/actions/driver-routes.ts
    src/app/(driver)/my-route/page.tsx
    src/app/(driver)/my-load/page.tsx
  </files>
  <action>
    **Schema already done** — prisma/schema.prisma already has `routeId String? @db.Uuid` on Load model with `route Route? @relation(fields: [routeId], references: [id])`. The DB column already exists. No migration or db push needed.

    **1. Update dispatch validation schema** (`src/lib/validations/load.schemas.ts`):
    - Add `routeId` to `dispatchLoadSchema` as optional: `routeId: z.string().uuid().optional().or(z.literal(''))`

    **2. Update dispatchLoad server action** (`src/app/(owner)/actions/loads.ts`):
    - Extract `routeId` from formData alongside driverId/truckId: `routeId: (formData.get('routeId') as string) || undefined`
    - In the `prisma.load.update` data object, add `routeId: result.data.routeId || null` (convert empty string to null)

    **3. Update DispatchModal component** (`src/components/loads/dispatch-modal.tsx`):
    - Add `routes` to props interface: `routes: Array<{ id: string; name: string | null; origin: string; destination: string }>`
    - Add an optional `<select>` for Route between the Truck select and the submit buttons:
      ```
      <label>Route (Optional)</label>
      <select name="routeId">
        <option value="">No route</option>
        {routes.map(r => <option key={r.id} value={r.id}>{r.name ?? `${r.origin} -> ${r.destination}`}</option>)}
      </select>
      ```
    - This field is NOT required (no `required` attribute)

    **4. Update load detail page** (`src/app/(owner)/loads/[id]/page.tsx`):
    - When load.status === 'PENDING', also fetch active routes alongside drivers/trucks:
      ```
      const availableRoutes = await prisma.route.findMany({
        where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
        select: { id: true, name: true, origin: true, destination: true },
        orderBy: { scheduledDate: 'desc' },
      }).catch(() => []);
      ```
    - Pass `routes={availableRoutes}` to `<DispatchModal>`

    **5. Update driver-load actions** (`src/app/(driver)/actions/driver-load.ts`):
    - In `getMyActiveLoad`: Keep the existing driverId-based query as-is (the load IS assigned to the driver via driverId). But add `route` to the include to fetch the linked route:
      ```
      include: {
        customer: { select: { companyName: true } },
        route: { select: { id: true, name: true, origin: true, destination: true, status: true } },
      }
      ```
    - In `getMyActiveLoadSummary`: Add `routeId` to the select fields so the my-route page can use it for cross-referencing. Also add `route: { select: { id: true, name: true, origin: true, destination: true, status: true } }` to the query.

    **6. Update driver-routes actions** (`src/app/(driver)/actions/driver-routes.ts`):
    - In `getMyAssignedRoute`: Add `loads` to the include clause to fetch loads linked by routeId:
      ```
      loads: {
        where: { status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] } },
        select: { id: true, loadNumber: true, origin: true, destination: true, status: true },
        orderBy: { pickupDate: 'asc' },
      }
      ```
    - In `getMyAssignedRouteSummary`: Add a `_count: { select: { loads: true } }` or add `loads` count to give the cross-reference card info.

    **7. Update driver /my-route page** (`src/app/(driver)/my-route/page.tsx`):
    - Replace the single "Your Active Load" cross-reference card (which uses `getMyActiveLoadSummary` — driverId guessing) with a section that shows `route.loads` (from the updated `getMyAssignedRoute` include).
    - Remove the `getMyActiveLoadSummary()` call from the Promise.all.
    - Instead, use `route.loads` (already fetched in step 6) to render a "Loads on this Route" section:
      - If route.loads is empty, show "No loads linked to this route" empty state.
      - If route.loads has entries, show each as a card/row with loadNumber, origin->destination, status badge, and a Link to `/my-load`.
    - Keep the same visual style (border-l-4 border-l-blue-500 card pattern).

    **8. Update driver /my-load page** (`src/app/(driver)/my-load/page.tsx`):
    - Replace the `getMyAssignedRouteSummary()` call with using `load.route` from the updated `getMyActiveLoad` (step 5).
    - The "Your Active Route" cross-reference card currently uses `routeSummary` from `getMyAssignedRouteSummary` (driverId guessing). Instead, use `load.route` (the explicit routeId link).
    - If `load.route` is null, don't show the route card (load has no linked route).
    - If `load.route` exists, render the same card using `load.route.name`, `load.route.origin`, `load.route.destination`, `load.route.status`.
    - Remove the `getMyAssignedRouteSummary` import if no longer used.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors.
    Run `npx next build 2>&1 | tail -20` — build succeeds (or at minimum, no errors in modified files).
  </verify>
  <done>
    - dispatchLoadSchema accepts optional routeId
    - dispatchLoad action saves routeId to Load record
    - DispatchModal shows optional route dropdown
    - Load detail page passes available routes to DispatchModal
    - Driver /my-load uses load.route (routeId link) for route card instead of driverId guess
    - Driver /my-route uses route.loads (routeId link) for loads section instead of driverId guess
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Loads on this Route section to owner route detail page</name>
  <files>
    src/app/(owner)/routes/[id]/page.tsx
    src/app/(owner)/routes/[id]/route-page-client.tsx
  </files>
  <action>
    **1. Fetch linked loads in route detail server page** (`src/app/(owner)/routes/[id]/page.tsx`):
    - Add a `linkedLoads` fetch to the existing Promise.all block:
      ```
      prisma.load.findMany({
        where: { routeId: id },
        select: {
          id: true,
          loadNumber: true,
          origin: true,
          destination: true,
          status: true,
          rate: true,
          pickupDate: true,
          customer: { select: { companyName: true } },
        },
        orderBy: { pickupDate: 'asc' },
      }).catch(() => [])
      ```
    - Wait — this page uses `getRoute(id)` server action, not direct prisma. Need to import `getTenantPrisma` or add a new server action. Since the page already imports from multiple action files, create a simple inline fetch using `getTenantPrisma`:
      - Import `getTenantPrisma` (already used elsewhere in owner pages).
      - Add the linked loads fetch in a separate Promise.all entry.
    - Pass `linkedLoads` to `<RoutePageClient>`.

    **2. Update RoutePageClient** (`src/app/(owner)/routes/[id]/route-page-client.tsx`):
    - Add `linkedLoads` to the props interface:
      ```
      linkedLoads: Array<{
        id: string;
        loadNumber: string;
        origin: string;
        destination: string;
        status: string;
        rate: any;
        pickupDate: Date;
        customer: { companyName: string };
      }>;
      ```
    - In BOTH view mode and edit mode sections, add a "Loads on this Route" section after the Driver Assignments section:
      ```
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
          <Package className="h-5 w-5" />
          Loads on this Route
        </h2>
        {linkedLoads.length > 0 ? (
          <div className="divide-y divide-border">
            {linkedLoads.map(load => (
              <div key={load.id} className="flex items-center justify-between py-3 text-sm gap-4">
                <Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline">
                  #{load.loadNumber}
                </Link>
                <span className="text-muted-foreground">{load.customer.companyName}</span>
                <span className="text-muted-foreground">{load.origin} -> {load.destination}</span>
                <LoadStatusBadge status={load.status} />
                <span className="font-semibold ml-auto">
                  ${Number(load.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No loads linked to this route. Link loads by selecting this route when dispatching.</p>
        )}
      </div>
      ```
    - Import `Package` from lucide-react and `Link` from next/link (Link already imported, add Package).
    - Import `LoadStatusBadge` from `@/components/loads/load-status-badge`.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors.
    Run `npx next build 2>&1 | tail -20` — build succeeds.
  </verify>
  <done>
    - Owner route detail page shows "Loads on this Route" section in both view and edit modes
    - Each load row links to the load detail page
    - Empty state shown when no loads are linked
    - Section shows load number, customer, route, status badge, and rate
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npx next build` succeeds
3. Dispatch modal renders a Route (Optional) dropdown when viewing a PENDING load
4. Driver /my-route shows loads via route.loads (routeId), not driverId
5. Driver /my-load shows route via load.route (routeId), not driverId
6. Owner route detail shows linked loads section
</verification>

<success_criteria>
- Dispatch flow optionally saves routeId on Load
- Driver portal uses explicit routeId links instead of driverId guessing
- Owner route detail displays loads linked to the route
- All existing functionality preserved (backwards compatible — routeId is nullable)
- TypeScript compilation clean, build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/67-add-routeid-fk-to-load-model-nullable-fo/67-SUMMARY.md`
</output>
