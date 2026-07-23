---
phase: quick-500
plan: 500
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
  - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
autonomous: true

must_haves:
  truths:
    - "Clicking 'Create New Facility' in the desktop Add Stop flow swaps the dialog body to the facility create form (no dead button)"
    - "A Back control on the create view returns to the search view"
    - "Successfully creating a facility advances directly to the stop-details view with the new facility selected"
    - "Selecting an existing facility still advances to the stop-details view and Add Stop still works"
    - "At most ONE Radix Dialog (and zero Sheets) is mounted at any point in the whole flow"
    - "TripAddStopModal (other FacilitySearchModal consumer) still compiles and renders unchanged"
  artifacts:
    - path: "apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx"
      provides: "Backward-compatible body-only render mode (search input + results + create button) that omits its own Dialog wrapper when bodyOnly is set"
      contains: "bodyOnly"
    - path: "apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx"
      provides: "Single-Dialog three-view flow (search | create | details); no Sheet, no showFacilitySheet"
      contains: "view"
  key_links:
    - from: "StopBuilderAddModal.tsx"
      to: "FacilitySearchModal.tsx"
      via: "FacilitySearchModal rendered with bodyOnly inside parent DialogContent"
      pattern: "FacilitySearchModal[\\s\\S]*bodyOnly"
    - from: "StopBuilderAddModal.tsx create view"
      to: "FacilityForm.tsx"
      via: "FacilityForm onSuccess -> handleFacilitySelect -> details view"
      pattern: "FacilityForm[\\s\\S]*onSuccess"
---

<objective>
Fix the dead "Create New Facility" button in the desktop Add Stop flow. Root cause: `StopBuilderAddModal` stacks a Radix `Sheet` (a Radix Dialog under the hood) on top of an already-open modal Radix `Dialog` (`FacilitySearchModal`). The open Dialog's overlay + `pointer-events` lock blocks/hides the Sheet, so the button appears dead.

Fix: collapse the whole flow into a SINGLE Radix `Dialog` owned by `StopBuilderAddModal` whose `DialogContent` swaps between three views — `search`, `create`, `details`. Never mount two Radix modal layers.

Purpose: Owners can create a facility inline while adding a stop instead of hitting a dead button.
Output: Refactored `FacilitySearchModal` (body-only mode, backward compatible) + rewritten `StopBuilderAddModal` (single-Dialog three-view flow).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
@apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
</context>

<constraints>
HARD CONSTRAINTS — call out and honor exactly:
- Do NOT convert the Dialog to non-modal. Do NOT have two simultaneously-mounted Radix modal layers (Dialog or Sheet) anywhere in this flow.
- `FacilityForm` props/contract stay unchanged. Do NOT modify `FacilityForm.tsx`. Its `onSuccess(created)` yields `{ id, name, city, state, facilityType }` — same shape as `FacilitySearchResult`, so it feeds `handleFacilitySelect` directly.
- Desktop only. Do NOT touch `MobileStopsEditor.tsx`, any mobile component, or the facilities API.
- `FacilitySearchModal` has a SECOND consumer: `apps/web/src/components/carrier/dispatches/TripAddStopModal.tsx` (imports it and passes `open/onOpenChange/onSelect/onCreateNew` with NO bodyOnly). The refactor MUST stay backward compatible — when `bodyOnly` is absent/false, `FacilitySearchModal` renders exactly as it does today (its own `<Dialog>`). Do NOT edit `TripAddStopModal.tsx`.
- No emoji in any copy.
- `tsc --noEmit` is NOT sufficient. Executor MUST run `next build` from `apps/web` before declaring done. tsc has ~35 pre-existing baseline errors (framer-motion, zustand, nuqs, papaparse, d3-geo, @tanstack/react-virtual missing @types) — only a build failure or new errors in the two touched files count.
- Commit atomically. Do NOT push. Do NOT run vercel. Orchestrator handles the final push/deploy.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Add backward-compatible body-only mode to FacilitySearchModal</name>
  <files>apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx</files>
  <action>
Add an optional `bodyOnly?: boolean` prop to `FacilitySearchModalProps` (default false/undefined).

Keep ALL existing state and effects (query, results, isLoading, debounceRef, the two useEffects, `handleSelect`) exactly as-is — both modes share them.

Extract the current inner content of `DialogContent` — the search input block, the results list block, and the "Create New button" block (the three sibling divs, NOT the `DialogHeader`) — into a local `const body = (<> ... </>)` fragment.

Then branch the return:
- When `bodyOnly` is true: return just `{body}` (a fragment). Do NOT render `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, or `<DialogTitle>` — the parent owns the Dialog and provides the title. This guarantees no second Radix Dialog is mounted.
- When `bodyOnly` is falsy (default): return the EXISTING structure unchanged — `<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Search Facilities</DialogTitle></DialogHeader>{body}</DialogContent></Dialog>`. This preserves `TripAddStopModal`'s behavior.

In the "Create New button" onClick, delete the misleading comment about opening a sheet on top; just call `onCreateNew()`. Copy text stays "Create New Facility" (no emoji).

Leave the `open` reset useEffect keyed on `open` as-is — it is harmless in body-only mode.
  </action>
  <verify>
Grep the file: `bodyOnly` appears in the props interface and the return branch. The default (non-bodyOnly) JSX still contains `<Dialog` and `<DialogTitle>Search Facilities`. `handleSelect` and both search useEffects are untouched.
  </verify>
  <done>
`FacilitySearchModal` renders identically to before when `bodyOnly` is absent; when `bodyOnly` is true it returns only the search body fragment with no Dialog/Sheet wrapper. `TripAddStopModal` still compiles against the unchanged default signature.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite StopBuilderAddModal as a single-Dialog three-view flow</name>
  <files>apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx</files>
  <action>
Remove the Sheet: delete the `Sheet, SheetContent, SheetHeader, SheetTitle` import block, delete the `showFacilitySheet` state, and delete the entire `if (step === 1) { return (<>...</>) }` early-return block containing the `<FacilitySearchModal>` + nested `<Sheet>`.

Replace the `step: 1 | 2` model with `const [view, setView] = useState<'search' | 'create' | 'details'>('search');`.

Update the reset useEffect (on `!open`) to `setView('search')` (plus the existing `setSelectedFacility(null)` and `setForm(DEFAULT_FORM)`); remove the `setShowFacilitySheet(false)` line.

Update `handleFacilitySelect` to `setSelectedFacility(facility); setView('details');`.

In the details "Change" button onClick, replace `setStep(1)` with `setView('search')`.

Return a SINGLE `<Dialog open={open} onOpenChange={onOpenChange}>` for ALL three views. Inside, one `<DialogContent>` (use `className="sm:max-w-lg max-h-[85vh] overflow-y-auto"` so the create form scrolls). Branch the header + body on `view`:

- view === 'search': `<DialogHeader><DialogTitle>Search Facilities</DialogTitle></DialogHeader>` then
  `<FacilitySearchModal bodyOnly open={open} onOpenChange={onOpenChange} onSelect={handleFacilitySelect} onCreateNew={() => setView('create')} />`
  (pass `onOpenChange` to satisfy the required prop even though body-only ignores it).

- view === 'create': `<DialogHeader>` with a Back control and title. Render a header row: a ghost `<Button type="button" variant="ghost" size="sm" onClick={() => setView('search')}>` containing `<ArrowLeft className="mr-1 h-3 w-3" />Back`, and `<DialogTitle>Create New Facility</DialogTitle>`. Then render
  `<FacilityForm onSuccess={(created) => handleFacilitySelect(created)} onCancel={() => setView('search')} />`.
  Do NOT modify FacilityForm. `created` is `{id,name,city,state,facilityType}` which matches `FacilitySearchResult`, so `handleFacilitySelect` advances to details with the new facility selected.

- view === 'details': `<DialogHeader><DialogTitle>Add Stop</DialogTitle></DialogHeader>` then the EXISTING step-2 body verbatim (selected facility header with the "Change" button, the quick-add form fields, and the Cancel/Add Stop buttons).

Keep `handleAdd`, `handleStopTypeChange`, `DEFAULT_FORM`, and the form JSX otherwise unchanged. Ensure exactly one `<Dialog>` is returned from the component (no early returns, no second Dialog/Sheet). `ArrowLeft` import stays.
  </action>
  <verify>
Grep StopBuilderAddModal.tsx: ZERO matches for `Sheet` and ZERO for `showFacilitySheet`. Exactly ONE `<Dialog` in the file. `FacilitySearchModal` is rendered with `bodyOnly`. `view` state drives search/create/details. Run `next build` from apps/web (see verification section) — must pass.
  </verify>
  <done>
Search view renders inside the single Dialog; "Create New Facility" swaps to the in-dialog FacilityForm with a working Back control; successful create advances to details with the new facility selected; selecting an existing facility and Add Stop are unchanged; Escape/Close resets view to 'search'.
  </done>
</task>

</tasks>

<verification>
From `apps/web`:
1. `npx next build` completes successfully (this is the required gate — tsc alone is NOT sufficient).
2. Grep `StopBuilderAddModal.tsx` — no `Sheet` import/usage, no `showFacilitySheet`, exactly one `<Dialog`.
3. Grep `FacilitySearchModal.tsx` — `bodyOnly` present; default branch still renders its own `<Dialog>` + `<DialogTitle>Search Facilities`.
4. Grep other consumers: `TripAddStopModal.tsx` still imports and uses `FacilitySearchModal` with the default (no bodyOnly) signature and compiles.
5. Reason through the flow: search -> create (Back returns to search) -> successful create advances to details with new facility selected; select-existing and add-stop paths unchanged; at no point are two Radix modal layers mounted.
</verification>

<success_criteria>
- `next build` passes from apps/web with no new errors in the two touched files.
- The desktop "Create New Facility" button swaps the dialog body to the create form (no dead button).
- Exactly one Radix Dialog and zero Sheets across search + create + details.
- `FacilityForm` and `TripAddStopModal` are untouched and still compile.
- No emoji introduced.
</success_criteria>

<output>
After completion, create `.planning/quick/500-fix-dead-create-new-facility-button-by-r/500-SUMMARY.md`.
Commit atomically. Do NOT push and do NOT run vercel — the orchestrator handles the final push/deploy.
</output>
