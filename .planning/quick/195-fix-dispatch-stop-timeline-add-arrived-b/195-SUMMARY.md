---
phase: quick-195
plan: 01
subsystem: carrier-dispatches
tags: [dispatch, stop-timeline, workflow, role-guard]
key-files:
  modified:
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
decisions:
  - Split single canAct flag into isStopPending/isStopArrived to implement two-step arrived->complete workflow
  - Added all role casing variants (owner/OWNER/manager/MANAGER) for canSkip guard to handle potential inconsistencies
metrics:
  duration: ~5 minutes
  completed: 2026-04-07T05:23:30Z
  tasks_completed: 1
  files_modified: 1
---

# Quick 195: Fix Dispatch Stop Timeline — Add Arrived Button

Two-step stop workflow (Mark Arrived -> Complete Stop) with manager role access to Skip.

## What Was Done

**Task 1: Add Mark Arrived button and fix action button logic (283d5bf)**

Previously, `StopTimelineCard` used a single `canAct` flag covering both `pending` and `arrived` statuses, always showing "Complete Stop". This skipped the `arrived` state in the UI entirely.

Changes made to `StopTimelineCard.tsx`:
- Added `handleArrive()` function calling `PATCH /api/v1/carrier/stops/[id]/arrived`, toasting success/error and refreshing the router
- Replaced `canAct` with two flags: `isStopPending` and `isStopArrived`
- Pending stops now show a "Mark Arrived" button (MapPin icon, outline variant)
- Arrived stops show "Complete Stop" button (existing behavior, doc compliance guard preserved)
- Completed/skipped stops show no action buttons
- Fixed `canSkip` to check all role casing variants: `owner`, `OWNER`, `manager`, `MANAGER`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx` modified
- [x] Commit 283d5bf exists
- [x] `npx tsc --noEmit` passed with zero errors
