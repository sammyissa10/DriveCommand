---
phase: quick-193
plan: "01"
subsystem: carrier/dispatches
tags: [dispatch, edit-dialog, bug-fix, api]
dependency_graph:
  requires: []
  provides: [working-edit-dialog-on-dispatch-detail, actualMiles-persistence]
  affects: [DispatchHeader, carrier-dispatch-PATCH-api]
tech_stack:
  added: []
  patterns: [shadcn-Dialog, startTransition, router.refresh]
key_files:
  created: []
  modified:
    - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
decisions:
  - "Inline edit dialog instead of separate /edit route — keeps context, no page navigation needed"
  - "Re-prepend [DISPATCH_NUMBER=] and [AUTO-GENERATED] tags on save to preserve internal note structure"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-07T04:22:39Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-193 Plan 01: Fix Edit Button on Dispatch Detail Page Summary

Fixed broken Edit button on dispatch detail page by replacing a dead `/edit` link (404) with an inline shadcn Dialog containing editable fields. Also fixed silent failure when saving actualMiles via inline odometer-end blur.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add actualMiles to API schema and lib type | 47e0886 | dispatches.ts, [id]/route.ts |
| 2 | Replace Edit link with shadcn Dialog in DispatchHeader | eaf97b1 | DispatchHeader.tsx |

## What Was Built

**Task 1 — actualMiles fix:**
- Added `actualMiles?: number` to `DispatchUpdateInput` type in `lib/carrier/dispatches.ts`
- Added `actualMiles: z.number().optional()` to `DispatchUpdateSchema` in the PATCH API route
- The `updateDispatch` function already spreads `...updateData` into Prisma, so actualMiles flows through automatically now that Zod no longer strips it

**Task 2 — Edit Dialog:**
- Removed broken `<Link href="/carrier/dispatches/{id}/edit">` (route did not exist)
- Added shadcn `Dialog` with 4 editable fields: Scheduled Departure (datetime-local), Planned Miles (number), Actual Miles (number), Notes (textarea)
- `openEditDialog()` pre-fills form from dispatch prop — converts ISO timestamp to datetime-local format, strips internal `[DISPATCH_NUMBER=...]` prefix and `[AUTO-GENERATED]` suffix from notes for clean display
- `handleEditSave()` reconstructs full notes string (re-prepending tags), builds PATCH payload, calls existing `patchDispatch()`, toasts on success/error, refreshes router
- Edit button remains disabled (greyed out) for in_progress, completed, cancelled, and tonu dispatches — same disabled span as before
- Expanded `DispatchHeaderProps` to include `scheduledDeparture: string` and `scheduledArrival: string | null` (already serialized and passed by parent page)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/lib/carrier/dispatches.ts` — contains `actualMiles`
- [x] `apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts` — contains `actualMiles`
- [x] `apps/web/src/components/carrier/dispatches/DispatchHeader.tsx` — contains `Dialog`
- [x] `npx tsc --noEmit` — no errors
- [x] Commits 47e0886 and eaf97b1 exist

## Self-Check: PASSED
