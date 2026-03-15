---
phase: quick-70
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/trucks/compute-truck-status.ts
  - src/app/(owner)/actions/trucks.ts
  - src/components/trucks/truck-list.tsx
  - src/app/(owner)/trucks/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Adding a future scheduled service does NOT change truck status to In Maintenance"
    - "A truck with only a future scheduled service and no active loads shows Ready to Use"
    - "A truck with an OVERDUE scheduled service shows In Maintenance"
    - "A truck with active loads/routes still shows In Use regardless of scheduled services"
    - "Status legend is visible on the trucks list page explaining all four statuses"
  artifacts:
    - path: "src/lib/trucks/compute-truck-status.ts"
      provides: "Fixed status computation with overdue-only maintenance logic"
    - path: "src/components/trucks/truck-list.tsx"
      provides: "Status legend UI"
  key_links:
    - from: "src/lib/trucks/compute-truck-status.ts"
      to: "src/app/(owner)/actions/trucks.ts"
      via: "scheduledServices query must include baselineDate, intervalDays, baselineOdometer"
      pattern: "scheduledServices.*select.*baselineDate"
---

<objective>
Fix TKT-0023: Truck status incorrectly shows "In Use" when a scheduled service is added. The real bug is that ANY incomplete scheduled service triggers "In Maintenance" — even future ones. Fix the logic so only OVERDUE scheduled services trigger "In Maintenance", and add a status legend to the trucks UI.

Purpose: Truck status should accurately reflect operational state — future scheduled reminders should not affect current status.
Output: Fixed compute-truck-status.ts, updated Prisma queries, status legend on trucks list page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/trucks/compute-truck-status.ts
@src/app/(owner)/actions/trucks.ts
@src/components/trucks/truck-list.tsx
@src/app/(owner)/trucks/[id]/page.tsx
@prisma/schema.prisma (ScheduledService model — has baselineDate, intervalDays, intervalMiles, baselineOdometer, isCompleted)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix compute-truck-status logic and query includes</name>
  <files>
    src/lib/trucks/compute-truck-status.ts
    src/app/(owner)/actions/trucks.ts
  </files>
  <action>
**In `src/lib/trucks/compute-truck-status.ts`:**

1. Update the `TruckWithRelations` interface — change `scheduledServices` to include the fields needed for due-date calculation:
   ```
   scheduledServices: { id: string; baselineDate: Date; intervalDays: number | null; intervalMiles: number | null; baselineOdometer: number }[];
   ```

2. Update `computeTruckStatus` — the "In Maintenance" check (currently line 66-69) should ONLY trigger when at least one scheduled service is OVERDUE. A service is overdue when:
   - `intervalDays` is set AND `baselineDate + intervalDays <= now`, OR
   - `intervalMiles` is set AND `baselineOdometer + intervalMiles <= truck.odometer`

   Create a helper function `isServiceOverdue(service, truckOdometer)` that checks these conditions. Only if at least one incomplete scheduled service is overdue should status be "In Maintenance".

3. Update the comment at the top of the file to clarify: "In Maintenance — overdue scheduled service (past due date or mileage threshold exceeded)"

**In `src/app/(owner)/actions/trucks.ts`:**

4. In BOTH Prisma queries that include `scheduledServices` (the list query around line 238 and the detail query around line 273), update the `select` to include the additional fields:
   ```
   scheduledServices: {
     where: { isCompleted: false },
     select: { id: true, baselineDate: true, intervalDays: true, intervalMiles: true, baselineOdometer: true },
   },
   ```

This ensures the compute function has the data it needs to determine if a service is actually overdue vs just scheduled for the future.
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors. Review the logic manually: a truck with a scheduled service due in 30 days should compute as "Ready to Use", not "In Maintenance". A truck with a service that was due 5 days ago (overdue) should compute as "In Maintenance".
  </verify>
  <done>
- computeTruckStatus only returns "In Maintenance" for overdue services
- Future scheduled services do not affect truck status
- Prisma queries include baselineDate, intervalDays, intervalMiles, baselineOdometer for scheduled services
- No TypeScript errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add status legend to trucks list and detail pages</name>
  <files>
    src/components/trucks/truck-list.tsx
    src/app/(owner)/trucks/[id]/page.tsx
  </files>
  <action>
**In `src/components/trucks/truck-list.tsx`:**

1. Add a status legend below the search input and above the table. Use a compact horizontal layout with the four status badges and their descriptions. Use the existing `variantClasses` map for badge styling. Structure:

   ```
   <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
     <span className="font-medium text-foreground">Status Guide:</span>
     <span className="inline-flex items-center gap-1.5">
       <span className={badge classes for blue}>In Use</span>
       Active dispatch
     </span>
     <span className="inline-flex items-center gap-1.5">
       <span className={badge classes for amber}>In Maintenance</span>
       Overdue service
     </span>
     <span className="inline-flex items-center gap-1.5">
       <span className={badge classes for red}>Expired Docs</span>
       Document past expiry
     </span>
     <span className="inline-flex items-center gap-1.5">
       <span className={badge classes for green}>Ready to Use</span>
       Available
     </span>
   </div>
   ```

   Place this inside the existing `<div className="space-y-4">` wrapper, between the search input and the table div.

**In `src/app/(owner)/trucks/[id]/page.tsx`:**

2. Add a tooltip or small helper text next to the status badge on the truck detail page. Use a simple `title` attribute on the status badge span (line 78) that explains what the current status means:
   - "In Use" title: "This truck is assigned to an active dispatch"
   - "In Maintenance" title: "This truck has an overdue scheduled service"
   - "Expired Docs" title: "This truck has at least one expired document"
   - "Ready to Use" title: "This truck is available for dispatch"

   Create a `statusDescriptions` map object keyed by TruckStatus and add the `title` attribute to the existing badge span.
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors. Run `npm run build` to confirm pages render without errors. Visually: the trucks list page should show a compact status guide row between search and table.
  </verify>
  <done>
- Trucks list page shows a status legend with all four statuses and brief descriptions
- Truck detail page status badge has a title/tooltip explaining the current status
- No TypeScript or build errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. Manual check: Create a scheduled service with a future due date — truck status should remain "Ready to Use" (not "In Maintenance")
4. Status legend visible on trucks list page
5. Status badge tooltip visible on truck detail page
</verification>

<success_criteria>
- Adding a future scheduled service does NOT change truck status
- Only overdue scheduled services trigger "In Maintenance"
- Users can see what each status means via the legend on the list page
- All existing status logic (In Use for active loads, Expired Docs) unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/70-tkt-0023-truck-status-logic-fix-schedule/70-SUMMARY.md`
</output>
