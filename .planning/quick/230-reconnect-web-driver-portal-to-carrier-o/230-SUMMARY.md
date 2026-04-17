---
phase: quick-230
plan: 01
subsystem: driver-portal
tags: [carrier-ops, dispatch, driver, web]
dependency_graph:
  requires: [CarrierDispatch, CarrierStop, CarrierFacility, CarrierDriver, CarrierLoad]
  provides: [driver-route-tab, driver-load-tab, dispatch-actions]
  affects: [driver-portal, carrier-ops]
tech_stack:
  patterns: [bypass_rls transaction, server-actions, server-components, use-transition]
key_files:
  modified:
    - apps/web/src/app/(driver)/actions/driver-routes.ts
    - apps/web/src/app/(driver)/actions/driver-load.ts
    - apps/web/src/app/(driver)/layout.tsx
    - apps/web/src/app/(driver)/my-route/page.tsx
    - apps/web/src/app/(driver)/my-load/page.tsx
    - apps/web/src/app/(driver)/page.tsx
    - apps/web/src/components/driver/route-detail-readonly.tsx
    - apps/web/src/components/driver/completed-route-history.tsx
    - apps/web/src/components/driver/completed-load-history.tsx
decisions:
  - "truckId in layout.tsx set to null — GPS tracker uses legacy Truck table, incompatible with CarrierTruck; GPS degrades gracefully until reconnected"
  - "load status updates removed from driver portal — CarrierLoad status cascades from stop completion via completeStop(), not direct driver updates"
  - "Documents and Messages sections removed from Route tab with TODO comments — need reconnection to CarrierDocument table in a future task"
metrics:
  duration_seconds: 270
  tasks_completed: 2
  files_modified: 9
  completed_date: "2026-04-17"
---

# Phase quick-230 Plan 01: Reconnect Web Driver Portal to Carrier Ops Summary

Driver portal Route and Load tabs rewritten to query CarrierDispatch/CarrierStop/CarrierLoad tables instead of legacy Route/Load tables, resolving the "No route assigned" blank state for drivers with active Carrier Ops dispatches.

## What Was Built

### Task 1: Rewrite server actions to query Carrier Ops tables

**driver-routes.ts** — completely rewritten with five new server actions:
- `getMyActiveDispatch()` — finds planned/in_progress dispatch via `carrierDriver.userId` join, includes truck, stops with facilities, and carrierLoads
- `getMyDispatchHistory()` — last 10 completed dispatches for history display
- `startTrip(dispatchId)` — verifies ownership, delegates to `transitionDispatchStatus(orgId, id, 'in_progress')`
- `arriveAtStop(stopId)` — verifies ownership, delegates to `arriveStop(orgId, stopId)`
- `completeCurrentStop(stopId)` — verifies ownership, delegates to `completeStop(orgId, stopId)`

All actions use `prisma.$transaction` with `bypass_rls` (same pattern as mobile API and layout.tsx).

**driver-load.ts** — rewritten with one new server action:
- `getMyLoads()` — finds active dispatches for driver, returns CarrierLoads linked to them including client and stop facilities

**layout.tsx** — GPS truckId lookup updated to query CarrierDispatch instead of legacy Route. truckId intentionally set to null with TODO comment (GPS tracker expects legacy Truck.id, CarrierTruck is a different table).

**page.tsx** — driver home now redirects on `getMyActiveDispatch()` instead of `getMyAssignedRoute()`.

### Task 2: Rewrite pages and components for Carrier Ops data shape

**route-detail-readonly.tsx** — completely rewritten as a set of components:
- `DispatchDetail` — main card showing dispatch status badge, scheduled departure, truck info, planned miles, Start Trip button (when planned), Navigate link to active stop
- Stop timeline: sequence circles (green=completed, blue=arrived, gray=pending), stop type badges (pickup/delivery/fuel_stop/relay/rest), facility name + city/state, appointment windows, arrived_at/departed_at timestamps, Arrive/Complete Stop buttons
- `StartTripButton` — client component with `useTransition`, calls `startTrip(dispatchId)` server action
- `StopActionButtons` — client component with `useTransition`, shows Arrive or Complete Stop based on stop status

**completed-route-history.tsx** — accepts `CarrierDispatch[]` instead of `Route[]`. Shows dispatch number (extracted from notes `[DISPATCH_NUMBER=...]` tag), first/last facility names, truck unit, stops timeline in expanded view.

**completed-load-history.tsx** — now accepts `CarrierLoad[]` with new Carrier Ops fields: reference number, BOL/PRO numbers, commodity description/weight/pieces, rate amount + rate type, special instructions, stop facilities.

**my-route/page.tsx** — imports new actions, renders `DispatchDetail` for active dispatch, `CompletedRouteHistory` for history. Documents and Messages sections removed with TODO comments.

**my-load/page.tsx** — simplified: calls `getMyLoads()`, renders `CompletedLoadHistory` with the load list. Legacy status timeline and `LoadStatusButton` removed (load status managed by stop completion cascade).

## Deviations from Plan

None — plan executed exactly as written. The `plannedMiles: any` type annotation on `CarrierDispatchShape` was added to handle Prisma's `Decimal` type (not assignable to `string | number`), which is standard practice in the codebase.

## Security Pattern

All server actions follow the established bypass_rls pattern:
```
requireRole([DRIVER]) → getSession() → prisma.$transaction with bypass_rls →
find carrierDriver WHERE userId = session.userId AND orgId = session.tenantId →
query dispatch WHERE primaryDriverId = carrierDriver.id AND orgId = session.tenantId
```

Double-scoped by both userId and orgId — no action accepts driverId or dispatchId without ownership verification.

## Self-Check

### Files verified:
- `apps/web/src/app/(driver)/actions/driver-routes.ts` — FOUND
- `apps/web/src/app/(driver)/actions/driver-load.ts` — FOUND
- `apps/web/src/app/(driver)/layout.tsx` — FOUND
- `apps/web/src/app/(driver)/my-route/page.tsx` — FOUND
- `apps/web/src/app/(driver)/my-load/page.tsx` — FOUND
- `apps/web/src/app/(driver)/page.tsx` — FOUND
- `apps/web/src/components/driver/route-detail-readonly.tsx` — FOUND
- `apps/web/src/components/driver/completed-route-history.tsx` — FOUND
- `apps/web/src/components/driver/completed-load-history.tsx` — FOUND

### Commit verified:
- `60e2d7f` — feat(quick-230): reconnect web driver portal to Carrier Ops dispatch data

### TypeScript: PASSED (npx tsc --noEmit — zero errors in modified files)

## Self-Check: PASSED
