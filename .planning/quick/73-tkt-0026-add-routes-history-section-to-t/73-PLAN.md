---
phase: quick-73
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/trucks.ts
  - src/app/(owner)/trucks/[id]/page.tsx
  - src/app/(owner)/trucks/[id]/truck-routes-history.tsx
autonomous: true

must_haves:
  truths:
    - "Truck detail page shows a Routes History section listing all routes assigned to this truck"
    - "Each route row shows name (or origin-destination fallback), status badge, scheduled date, and a link to the route detail page"
    - "Routes include archived routes (this is a history view)"
    - "Routes are sorted most recent first by scheduledDate"
  artifacts:
    - path: "src/app/(owner)/actions/trucks.ts"
      provides: "listTruckRoutes server action"
      contains: "listTruckRoutes"
    - path: "src/app/(owner)/trucks/[id]/truck-routes-history.tsx"
      provides: "TruckRoutesHistory client component"
      contains: "TruckRoutesHistory"
    - path: "src/app/(owner)/trucks/[id]/page.tsx"
      provides: "Renders TruckRoutesHistory section"
      contains: "TruckRoutesHistory"
  key_links:
    - from: "src/app/(owner)/trucks/[id]/page.tsx"
      to: "listTruckRoutes"
      via: "server action call in page"
      pattern: "listTruckRoutes"
    - from: "src/app/(owner)/trucks/[id]/truck-routes-history.tsx"
      to: "/routes/[id]"
      via: "Link component"
      pattern: "href.*routes/"
---

<objective>
Add a "Routes History" section to the truck detail page that lists all routes (including archived) ever assigned to this truck, with route name, status badge, scheduled date, and a clickable link to each route's detail page.

Purpose: Owners need visibility into a truck's full route history for tracking utilization and audit.
Output: New server action + client component + updated truck detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/actions/trucks.ts
@src/app/(owner)/trucks/[id]/page.tsx
@src/components/routes/route-detail.tsx (status badge pattern: lines 78-87)
@src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx (similar list pattern)
@prisma/schema.prisma (Route model: lines 248-290)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add listTruckRoutes server action and TruckRoutesHistory component</name>
  <files>
    src/app/(owner)/actions/trucks.ts
    src/app/(owner)/trucks/[id]/truck-routes-history.tsx
  </files>
  <action>
1. In `src/app/(owner)/actions/trucks.ts`, add a new exported server action `listTruckRoutes(truckId: string)`:
   - Auth: `await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER])` (same as getTruck)
   - Query: `prisma.route.findMany({ where: { truckId }, orderBy: { scheduledDate: 'desc' }, take: 50 })`
   - Do NOT filter by `archivedAt: null` — include archived routes (this is a history view)
   - Select only needed fields: `id, name, origin, destination, status, scheduledDate, archivedAt`

2. Create `src/app/(owner)/trucks/[id]/truck-routes-history.tsx` as a client component:
   - Props: `{ routes: Array<{ id, name, origin, destination, status, scheduledDate, archivedAt }> }`
   - Render a table/list of routes inside the existing card pattern (rounded-xl border border-border bg-card p-6 shadow-sm)
   - For each route row show:
     a. Route name: use `route.name` if present, otherwise fallback to `${route.origin} → ${route.destination}`
     b. Status badge: use same pattern as route-detail.tsx — `bg-blue-100 text-blue-800` for IN_PROGRESS, `bg-emerald-100 text-emerald-800` for COMPLETED, `bg-muted text-muted-foreground` for PLANNED/default. Display status with underscores replaced by spaces, title-cased.
     c. Scheduled date: formatted as "MMM d, yyyy" (e.g., "Mar 15, 2026")
     d. Link: clickable route name or "View" link pointing to `/routes/${route.id}` using Next.js Link component with ExternalLink icon
   - If `route.archivedAt` is not null, show a subtle "(Archived)" label next to the status badge in muted text
   - Empty state: "No routes have been assigned to this truck yet." in muted text
   - Use the same visual patterns as the existing truck detail page sections
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Visually inspect that the component file exports TruckRoutesHistory.</verify>
  <done>listTruckRoutes action returns all routes for a truck sorted by scheduledDate desc. TruckRoutesHistory component renders the list with status badges, dates, and links.</done>
</task>

<task type="auto">
  <name>Task 2: Integrate Routes History into truck detail page</name>
  <files>
    src/app/(owner)/trucks/[id]/page.tsx
  </files>
  <action>
1. In `src/app/(owner)/trucks/[id]/page.tsx`:
   - Import `listTruckRoutes` from the trucks actions
   - Import `TruckRoutesHistory` from `./truck-routes-history`
   - After the existing `listDocuments` call (around line 26), add a similar non-blocking fetch for routes:
     ```
     let truckRoutes: any[] = [];
     try {
       truckRoutes = await listTruckRoutes(id);
     } catch (error) {
       console.error('Failed to load truck routes:', error);
     }
     ```
   - Add the Routes History section between the "Files" section and the "Record History" (Audit Trail) section. Wrap it in the same card pattern as other sections:
     ```
     {/* Routes History */}
     <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
       <h2 className="text-lg font-semibold text-card-foreground mb-4">Routes History</h2>
       <TruckRoutesHistory routes={truckRoutes} />
     </div>
     ```
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Run `npm run build` to verify the page builds successfully. Navigate to a truck detail page in the browser to see the Routes History section.</verify>
  <done>Truck detail page shows a "Routes History" section with all routes assigned to this truck, including archived ones, sorted most recent first, with status badges and clickable links to route detail pages.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npm run build` completes successfully
- Truck detail page at `/trucks/[id]` renders the Routes History section
- Routes display name (or origin/destination fallback), status badge, scheduled date, and link
- Empty state shows when truck has no routes
</verification>

<success_criteria>
Truck detail page displays a Routes History section listing all routes (including archived) assigned to the truck, sorted by most recent scheduledDate, with status badges matching the existing route status pattern, formatted dates, and clickable links to each route's detail page.
</success_criteria>

<output>
After completion, create `.planning/quick/73-tkt-0026-add-routes-history-section-to-t/73-SUMMARY.md`
</output>
