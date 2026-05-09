---
phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification
plan: 02
subsystem: api
tags: [activation-tracker, onboarding, carrier, fleet, drivers, next-server-after]

# Dependency graph
requires:
  - phase: 51-01
    provides: activation-tracker.ts confirmed correct; recordActivationEvent is idempotent
provides:
  - POST /api/v1/carrier/fleet/drivers now fires first_real_driver activation event after 201 response
affects: [onboarding, activation-progress, carrier-fleet-drivers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multiple after() registrations per request handler are valid in Next.js — each fires independently post-response"

key-files:
  created: []
  modified:
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts

key-decisions:
  - "Placed activation after() block after the fireEvent after() block but before the return — both after() calls fire non-blocking post-response"
  - "No isSample guard needed: sample data goes through DB seeder (not this API route), and tracker is idempotent anyway"

patterns-established:
  - "Activation events in POST handlers: add a second after() block after any existing after() blocks, catch all errors silently"

# Metrics
duration: 3min
completed: 2026-05-03
---

# Phase 51 Plan 02: Add activation hook to direct driver creation Summary

**POST /api/v1/carrier/fleet/drivers now calls recordActivationEvent(orgId, 'first_real_driver') in a non-blocking after() block, closing the gap where direct carrier driver creation never triggered the activation tracker**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-03T21:19:00Z
- **Completed:** 2026-05-03T21:21:55Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added `recordActivationEvent` import from `@/lib/onboarding/activation-tracker`
- Added second `after()` block after existing `fireEvent` block, before the 201 return
- TypeScript compiles clean (zero source-level errors); existing `ON_DRIVER_CREATE` workflow event block preserved unchanged

## Task Commits

1. **Tasks 1-3: Read, add import + after() block, verify and commit** - `4d5251b` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` - Added `recordActivationEvent` import and second `after()` block for first_real_driver activation event

## Decisions Made
- Placed the new `after()` block after the `fireEvent` after block and before the `return NextResponse.json(...)` so both after-blocks register independently and the response ordering is unchanged
- Silent catch (no logger call) for activation after block per plan spec — tracker errors are non-fatal

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
TypeScript check produced errors in `.next/dev/` generated files (pre-existing build artifacts from the Next.js dev server). Source-level errors: zero. Not related to this change.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Direct carrier driver creation now fully wired for activation tracking
- Both activation paths (invitation acceptance via 51-01 context, direct creation via this plan) are now covered
- Ready to proceed with 51-03

---
*Phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification*
*Completed: 2026-05-03*
