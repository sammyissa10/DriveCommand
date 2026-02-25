---
phase: quick-35
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/drivers/driver-list.tsx
autonomous: true
must_haves:
  truths:
    - "Clicking Remove on an active driver opens an AlertDialog confirmation modal"
    - "Confirming in the dialog calls deactivateDriver (sets isActive=false)"
    - "Cancelling the dialog leaves the driver unchanged"
    - "Clicking Reactivate on an inactive driver opens a separate AlertDialog confirmation"
    - "No native window.confirm calls remain in driver-list.tsx"
  artifacts:
    - path: "src/components/drivers/driver-list.tsx"
      provides: "Driver list with AlertDialog confirmation for deactivate and reactivate"
      contains: "AlertDialog"
  key_links:
    - from: "src/components/drivers/driver-list.tsx"
      to: "src/components/ui/alert-dialog.tsx"
      via: "import AlertDialog components"
      pattern: "AlertDialog"
---

<objective>
Replace window.confirm calls in the drivers list with a proper shadcn AlertDialog confirmation modal for both Remove (deactivate) and Reactivate actions.

Purpose: window.confirm is a browser-native modal with no styling control. AlertDialog provides a polished, accessible confirmation UX consistent with the rest of the app.
Output: Updated driver-list.tsx with AlertDialog-based confirmations replacing all window.confirm usage.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace window.confirm with AlertDialog in driver-list.tsx</name>
  <files>src/components/drivers/driver-list.tsx</files>
  <action>
    Rewrite src/components/drivers/driver-list.tsx to use AlertDialog instead of window.confirm.

    Import from @/components/ui/alert-dialog: AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel.

    Add state to track which dialog is open and for which driver:
    - pendingDeactivate: { id: string; firstName: string; lastName: string } | null
    - pendingReactivate: { id: string; firstName: string; lastName: string } | null

    Remove the handleDeactivate and handleReactivate functions that call window.confirm.

    In the actions column cell:
    - For active drivers: render a button labeled "Remove" (with UserX icon) that sets pendingDeactivate to the driver's details. Do NOT use AlertDialogTrigger wrapping the table cell button — instead use a plain button and control open state with !!pendingDeactivate.
    - For inactive drivers: render a button labeled "Reactivate" (with UserCheck icon) that sets pendingReactivate.

    Outside the table (but inside the return fragment), render two controlled AlertDialog instances:

    Deactivate dialog (open={!!pendingDeactivate} onOpenChange={(open) => !open && setPendingDeactivate(null)}):
    - Title: "Remove Driver"
    - Description: "Are you sure you want to remove {firstName} {lastName}? They will lose access immediately. You can reactivate them at any time."
    - Cancel: "Cancel" (calls setPendingDeactivate(null))
    - Action: "Remove Driver" with className="bg-destructive text-destructive-foreground hover:bg-destructive/90" (calls onDeactivate(pendingDeactivate.id) then setPendingDeactivate(null))

    Reactivate dialog (open={!!pendingReactivate} onOpenChange={(open) => !open && setPendingReactivate(null)}):
    - Title: "Reactivate Driver"
    - Description: "Reactivate {firstName} {lastName}? They will regain access to the driver app."
    - Cancel: "Cancel"
    - Action: "Reactivate" (default styling — calls onReactivate(pendingReactivate.id) then setPendingReactivate(null))

    Keep all other existing UI (search input, table columns, sorting, empty state) exactly as-is. Do not change DriverListProps interface — onDeactivate and onReactivate signatures remain the same.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -i "driver-list" || echo "No TS errors in driver-list"</verify>
  <done>driver-list.tsx uses AlertDialog for Remove and Reactivate confirmations; no window.confirm calls remain; TypeScript compiles without errors in that file</done>
</task>

</tasks>

<verification>
- grep for "window.confirm" in src/components/drivers/driver-list.tsx returns no results
- grep for "AlertDialog" in src/components/drivers/driver-list.tsx returns results
- npx tsc --noEmit passes without errors related to driver-list.tsx
</verification>

<success_criteria>
- Clicking "Remove" on an active driver row opens a modal with title "Remove Driver" and a destructive confirm button
- Clicking "Reactivate" on an inactive driver row opens a modal with title "Reactivate Driver"
- Cancelling either dialog does nothing to the driver's status
- No native browser confirm dialogs appear anywhere on the drivers page
</success_criteria>

<output>
After completion, create `.planning/quick/35-add-remove-deactivate-driver-functionali/35-SUMMARY.md`
</output>
