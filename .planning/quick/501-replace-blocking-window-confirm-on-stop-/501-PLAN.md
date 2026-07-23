# Quick Task 501 — Plan

**Replace blocking `window.confirm` on stop removal and clear stuck drag overlay on cancelled drags**

## Context

Diagnosis (prior task) confirmed two pre-existing (NOT 498) defects in the desktop New Load stops list:

1. **Blocking confirm** — [StopCard.tsx:98-103](../../../apps/web/src/components/carrier/stops/StopCard.tsx) `handleRemove` gates removal behind synchronous `window.confirm('Remove this stop?')`, which parks the JS main thread until the native dialog is answered (the "1-2 min freeze" under automation). Inconsistent with `MobileStopsEditor`, which removes unsaved in-form stops with no confirmation.
2. **Stuck drag overlay** — [StopBuilder.tsx:87-92](../../../apps/web/src/components/carrier/stops/StopBuilder.tsx) `DndContext` wires `onDragStart` + `onDragEnd` but **no `onDragCancel`**, so an aborted keyboard drag never clears `activeId` and the `<DragOverlay>` sticks.

Both stops are unsaved, in-form (client-side only) data — removal is confirm-free by product decision (mobile parity).

## Tasks

### Task 1 — Remove the blocking confirm (StopCard.tsx)
In `handleRemove`, delete the `window.confirm(...)` gate and call `onRemove()` directly. **Keep `e.stopPropagation()`** (prevents the card-body expand toggle from firing). Result:

```tsx
function handleRemove(e: React.MouseEvent) {
  e.stopPropagation();
  onRemove();
}
```

Commit: `fix(quick-501): remove blocking window.confirm on stop removal`

### Task 2 — Clear overlay on cancelled drag (StopBuilder.tsx)
Add `onDragCancel={() => setActiveId(null)}` to the `DndContext` (alongside the existing `onDragStart`/`onDragEnd`). Do NOT modify `sensors` or `collisionDetection`.

Commit: `fix(quick-501): clear drag overlay on cancelled drag`

## Constraints
- Modify ONLY `apps/web/src/components/carrier/stops/StopCard.tsx` and `StopBuilder.tsx`.
- Do NOT touch LoadForm.tsx, loads.ts, MobileStopsEditor.tsx, or anything from tasks 498-500.
- No new dialog components. No sensor/collision changes.
- Verification gate: `next build` from apps/web (tsc alone insufficient; ~35-error baseline is unrelated). Reason through add/select/remove/reorder paths still work.
- Executor commits atomically; does NOT push and does NOT run vercel.

## Verification
- `next build` (apps/web) compiles.
- Grep: zero `window.confirm` remaining in StopCard.tsx; `onDragCancel` present in StopBuilder.tsx.
- Walkthrough: Add Stop still opens modal; select existing facility still adds; Remove now deletes immediately with no dialog; drag-reorder still resequences; aborted drag clears the overlay.
