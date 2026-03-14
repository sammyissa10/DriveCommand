---
phase: quick-57
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/trucks/compute-truck-status.ts
  - src/app/(owner)/actions/trucks.ts
  - src/app/(owner)/trucks/truck-list-wrapper.tsx
  - src/components/trucks/truck-list.tsx
  - src/app/(owner)/trucks/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Trucks list shows a status badge for each truck"
    - "Truck detail page shows the status badge"
    - "Status is computed from existing data, not stored"
    - "Priority order: In Use > In Maintenance > Expired Docs > Ready to Use"
  artifacts:
    - path: "src/lib/trucks/compute-truck-status.ts"
      provides: "Pure function to compute truck status from related data"
      exports: ["computeTruckStatus", "TruckStatus"]
    - path: "src/components/trucks/truck-list.tsx"
      provides: "Status badge column in trucks table"
    - path: "src/app/(owner)/trucks/[id]/page.tsx"
      provides: "Status badge on truck detail page"
  key_links:
    - from: "src/app/(owner)/actions/trucks.ts"
      to: "prisma relations (loads, routes, scheduledServices, documents)"
      via: "include in listTrucks and getTruck queries"
      pattern: "include.*assignedRoutes|loads|scheduledServices|documents"
    - from: "src/components/trucks/truck-list.tsx"
      to: "src/lib/trucks/compute-truck-status.ts"
      via: "import and call in Status column"
      pattern: "computeTruckStatus"
---

<objective>
Add computed status badges to trucks — "In Use", "In Maintenance", "Expired Docs", or "Ready to Use" — derived from existing related data (routes, loads, scheduled services, documents). No schema changes.

Purpose: Fleet managers can instantly see which trucks are available, busy, need maintenance, or have compliance issues.
Output: Status badge on trucks list table and truck detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma (Truck, Route, Load, ScheduledService, Document models)
@src/app/(owner)/actions/trucks.ts (listTrucks, getTruck server actions)
@src/components/trucks/truck-list.tsx (TruckList component with TanStack Table)
@src/app/(owner)/trucks/truck-list-wrapper.tsx (client wrapper passing trucks to TruckList)
@src/app/(owner)/trucks/[id]/page.tsx (truck detail page)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create status computation utility and update server actions to include related data</name>
  <files>
    src/lib/trucks/compute-truck-status.ts
    src/app/(owner)/actions/trucks.ts
  </files>
  <action>
1. Create `src/lib/trucks/compute-truck-status.ts`:
   - Export a type `TruckStatus = 'In Use' | 'In Maintenance' | 'Expired Docs' | 'Ready to Use'`
   - Export a type `TruckStatusInfo = { status: TruckStatus; variant: 'blue' | 'amber' | 'red' | 'green' }` for badge styling
   - Export function `computeTruckStatus(truck: TruckWithRelations): TruckStatusInfo` that checks in priority order:
     a. **In Use** (variant: blue): truck has at least one related Route with status `IN_PROGRESS` OR at least one related Load with status `DISPATCHED`, `PICKED_UP`, or `IN_TRANSIT`. Check both `assignedRoutes` and `loads` arrays.
     b. **In Maintenance** (variant: amber): truck has at least one ScheduledService where `isCompleted === false`. These represent upcoming/pending maintenance.
     c. **Expired Docs** (variant: red): truck has at least one Document where `expiryDate` is not null AND `expiryDate < now()`.
     d. **Ready to Use** (variant: green): none of the above conditions match.
   - Export the `TruckWithRelations` type so it can be used in the wrapper and list components.
   - Keep the function pure — accepts data, returns status. No DB calls.

2. Update `src/app/(owner)/actions/trucks.ts`:
   - In `listTrucks()`: add `include` to the `findMany` call:
     ```
     include: {
       assignedRoutes: {
         where: { status: 'IN_PROGRESS', archivedAt: null },
         select: { id: true, status: true },
       },
       loads: {
         where: { status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] } },
         select: { id: true, status: true },
       },
       scheduledServices: {
         where: { isCompleted: false },
         select: { id: true },
       },
       documents: {
         where: { expiryDate: { not: null } },
         select: { id: true, expiryDate: true },
       },
     }
     ```
   - In `getTruck()`: add the same includes (merge with existing `createdBy`/`updatedBy` includes).
   - Update the return type annotation if needed (Prisma will infer the expanded type from includes).
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors. Confirm the compute function file exists and exports the expected types.
  </verify>
  <done>
    `computeTruckStatus` function exists with correct priority logic. `listTrucks` and `getTruck` include the related data needed for status computation.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add status badge to trucks list table and truck detail page</name>
  <files>
    src/app/(owner)/trucks/truck-list-wrapper.tsx
    src/components/trucks/truck-list.tsx
    src/app/(owner)/trucks/[id]/page.tsx
  </files>
  <action>
1. Update `src/app/(owner)/trucks/truck-list-wrapper.tsx`:
   - Change the type of `initialTrucks` from `Truck[]` to `TruckWithRelations[]` (import from compute-truck-status.ts).
   - Update the `useOptimistic` generic type accordingly.
   - Pass trucks through to TruckList with the expanded type.

2. Update `src/components/trucks/truck-list.tsx`:
   - Import `computeTruckStatus`, `TruckWithRelations`, and `TruckStatusInfo` from `@/lib/trucks/compute-truck-status`.
   - Change props type from `Truck[]` to `TruckWithRelations[]`.
   - Add a new "Status" column AFTER "License Plate" and BEFORE "Odometer" in the columns array:
     ```
     {
       id: 'status',
       header: 'Status',
       cell: ({ row }) => {
         const { status, variant } = computeTruckStatus(row.original);
         const variantClasses = {
           blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
           amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
           red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
           green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
         };
         return (
           <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${variantClasses[variant]}`}>
             {status}
           </span>
         );
       },
       enableSorting: false,
     }
     ```
   - Update the `ColumnDef<Truck>[]` generic to `ColumnDef<TruckWithRelations>[]`.

3. Update `src/app/(owner)/trucks/[id]/page.tsx`:
   - Import `computeTruckStatus` from `@/lib/trucks/compute-truck-status`.
   - After the truck title `<h1>`, add the status badge inline. Place it right next to the truck name in the header area:
     ```tsx
     // Compute status from the truck data (getTruck now includes relations)
     const { status, variant } = computeTruckStatus(truck as any);
     // In the JSX, after the <h1>:
     <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${variantClasses[variant]}`}>
       {status}
     </span>
     ```
   - Define the same `variantClasses` map as in truck-list.tsx (or extract to the utility if preferred — keep it simple, inline is fine for 2 usages).
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors. Run `npm run build` to confirm no build errors. Visually confirm: trucks list shows Status column with colored badges, truck detail shows status badge next to truck name.
  </verify>
  <done>
    Trucks list table has a "Status" column with colored badge (blue/amber/red/green). Truck detail page shows status badge next to the truck title. Status is computed live from related data with correct priority: In Use > In Maintenance > Expired Docs > Ready to Use.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` completes successfully
3. Trucks list page renders with Status column showing appropriate badges
4. Truck detail page shows status badge next to truck name
5. A truck assigned to an active route/load shows "In Use" (blue)
6. A truck with pending scheduled service shows "In Maintenance" (amber) — only if not "In Use"
7. A truck with expired documents shows "Expired Docs" (red) — only if not "In Use" or "In Maintenance"
8. A truck with none of the above shows "Ready to Use" (green)
</verification>

<success_criteria>
- Status badges visible on trucks list and detail pages
- Priority ordering enforced: In Use > In Maintenance > Expired Docs > Ready to Use
- No schema changes — all computed from existing relations
- TypeScript compiles cleanly
- Build passes
</success_criteria>

<output>
After completion, create `.planning/quick/57-tkt-0015-add-automated-status-to-trucks-/57-SUMMARY.md`
</output>
