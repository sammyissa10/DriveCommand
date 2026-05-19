---
phase: quick
plan: "375"
subsystem: carrier/templates + carrier/facilities
tags: [diagnosis, tkt-0027, bug-42, facility-search, route-template, sheet]
dependency_graph:
  requires: []
  provides: ["375-fix-prompt"]
  affects: ["StopBuilderAddModal", "FacilitySearchModal", "FacilityForm", "RouteTemplateForm"]
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/375-tkt-0027-diagnosis-audit-create-new-faci/375-SUMMARY.md
  modified: []
decisions:
  - "TKT-0027 and Bug 42 are ALREADY FIXED — both were resolved by quick-185 (Apr 5 2026) and quick-314 (May 14 2026). No further fix needed."
metrics:
  duration: "8 minutes"
  completed: "2026-05-19"
---

# Phase quick Plan 375: TKT-0027 Diagnosis — Create New Facility in Template Flow

**One-liner:** TKT-0027 and Bug 42 are both already resolved; the Sheet + onSuccess + onCancel wiring was completed in quick-185 and quick-314 respectively.

---

## Reproduction (Historical — Bug No Longer Reproducible)

The original broken flow was:

1. User navigates to `/carrier/templates/new` and partially fills out `RouteTemplateForm` (React `useState` fields: templateName, clientId, stops, etc.)
2. User clicks "Add Stop" inside the `StopBuilder` component, which opens `StopBuilderAddModal` at step 1
3. `StopBuilderAddModal` renders `FacilitySearchModal` (a shadcn `Dialog`) at step 1
4. User clicks "Create New Facility" inside `FacilitySearchModal`
5. **Bug (historical):** The `onCreateNew` callback was wired but the `StopBuilderAddModal` code pre-quick-185 either: (a) called `router.push('/carrier/facilities/new')` causing a full-page navigation, OR (b) called `onOpenChange(false)` inside `FacilitySearchModal`'s Create New button which closed the Dialog and triggered `StopBuilderAddModal`'s reset `useEffect` (runs on `!open`), wiping all step/facility state
6. **Bug 42 (historical):** When the user was navigated to `/carrier/facilities/new` (standalone page), `FacilityForm.tsx` had no `onCancel` prop — its Cancel button always called `router.push('/carrier/facilities')`, sending the user to the facilities list instead of back to the template

---

## Files Involved

| File | Role | Key Lines |
|------|------|-----------|
| `apps/web/src/app/(owner)/carrier/templates/new/page.tsx` | Page shell — renders `<RouteTemplateForm />` with no props | Line 25 |
| `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` | Template form — all state in `useState` hooks, renders `<StopBuilder stops={stops} onChange={setStops} mode="template" />` | Lines 107–159 (state), Line 738–753 (StopBuilder render) |
| `apps/web/src/components/carrier/stops/StopBuilder.tsx` | Stop list manager — owns `showAddModal` state, renders `<StopBuilderAddModal open={showAddModal} … />` | Lines 43–44 (state), Lines 154–159 (modal render) |
| `apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx` | Two-step modal — step 1 = FacilitySearchModal + Sheet combo, step 2 = quick-add form | Lines 66–69 (state), Lines 126–156 (step 1 render with Sheet), Lines 133–135 (onCreateNew handler) |
| `apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx` | shadcn Dialog — search + "Create New Facility" button | Lines 22–27 (props interface, including optional `onCreateNew`), Lines 172–188 (button + onClick) |
| `apps/web/src/components/carrier/facilities/FacilityForm.tsx` | Reusable facility creation form — already accepts `onSuccess` and `onCancel` callbacks | Lines 80–86 (props interface), Lines 230–241 (onSuccess branch), Line 552 (onCancel branch) |
| `apps/web/src/components/ui/sheet.tsx` | shadcn Sheet primitive (Radix Dialog under the hood) | Full file — confirmed present |
| `apps/web/src/app/(owner)/carrier/facilities/new/page.tsx` | Standalone facility page — renders `<FacilityForm />` with no props (standalone context, not used by template flow) | Line 25 |

---

## Root Cause (Historical)

### What the "Create New Facility" button actually does (current code)

**`FacilitySearchModal.tsx` lines 172–188:**
```tsx
{onCreateNew && (
  <div className="border-t border-border pt-3">
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => {
        // Do NOT close the search modal — the sheet should open on top
        onCreateNew();
      }}
    >
      <Plus className="mr-2 h-4 w-4" />
      Create New Facility
    </Button>
  </div>
)}
```

The button calls `onCreateNew()` without closing the dialog. The comment explicitly notes the design intent.

**`StopBuilderAddModal.tsx` lines 133–135** (the `onCreateNew` handler passed to `FacilitySearchModal`):
```tsx
onCreateNew={() => {
  setShowFacilitySheet(true);
}}
```

This opens a shadcn Sheet (`showFacilitySheet` state, line 69) rendered directly inside `StopBuilderAddModal` at lines 139–154, overlaying the `FacilitySearchModal` dialog without closing it.

**`FacilityForm` inside the Sheet (lines 145–150 of `StopBuilderAddModal.tsx`):**
```tsx
<FacilityForm
  onSuccess={(created) => {
    setShowFacilitySheet(false);
    handleFacilitySelect(created);
  }}
  onCancel={() => setShowFacilitySheet(false)}
/>
```

On success: sheet closes, newly created facility is auto-selected into step 2 (no navigation). On cancel: sheet closes, search dialog remains.

### Why both bugs are now fixed

- **TKT-0027** (modal closes and returns to template form): Fixed in **quick-185** (`c0c9aed0`, Apr 5 2026). The original Create New button was calling `onOpenChange(false)` — which triggered `StopBuilderAddModal`'s `useEffect` reset — and `FacilityForm` had no `onSuccess` callback so it called `router.push`. Both were corrected: the button no longer closes the dialog, and `FacilityForm.onSuccess` passes the new facility back instead of navigating.
- **Bug 42** (Cancel inside New Facility modal sends user to `/carrier/facilities` list): Fixed in **quick-314** (`77e9f868`, May 14 2026). `FacilityForm`'s Cancel button previously always called `router.push('/carrier/facilities')`. The `onCancel` prop was added and `StopBuilderAddModal` passes `onCancel={() => setShowFacilitySheet(false)}`, so Cancel now only closes the sheet.

---

## Template State Mechanism

`RouteTemplateForm` holds all form data in plain React `useState` hooks (lines 111–159 of `RouteTemplateForm.tsx`): `templateName`, `clientId`, `contractId`, `scheduleType`, rrule state, `stops`, etc. There is no URL param persistence, no `sessionStorage`, no `localStorage`, and no Zustand store.

**State is preserved** across the facility creation flow because the current implementation never navigates away from `/carrier/templates/new`. The Sheet and Dialog stack stays on top of the same React tree, so all `RouteTemplateForm` state variables survive untouched. If a full `router.push` were to occur (e.g., if the fixes were reverted), all `useState` data would be lost immediately — there is no fallback persistence mechanism.

---

## Relationship to Bug 42

**Same root cause, distinct symptoms.**

Both bugs stem from the pre-quick-185 absence of callback props on `FacilityForm` and the pre-quick-314 absence of the `onCancel` prop:

- **TKT-0027** = "Create New Facility closes the modal and abandons the template" → caused by `onOpenChange(false)` call in the button + `router.push` in `FacilityForm` (no `onSuccess`)
- **Bug 42** = "Navigating back from New Facility modal loses template form data" → caused by `router.push('/carrier/facilities')` in FacilityForm's Cancel button (no `onCancel`)

Both are now resolved. They share the same architectural root (FacilityForm was page-navigation-only), but manifest as two distinct user-facing breakages.

---

## Behavior Summary Table

| Question | Answer | Evidence (file:line) |
|----------|--------|----------------------|
| What does "Create New Facility" currently do? | Opens a shadcn Sheet on top of the FacilitySearchModal Dialog without closing it; Sheet contains FacilityForm with onSuccess + onCancel callbacks | `FacilitySearchModal.tsx:179-182`, `StopBuilderAddModal.tsx:133-135`, `StopBuilderAddModal.tsx:139-154` |
| Is shadcn Sheet available? | YES | `apps/web/src/components/ui/sheet.tsx` (full file confirmed) |
| Can FacilityForm be reused as-is in a Sheet? | YES | `FacilityForm.tsx:80-86` — `onSuccess` and `onCancel` props both exist and are already wired in `StopBuilderAddModal` |
| Is template form state preserved across nav? | YES (no nav occurs; React useState survives in-tree Sheet/Dialog overlay) | `RouteTemplateForm.tsx:111-159` (all useState), `StopBuilderAddModal.tsx:70-78` (reset only on `!open`) |
| Is this the same as Bug 42? | RELATED — same architectural root (missing FacilityForm callbacks), distinct symptoms | `FacilityForm.tsx:552` (onCancel), `FacilityForm.tsx:230-241` (onSuccess) |

---

## Recommended Fix Approach

**No fix is needed.** Both TKT-0027 and Bug 42 were already resolved:

- `quick-185` (`c0c9aed0`, Apr 5 2026): Added `onSuccess` to `FacilityForm`, fixed `FacilitySearchModal` Create New button to not close the dialog, wired `StopBuilderAddModal` to use the Sheet + `FacilityForm` combo
- `quick-314` (`77e9f868`, May 14 2026): Added `onCancel` to `FacilityForm`, wired `StopBuilderAddModal` to pass `onCancel={() => setShowFacilitySheet(false)}`

The current implementation in `StopBuilderAddModal.tsx` already uses the exact pattern that the fix prompt would have recommended: a shadcn Sheet nested alongside `FacilitySearchModal`, with `FacilityForm` receiving `onSuccess` (auto-select new facility into step 2) and `onCancel` (close sheet only). No source files need to be modified.

**Most recent commit touching the relevant files:**
- `77e9f868` — `fix(quick-314): Bug 42 - make FacilityForm Cancel context-aware via onCancel prop` (May 14 2026)

---

Diagnosis complete. Ready for fix prompt.

---

## Self-Check: PASSED

- `375-SUMMARY.md` created at correct path
- Cites 8 files with line-number references
- Zero source-code files modified
- All 6 required sections present
- Behavior summary table complete
- Both TKT-0027 and Bug 42 root causes documented
- Fix approach stated (no action needed — already resolved)
