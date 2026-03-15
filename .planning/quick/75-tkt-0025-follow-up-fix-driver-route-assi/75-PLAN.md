---
phase: quick-75
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/driver-route-joins.ts
  - src/app/(owner)/drivers/[id]/page.tsx
  - src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx
autonomous: true
must_haves:
  truths:
    - "Driver detail page shows routes assigned via Route.driverId (primary driver from route form)"
    - "Driver detail page shows routes assigned via DriverRouteJoin table (co-driver/payment assignments)"
    - "Each route entry displays the correct role badge: Primary Driver, Main Driver, or Co-Driver"
    - "Routes appearing in both sources are deduplicated, showing only the DriverRouteJoin entry"
  artifacts:
    - path: "src/app/(owner)/actions/driver-route-joins.ts"
      provides: "listDriverPrimaryRoutes server action"
      contains: "listDriverPrimaryRoutes"
    - path: "src/app/(owner)/drivers/[id]/page.tsx"
      provides: "Parallel fetch of both route sources"
      contains: "listDriverPrimaryRoutes"
    - path: "src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx"
      provides: "Merged display with role badges and deduplication"
      contains: "Primary Driver"
  key_links:
    - from: "src/app/(owner)/drivers/[id]/page.tsx"
      to: "src/app/(owner)/actions/driver-route-joins.ts"
      via: "listDriverPrimaryRoutes import"
      pattern: "listDriverPrimaryRoutes"
    - from: "src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx"
      to: "role badges"
      via: "conditional rendering based on assignment source"
      pattern: "Primary Driver|Main Driver|Co-Driver"
---

<objective>
Fix the Driver Route Assignments section on the driver detail page to show routes from BOTH data sources: Route.driverId (primary driver set on route form) and DriverRouteJoin table (co-driver/payment assignments). Each entry gets a role badge. Duplicates are resolved in favor of DriverRouteJoin entries (which carry payment data).

Purpose: Currently drivers assigned via the route form (Route.driverId) do not appear in their Route Assignments section because only DriverRouteJoin records are queried.
Output: Complete fix across server action, page, and component.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/actions/driver-route-joins.ts
@src/app/(owner)/drivers/[id]/page.tsx
@src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx
@prisma/schema.prisma (Route model: has driverId field pointing to User.id, plus archivedAt for soft delete)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add listDriverPrimaryRoutes server action</name>
  <files>src/app/(owner)/actions/driver-route-joins.ts</files>
  <action>
Add a new exported async function `listDriverPrimaryRoutes(driverId: string)` to the existing driver-route-joins.ts file.

This function should:
1. Call `requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER])`
2. Get prisma via `getTenantPrisma()`
3. Query `prisma.route.findMany` where `driverId = driverId` AND `archivedAt = null`
4. Select: `id`, `name`, `origin`, `destination`, `scheduledDate`, `status`
5. Order by `scheduledDate` desc
6. Return the results array (empty array on error, matching existing pattern)

This queries Route.driverId which is set when a driver is selected on the route create/edit form, a completely separate mechanism from DriverRouteJoin records.
  </action>
  <verify>TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -20` shows no errors in driver-route-joins.ts</verify>
  <done>listDriverPrimaryRoutes function exists and queries Route table for routes where this user is the primary driver</done>
</task>

<task type="auto">
  <name>Task 2: Update page and component to merge both route sources with role badges</name>
  <files>
    src/app/(owner)/drivers/[id]/page.tsx
    src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx
  </files>
  <action>
**page.tsx changes:**
1. Import `listDriverPrimaryRoutes` from the actions file
2. Add it to the `Promise.all` call: fetch `listDriverPrimaryRoutes(id)` alongside the existing two calls
3. Pass the new `primaryRoutes` array to `DriverRouteAssignmentsSection` as a new prop `primaryRoutes`

**driver-route-assignments-section.tsx changes:**

1. Add a new type `PrimaryRouteInfo` matching the shape returned by the new action:
   ```
   { id: string; name: string | null; origin: string; destination: string; scheduledDate: Date; status: string }
   ```

2. Add `primaryRoutes: PrimaryRouteInfo[]` to the component props interface

3. Create a unified display list by merging both sources with deduplication:
   - Build a Set of routeIds from `initialAssignments` (DriverRouteJoin entries)
   - Filter `primaryRoutes` to exclude any route whose id is already in the Set (dedup: DriverRouteJoin wins because it has payment data)
   - Create a unified array of display items, each with a `source` field:
     - DriverRouteJoin entries get source: `'join'`
     - Primary route entries get source: `'primary'`

4. For role badges, update the rendering:
   - Source `'primary'`: Show a blue/indigo badge "Primary Driver" (use `bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400`)
   - Source `'join'` with `isMainDriver=true`: Keep existing green "Main Driver" badge with Star icon
   - Source `'join'` with `isMainDriver=false`: Show an amber/orange badge "Co-Driver" (use `bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`)
   - Remove the conditional that only shows the badge when `isMainDriver` is true -- now EVERY entry gets a role badge

5. For primary route entries (no DriverRouteJoin record), do NOT show payment info or delete button since there is no join record to delete or payment data to display. Show only the route link, status badge, role badge, and scheduled date.

6. Sort the combined list by scheduledDate descending so the view is chronologically consistent.

7. Update the empty state check to use the combined list length.
  </action>
  <verify>
Run `npx tsc --noEmit --pretty` to confirm no type errors. Then run `npm run build 2>&1 | tail -20` to confirm the page builds successfully.
  </verify>
  <done>
Driver detail page Route Assignments section shows:
- Routes from Route.driverId with "Primary Driver" badge (no payment info, no delete button)
- DriverRouteJoin entries with "Main Driver" or "Co-Driver" badge (with payment info and delete button)
- Duplicates resolved: if a route appears in both, only the DriverRouteJoin version shows
- All entries sorted by scheduled date descending
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. The driver detail page at `/drivers/[id]` renders both primary-assigned and join-assigned routes
</verification>

<success_criteria>
- listDriverPrimaryRoutes action queries Route.driverId and returns non-archived routes
- Driver detail page fetches both data sources in parallel
- Component merges, deduplicates (join wins), and displays role badges for every entry
- Primary Driver entries show no payment section or delete button
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/75-tkt-0025-follow-up-fix-driver-route-assi/75-SUMMARY.md`
</output>
