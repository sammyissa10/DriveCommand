---
phase: quick-180
plan: 01
subsystem: carrier-ops
tags: [integration-test, carrier-ops, prisma, schema-fix, vitest]
dependency_graph:
  requires: [carrier ops service layer (lib/carrier/*), prisma schema, migrations 001-014]
  provides: [contracted-route-journey integration test, prisma @map field mappings]
  affects: [apps/web/prisma/schema.prisma, apps/web/src/generated/prisma, carrier ops API routes]
tech_stack:
  added: []
  patterns: [bypass_rls transactions for test setup, service function direct imports, raw Prisma for assertions]
key_files:
  created:
    - apps/web/tests/carrier/contracted-route-journey.test.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/generated/prisma/schema.prisma
    - apps/web/src/generated/prisma/index.js
    - apps/web/src/generated/prisma/edge.js
    - apps/web/src/generated/prisma/package.json
decisions:
  - "Added @map directives to all carrier model fields in Prisma schema to fix column name mismatch between camelCase Prisma fields and snake_case DB columns"
  - "Used rateType: flat on contract (DB constraint: only per_mile/flat/per_load/hourly allowed), then updated load rateType to per_stop post-dispatch to test per_stop revenue formula"
  - "Used facilityType: customer_site (not customer) per DB constraint"
  - "Used scheduleType: fixed_days (not recurring) per DB constraint"
  - "Cleanup deletes ALL stops for ALL dispatches generated (not just the primary dispatch) to avoid FK violations"
metrics:
  duration: ~60 minutes
  completed: 2026-04-05
  tasks: 1
  files: 6
---

# Phase quick-180 Plan 01: Carrier Ops E2E Integration Test Summary

End-to-end Vitest integration test validating the complete 15-step contracted recurring route journey — client creation through driver pay record generation — against the real Supabase PostgreSQL database.

## What Was Built

A single sequential integration test (`tests/carrier/contracted-route-journey.test.ts`) that:

1. Creates isolated test data (tenant, user, driver, truck) via `bypass_rls` transactions
2. Exercises all 15 steps of the contracted recurring route journey using carrier ops service functions directly (bypassing HTTP auth)
3. Cleans up all test data in a `try/finally` block regardless of outcome
4. Skips gracefully when `DATABASE_URL` is not set

### 15-Step Journey Assertions

| Step | What Is Tested | Pass/Fail |
|------|---------------|-----------|
| 1 | `createClient` — client record created with correct name | PASS |
| 2 | `createContract` — contract number matches `CN-` prefix pattern | PASS |
| 3 | `createFacility` x2 — warehouse + customer_site have valid IDs | PASS |
| 4 | `createRouteTemplate` + RouteTemplateStop records created via Prisma | PASS |
| 5 | `generateDispatches` — at least 1 dispatch created for 14-day window | PASS |
| 6 | `listDispatches` — dispatch found with status=planned, correct routeTemplateId | PASS |
| 7 | `transitionDispatchStatus(planned→in_progress)` — actualDeparture set | PASS |
| 8 | Stops fetched, linked to load, `arriveStop` — arrivedAt set, status=arrived | PASS |
| 9 | BOL document created via Prisma + bolNumber set on stop — verified | PASS |
| 10 | `completeStop(pickup)` — status=completed, notes.dwell_minutes present | PASS |
| 11 | **CRITICAL**: `completeStop(delivery)` WITHOUT POD → 422 + "POD document required before completing this stop." | PASS |
| 12 | POD document created via Prisma + podNumber set on delivery stop | PASS |
| 13 | `completeStop(delivery)` WITH POD → status=completed, cascades to load+dispatch | PASS |
| 14 | Load status=delivered, totalRevenue=65 (per_stop: 65 × 1 delivery stop) | PASS |
| 15 | DriverPayRecord auto-generated, status=pending, driverId matches primary driver | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Prisma schema missing @map directives for all carrier models**

- **Found during:** Task 1, setup phase
- **Issue:** The carrier ops migrations (001-014) created tables with snake_case column names (`org_id`, `first_name`, `dispatch_id`, etc.) but the Prisma schema defined camelCase fields (`orgId`, `firstName`, `dispatchId`) without `@map` directives. Prisma generates SQL using the field names as column names (with quoting), so ALL carrier ops queries failed with "column not found" errors. Every service function (`createClient`, `createFacility`, `arriveStop`, etc.) was completely broken.
- **Fix:** Added `@map("snake_case_name")` to every camelCase field in all 14 carrier models. Also applied the pending DB migration (`20260405000001_carrier_stop_doc_required_flags`) and regenerated the Prisma client.
- **Files modified:** `apps/web/prisma/schema.prisma`, `apps/web/src/generated/prisma/*`
- **Commit:** 823afa7

**2. [Rule 1 - Bug] DB constraints rejected plan's contract rateType, facilityType, and scheduleType values**

- **Found during:** Task 1, Step 2 (contract creation)
- **Issue:** The plan specified `rateType: 'per_stop'` for contracts, `facilityType: 'customer'`, and `scheduleType: 'recurring'` — none of which are valid per the actual DB check constraints.
  - `contracts_rate_type_check`: only `['per_mile', 'flat', 'per_load', 'hourly']`
  - `facilities_facility_type_check`: only `['terminal', 'yard', 'warehouse', 'drop_yard', 'customer_site']`
  - `route_templates_schedule_type_check`: only `['fixed_days', 'frequency', 'on_call']`
- **Fix:** Changed contract `rateType` to `'flat'`, updated shop facilityType to `'customer_site'`, changed scheduleType to `'fixed_days'`. After dispatch generation, updated the load's `rateType` to `'per_stop'` directly via Prisma to exercise the per_stop revenue formula. Revenue assertion (totalRevenue=65) remains valid: `flat` with baseRate=65 gives 65, as does `per_stop` with 1 delivery stop × 65.
- **Files modified:** `apps/web/tests/carrier/contracted-route-journey.test.ts`
- **Commit:** 823afa7

**3. [Rule 3 - Blocker] Cleanup FK violation: dispatches could not be deleted while stops existed**

- **Found during:** First successful test run (cleanup phase)
- **Issue:** `generateDispatches` creates ~10 dispatches for the 14-day window. The cleanup only deleted stops for `dispatchIds` (1 dispatch), then tried to delete ALL dispatches via `orgId`. The other 9 dispatches still had stops, violating `stops_dispatch_id_fkey`.
- **Fix:** Updated cleanup to first fetch all dispatch IDs for the org, then delete all their stops, then delete all dispatches.
- **Files modified:** `apps/web/tests/carrier/contracted-route-journey.test.ts`
- **Commit:** 823afa7

## Self-Check

**File exists:**
- `apps/web/tests/carrier/contracted-route-journey.test.ts` — FOUND
- `apps/web/prisma/schema.prisma` (with @map directives) — FOUND

**Commit exists:**
- 823afa7 — FOUND (git log confirms)

**Test result:** All 15 assertions PASS. Cleanup completes without errors. Idempotent across consecutive runs.

## Self-Check: PASSED
