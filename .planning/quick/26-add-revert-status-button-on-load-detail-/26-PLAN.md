---
phase: quick-26
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/loads.ts
  - src/components/loads/status-update-button.tsx
autonomous: true

must_haves:
  truths:
    - "User can revert a load status one step back (e.g. Delivered -> In Transit)"
    - "Revert button is visible for statuses past PENDING (DISPATCHED through INVOICED)"
    - "Revert button is placed near existing status action buttons"
    - "PENDING and CANCELLED statuses have no revert option"
  artifacts:
    - path: "src/app/(owner)/actions/loads.ts"
      provides: "revertLoadStatus server action"
      contains: "revertLoadStatus"
    - path: "src/components/loads/status-update-button.tsx"
      provides: "Revert status button UI"
      contains: "PREV_STATUS"
  key_links:
    - from: "src/components/loads/status-update-button.tsx"
      to: "src/app/(owner)/actions/loads.ts"
      via: "revertLoadStatus server action prop"
      pattern: "revertStatusAction"
---

<objective>
Add a "Revert Status" button to the load detail page that steps the load status back one step in the lifecycle (INVOICED -> DELIVERED -> IN_TRANSIT -> PICKED_UP -> DISPATCHED).

Purpose: Allow dispatchers to correct accidental status advances without cancelling loads.
Output: Working revert button on load detail page alongside existing status progression buttons.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/actions/loads.ts
@src/components/loads/status-update-button.tsx
@src/app/(owner)/loads/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add revertLoadStatus server action</name>
  <files>src/app/(owner)/actions/loads.ts</files>
  <action>
Add a REVERSE_STATUS_TRANSITIONS map and revertLoadStatus server action to loads.ts:

1. Add a REVERSE_STATUS_TRANSITIONS constant (separate from STATUS_TRANSITIONS):
   ```
   DISPATCHED -> PENDING
   PICKED_UP -> DISPATCHED
   IN_TRANSIT -> PICKED_UP
   DELIVERED -> IN_TRANSIT
   INVOICED -> DELIVERED
   ```
   PENDING and CANCELLED have no reverse transition.

2. Create `revertLoadStatus(id: string)` server action:
   - requireRole([OWNER, MANAGER])
   - Fetch current load status
   - Look up previous status from REVERSE_STATUS_TRANSITIONS
   - If no reverse transition exists, return error "Cannot revert from {status}"
   - Update load status to previous status
   - revalidatePath for /loads and /loads/{id}
   - Return { success: true }

3. When reverting FROM DISPATCHED back to PENDING:
   - Also clear driverId, truckId, and trackingToken (set to null) since PENDING loads should not have assignments
   - This matches the dispatchLoad action which sets these fields when moving to DISPATCHED

Do NOT send customer email notifications on revert (this is a correction, not a customer-facing event).
  </action>
  <verify>Check TypeScript compilation: `npx tsc --noEmit --pretty 2>&1 | head -20` should show no errors in loads.ts</verify>
  <done>revertLoadStatus server action exported from loads.ts, handles all reverse transitions including clearing assignment on DISPATCHED->PENDING revert</done>
</task>

<task type="auto">
  <name>Task 2: Add revert button to StatusUpdateButton and wire into load detail page</name>
  <files>src/components/loads/status-update-button.tsx, src/app/(owner)/loads/[id]/page.tsx</files>
  <action>
Update StatusUpdateButton component (src/components/loads/status-update-button.tsx):

1. Add a PREV_STATUS map (mirrors the server-side reverse transitions for label display):
   ```
   DISPATCHED: { status: 'PENDING', label: 'Revert to Pending' }
   PICKED_UP: { status: 'DISPATCHED', label: 'Revert to Dispatched' }
   IN_TRANSIT: { status: 'PICKED_UP', label: 'Revert to Picked Up' }
   DELIVERED: { status: 'IN_TRANSIT', label: 'Revert to In Transit' }
   INVOICED: { status: 'DELIVERED', label: 'Revert to Delivered' }
   ```

2. Add optional `revertStatusAction` prop to StatusUpdateButtonProps:
   `revertStatusAction?: (id: string) => Promise<any>`

3. Add a handleRevert function (same pattern as handleProgress but calls revertStatusAction and uses window.confirm: "Are you sure you want to revert this load to {prev label}?").

4. Render the revert button ONLY when:
   - revertStatusAction prop is provided
   - PREV_STATUS[currentStatus] exists (not PENDING or CANCELLED)

5. Style the revert button with a muted/outline style to visually distinguish from the primary "advance" button. Use Undo2 icon from lucide-react. Place it AFTER the advance button but BEFORE the cancel button. Example classes:
   `"inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"`

Update load detail page (src/app/(owner)/loads/[id]/page.tsx):

1. Import revertLoadStatus from the actions file.
2. Pass `revertStatusAction={revertLoadStatus}` to the StatusUpdateButton component where it is rendered (line ~111-115 area).
  </action>
  <verify>Run `npx tsc --noEmit --pretty 2>&1 | head -30` to confirm no TypeScript errors. Then run `npm run build 2>&1 | tail -20` to confirm build succeeds.</verify>
  <done>Revert button appears on load detail page for DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED/INVOICED statuses. Button styled as secondary/outline to distinguish from primary advance button. Clicking shows confirmation dialog then reverts status one step back.</done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors
2. Build succeeds
3. Load detail page shows revert button for non-PENDING/non-CANCELLED loads
4. Revert button has distinct muted styling vs primary advance button
</verification>

<success_criteria>
- Revert button visible on load detail page for statuses DISPATCHED through INVOICED
- Clicking revert steps status back exactly one step with confirmation dialog
- Reverting from DISPATCHED clears driver/truck assignment
- No customer email sent on revert
- Button visually subordinate to the primary advance button
</success_criteria>

<output>
After completion, create `.planning/quick/26-add-revert-status-button-on-load-detail-/26-SUMMARY.md`
</output>
