---
phase: 45-workflow-engine-4-automation
plan: "02"
subsystem: api
tags: [workflow-engine, automation, trigger, recipes, vitest, typescript]

# Dependency graph
requires:
  - phase: 45-01
    provides: PlaybookTrigger table with TriggerEvent enum in DB and Prisma client
  - phase: 44-workflow-engine-3-inspection-mode
    provides: generatePlaybookInstance service (triggeredBy: 'manual' | 'trigger' signature confirmed)
provides:
  - fireEvent() event-dispatch service with flat key-value condition matching
  - RECIPES constant array — all 7 spec Section 11 recipes
  - getRecipeByKey() lookup helper for enableRecipe mutation
  - Unit tests proving Phase 4 DoD test 1 (match + skip)
affects: [45-03, 45-04, 45-05, 45-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fireEvent best-effort: per-trigger failures logged via structured logger, never thrown — callers use after() from next/server"
    - "Flat key-value condition evaluation: Object.entries(conditions).every(([k,v]) => entityData[k] === v)"
    - "EVENT_TO_ENTITY_TYPE map determines entityType from TriggerEvent — MANUAL_ONLY and RECURRING are no-ops"

key-files:
  created:
    - apps/web/src/server/services/workflows/fireEvent.ts
    - apps/web/src/server/services/workflows/recipes.ts
    - apps/web/src/__tests__/workflows-fire-event.test.ts

key-decisions:
  - "generatePlaybookInstance accepts triggeredBy: 'trigger' directly — no adapter needed, signature confirmed"
  - "Callers use after() from next/server to run fireEvent outside mutation transactions (spec Section 6.5 Pitfall 5)"
  - "conditions: null treated identically to conditions: {} — always matches (Object.entries([]) = [])"

patterns-established:
  - "Recipe pattern: key + displayName + sentence + triggerEvent + conditions + suggestedCategory — no DB row until tenant enables it"
  - "fireEvent guard pattern: check entityType mapping first, then entityData.id, then load triggers"

# Metrics
duration: 7min
completed: 2026-04-24
---

# Phase 45 Plan 02: fireEvent Service + Recipes Library Summary

**Event-to-Playbook dispatch engine (fireEvent) with flat key-value matching, all 7 spec Section 11 recipe constants, and 7-test unit suite proving Phase 4 DoD test 1**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-24T19:42:38Z
- **Completed:** 2026-04-24T19:49:30Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Implemented `fireEvent()` with flat key-value equality matching (no expression language per spec Section 6.5), best-effort per-trigger error handling, and `after()`-safe design (no transaction wrapping)
- Created all 7 recipe constants from spec Section 11: cdl_driver_onboarding, non_cdl_driver_onboarding, owner_op_onboarding, pre_trip_inspection, post_trip_inspection, new_vehicle_intake, partner_onboarding
- Wrote 7 unit tests covering match, mismatch skip, empty conditions, null conditions, inactive-filter, best-effort failure, and MANUAL_ONLY no-op — all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement fireEvent service** - `ec1d1a1` (feat)
2. **Task 2: Create recipes constants library** - `e6caf5b` (feat)
3. **Task 3: Unit tests — fireEvent match/skip behavior** - `beb2f93` (test)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified
- `apps/web/src/server/services/workflows/fireEvent.ts` — Event-dispatch service: loads active PlaybookTriggers, flat condition match, calls generatePlaybookInstance per match, logs failures
- `apps/web/src/server/services/workflows/recipes.ts` — 7 recipe constants + Recipe interface + getRecipeByKey() helper
- `apps/web/src/__tests__/workflows-fire-event.test.ts` — 7 Vitest unit tests; all pass

## Decisions Made
- `generatePlaybookInstance` already accepts `triggeredBy: 'trigger'` (confirmed from reading the file) — no adapter needed. Signature is exactly `{ playbookId, entityType, entityId, tenantId, triggeredBy: 'manual' | 'trigger' }`.
- `conditions: null` (Prisma Json? field) coerced to `{}` via `(trigger.conditions ?? {})` — ensures null means "always match" matching spec intent.
- Recipe `conditions` values use `'CDL'`, `'NON_CDL'`, `'OWNER_OP'` per spec casing — no precedent in codebase for driverType field, so spec casing applied as default.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in apps/web (deleted `[stopId]/messages/route.ts` replaced with `[id]/messages/`) — unrelated to this plan, documented in 45-01 SUMMARY. `tsc --noEmit` shows only this one pre-existing error, not caused by any Plan 02 changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `fireEvent()` is ready to be called from lifecycle hooks (Plan 04: `after()` wrappers in driver/truck/load create routes)
- `RECIPES` and `getRecipeByKey()` ready for Plan 05 trigger router's `enableRecipe` mutation
- Phase 4 DoD test 1 satisfied — match/skip behavior proven by unit tests

## Self-Check: PASSED

- FOUND: apps/web/src/server/services/workflows/fireEvent.ts
- FOUND: apps/web/src/server/services/workflows/recipes.ts
- FOUND: apps/web/src/__tests__/workflows-fire-event.test.ts
- Commit ec1d1a1: FOUND
- Commit e6caf5b: FOUND
- Commit beb2f93: FOUND
- RECIPES.length: 7 (verified via grep)
- All 7 tests pass (vitest output confirmed)

---
*Phase: 45-workflow-engine-4-automation*
*Completed: 2026-04-24*
