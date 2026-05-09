---
phase: quick-193
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
  - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
autonomous: true
must_haves:
  truths:
    - "Edit button opens a dialog (not a dead link) when dispatch is in planned status"
    - "Edit dialog saves scheduledDeparture, plannedMiles, actualMiles, and notes via PATCH"
    - "Edit button is disabled (greyed out) when dispatch is in_progress, completed, cancelled, or tonu"
    - "Inline odometer end (actualMiles) blur-save works without silent failure"
  artifacts:
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "actualMiles in DispatchUpdateInput type"
      contains: "actualMiles"
    - path: "apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts"
      provides: "actualMiles in Zod schema"
      contains: "actualMiles"
    - path: "apps/web/src/components/carrier/dispatches/DispatchHeader.tsx"
      provides: "Edit dialog with form fields"
      contains: "Dialog"
  key_links:
    - from: "DispatchHeader edit dialog"
      to: "/api/v1/carrier/dispatches/[id]"
      via: "PATCH fetch in handleEditSave"
      pattern: "patchDispatch.*scheduledDeparture"
---

<objective>
Fix the broken Edit button on the dispatch detail page. Currently it links to a non-existent `/edit` route (404). Replace with an inline shadcn Dialog containing editable fields for scheduledDeparture, plannedMiles, actualMiles, and notes. Also fix the silent failure when saving actualMiles by adding it to the API schema and type.

Purpose: Dispatchers cannot edit dispatch details after creation — this is a core workflow blocker.
Output: Working edit dialog + fixed actualMiles persistence.
</objective>

<context>
@apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add actualMiles to API schema and lib type</name>
  <files>
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
  </files>
  <action>
    1. In `apps/web/src/lib/carrier/dispatches.ts` line ~44, add `actualMiles?: number;` to the `DispatchUpdateInput` type (after `plannedMiles`). The `updateDispatch` function already spreads `...updateData` into Prisma, so this flows through automatically.

    2. In `apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts` line ~18, add `actualMiles: z.number().optional(),` to `DispatchUpdateSchema` (after `plannedMiles`). Also add `scheduledArrival: z.string().datetime().optional(),` if not already present (it IS already present at line 15, so just add actualMiles).

    This fixes the inline odometer-end blur-save that silently fails because actualMiles gets stripped by Zod validation.
  </action>
  <verify>
    Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors. Grep both files for `actualMiles` to confirm presence.
  </verify>
  <done>
    `DispatchUpdateInput` includes `actualMiles?: number`, `DispatchUpdateSchema` includes `actualMiles: z.number().optional()`. Inline odometer-end blur-save will now persist to DB.
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace Edit link with shadcn Dialog in DispatchHeader</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
  </files>
  <action>
    **1. Expand the DispatchHeaderProps dispatch type** to include fields the dialog needs:
    ```
    scheduledDeparture: string;      // ISO string
    scheduledArrival: string | null;  // ISO string or null
    ```
    (The parent page.tsx already serializes and passes these in `serializedDispatch`.)

    **2. Add imports:**
    - `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` from `@/components/ui/dialog`
    - `Label` from `@/components/ui/label` (if exists, otherwise use plain label elements)
    - Remove `Link` from `next/link` import (no longer used)

    **3. Add dialog state** inside the `DispatchHeader` component (after existing state):
    ```
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({
      scheduledDeparture: '',
      plannedMiles: '',
      actualMiles: '',
      notes: '',
    });
    ```

    **4. Add helper functions:**

    `openEditDialog()` — sets editForm state from dispatch prop:
    - `scheduledDeparture`: convert ISO string to `datetime-local` format by slicing first 16 chars (YYYY-MM-DDTHH:mm)
    - `plannedMiles`: `String(dispatch.plannedMiles ?? '')`
    - `actualMiles`: `String(dispatch.actualMiles ?? '')`
    - `notes`: strip `[DISPATCH_NUMBER=...]` prefix and `[AUTO-GENERATED]` suffix from `dispatch.notes` for display. Use regex: `dispatch.notes?.replace(/^\[DISPATCH_NUMBER=[^\]]*\]\s*/, '').replace(/\s*\[AUTO-GENERATED\]\s*$/, '').trim() ?? ''`
    - Then `setEditOpen(true)`

    `handleEditSave()` — wrapped in `startTransition`:
    - Build payload object: `scheduledDeparture` (convert back to ISO with `new Date(editForm.scheduledDeparture).toISOString()`), `plannedMiles` (parseFloat, only if non-empty), `actualMiles` (parseFloat, only if non-empty), `notes` (re-prepend the `[DISPATCH_NUMBER=...]` tag extracted from original notes, re-append `[AUTO-GENERATED]` if original had it)
    - Call existing `patchDispatch(payload)`
    - On success: `toast.success('Dispatch updated')`, `setEditOpen(false)`, `router.refresh()`
    - On error: `toast.error(err.message)`
    - Also update the local `plannedMilesInput` and `actualMilesInput` state to match new values so inline inputs stay in sync

    **5. Replace the Edit `<Link>` (lines 257-263) with a `<Button>`:**
    ```tsx
    <Button
      size="sm"
      variant="outline"
      onClick={openEditDialog}
      className="inline-flex items-center gap-1.5"
    >
      <Edit2 className="h-3.5 w-3.5" />
      Edit
    </Button>
    ```
    Keep the existing disabled span for `isInProgress || isLocked` (lines 248-255) — that already handles the disabled state correctly.

    **6. Add the Dialog JSX** at the end of the component return, inside the outer div but after all existing content:
    ```tsx
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Dispatch{dispatchNumber ? ` ${dispatchNumber}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Scheduled Departure</label>
            <input
              type="datetime-local"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={editForm.scheduledDeparture}
              onChange={(e) => setEditForm((f) => ({ ...f, scheduledDeparture: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Planned Miles</label>
              <input
                type="number"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={editForm.plannedMiles}
                onChange={(e) => setEditForm((f) => ({ ...f, plannedMiles: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Actual Miles</label>
              <input
                type="number"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={editForm.actualMiles}
                onChange={(e) => setEditForm((f) => ({ ...f, actualMiles: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm min-h-[80px]"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Dispatch notes..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={handleEditSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    ```

    **Important details:**
    - Use the same `isPending` / `startTransition` that existing status actions use
    - Input styling matches shadcn Input classes (the inline inputs in this file already use this pattern)
    - The `[DISPATCH_NUMBER=...]` tag extraction: use `const dnMatch = dispatch.notes?.match(/^\[DISPATCH_NUMBER=[^\]]*\]/) ?? null` to capture it, then prepend `dnMatch?.[0] + ' '` back on save if it existed
    - Similarly check for `[AUTO-GENERATED]` suffix presence before stripping/re-adding
  </action>
  <verify>
    Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors. Visually verify the component renders by loading a dispatch detail page — the Edit button should open a dialog with pre-filled fields.
  </verify>
  <done>
    Edit button opens a Dialog with scheduledDeparture (datetime-local), plannedMiles, actualMiles, and notes fields. Saving calls PATCH API and refreshes the page. Notes display is cleaned of internal tags. Edit button remains disabled for in_progress/completed/cancelled/tonu dispatches.
  </done>
</task>

</tasks>

<verification>
1. Navigate to a dispatch detail page with status "planned" — Edit button should open a dialog
2. Verify all 4 fields are pre-filled correctly from dispatch data
3. Change a field, click Save — toast shows success, dialog closes, page refreshes with new data
4. Navigate to an in_progress or completed dispatch — Edit button should be greyed out and not clickable
5. Test inline odometer end (actualMiles) blur-save — should now persist without error
6. Run `npx tsc --noEmit -p apps/web/tsconfig.json` — no type errors
</verification>

<success_criteria>
- Edit button opens dialog (not 404 link) on planned dispatches
- Dialog saves all 4 fields via PATCH API
- Edit disabled on in_progress/completed/cancelled/tonu dispatches
- Inline actualMiles blur-save works (no silent failure)
- No TypeScript errors
</success_criteria>
