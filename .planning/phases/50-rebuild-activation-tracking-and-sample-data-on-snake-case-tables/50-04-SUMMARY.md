---
phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables
plan: "04"
subsystem: api
tags: [activation-tracking, onboarding, next/server, after, carrier-clients]

# Dependency graph
requires:
  - phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables
    plan: "01"
    provides: activation-tracker.ts with recordActivationEvent function
  - phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables
    plan: "02"
    provides: ActivationProgress table wired to trucks and drivers create routes
  - phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables
    plan: "03"
    provides: ActivationProgress wired to first_real_driver event
provides:
  - carrier clients POST route fires recordActivationEvent('first_real_client') after real client creation
  - isSample guard prevents sample clients from triggering activation tracker
  - after() block ensures activation tracking is non-blocking
affects:
  - onboarding progress API (completionPct advances from 40% to 60% after first real client)
  - activation-tracker integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "after() block from next/server for non-blocking side effects in API route handlers"
    - "isSample guard: check client.isSample before firing activation tracker so sample data seeding does not trigger activation"
    - "try/catch inside after() block ensures tracker failure never affects HTTP response"

key-files:
  created: []
  modified:
    - apps/web/src/app/api/v1/carrier/clients/route.ts

key-decisions:
  - "Used next/server after() for non-blocking activation tracking — consistent with pattern from phases 50-02 and 50-03"
  - "isSample guard placed inside after() block before recordActivationEvent call — sample client creation is always silent"
  - "logger.error used inside try/catch (not console.error) since logger is already imported in this file"

patterns-established:
  - "Pattern: all carrier resource POST routes that can be real records wrap activation tracker in after() + isSample guard"

# Metrics
duration: 1min
completed: 2026-05-03
---

# Phase 50 Plan 04: Clients Route Activation Tracker Summary

**after() block wired into carrier clients POST route: real client creation fires 'first_real_client' activation event, advancing completionPct from 40% to 60%**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-05-03T00:00:31Z
- **Completed:** 2026-05-03T00:01:16Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `after` to the `next/server` import in the clients route (was only importing `NextRequest, NextResponse`)
- Added `recordActivationEvent` import from `@/lib/onboarding/activation-tracker`
- Inserted `after()` block between `createClient()` call and `return NextResponse.json(...)` in the POST handler
- `!client.isSample` guard ensures only real client creation triggers the activation event
- `try/catch` inside the `after()` block ensures tracker errors never affect the HTTP 201 response

## Task Commits

Each task was committed atomically:

1. **Task 1: Add after import, recordActivationEvent import, and tracker after() block to clients route POST handler** - `55972ee` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `apps/web/src/app/api/v1/carrier/clients/route.ts` - Added `after` import, `recordActivationEvent` import, and non-blocking activation tracker after() block in POST handler

## Decisions Made

- Used `logger.error` (not `console.error`) inside the try/catch because `logger` was already imported in this file — consistent with existing error logging in the same file.
- The `isSample` guard is placed at the top of the `after()` callback so no async work is done at all for sample client creation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- First three activation events (first_real_truck, first_real_driver, first_real_client) are now wired to their respective POST routes.
- Plan 50-05 will wire the final event: `first_load_in_transit`.
- After 50-05, the full activation tracking pipeline will be complete and completionPct will reach 100% when all four milestones are met.

---
*Phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables*
*Completed: 2026-05-03*
