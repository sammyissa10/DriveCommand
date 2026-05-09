---
phase: quick-227
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
  - apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
autonomous: true
must_haves:
  truths:
    - "When dispatch is planned, edit dialog shows searchable primary driver, co-driver, and truck dropdowns"
    - "When dispatch is in_progress/completed/cancelled/tonu, driver/truck/load fields are read-only"
    - "Changing primary driver fires sendDispatchAssignedNotification via after() for new driver only"
    - "Loads can be removed from a planned dispatch (sets load.dispatchId=null, load.status=pending)"
    - "Loads with active stops (arrived/completed) cannot be removed — returns 400"
    - "All dropdowns are tenant-isolated (orgId scoped)"
  artifacts:
    - path: "apps/web/src/components/carrier/dispatches/DispatchHeader.tsx"
      provides: "Edit dialog with driver/truck/co-driver dropdowns when status=planned"
    - path: "apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx"
      provides: "Remove button per load when status=planned, with active stop guard"
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "updateDispatch with co-driver validation and tenant isolation on driver/truck changes"
  key_links:
    - from: "DispatchHeader.tsx"
      to: "/api/v1/carrier/dispatches/[id]"
      via: "PATCH fetch in handleEditSave"
      pattern: "primaryDriverId|coDriverId|truckId"
    - from: "DispatchLoadsPanel.tsx"
      to: "/api/v1/carrier/dispatches/[id]/loads"
      via: "DELETE fetch for load removal"
      pattern: "dispatch.*loads"
---

<objective>
Add driver, truck, co-driver, and load assignment editing to the dispatch edit form for planned dispatches.

Purpose: Dispatchers need to reassign drivers/trucks and swap loads before a trip starts. Currently the edit form only allows changing miles, notes, and departure time.
Output: Updated DispatchHeader with assignment dropdowns, DispatchLoadsPanel with remove buttons, and backend support for load detachment with active-stop guard.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
@apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
@apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/notifications.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add driver/truck/co-driver dropdowns to edit dialog and wire backend</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
  </files>
  <action>
1. **DispatchHeader.tsx — Expand props and edit dialog:**
   - Add new props to `DispatchHeaderProps`:
     - `allDrivers: Array<{ id: string; name: string }>` — all active org drivers
     - `allTrucks: Array<{ id: string; unitNumber: string }>` — all active org trucks
   - Add fields to `editForm` state: `primaryDriverId`, `coDriverId`, `truckId`
   - In `openEditDialog()`, initialize these from `dispatch.primaryDriverId`, `dispatch.coDriverId`, `dispatch.truckId`
   - In the Dialog, when `dispatch.status === 'planned'`, render three additional fields ABOVE the existing Scheduled Departure field:
     - **Primary Driver** — a `<select>` (or searchable input with datalist) populated from `allDrivers`. Required field.
     - **Co-Driver** — a `<select>` with an empty "None" option, populated from `allDrivers` EXCLUDING the currently selected `primaryDriverId`. Optional.
     - **Truck** — a `<select>` populated from `allTrucks`. Required field.
   - Add validation in `handleEditSave`: if `coDriverId === primaryDriverId`, show toast error "Co-driver cannot be the same as primary driver" and return early.
   - In `handleEditSave`, include `primaryDriverId`, `coDriverId` (or null if empty), and `truckId` in the PATCH payload — but ONLY when `dispatch.status === 'planned'`.
   - When `dispatch.status !== 'planned'`, do NOT include these fields in the payload (existing behavior unchanged).

2. **page.tsx — Pass driver/truck lists to DispatchHeader:**
   - The page already fetches `allDrivers` and `allTrucks` (lines 98-109) and creates `driversForPanels` and `trucksForAttach`.
   - Pass `allDrivers={driversForPanels}` and `allTrucks={trucksForAttach}` as props to `<DispatchHeader>`. Remove the `void trucksForAttach;` line (line 115).

3. **dispatches.ts — Add tenant isolation to updateDispatch:**
   - In `updateDispatch()`, when `data.primaryDriverId` is provided and differs from existing:
     - Verify the new driver belongs to the org: `prisma.carrierDriver.findFirst({ where: { id: data.primaryDriverId, orgId } })`. If not found, return `{ error: 'Invalid driver' }`.
   - When `data.coDriverId` is provided (and not null):
     - Verify the co-driver belongs to the org. If not found, return `{ error: 'Invalid co-driver' }`.
     - Verify `data.coDriverId !== data.primaryDriverId` (or existing primaryDriverId if not changing). If same, return `{ error: 'Co-driver cannot be the same as primary driver' }`.
   - When `data.truckId` is provided and differs from existing:
     - Verify the new truck belongs to the org: `prisma.carrierTruck.findFirst({ where: { id: data.truckId, orgId } })`. If not found, return `{ error: 'Invalid truck' }`.
   - The existing `after(() => sendDispatchAssignedNotification(...))` on primaryDriverId change is already correct — leave it as-is.

4. **route.ts (dispatches [id]) — Allow coDriverId to be null:**
   - Update the `DispatchUpdateSchema`: change `coDriverId` from `z.string().uuid().optional()` to `z.string().uuid().nullable().optional()` so the frontend can send `coDriverId: null` to clear the co-driver.
  </action>
  <verify>
    Run `npx tsc --noEmit` from apps/web. Confirm no type errors. Visually verify: open a planned dispatch detail page, click Edit — the dialog should show driver, co-driver, and truck dropdowns populated with org data. Save with a different driver — the dispatch should update and a notification should be sent to the new driver.
  </verify>
  <done>
    Edit dialog shows driver/truck/co-driver dropdowns for planned dispatches. Dropdowns are populated with active org drivers/trucks. Saving with a changed primary driver triggers notification via after(). Co-driver validation prevents selecting same as primary. All dropdown queries are tenant-isolated. Non-planned dispatches show no assignment fields.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add load removal from dispatch with active-stop guard</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
    apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
    apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
  </files>
  <action>
1. **loads/[id]/route.ts — Allow dispatchId to be null:**
   - Update `LoadUpdateSchema`: change `dispatchId` from `z.string().uuid().optional()` to `z.string().uuid().nullable().optional()` so the detach operation can set `dispatchId: null`.

2. **dispatches/[id]/route.ts — Add DELETE handler for load removal:**
   - Add a new API endpoint pattern. Since Next.js App Router doesn't easily support sub-resources, add a `POST` handler to a new route file at `apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts`:
     - Schema: `z.object({ loadId: z.string().uuid() })`
     - Auth + orgId check (same pattern as existing PATCH)
     - Verify the dispatch exists and belongs to the org
     - Verify the dispatch status is `planned` — if not, return 400 "Can only modify loads on planned dispatches"
     - Verify the load exists, belongs to this dispatch, and belongs to this org
     - Check if any stops linked to this load have status `arrived` or `completed`: `prisma.carrierStop.findFirst({ where: { dispatchId: id, loadId, status: { in: ['arrived', 'completed'] } } })`. If found, return 400 "Cannot remove a load with active stops"
     - Update the load: `prisma.carrierLoad.update({ where: { id: loadId }, data: { dispatchId: null, status: 'pending' } })`
     - Return 200 with success

3. **DispatchLoadsPanel.tsx — Add remove button per load:**
   - Only show remove buttons when `dispatchStatus === 'planned'`.
   - For each load in the list, add a small red X button (using the existing `X` icon from lucide) to the right side of each load row.
   - On click, call `POST /api/v1/carrier/dispatches/${dispatchId}/remove-load` with `{ loadId: load.id }`.
   - On success, toast "Load removed from dispatch" and `router.refresh()`.
   - On error (400 for active stops), show the error message from the response in a toast.
   - Also update the existing `handleAttach` function: after attaching a load, the load status should be set to `assigned`. Currently it just sets `dispatchId` via the load PATCH. Add `status: 'assigned'` to the PATCH body in `handleAttach`.
   - Only show the "Attach Load" button when `dispatchStatus === 'planned'` (currently it shows for both planned and in_progress — tighten this to planned only per requirements).
  </action>
  <verify>
    Run `npx tsc --noEmit` from apps/web. Confirm no type errors. On a planned dispatch with attached loads: verify remove button appears, clicking it detaches the load (sets status back to pending). On a dispatch with a load whose stops are arrived/completed: verify remove returns "Cannot remove a load with active stops". On in_progress dispatch: verify no remove buttons and no attach button.
  </verify>
  <done>
    Planned dispatches show remove button per load. Removing a load sets load.dispatchId=null and load.status=pending. Loads with active stops (arrived/completed) cannot be removed (400 error). Attaching a load sets status to assigned. Load attachment and removal are locked for non-planned dispatches.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes from apps/web root
2. Open a planned dispatch — Edit dialog shows driver, co-driver, truck dropdowns
3. Change primary driver, save — dispatch updates, notification fires
4. Set co-driver same as primary — validation error shown
5. Open a planned dispatch — each load row has a remove (X) button
6. Remove a load — load status reverts to pending, dispatchId cleared
7. Try removing a load with arrived/completed stops — 400 error shown
8. Open an in_progress dispatch — no assignment dropdowns in edit, no remove/attach buttons on loads
</verification>

<success_criteria>
- Driver, truck, and co-driver are editable on planned dispatches via the edit dialog
- Load attachment and removal works on planned dispatches with proper status transitions
- All changes are tenant-isolated
- Non-planned dispatches lock all assignment fields
- Active-stop guard prevents removing loads mid-transit
</success_criteria>

<output>
After completion, create `.planning/quick/227-allow-editing-driver-truck-and-load-assi/227-SUMMARY.md`
</output>
