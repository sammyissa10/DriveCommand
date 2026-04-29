---
phase: 47-tenant-self-onboarding-foundation-schema-migration-seed-data-and-sysadmin-crud
plan: "02"
subsystem: database
tags: [postgres, prisma, migrations, seed-data, automation, subscription]

# Dependency graph
requires:
  - phase: 47-01
    provides: Plan, AutomationRule, and all other schema tables needed for seed INSERTs
provides:
  - 3 Plan rows seeded: starter ($49/mo, 5 trucks/users), pro ($99/mo, 20 trucks/users), fleet ($199/mo, unlimited)
  - 6 SYSTEM AutomationRule rows: welcome_owner, no_progress_nudge, add_driver_nudge, dispatch_load_nudge, trial_ending_soon, activation_celebration
  - Idempotent seed migration — safe to run multiple times
affects: [47-03, 47-04, signup-flow, automation-engine, plan-selector-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed migrations use ON CONFLICT (key) DO NOTHING for idempotency"
    - "actionsJson stored as JSONB array with type/template/delaySeconds shape"
    - "SYSTEM-scope AutomationRules have tenantId=NULL and no stripeProductId"

key-files:
  created:
    - apps/web/prisma/migrations/20260429000002_seed_plans_and_automations/migration.sql
  modified: []

key-decisions:
  - "trial_ending_soon rule uses runOncePerTenant=FALSE because it fires daily via cron.daily, not just once per tenant lifecycle"
  - "stripeProductId/stripeCouponId left as NULL — not written in seed, set by SysAdmin later when Stripe is configured"
  - "activation_celebration has 3 actions: immediate in_app_message + immediate email + email at 259200s (3 days) for driver onboarding checklist prompt"

patterns-established:
  - "AutomationRule actionsJson shape: [{type, template?, key?, delaySeconds, to?, fromName?}]"
  - "conditionsJson shape: {field.path: {operator: value}} — empty {} means no conditions"

# Metrics
duration: 1min
completed: 2026-04-29
---

# Phase 47 Plan 02: Seed Plans and SYSTEM AutomationRules Summary

**Idempotent seed migration inserting 3 subscription Plans and 6 SYSTEM AutomationRules with triggerEvent values and actionsJson payloads per spec section 7.4**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-29T02:07:30Z
- **Completed:** 2026-04-29T02:09:20Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Seed migration file created at `apps/web/prisma/migrations/20260429000002_seed_plans_and_automations/migration.sql`
- 3 Plan rows: starter (4900 cents, 5 trucks/users), pro (9900 cents, 20 trucks/users), fleet (19900 cents, unlimited)
- 6 SYSTEM AutomationRule rows covering the full onboarding funnel: signup welcome, 30-min nudge, add-driver nudge, dispatch nudge, trial expiry warning, and activation celebration
- All 7 INSERT blocks use `ON CONFLICT ("key") DO NOTHING` — migration is fully idempotent

## Task Commits

Each task was committed atomically:

1. **Task 1: Write seed migration — 3 Plans and 6 SYSTEM AutomationRules** - `e66149b` (chore)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `apps/web/prisma/migrations/20260429000002_seed_plans_and_automations/migration.sql` — Seed INSERT statements for Plans and AutomationRules, idempotent via ON CONFLICT DO NOTHING

## Decisions Made

- `trial_ending_soon` uses `runOncePerTenant=FALSE` because it fires via `cron.daily` and must re-evaluate daily, unlike lifecycle rules that fire once per tenant
- `stripeProductId` and `stripeCouponId` are left NULL — SysAdmin sets these after Stripe product/coupon configuration
- `activation_celebration` includes a 3rd email action at `delaySeconds: 259200` (3 days) to prompt driver onboarding checklist follow-up

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Migration runs automatically via the migrate.mjs hook on next deploy.

## Next Phase Readiness

- Plan rows are ready for signup flow plan selector (Plan 03 or later)
- AutomationRules are ready for the automation engine to evaluate on events (Plan 04 or later)
- No blockers for Plan 03 (SysAdmin CRUD for Plans, Promos, AutomationRules)

## Self-Check

- [x] `apps/web/prisma/migrations/20260429000002_seed_plans_and_automations/migration.sql` — FOUND
- [x] Commit `e66149b` — FOUND
- [x] ON CONFLICT count: 7 SQL clauses (1 Plan batch + 6 AutomationRules)
- [x] INSERT INTO count: 7 (1 batch Plan INSERT + 6 individual AutomationRule INSERTs)
- [x] No standalone BEGIN/COMMIT — CLEAN
- [x] All 6 rule keys present
- [x] `trial_ending_soon` has `runOncePerTenant=FALSE`
- [x] `activation_celebration` has 3 actions with delaySeconds 0, 0, 259200

## Self-Check: PASSED

---
*Phase: 47-tenant-self-onboarding-foundation-schema-migration-seed-data-and-sysadmin-crud*
*Completed: 2026-04-29*
