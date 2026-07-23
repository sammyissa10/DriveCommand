---
phase: quick-500
plan: 500
subsystem: carrier-web-facilities
tags: [dialog, radix, facilities, stops, bugfix]
dependency-graph:
  requires: []
  provides:
    - "FacilitySearchModal bodyOnly mode"
    - "StopBuilderAddModal single-Dialog three-view flow"
  affects:
    - "apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx"
    - "apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx"
tech-stack:
  added: []
  patterns:
    - "Body-only render mode on a shared Radix Dialog component so a parent can host it inside its own single Dialog without stacking Dialog/Sheet layers"
key-files:
  created: []
  modified:
    - apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
    - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
decisions:
  - "Kept FacilitySearchModal's default (non-bodyOnly) branch byte-for-byte behavior-identical to preserve TripAddStopModal, which was explicitly out of scope."
metrics:
  duration: "~25 min"
  completed: 2026-07-23
---

# Quick Task 500: Fix Dead Create New Facility Button Summary

Collapsed a stacked Radix Sheet-on-top-of-Dialog into a single Radix Dialog with three internal views (search / create / details) so the "Create New Facility" button in the desktop Add Stop flow actually opens the create form instead of appearing dead.

## Root Cause

`StopBuilderAddModal` rendered `FacilitySearchModal` (its own modal `<Dialog>`) and, on "Create New Facility" click, opened a `<Sheet>` (also a Radix Dialog primitive under the hood) on top of it. The already-open Dialog's overlay/`pointer-events: none` lock on the rest of the page blocked or hid the Sheet, so the button appeared to do nothing.

## What Changed

**`FacilitySearchModal.tsx`** — Added an optional `bodyOnly?: boolean` prop (default false). Extracted the search input, results list, and "Create New Facility" button into a local `body` fragment. When `bodyOnly` is true, the component returns just `body` (no `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` — the parent owns the Dialog and title). When `bodyOnly` is falsy/absent, the component renders exactly as before: its own `<Dialog><DialogContent><DialogHeader><DialogTitle>Search Facilities</DialogTitle></DialogHeader>{body}</DialogContent></Dialog>`. All existing state/effects (`query`, `results`, `isLoading`, debounce, `handleSelect`) are untouched and shared by both modes. Also removed the now-inaccurate "sheet should open on top" comment on the Create New button's onClick.

**`StopBuilderAddModal.tsx`** — Removed the `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle` import and the `showFacilitySheet` state entirely. Replaced the `step: 1 | 2` model with `view: 'search' | 'create' | 'details'`. The component now returns exactly ONE `<Dialog>` for the whole component (no early returns, no second Dialog/Sheet), with `<DialogContent>` branching its header + body on `view`:
- `search` — `FacilitySearchModal` rendered with `bodyOnly` inside the parent's own `DialogHeader`/`DialogTitle` ("Search Facilities").
- `create` — a header row with a ghost Back button (`ArrowLeft` + "Back") next to `DialogTitle` ("Create New Facility"), then `FacilityForm` rendered in-dialog with `onSuccess={(created) => handleFacilitySelect(created)}` and `onCancel={() => setView('search')}`. `FacilityForm` was not modified; its `onSuccess` payload shape (`{id, name, city, state, facilityType}`) already matches `FacilitySearchResult`, so it feeds `handleFacilitySelect` directly.
- `details` — the existing step-2 quick-add form body, verbatim, with the "Change" button now calling `setView('search')` instead of `setStep(1)`.

`DialogContent` className updated to `sm:max-w-lg max-h-[85vh] overflow-y-auto` so the (potentially taller) create form scrolls within the dialog. The reset-on-close `useEffect` now resets `view` to `'search'` (plus clearing `selectedFacility`/`form`) instead of resetting `step`/`showFacilitySheet`.

## Flow Verified (by reasoning through the code)

1. Dialog opens → `view='search'` → `FacilitySearchModal` (bodyOnly) renders search input + results + Create New Facility button inside the single Dialog.
2. Selecting an existing facility → `handleFacilitySelect` → `view='details'` — unchanged behavior, Add Stop still works.
3. Clicking "Create New Facility" → `onCreateNew={() => setView('create')}` → same Dialog swaps to `FacilityForm` with a Back control — no second Dialog/Sheet ever mounts.
4. Back button in create view → `setView('search')` → returns to search.
5. Successful `FacilityForm` submission → `onSuccess(created)` → `handleFacilitySelect(created)` → `view='details'` with the new facility selected, matching the same path as selecting an existing facility.
6. Escape/Close (`onOpenChange(false)`) → reset `useEffect` fires on `!open` → `view` resets to `'search'`.

At every point exactly one Radix Dialog is mounted (the parent's); `FacilitySearchModal` never renders its own Dialog because `bodyOnly` is always passed from `StopBuilderAddModal`. `TripAddStopModal.tsx` (the other consumer) was not touched and still calls `FacilitySearchModal` with the original signature (no `bodyOnly`), so it continues to render its own Dialog exactly as before.

## Verification

- `npx next build` from `apps/web`: compiled successfully (Turbopack, 27.5s), TypeScript check finished with no new errors, all 217 static pages generated. The only warning present (`next.config.ts` NFT trace) is pre-existing and unrelated to the touched files.
- Grep `StopBuilderAddModal.tsx`: zero matches for `Sheet`, zero for `showFacilitySheet`, exactly one `<Dialog` in the file.
- Grep `FacilitySearchModal.tsx`: `bodyOnly` present in props interface, in destructured params, and in the branch; default (non-bodyOnly) path still contains `<Dialog` and `<DialogTitle>Search Facilities`.
- Grep `TripAddStopModal.tsx`: still imports/uses `FacilitySearchModal` with the original (no `bodyOnly`) call signature — untouched, still compiles.
- No emoji introduced in any copy.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx (bodyOnly prop + branch present)
- FOUND: apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx (view state, single Dialog, no Sheet)
- FOUND commit 68559700: feat(quick-500): add backward-compatible bodyOnly mode to FacilitySearchModal
- FOUND commit ffa875fc: fix(quick-500): fix dead Create New Facility button in Add Stop flow
