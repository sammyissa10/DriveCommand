# Quick-501: Replace blocking window.confirm on stop removal — Summary

**One-liner:** `StopCard.handleRemove` no longer parks the JS main thread behind a synchronous `window.confirm('Remove this stop?')` — it removes the stop immediately (matching `MobileStopsEditor` parity for unsaved, in-form data) — and `StopBuilder`'s `DndContext` now wires `onDragCancel` to clear `activeId`, so an aborted keyboard drag no longer leaves the `DragOverlay` clone stuck on screen.

## What was broken

Two pre-existing (not from tasks 498-500) defects in the desktop New Load stops list:

1. **Blocking confirm** — `StopCard.tsx` `handleRemove` gated stop removal behind `window.confirm(...)`, a synchronous native dialog that blocks the main thread until answered (the source of the "1-2 min freeze" observed under automation, since headless/automated contexts can't answer a native `confirm`).
2. **Stuck drag overlay** — `StopBuilder.tsx`'s `DndContext` wired `onDragStart` + `onDragEnd` but no `onDragCancel`, so an aborted keyboard drag (e.g. Escape) never reset `activeId`, leaving the `<DragOverlay>` clone rendered indefinitely.

Both stops are unsaved, in-form (client-side only) data — removal is confirm-free by product decision (mobile parity with `MobileStopsEditor`, which already removes without confirmation).

## What changed (2 commits)

### Task 1 — `caa75d56` — Remove the blocking confirm (StopCard.tsx)
- `handleRemove` deletes the `window.confirm('Remove this stop?')` gate and calls `onRemove()` directly.
- `e.stopPropagation()` is preserved (prevents the card-body expand/collapse toggle from firing when the Remove button is clicked).

### Task 2 — `3ce6d72d` — Clear overlay on cancelled drag (StopBuilder.tsx)
- Added `handleDragCancel()` which calls `setActiveId(null)`.
- Wired `onDragCancel={handleDragCancel}` onto the existing `DndContext`, alongside `onDragStart`/`onDragEnd`.
- `sensors` and `collisionDetection` were not touched.

## Verification results

- `npx next build` from `apps/web` — compiled successfully with no new errors (only the pre-existing, unrelated Turbopack NFT-trace baseline noise on `next.config.ts`, present regardless of this change).
- Grep confirms zero `window.confirm` remaining in `StopCard.tsx`.
- Grep confirms `onDragCancel={handleDragCancel}` present on the `DndContext` in `StopBuilder.tsx` (line 96).
- `git diff --name-only` across both commits touches only `StopCard.tsx` and `StopBuilder.tsx` — no changes to `LoadForm.tsx`, `loads.ts`, `MobileStopsEditor.tsx`, or any 498-500 files.

### Reasoned-through scenarios (per constraints)
- **Add Stop modal** — unaffected; `StopBuilderAddModal` open/close logic (`showAddModal` state, `onOpenChange`) was untouched by either change.
- **Select-existing-facility add** — unaffected; `handleAdd` in `StopBuilder.tsx` (appends stop + resequences) was not touched.
- **Remove now deletes immediately with no dialog** — `handleRemove` in `StopCard.tsx` calls `onRemove()` synchronously on click with `e.stopPropagation()` still preventing the card from also toggling expand; `StopBuilder.handleRemove(id)` (unchanged) filters the stop out and resequences the remainder.
- **Drag-reorder still resequences** — `handleDragEnd` is completely unchanged: on a valid drop (`over` present, `active.id !== over.id`) it still computes `oldIndex`/`newIndex`, calls `arrayMove`, and `resequence`s via `onChange`. Only the new `onDragCancel` handler was added alongside it.
- **Aborted drag clears the overlay** — pressing Escape (or any DnD-kit-recognized cancel) now fires `onDragCancel` → `handleDragCancel()` → `setActiveId(null)`, so `activeStop` becomes `null` and `<DragOverlay>` renders nothing instead of sticking with the last dragged clone.

## Deviations from plan

None — plan executed exactly as written.

## Not done (explicitly out of scope per plan)

- No new dialog/confirmation component added.
- `sensors` and `collisionDetection` on `DndContext` left untouched.
- `LoadForm.tsx`, `loads.ts`, `MobileStopsEditor.tsx`, and tasks 498-500 files were not touched.
- Not deployed, not pushed — commits only (orchestrator handles the final push/deploy decision).

## Files changed

- `apps/web/src/components/carrier/stops/StopCard.tsx`
- `apps/web/src/components/carrier/stops/StopBuilder.tsx`

## Commits

- `caa75d56` fix(quick-501): remove blocking window.confirm on stop removal
- `3ce6d72d` fix(quick-501): clear drag overlay on cancelled drag

## Self-Check: PASSED

- `apps/web/src/components/carrier/stops/StopCard.tsx` — FOUND
- `apps/web/src/components/carrier/stops/StopBuilder.tsx` — FOUND
- Commit `caa75d56` — FOUND
- Commit `3ce6d72d` — FOUND
