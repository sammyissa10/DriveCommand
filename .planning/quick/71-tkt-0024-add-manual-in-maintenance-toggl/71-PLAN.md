---
phase: quick-71
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/trucks/compute-truck-status.ts
  - src/app/(owner)/actions/trucks.ts
  - src/app/(owner)/trucks/[id]/page.tsx
  - src/app/(owner)/trucks/[id]/maintenance/page.tsx
  - src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx
  - src/components/trucks/maintenance-toggle-button.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can manually put a truck in maintenance via button on truck detail page"
    - "Owner can manually put a truck in maintenance via button on maintenance page"
    - "Owner can mark a truck available again via the same button"
    - "Manual inMaintenance override takes priority over overdue-service check in computeTruckStatus"
    - "Truck status shows 'In Maintenance' when inMaintenance is true, even without overdue services"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "inMaintenance Boolean field on Truck model"
      contains: "inMaintenance"
    - path: "src/lib/trucks/compute-truck-status.ts"
      provides: "Manual maintenance check before overdue-service check"
      contains: "inMaintenance"
    - path: "src/app/(owner)/actions/trucks.ts"
      provides: "toggleTruckMaintenance server action"
      exports: ["toggleTruckMaintenance"]
    - path: "src/components/trucks/maintenance-toggle-button.tsx"
      provides: "Client component for maintenance toggle button"
  key_links:
    - from: "src/components/trucks/maintenance-toggle-button.tsx"
      to: "src/app/(owner)/actions/trucks.ts"
      via: "toggleTruckMaintenance server action call"
    - from: "src/lib/trucks/compute-truck-status.ts"
      to: "TruckWithRelations.inMaintenance"
      via: "manual override check before overdue-service check"
---

<objective>
Add a manual "In Maintenance" toggle to trucks so owners can mark trucks as in maintenance
independent of overdue scheduled services. The toggle adds an `inMaintenance` boolean to the
Truck model, a `toggleTruckMaintenance` server action, and toggle buttons on the truck detail
and maintenance pages.

Purpose: Allow fleet owners to manually control truck availability when sending trucks for
maintenance that isn't tracked by scheduled services.
Output: Working toggle button on both pages, schema updated, status computation updated.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma (Truck model — add inMaintenance field)
@src/lib/trucks/compute-truck-status.ts (add manual override check)
@src/app/(owner)/actions/trucks.ts (add toggleTruckMaintenance action)
@src/app/(owner)/trucks/[id]/page.tsx (add toggle button)
@src/app/(owner)/trucks/[id]/maintenance/page.tsx (add toggle button)
@src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx (pass toggle props)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add inMaintenance field to schema, update computeTruckStatus, add server action</name>
  <files>
    prisma/schema.prisma
    src/lib/trucks/compute-truck-status.ts
    src/app/(owner)/actions/trucks.ts
  </files>
  <action>
1. In `prisma/schema.prisma`, add `inMaintenance Boolean @default(false)` to the Truck model,
   placed after the `odometer` field. Then run `npx prisma db push` to sync the schema.

2. In `src/lib/trucks/compute-truck-status.ts`:
   - Add `inMaintenance?: boolean;` to the `TruckWithRelations` interface (after `odometer`).
   - In `computeTruckStatus()`, after the "In Use" check (priority 1) and BEFORE the existing
     overdue-service "In Maintenance" check, add a manual maintenance check:
     ```
     // 2a. In Maintenance — manual override
     if (truck.inMaintenance) {
       return { status: 'In Maintenance', variant: 'amber' };
     }
     ```
   - Keep the existing overdue-service check as 2b (it still triggers "In Maintenance" if
     inMaintenance is false but services are overdue).
   - Update the file's header comment to reflect the new priority:
     `2. In Maintenance — manual override OR overdue scheduled service`

3. In `src/app/(owner)/actions/trucks.ts`, add a `toggleTruckMaintenance` server action:
   ```typescript
   export async function toggleTruckMaintenance(truckId: string, inMaintenance: boolean) {
     await requireRole([UserRole.OWNER, UserRole.MANAGER]);
     const userId = await requireAuth();
     const prisma = await getTenantPrisma();
     await prisma.truck.update({
       where: { id: truckId },
       data: { inMaintenance, updatedById: userId },
     });
     revalidatePath('/trucks');
     revalidatePath(`/trucks/${truckId}`);
     revalidatePath(`/trucks/${truckId}/maintenance`);
     revalidateTag('dashboard-metrics');
     return { success: true };
   }
   ```
  </action>
  <verify>
    Run `npx prisma db push` succeeds without errors.
    Run `npx tsc --noEmit` passes (no type errors from TruckWithRelations change).
  </verify>
  <done>
    Truck model has inMaintenance boolean field, computeTruckStatus checks it before overdue
    services, and toggleTruckMaintenance server action exists and is exported.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create toggle button component and add to truck detail and maintenance pages</name>
  <files>
    src/components/trucks/maintenance-toggle-button.tsx
    src/app/(owner)/trucks/[id]/page.tsx
    src/app/(owner)/trucks/[id]/maintenance/page.tsx
    src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx
  </files>
  <action>
1. Create `src/components/trucks/maintenance-toggle-button.tsx` — a client component:
   - Props: `truckId: string`, `inMaintenance: boolean`
   - Uses `useTransition` for pending state
   - Imports and calls `toggleTruckMaintenance` from trucks actions
   - Calls `router.refresh()` after toggle succeeds
   - When `inMaintenance` is false: render an amber/destructive-style button with Wrench icon
     saying "Put in Maintenance" (amber background: `bg-amber-600 hover:bg-amber-700 text-white`)
   - When `inMaintenance` is true: render a green outline button with CheckCircle icon saying
     "Mark Available" (`border-emerald-600 text-emerald-600 hover:bg-emerald-50
     dark:hover:bg-emerald-900/20`)
   - Show a loading spinner or disabled state during transition
   - Import icons from lucide-react (Wrench, CheckCircle2, Loader2)

2. In `src/app/(owner)/trucks/[id]/page.tsx`:
   - Import `MaintenanceToggleButton` from the new component
   - Add the button in the header actions area (the `flex gap-3` div), BEFORE the Maintenance
     link button. Pass `truckId={truck.id}` and `inMaintenance={truck.inMaintenance ?? false}`.
   - Update the `statusDescriptions` for 'In Maintenance' to:
     `'This truck has been manually marked as in maintenance or has an overdue scheduled service'`

3. In `src/app/(owner)/trucks/[id]/maintenance/page.tsx`:
   - Import `MaintenanceToggleButton`
   - Add the button in the header section, after the `<p>` with odometer info and before
     `<MaintenancePageClient>`. Wrap in a div with `mt-3` for spacing.
   - Pass `truckId={id}` and `inMaintenance={truck.inMaintenance ?? false}`.

Note: The maintenance-page-client.tsx does NOT need changes — the toggle button is a separate
independent client component placed in the server-rendered page wrapper.
  </action>
  <verify>
    Run `npx tsc --noEmit` passes.
    Run `npm run build` succeeds (or `next build` if that's the script).
    Visually: navigate to a truck detail page — amber "Put in Maintenance" button visible.
    Click it — status changes to "In Maintenance", button changes to green "Mark Available".
    Navigate to maintenance page — same button appears and works.
  </verify>
  <done>
    Toggle button renders on both truck detail and maintenance pages. Clicking toggles
    inMaintenance field and truck status updates accordingly. Button style matches spec
    (amber for put-in-maintenance, green outline for mark-available).
  </done>
</task>

</tasks>

<verification>
- `npx prisma db push` succeeds
- `npx tsc --noEmit` passes
- `npm run build` succeeds
- Truck detail page shows maintenance toggle button in header actions
- Maintenance page shows maintenance toggle button
- Clicking "Put in Maintenance" sets truck to In Maintenance status
- Clicking "Mark Available" returns truck to its computed status
- A truck that is "In Use" still shows "In Use" even if inMaintenance is true (In Use is priority 1)
</verification>

<success_criteria>
- Truck model has `inMaintenance` boolean field (default false)
- `computeTruckStatus` checks manual `inMaintenance` before overdue-service check
- Toggle button appears on both truck detail and maintenance pages
- Button correctly toggles between "Put in Maintenance" (amber) and "Mark Available" (green)
- Status priority: In Use > In Maintenance (manual or overdue) > Expired Docs > Ready to Use
</success_criteria>

<output>
After completion, create `.planning/quick/71-tkt-0024-add-manual-in-maintenance-toggl/71-SUMMARY.md`
</output>
