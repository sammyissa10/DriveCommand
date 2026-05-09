---
phase: quick-120
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/routes.ts
  - apps/web/src/app/(owner)/actions/loads.ts
  - apps/web/src/components/loads/load-form.tsx
  - apps/web/src/app/(owner)/loads/new/page.tsx
  - apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
autonomous: true
must_haves:
  truths:
    - "Creating a route with a driver who already has a non-completed route on the same scheduledDate is blocked with a clear error"
    - "Editing a route to assign a driver who already has a non-completed route on that date is blocked"
    - "When selecting a route in the load form, a warning appears if load pickupDate or deliveryDate falls outside the route scheduledDate"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/routes.ts"
      provides: "Driver date conflict validation in createRoute and updateRoute"
    - path: "apps/web/src/app/(owner)/actions/loads.ts"
      provides: "Route-load date mismatch warning returned from createLoad and updateLoad"
    - path: "apps/web/src/components/loads/load-form.tsx"
      provides: "Client-side warning banner when route-load dates mismatch"
  key_links:
    - from: "routes.ts createRoute/updateRoute"
      to: "prisma.route.findFirst"
      via: "conflict query checking same driver + same date + non-COMPLETED status"
    - from: "load-form.tsx"
      to: "routes prop with scheduledDate"
      via: "client-side date comparison when routeId changes"
---

<objective>
Add date conflict validation to routes and loads:
1. Block creating/editing a route when the assigned driver already has a non-COMPLETED route on the same scheduledDate (server-side, hard block with field error on driverId).
2. Warn (not block) when assigning a load to a route if the load's pickupDate or deliveryDate falls outside the route's scheduledDate (client-side warning banner + server-side warning field).

Purpose: Prevent double-booking drivers on routes and surface date mismatches between loads and their assigned routes.
Output: Updated server actions with validation logic, updated load form with warning UI.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/actions/routes.ts
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/src/components/loads/load-form.tsx
@apps/web/src/components/routes/route-form.tsx
@apps/web/src/app/(owner)/loads/new/page.tsx
@apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add driver date conflict validation to route create/update server actions</name>
  <files>apps/web/src/app/(owner)/actions/routes.ts</files>
  <action>
In `createRoute`, after the existing driver role validation (line ~107) and before the route create call, add a conflict check:

```
// Check for driver scheduling conflict on the same date
const scheduledDay = new Date(scheduledDate);
scheduledDay.setUTCHours(0, 0, 0, 0);
const nextDay = new Date(scheduledDay);
nextDay.setUTCDate(nextDay.getUTCDate() + 1);

const conflictingRoute = await prisma.route.findFirst({
  where: {
    driverId,
    status: { not: 'COMPLETED' },
    archivedAt: null,
    scheduledDate: { gte: scheduledDay, lt: nextDay },
  },
  select: { id: true, name: true, origin: true, destination: true },
});

if (conflictingRoute) {
  const label = conflictingRoute.name || `${conflictingRoute.origin} -> ${conflictingRoute.destination}`;
  return {
    error: {
      driverId: [`Driver already has a route on this date: "${label}"`],
    },
  };
}
```

In `updateRoute`, add the same conflict check after the existing driver validation block (line ~277), but exclude the current route being edited from the conflict query by adding `id: { not: id }` to the where clause. Only run this check when either `driverId` or `scheduledDate` is being updated. Determine the effective driverId and scheduledDate by falling back to the existing route values when not provided in the update:

- Fetch the current route at the start of the try block (before driver validation): `const existingRoute = await prisma.route.findUnique({ where: { id }, select: { driverId: true, scheduledDate: true } });`
- Use `const effectiveDriverId = result.data.driverId || existingRoute.driverId;` and similarly for scheduledDate
- Run the conflict check using effectiveDriverId and effectiveScheduledDate, excluding `id: { not: id }`
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` to confirm no type errors. Manually test by attempting to create two routes for the same driver on the same date -- the second should be rejected with a driverId field error.
  </verify>
  <done>Creating or editing a route with a driver who already has a non-completed route on the same scheduledDate returns a field error on driverId with the conflicting route name.</done>
</task>

<task type="auto">
  <name>Task 2: Add route-load date mismatch warning in load form (client + server)</name>
  <files>
    apps/web/src/app/(owner)/actions/loads.ts
    apps/web/src/components/loads/load-form.tsx
    apps/web/src/app/(owner)/loads/new/page.tsx
    apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
  </files>
  <action>
**Server-side (loads.ts):** In both `createLoad` and `updateLoad`, after the load is successfully created/updated but before the redirect, add a date mismatch check. If `routeId` is set, fetch the route's scheduledDate, then compare:
- If pickupDate is not on the same calendar day as scheduledDate, OR deliveryDate (if set) is not on the same calendar day as scheduledDate, this is a mismatch. Since the action redirects on success, the warning cannot be returned from the action itself. Instead, this will be purely client-side.

**Client-side (load-form.tsx):**
1. Update the `routes` prop type to include `scheduledDate: string` (ISO date string):
   ```
   routes?: Array<{ id: string; name: string | null; origin: string; destination: string; scheduledDate: string }>;
   ```

2. Add state to track the selected routeId:
   ```
   const [selectedRouteId, setSelectedRouteId] = useState<string>(initialData?.routeId || '');
   ```

3. Change the route `<select>` from uncontrolled (`defaultValue`) to controlled (`value={selectedRouteId}` with `onChange` that calls `setSelectedRouteId`).

4. Compute a warning message derived from state (no useEffect needed):
   ```
   const selectedRoute = routes.find(r => r.id === selectedRouteId);
   let dateWarning: string | null = null;
   if (selectedRoute) {
     // Get pickupDate and deliveryDate from the form's current values
     // Since these are uncontrolled inputs, we need to track them in state too
     // OR use a simpler approach: read from DOM via refs
   }
   ```

   Actually, the simplest approach: also track pickupDate and deliveryDate in state:
   ```
   const [pickupDateVal, setPickupDateVal] = useState(initialData?.pickupDate || '');
   const [deliveryDateVal, setDeliveryDateVal] = useState(initialData?.deliveryDate || '');
   ```
   Make the pickupDate and deliveryDate inputs controlled (value + onChange).

   Then compute the warning:
   ```
   let dateWarning: string | null = null;
   if (selectedRoute && pickupDateVal) {
     const routeDate = selectedRoute.scheduledDate.slice(0, 10); // YYYY-MM-DD
     const pickup = pickupDateVal; // already YYYY-MM-DD from input[type=date]
     const delivery = deliveryDateVal || null;
     const mismatches: string[] = [];
     if (pickup !== routeDate) mismatches.push(`pickup date (${pickup})`);
     if (delivery && delivery !== routeDate) mismatches.push(`delivery date (${delivery})`);
     if (mismatches.length > 0) {
       dateWarning = `Warning: ${mismatches.join(' and ')} ${mismatches.length === 1 ? 'does' : 'do'} not match the route scheduled date (${routeDate}). The load can still be saved.`;
     }
   }
   ```

5. Render the warning banner below the Route select dropdown (after the closing `</div>` of the route field, before the origin/destination grid). Use an amber/yellow style consistent with existing warnings in the codebase:
   ```jsx
   {dateWarning && (
     <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-2.5">
       <p className="text-sm text-amber-700 dark:text-amber-300">{dateWarning}</p>
     </div>
   )}
   ```

**Page data (new/page.tsx and edit/page.tsx):**
Update both load page files to include `scheduledDate` in the routes data passed to LoadForm. In the `listRoutes().then(...)` mapping, change from:
```
rs.map((r) => ({ id: r.id, name: r.name, origin: r.origin, destination: r.destination }))
```
to:
```
rs.map((r) => ({ id: r.id, name: r.name, origin: r.origin, destination: r.destination, scheduledDate: r.scheduledDate.toISOString() }))
```

Also update the `routes` type annotation in both files from:
```
let routes: Array<{ id: string; name: string | null; origin: string; destination: string }> = [];
```
to:
```
let routes: Array<{ id: string; name: string | null; origin: string; destination: string; scheduledDate: string }> = [];
```

Note: `listRoutes()` already includes `scheduledDate` in the Route model return (it does `findMany` without a `select`, so all fields are returned).
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` to confirm no type errors. Navigate to /loads/new, select a route, set a pickupDate that differs from the route's scheduledDate -- an amber warning banner should appear below the route dropdown. Changing the date to match should dismiss the warning. The form should still submit successfully (warning only, not blocking).
  </verify>
  <done>When a route is selected in the load form and the load's pickupDate or deliveryDate does not match the route's scheduledDate, an amber warning banner is displayed. The warning is informational only and does not prevent form submission.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` -- no type errors
2. Create a route for Driver A on 2026-04-01. Try to create another route for Driver A on 2026-04-01 -- should see driverId error "Driver already has a route on this date"
3. Edit a route to change driver to one who already has a route that day -- should see same error
4. Edit a route without changing driver/date -- should succeed (no false positive from self-conflict)
5. Create a load, select a route scheduled for 2026-04-01, set pickupDate to 2026-04-02 -- amber warning appears
6. Change pickupDate to 2026-04-01 -- warning disappears
7. Submit load with warning showing -- load is created successfully (no block)
</verification>

<success_criteria>
- Driver double-booking on routes is blocked at the server action level with a clear field error
- Route-load date mismatch produces a visible but non-blocking amber warning in the load form
- No TypeScript errors
- Existing route and load CRUD functionality is not broken
</success_criteria>

<output>
After completion, create `.planning/quick/120-date-conflict-validation-1-when-creating/120-SUMMARY.md`
</output>
