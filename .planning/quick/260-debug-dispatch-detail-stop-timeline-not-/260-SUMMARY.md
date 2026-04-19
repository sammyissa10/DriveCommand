---
phase: quick-260
plan: "01"
subsystem: carrier-ops
tags: [bug-fix, stops, dispatch, loads, prisma]
dependency_graph:
  requires: []
  provides: [pendingStopsJson on CarrierLoad, stops-survive-without-dispatch]
  affects: [dispatch-detail-stop-timeline, load-creation-flow, load-update-flow]
tech_stack:
  added: []
  patterns: [pending-json-buffer-pattern]
key_files:
  created:
    - apps/web/prisma/migrations/20260419000002_add_pending_stops_json/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/generated/prisma/index.d.ts
decisions:
  - "Store stops as JSON blob on CarrierLoad when no dispatchId — avoids schema change to make dispatchId optional on CarrierStop"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-19"
  tasks_completed: 1
  tasks_total: 1
---

# Phase quick-260 Plan 01: Fix Dispatch Detail Stop Timeline Empty After Load Attach

**One-liner:** Add `pendingStopsJson` buffer on `CarrierLoad` so stops survive creation without a dispatch and auto-persist as `CarrierStop` records when a dispatch is attached.

## Root Cause

`createLoad` only called `persistStops` when `load.dispatchId` was set. Since the NewLoadPage never includes a dispatch, stops from StopBuilder were silently dropped. When the load was later attached to a dispatch via DispatchLoadsPanel (`PATCH { dispatchId }`), `updateLoad`'s `updateMany` migrated zero existing `CarrierStop` records — leaving the dispatch detail Stop Timeline empty.

## What Was Built

### Schema Change
Added `pendingStopsJson String? @map("pending_stops_json") @db.Text` to `CarrierLoad`. Migration `20260419000002_add_pending_stops_json` applied successfully.

### createLoad fix
Changed the stops persistence block from requiring `dispatchId` to branching:
- **With dispatchId** — calls `persistStops` immediately (existing behavior, unchanged)
- **Without dispatchId** — stores `JSON.stringify(data.stops)` into `pendingStopsJson`

### updateLoad fix (dispatch attach)
After the existing `updateMany` migration block (when `dispatchId` changes to non-null), now additionally:
1. Reads `pendingStopsJson` from the load record
2. Parses the JSON and calls `persistStops` with the new `dispatchId`
3. Sets `pendingStopsJson = null` to clear the buffer

### updateLoad fix (edit without dispatch)
When `data.stops` is supplied and no `effectiveDispatchId` exists:
- Stores/updates `pendingStopsJson` (replaces previous JSON or sets to null if empty array)
- Clears `pendingStopsJson` when stops are finally persisted via `persistStops`

## Deviations from Plan

None — plan executed exactly as written. The `existing` variable in `updateLoad` was already fetched with default select (all fields) as the plan noted, so `pendingStopsJson` is available after migration without any additional query changes. The `loadWithPending` query was added as a separate targeted `findFirst` after the `updateMany` block per the plan spec.

## Verification

1. `prisma migrate deploy` — applied `20260419000002_add_pending_stops_json` successfully
2. `tsc --noEmit` from `apps/web` — zero errors in `src/` (e2e Playwright type errors are pre-existing)
3. Code path verified: `createLoad` without `dispatchId` + stops → `pendingStopsJson` set. `updateLoad` with new `dispatchId` → JSON parsed → `persistStops` called → `CarrierStop` records created → `getDispatch` includes stops → StopTimeline renders them.

## Self-Check: PASSED

- `apps/web/prisma/migrations/20260419000002_add_pending_stops_json/migration.sql` — created
- `apps/web/prisma/schema.prisma` — contains `pendingStopsJson`
- `apps/web/src/lib/carrier/loads.ts` — contains `pendingStopsJson` and `persistStops` call on dispatch attach
- Commit `fa7f694` — verified
