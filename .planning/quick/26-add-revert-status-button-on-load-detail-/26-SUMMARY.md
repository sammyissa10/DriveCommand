---
phase: quick-26
plan: "01"
subsystem: loads
tags: [loads, dispatch, status-management, server-actions]
dependency_graph:
  requires: [quick-8]
  provides: [revert-load-status]
  affects: [src/app/(owner)/actions/loads.ts, src/components/loads/status-update-button.tsx, src/app/(owner)/loads/[id]/page.tsx]
tech_stack:
  added: []
  patterns: [server-action-revert, confirmation-dialog, outline-secondary-button]
key_files:
  created: []
  modified:
    - src/app/(owner)/actions/loads.ts
    - src/components/loads/status-update-button.tsx
    - src/app/(owner)/loads/[id]/page.tsx
decisions:
  - Revert from DISPATCHED->PENDING clears driverId/truckId/trackingToken to match dispatchLoad symmetry
  - No customer email sent on revert — dispatcher correction, not customer-facing event
  - window.confirm confirmation dialog before revert (same pattern as cancel)
  - Undo2 lucide icon on revert button to visually signal backward action
  - INVOICED status included in StatusUpdateButton render condition (revert-only, no advance)
  - Revert button styled as muted/outline to be visually subordinate to primary advance button
metrics:
  duration: 122s
  completed: "2026-02-24"
  tasks: 2
  files_affected: 3
---

# Quick-26: Add Revert Status Button on Load Detail Summary

**One-liner:** Revert status button on load detail page — steps load back one lifecycle stage (INVOICED through DISPATCHED) with driver/truck assignment cleared on DISPATCHED->PENDING revert.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add revertLoadStatus server action | 3b4d9d9 | src/app/(owner)/actions/loads.ts |
| 2 | Add revert button to StatusUpdateButton and wire into load detail page | d63c9dd | src/components/loads/status-update-button.tsx, src/app/(owner)/loads/[id]/page.tsx |

## What Was Built

**revertLoadStatus server action** (`src/app/(owner)/actions/loads.ts`):
- `REVERSE_STATUS_TRANSITIONS` map: DISPATCHED->PENDING, PICKED_UP->DISPATCHED, IN_TRANSIT->PICKED_UP, DELIVERED->IN_TRANSIT, INVOICED->DELIVERED
- `revertLoadStatus(id)` server action gated to OWNER/MANAGER roles
- Fetches current status, looks up previous status from map
- Returns `{ error: "Cannot revert from {status}." }` if no reverse transition (PENDING/CANCELLED)
- When reverting DISPATCHED->PENDING: clears `driverId`, `truckId`, `trackingToken` (symmetric with dispatchLoad)
- No customer email on revert — dispatcher correction, not a customer-facing event
- Revalidates `/loads` and `/loads/[id]` on success

**StatusUpdateButton component** (`src/components/loads/status-update-button.tsx`):
- Added `PREV_STATUS` map with labels: "Revert to Pending", "Revert to Dispatched", etc.
- Added optional `revertStatusAction?: (id: string) => Promise<any>` prop
- `handleRevert` function with `window.confirm` dialog before executing revert
- Revert button rendered between advance button and cancel button
- Uses `Undo2` icon from lucide-react
- Styled as muted/outline: `border border-border bg-card text-muted-foreground hover:bg-accent`
- Only renders when `revertStatusAction` prop provided AND `PREV_STATUS[currentStatus]` exists
- Updated null-render guard: `if (!next && !canCancel && !canRevert) return null`

**Load detail page** (`src/app/(owner)/loads/[id]/page.tsx`):
- Imports `revertLoadStatus` alongside existing actions
- Passes `revertStatusAction={revertLoadStatus}` to `StatusUpdateButton`
- Render condition extended from `DISPATCHED|PICKED_UP|IN_TRANSIT|DELIVERED` to also include `INVOICED` (so revert button appears for INVOICED loads even though there is no advance button)

## Decisions Made

1. **Revert DISPATCHED->PENDING clears assignment** — dispatchLoad sets driverId/truckId/trackingToken when advancing to DISPATCHED; revert must mirror this by clearing them. PENDING loads should not carry assignment data.

2. **No customer email on revert** — Reverting is a dispatcher correction. Sending "Your load is now Picked Up... just kidding, it's Dispatched" would confuse customers. Customer-facing notifications only go on forward progression.

3. **window.confirm confirmation dialog** — Matches existing cancel load pattern. Provides a guard against accidental clicks without adding modal complexity.

4. **INVOICED included in render condition** — INVOICED has no forward advance but does have a revert (->DELIVERED). Previously the `StatusUpdateButton` was not shown for INVOICED loads at all. Now it renders with only the revert button visible.

5. **Undo2 icon** — Visually communicates backward action. Distinct from the progress-forward buttons which have no icon.

6. **Muted/outline button style** — Keeps visual hierarchy: primary blue advance > muted outline revert > red destructive cancel. Dispatchers can clearly distinguish the three action types.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript: `npx tsc --noEmit` — no errors
- Build: `npm run build` — succeeded, all pages compiled
- REVERSE_STATUS_TRANSITIONS covers all 5 reversible statuses
- PREV_STATUS in component matches server-side map exactly

## Self-Check: PASSED

Files confirmed present:
- src/app/(owner)/actions/loads.ts — contains `revertLoadStatus` and `REVERSE_STATUS_TRANSITIONS`
- src/components/loads/status-update-button.tsx — contains `PREV_STATUS` and `revertStatusAction` prop
- src/app/(owner)/loads/[id]/page.tsx — imports and passes `revertLoadStatus`

Commits confirmed:
- 3b4d9d9 — feat(quick-26): add revertLoadStatus server action with reverse status transitions
- d63c9dd — feat(quick-26): add revert status button to load detail page
