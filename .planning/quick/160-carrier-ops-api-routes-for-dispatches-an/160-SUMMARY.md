---
phase: quick-160
plan: 01
subsystem: carrier-ops
tags: [api-routes, carrier, dispatches, loads, revenue-calculator]
dependency_graph:
  requires:
    - quick-153 (carrier_dispatch + carrier_load DB models)
    - quick-157 (carrier Prisma schema complete)
  provides:
    - dispatch CRUD API (GET list, POST create, GET one, PATCH fields, PATCH status)
    - load CRUD API (GET list, POST create, GET one, PATCH fields, PATCH revenue)
    - revenue calculator (all 6 rate types + FSC)
  affects:
    - apps/web/src/lib/carrier/ (3 new lib modules)
    - apps/web/src/app/api/v1/carrier/ (6 new route files)
tech_stack:
  added: []
  patterns:
    - same auth boilerplate as carrier/clients routes (getSession, tenantId)
    - decStr() Decimal serialization helper
    - dispatch number stored as [DISPATCH_NUMBER=DC-YYYY-NNNNN] in notes field
    - load reference stored as LD-YYYY-NNNNN in referenceNumber when null
    - recalculateAndStore called after createLoad and on rate-affecting PATCH fields
key_files:
  created:
    - apps/web/src/lib/carrier/revenue-calculator.ts
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/app/api/v1/carrier/dispatches/route.ts
    - apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/dispatches/[id]/status/route.ts
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/revenue/route.ts
  modified: []
decisions:
  - updateDispatch return type changed from Prisma delegate prototype reference to Record<string,unknown> to satisfy TypeScript
  - otherCharges added to LoadCreateInput (was missing, needed for rate-field change detection in updateLoad)
metrics:
  duration: "~5 minutes"
  completed: "2026-04-05T05:32:37Z"
  tasks_completed: 3
  files_created: 9
  files_modified: 0
---

# Phase quick-160 Plan 01: Carrier Ops API Routes (Dispatches + Loads) Summary

Dispatch and load CRUD REST API with state-machine status transitions and automatic revenue calculation covering all 6 rate types plus FSC.

## What Was Built

### revenue-calculator.ts
- `calculateRevenue(load, dispatch?, contract?)` — handles per_mile, flat, per_stop, per_cwt, per_pallet, hourly rate types
- FSC methods: percent_of_linehaul (baseRevenue * rate), per_mile (miles * rate), none
- `recalculateAndStore(orgId, loadId)` — fetches load + dispatch + contract from DB, runs calculator, updates totalRevenue + fuelSurcharge
- Broker gross margin computed and logged but not stored (no column for it)

### dispatches.ts
- `listDispatches` — defaults to today 00:00 → tomorrow 23:59 on scheduledDeparture; filters: status, driverId, needsAssignment (notes contains), pagination
- `createDispatch` — auto-generates DC-YYYY-NNNNN stored as `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` in notes field
- `updateDispatch` — blocks all updates on completed dispatch (409); strips primaryDriverId/truckId when in_progress (locked)
- `transitionDispatchStatus` — strict state machine:
  - planned → in_progress: sets actualDeparture
  - in_progress → completed: verifies all stops are completed/skipped, sets actualArrival; TODO stub for pay calculator
  - planned → cancelled: cascades to pending loads
  - planned → tonu: prepends [TONU] to notes

### loads.ts
- `listLoads` — filters: clientId, dispatchId, status, dateFrom/dateTo on createdAt
- `getLoad` — includes client, dispatch, contract, stops, expenses; attaches financials summary with decStr serialization
- `createLoad` — throws on missing clientId with exact message; auto-populates rateType/rateAmount from contract; auto-generates LD-YYYY-NNNNN referenceNumber; calls recalculateAndStore after creation
- `updateLoad` — triggers recalculateAndStore when any of: rateType, rateAmount, commodityWeightLbs, commodityPallets, otherCharges, brokerFlag, carrierCost changed

### Dispatch API Routes (3 files)
- `GET /api/v1/carrier/dispatches` — list with filters + today+tomorrow default
- `POST /api/v1/carrier/dispatches` — Zod validates UUID fields, creates dispatch, returns 201
- `GET /api/v1/carrier/dispatches/[id]` — single dispatch with stops/loads/expenses/payRecords
- `PATCH /api/v1/carrier/dispatches/[id]` — field updates; 409 on completed; driver/truck stripped when in_progress
- `PATCH /api/v1/carrier/dispatches/[id]/status` — state machine; 422 on invalid transition with {error, details: {from, to}}

### Load API Routes (3 files)
- `GET /api/v1/carrier/loads` — list with client/dispatch/status/date filters
- `POST /api/v1/carrier/loads` — checks `!body.clientId` before Zod, returns exact 400 message; contract auto-populates rates; returns 201
- `GET /api/v1/carrier/loads/[id]` — single load with financials summary
- `PATCH /api/v1/carrier/loads/[id]` — field updates; triggers revenue recalc on rate field changes
- `PATCH /api/v1/carrier/loads/[id]/revenue` — on-demand recalculation; returns {id, totalRevenue, fuelSurcharge}

## Commits

| Hash | Description |
|------|-------------|
| 98dea5a | feat(quick-160): add revenue calculator + dispatch and load lib modules |
| 92690c6 | feat(quick-160): add dispatch API routes (list, create, get, update, status) |
| 07a171b | feat(quick-160): add load API routes (list, create, get, update, revenue) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invalid return type annotation on updateDispatch**
- **Found during:** Task 1 TypeScript check
- **Issue:** `typeof prisma.carrierDispatch.prototype` is not a valid type — Prisma delegate doesn't expose `.prototype`
- **Fix:** Changed return type to `Record<string, unknown> | null`
- **Files modified:** apps/web/src/lib/carrier/dispatches.ts
- **Commit:** 98dea5a

**2. [Rule 2 - Missing field] otherCharges missing from LoadCreateInput**
- **Found during:** Task 1 TypeScript check
- **Issue:** `updateLoad` checked `otherCharges` in the rate-affecting fields list, but `otherCharges` was not in the `LoadCreateInput` interface
- **Fix:** Added `otherCharges?: number` to `LoadCreateInput` (it's a real DB column on CarrierLoad)
- **Files modified:** apps/web/src/lib/carrier/loads.ts
- **Commit:** 98dea5a

## Self-Check: PASSED

All 9 files exist. All 3 commits verified in git log. TypeScript passes with zero errors.
