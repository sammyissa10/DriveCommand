---
phase: quick-255
plan: "01"
subsystem: carrier-dispatches
tags: [bug-fix, carrier, dispatch, stops]
dependency_graph:
  requires: []
  provides: [dispatch-stop-timeline-populated]
  affects: [dispatch-detail-page, load-update, remove-load]
tech_stack:
  added: []
  patterns: [prisma-updateMany-cascade, stop-migration]
key_files:
  modified:
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts
decisions:
  - "Only migrate/delete stops with status='pending'; completed/skipped/arrived stops are preserved as history"
  - "CarrierStop has no orgId column; tenant isolation maintained via validated loadId/dispatchId FKs"
metrics:
  duration: "8 minutes"
  completed: "2026-04-18"
  tasks_completed: 1
  files_modified: 2
---

# Phase quick-255 Plan 01: Fix Dispatch Detail Stop Timeline Summary

Fixes two bugs that caused the dispatch detail Stop Timeline to appear empty after attaching loads via the Loads panel.

## What Was Built

**Bug 1 — `updateLoad` in `apps/web/src/lib/carrier/loads.ts`:**
The function updated `load.dispatchId` but never updated existing `CarrierStop` records. Since `getDispatch` queries stops by `dispatchId`, mismatched stops were invisible. Fixed by adding a `prisma.carrierStop.updateMany` after the load update: when `dispatchId` changes to a non-null value, pending stops are migrated to the new dispatch; when `dispatchId` is set to null, pending stops are deleted.

**Bug 2 — `remove-load/route.ts`:**
When a load was removed from a dispatch, `dispatchId` was set to null on the load but `CarrierStop` records still referenced the old dispatch (orphaned stops). Fixed by adding `prisma.carrierStop.deleteMany` for pending stops after the load detach.

In both cases, completed/skipped/arrived stops are never touched, preserving historical records.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Commit | Description |
|--------|-------------|
| 2184184 | fix(quick-255): migrate CarrierStop dispatchId when load is attached/detached |

## Self-Check: PASSED

- `apps/web/src/lib/carrier/loads.ts` — modified, committed in 2184184
- `apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts` — modified, committed in 2184184
- `tsc --noEmit` — zero errors in modified files (pre-existing e2e spec errors unrelated to this task)
