---
phase: quick-268
plan: "01"
subsystem: carrier-ops
tags: [bug-fix, dispatch, carrier-stops, sequenceOrder, error-logging]
dependency_graph:
  requires: []
  provides: [multi-load-dispatch-support]
  affects: [apps/web/src/lib/carrier/loads.ts, apps/web/src/app/api/v1/carrier/loads/[id]/route.ts]
tech_stack:
  added: []
  patterns: [transactional-count-before-insert, error-serialization]
key_files:
  created: []
  modified:
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
decisions:
  - Count existing dispatch stops inside the $transaction (not outside) to avoid race conditions when two loads are attached concurrently
metrics:
  duration: ~5 minutes
  completed: "2026-04-21"
  tasks_completed: 1
  files_modified: 2
---

# Phase quick-268 Plan 01: Fix Attach Second Load to Dispatch Summary

**One-liner:** Offset new CarrierStop sequenceOrder values by existing dispatch stop count inside the transaction to eliminate unique-constraint 500 errors on multi-load dispatches.

## What Was Built

Fixed two bugs in the carrier loads subsystem:

1. **sequenceOrder collision fix** — When a second load is attached to a dispatch, its stops were inserted with `sequenceOrder` values starting from 0/1, colliding with the first load's stops (unique constraint `@@unique([dispatchId, sequenceOrder])`). The fix counts existing stops on the dispatch **inside the `$transaction`** and adds that count as an offset to all incoming new stops in `createMany`. Existing stops being updated keep their original `sequenceOrder`.

2. **PATCH error logging improvement** — The catch block in the PATCH route handler was logging non-`Error` objects (like `PrismaClientKnownRequestError`) via `String(err)`, which produces `[object Object]`. Changed to `JSON.stringify(err, Object.getOwnPropertyNames(err as object))` so all enumerable and non-enumerable properties (code, meta, clientVersion, etc.) are serialized and visible in Vercel logs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix sequenceOrder collision in persistStops and improve PATCH error logging | 0d03ad2 | loads.ts, route.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/loads.ts` — modified, `existingDispatchStopCount` present at line 336
- `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts` — modified, `Object.getOwnPropertyNames` present at line 98
- Commit `0d03ad2` exists
- `tsc --noEmit` passed with zero errors
