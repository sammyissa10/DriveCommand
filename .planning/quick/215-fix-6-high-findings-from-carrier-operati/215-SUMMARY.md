---
phase: quick-215
plan: "01"
subsystem: carrier-operations
tags: [security, tenant-isolation, bug-fix, enum-fix, soft-delete]
dependency_graph:
  requires: [213-carrier-audit-report]
  provides: [carrier-loads-per_load, carrier-facilities-soft-delete-guard, carrier-expenses-fk-checks, carrier-route-templates-fk-checks, carrier-stops-fk-checks]
  affects: [carrier-loads-api, carrier-facilities-lib, carrier-expenses-lib, carrier-route-templates-lib, carrier-stops-lib, save-route-template-action]
tech_stack:
  added: []
  patterns: [tenant-isolation-fk-checks, soft-delete-app-layer-guard]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/lib/carrier/facilities.ts
    - apps/web/src/lib/carrier/expenses.ts
    - apps/web/src/lib/carrier/route-templates.ts
    - apps/web/src/app/api/v1/carrier/route-templates/route.ts
    - apps/web/src/actions/carrier/save-route-template.ts
    - apps/web/src/lib/carrier/stops.ts
decisions:
  - "App-layer soft-delete guard instead of schema migration — facilityType prefix convention preserved, getFacility/updateFacility now exclude inactive_ prefixed records without touching schema"
  - "Batch facility ownership check in saveRouteTemplate — single findMany instead of N individual queries for stop facilityIds"
metrics:
  duration: "~18 minutes"
  completed: "2026-04-15T02:14:57Z"
  tasks_completed: 6
  files_modified: 8
---

# Phase quick-215 Plan 01: Fix 6 High Findings from Carrier Operations Audit Summary

Closed all 6 High-severity findings from audit 213: 2 enum/schema mismatches causing load creation failures, and 4 tenant isolation gaps where FK references were accepted without verifying they belong to the requesting org.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add per_load to loads API rateType enum and LoadForm dropdown | be5f877 |
| 2 | Guard getFacility/updateFacility against soft-deleted facilities | 2d34a7b |
| 3 | Add FK ownership checks to createExpense (dispatch, stop, driver) | 53523a4 |
| 4 | Add FK ownership checks to createRouteTemplate and saveRouteTemplate | 6400403 |
| 5 | Add FK ownership checks for loadId and clientId in createStop | cb50a96 |
| 6 | Batch-verify stop facilityIds ownership in saveRouteTemplate | 99c0398 |

## What Was Fixed

### Finding #4 — per_load rateType rejected by loads API

The `LoadCreateSchema` z.enum for `rateType` was missing `per_load`, which is one of the 4 values in the ContractForm `RATE_TYPES` list. A load created from a `per_load` contract would get a 400 from the API. Fixed by adding `per_load` to the enum in the API route, adding a `Per Load` option to the LoadForm dropdown, and adding an entry to `RATE_TYPE_LABELS`.

### Finding #7 — Soft-deleted facility prefix round-trip corruption

`softDeleteFacility` corrupts `facilityType` with an `inactive_` prefix (e.g. `inactive_terminal`). If a soft-deleted facility was loaded via `getFacility()` and re-saved, the corrupted value was round-tripped back. Fixed by adding `NOT: { facilityType: { startsWith: 'inactive_' } }` guards to both `getFacility()` and `updateFacility()`. Soft-deleted facilities now return 404 from GET and are rejected by PATCH. No schema changes — app-layer only as specified.

### Finding #5 — createExpense accepts cross-tenant FKs

`createExpense` only checked `loadId` ownership (from an existing propagate-clientId query), but `dispatchId`, `stopId`, and `driverId` were inserted without ownership verification. Added `findFirst` checks for all three before the `create` call. The existing loadId ownership check was preserved.

### Finding #6 + #8 — createRouteTemplate accepts cross-tenant FKs

Both the API path (`lib/carrier/route-templates.ts createRouteTemplate`) and the server action path (`actions/carrier/save-route-template.ts saveRouteTemplate`) accepted `clientId`, `contractId`, `defaultDriverId`, and `defaultTruckId` without ownership verification. Added 4 ownership checks to each path. The API route POST handler was updated to catch `Invalid *` errors and return 400. The existing `stops.some((s) => !s.facility_id)` guard was preserved intact.

### Finding #2 — createStop accepts cross-tenant loadId/clientId

`createStop` already checked `dispatchId` and `facilityId` ownership, but not `loadId` or `clientId`. Added both checks returning `null` (which the API route maps to 404) to match the existing pattern.

### Task 6 — saveRouteTemplate stop facilityIds not verified

All stop `facilityId` values in route template creation were passed straight to the DB without ownership verification. Added a batch `findMany` check for all unique facilityIds in the stops array. Uses a single query for efficiency rather than N individual checks.

## Deviations from Plan

None — plan executed exactly as written. The TypeScript errors reported by `tsc --noEmit` were 3 pre-existing errors in `e2e/` Playwright test files (Playwright `Locator.not` type mismatch) unrelated to this task's changes. All source files in `src/` compile cleanly.

## Self-Check: PASSED

Files modified:
- FOUND: apps/web/src/app/api/v1/carrier/loads/route.ts
- FOUND: apps/web/src/components/carrier/loads/LoadForm.tsx
- FOUND: apps/web/src/lib/carrier/facilities.ts
- FOUND: apps/web/src/lib/carrier/expenses.ts
- FOUND: apps/web/src/lib/carrier/route-templates.ts
- FOUND: apps/web/src/app/api/v1/carrier/route-templates/route.ts
- FOUND: apps/web/src/actions/carrier/save-route-template.ts
- FOUND: apps/web/src/lib/carrier/stops.ts

Commits:
- FOUND: be5f877
- FOUND: 2d34a7b
- FOUND: 53523a4
- FOUND: 6400403
- FOUND: cb50a96
- FOUND: 99c0398
