---
phase: quick-161
plan: "01"
subsystem: carrier-ops
tags: [carrier, stops, api, microflow, bol, pod, dispatch]
dependency_graph:
  requires:
    - quick-153 (carrier_stops table migration)
    - quick-157 (carrier Prisma schema)
  provides:
    - stops CRUD (listStops, getStop, createStop, updateStop)
    - stop completion microflow (arriveStop, completeStop, skipStop)
    - 5 REST endpoints under /api/v1/carrier/stops/
  affects:
    - carrier dispatch lifecycle (cascade to completed)
    - carrier load lifecycle (cascade to delivered)
    - revenue recalculation on final delivery stop
tech_stack:
  added: []
  patterns:
    - stop-completion microflow (3-stage: compliance -> finalize -> cascade)
    - BOL/POD 422 enforcement from RouteTemplateStop lookup
    - address_snapshot in notes JSON at stop creation
    - dwellMinutes = Math.floor((departedAt - arrivedAt) / 60000) stored in notes JSON
key_files:
  created:
    - apps/web/src/lib/carrier/stops.ts
    - apps/web/src/lib/carrier/stop-completion.ts
    - apps/web/src/app/api/v1/carrier/stops/route.ts
    - apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/stops/[id]/arrived/route.ts
    - apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts
    - apps/web/src/app/api/v1/carrier/stops/[id]/skip/route.ts
  modified: []
decisions:
  - recalculateAndStore wrapped in try/catch so revenue calc failure does not block stop completion
  - role check for skip (driver=403) placed in API route layer, not skipStop lib function
  - dwellMinutes defaults to 0 when arrivedAt is null (defensive; should not occur in practice)
metrics:
  duration: "142s"
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 7
  files_modified: 0
---

# Phase quick-161 Plan 01: Carrier Ops API Routes for Stops — Summary

**One-liner:** Stop completion microflow with hard BOL/POD 422 enforcement, integer dwell calculation, and load/dispatch cascade via 7 new files (2 lib modules + 5 API routes).

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create stops.ts lib module + stop-completion.ts microflow | `556c93e` | stops.ts, stop-completion.ts |
| 2 | Create all 5 API route files for stops | `fc6d1fd` | stops/route.ts, [id]/route.ts, arrived, complete, skip |

## What Was Built

### stops.ts (lib module)
- `listStops(orgId, filters)` — always ordered by `sequenceOrder ASC`, filters by dispatchId and/or loadId
- `getStop(orgId, id)` — includes documents, expenses, facility, and dispatch (orgId + routeTemplateId)
- `createStop(orgId, data)` — verifies dispatch ownership, fetches facility, stores `address_snapshot` in notes JSON
- `updateStop(orgId, id, data)` — restricted to 5 fields: contactName, contactPhone, appointmentStart, appointmentEnd, specialInstructions

### stop-completion.ts (microflow module)
- `arriveStop` — validates `status === 'pending'`, sets `arrivedAt + status = arrived`, hard 422 otherwise
- `completeStop` — 6-step microflow:
  1. Validate `status === 'arrived'`
  2. BOL check: query RouteTemplateStop for bolRequired; if true, check stop.bolNumber + CarrierDocument(documentType=bol) exists → 422 with exact message
  3. POD check: same pattern with podRequired → 422 with exact message
  4. Set departedAt, compute dwellMinutes = Math.floor((departedAt - arrivedAt) / 60000), merge into notes JSON
  5. Load cascade: if no remaining delivery stops (not completed/skipped) → mark load `delivered` + recalculateAndStore (wrapped in try/catch)
  6. Dispatch cascade: if no remaining stops → mark dispatch `completed` + `actualArrival`; TODO comment for pay-calculator
- `skipStop` — merges skip_log into notes JSON; role check handled by API route layer

### API Routes (5 files)
- `GET /api/v1/carrier/stops` — list with dispatch_id/load_id/page/pageSize filters
- `POST /api/v1/carrier/stops` — full Zod validation, address_snapshot via createStop
- `GET /api/v1/carrier/stops/[id]` — returns stop with documents and expenses
- `PATCH /api/v1/carrier/stops/[id]` — 5-field update only
- `PATCH /api/v1/carrier/stops/[id]/arrived` — delegates to arriveStop, passes through error/status
- `PATCH /api/v1/carrier/stops/[id]/complete` — delegates to completeStop, BOL/POD 422 surfaces directly
- `PATCH /api/v1/carrier/stops/[id]/skip` — 403 guard for driver role, requires skip_reason

## Verification

- `npx tsc --noEmit` from apps/web: zero type errors
- All 7 files exist at correct paths
- `recalculateAndStore` imported from `./revenue-calculator` and wrapped in try/catch
- Skip route checks `session.role === 'driver'` for 403 (not a non-existent 'manager' role)
- `completeStop` queries `RouteTemplateStop` for bolRequired/podRequired (not CarrierStop columns)
- dwellMinutes uses `Math.floor` and stored in notes JSON field

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files confirmed to exist:
- apps/web/src/lib/carrier/stops.ts — FOUND
- apps/web/src/lib/carrier/stop-completion.ts — FOUND
- apps/web/src/app/api/v1/carrier/stops/route.ts — FOUND
- apps/web/src/app/api/v1/carrier/stops/[id]/route.ts — FOUND
- apps/web/src/app/api/v1/carrier/stops/[id]/arrived/route.ts — FOUND
- apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts — FOUND
- apps/web/src/app/api/v1/carrier/stops/[id]/skip/route.ts — FOUND

Commits confirmed:
- 556c93e — feat(quick-161): create stops.ts lib + stop-completion.ts microflow
- fc6d1fd — feat(quick-161): create all 5 carrier stops API routes
