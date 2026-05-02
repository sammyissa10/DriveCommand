---
phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables
plan: "02"
subsystem: database
tags: [prisma, seeder, snake_case, carrier, sample-data, onboarding]

# Dependency graph
requires:
  - phase: 50-01
    provides: isSample column added to carrier_trucks, clients, loads, carrier_drivers tables via raw SQL migrations

provides:
  - seedSampleData rewrites targeting snake_case carrier tables (carrierTruck, carrierClient, carrierLoad, carrierDriver)
  - ONBOARDING_SEED_SAMPLES env-var kill switch
  - generateVehicleId exported from fleet-trucks.ts
  - Sample drivers create both User row (isSample=true) and CarrierDriver row linked via userId

affects: [50-03, 50-04, activation-tracker, tenant-provisioning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kill switch pattern: process.env.ONBOARDING_SEED_SAMPLES === 'false' guard at top of function"
    - "Sample data uses orgId (not tenantId) as carrier table FK"
    - "Sample drivers: User row (passwordHash placeholder) + CarrierDriver row linked via userId"

key-files:
  created: []
  modified:
    - apps/web/src/lib/onboarding/seed-sample-data.ts
    - apps/web/src/lib/carrier/fleet-trucks.ts
    - apps/web/.env.example

key-decisions:
  - "Use orgId (not tenantId) as carrier table FK — carrier tables use org_id column"
  - "generateVehicleId is async; called sequentially in a for loop within the transaction client scope"
  - "Old PascalCase seed code wrapped in PHASE 50 comment block for rollback safety"
  - "SeedConfig interface updated from customersCount to clientsCount + loadsCount to match carrier model names"

patterns-established:
  - "Kill switch: env var === 'false' guard at top of seeder function body"

# Metrics
duration: 2min
completed: 2026-05-02
---

# Phase 50 Plan 02: Seeder Rewrite for Snake Case Tables Summary

**Rewrote seedSampleData to write to carrier snake_case tables (carrierTruck, carrierClient, carrierLoad, carrierDriver) with an ONBOARDING_SEED_SAMPLES kill switch and dual User+CarrierDriver sample driver creation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-02T23:53:08Z
- **Completed:** 2026-05-02T23:55:36Z
- **Tasks:** 3 (Task 1, Task 1.5, Task 2)
- **Files modified:** 3

## Accomplishments
- Rewrote seed-sample-data.ts to write exclusively to carrier snake_case tables using orgId as tenant FK
- Added ONBOARDING_SEED_SAMPLES=true kill switch to .env and .env.example
- Exported generateVehicleId from fleet-trucks.ts so the seeder can import and call it
- Sample drivers now create both a User row (passwordHash placeholder, isSample=true) AND a CarrierDriver row linked via userId
- Updated SeedConfig interface from customersCount to clientsCount + loadsCount
- Old PascalCase seed code wrapped in PHASE 50 rollback comment block

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ONBOARDING_SEED_SAMPLES env var** - `00c9336` (chore)
2. **Task 1.5: Export generateVehicleId from fleet-trucks.ts** - `b908b48` (chore)
3. **Task 2: Rewrite seed-sample-data.ts for snake_case carrier tables** - `1f66833` (feat)

## Files Created/Modified
- `apps/web/src/lib/onboarding/seed-sample-data.ts` - Rewritten seeder targeting carrier snake_case tables
- `apps/web/src/lib/carrier/fleet-trucks.ts` - Added export keyword to generateVehicleId function
- `apps/web/.env.example` - Added ONBOARDING_SEED_SAMPLES=true with descriptive comment

## Decisions Made
- Used orgId (not tenantId) as the carrier table FK since all carrier models use org_id as the tenant reference column
- generateVehicleId is async (queries DB for max vehicleId), so trucks are created sequentially in a for loop rather than Promise.all
- SeedConfig interface updated from `customersCount` to `clientsCount` + `loadsCount` to match carrier model naming
- Old PascalCase seed code preserved in a comment block rather than deleted, per Option Z shadow retention strategy

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `.env` is gitignored (expected for security) — Task 1 commit only staged `.env.example`. The ONBOARDING_SEED_SAMPLES=true var is set locally in `.env` as intended.

## User Setup Required
None - no external service configuration required. ONBOARDING_SEED_SAMPLES=true is set in .env locally.

## Next Phase Readiness
- Seeder now populates the tables that carrier sidebar pages actually read from
- Ready for Plan 03: Activation tracker to check snake_case tables for has_trucks, has_drivers, etc.
- generateVehicleId is exported and available for any other callers that need it

---
*Phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables*
*Completed: 2026-05-02*
