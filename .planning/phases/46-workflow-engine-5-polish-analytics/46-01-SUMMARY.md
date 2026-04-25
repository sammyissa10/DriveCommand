---
phase: 46-workflow-engine-5-polish-analytics
plan: "01"
subsystem: database
tags: [prisma, postgres, migration, zod, workflow-engine, cron, vercel]

# Dependency graph
requires:
  - phase: 45-workflow-engine-4-automation
    provides: PlaybookStep model, NotifType enum, PlaybookNotification model, generatePlaybookInstance service
provides:
  - OverdueRecipient enum (DRIVER/OWNER/BOTH) in Prisma schema and DB
  - DAILY_DIGEST value in NotifType enum
  - dueWithinHours Int? field on PlaybookStep (hours-based SLA)
  - overdueRecipient OverdueRecipient @default(OWNER) field on PlaybookStep
  - generatePlaybookInstance computes dueDate from dueWithinHours (hours-first, days fallback)
  - buildStepSnapshot outputs dueWithinHours + overdueRecipient in JSON
  - overdueRecipientSchema in packages/validation
  - updatePlaybookStepSchema accepts dueWithinHours + overdueRecipient
  - vercel.json registers workflow-notifications (hourly) + workflow-digest (8am UTC)
affects: [46-02, 46-03, 46-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hours-based SLA: dueWithinHours takes precedence over legacy dueDaysFromStart in generatePlaybookInstance"
    - "stepSnapshot JSON includes overdueRecipient so cron can read it without DB join"
    - "Cron registration pattern: vercel.json crons array with path + schedule"

key-files:
  created:
    - apps/web/prisma/migrations/20260425030001_phase46_playbook_step_overdue_fields/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
    - packages/validation/src/workflows/enums.ts
    - packages/validation/src/workflows/playbook.ts
    - apps/web/vercel.json
    - apps/web/src/generated/prisma/* (auto-regenerated)

key-decisions:
  - "dueWithinHours (hours) takes precedence over dueDaysFromStart (days) — more granular SLA needed by cron without breaking existing playbooks that used dueDaysFromStart"
  - "overdueRecipient stored in stepSnapshot JSON — cron can determine who to notify from snapshot without extra DB join to PlaybookStep template"
  - "Migration created as raw SQL per project convention — prisma migrate dev blocked by url/directUrl in datasource block, migrate.mjs custom runner applies it directly"

patterns-established:
  - "Prisma generate workaround: temporarily remove url/directUrl from datasource block, run generate, restore — required due to Prisma 7 schema validation blocking generate when both prisma.config.ts and schema datasource urls coexist"

# Metrics
duration: 4min
completed: 2026-04-25
---

# Phase 46 Plan 01: Schema Migration — OverdueRecipient + dueWithinHours + DAILY_DIGEST + vercel.json Crons Summary

**OverdueRecipient enum, hours-based SLA fields on PlaybookStep, DAILY_DIGEST in NotifType, and both workflow crons registered in vercel.json — foundation for per-step overdue alerting**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-25T03:39:45Z
- **Completed:** 2026-04-25T03:43:30Z
- **Tasks:** 2
- **Files modified:** 6 (+ Prisma client regenerated)

## Accomplishments
- Added `OverdueRecipient` enum (DRIVER/OWNER/BOTH) to schema and Supabase DB
- Added `DAILY_DIGEST` to `NotifType` enum for daily summary notifications
- Added `dueWithinHours Int?` and `overdueRecipient OverdueRecipient @default(OWNER)` to `PlaybookStep`
- Updated `generatePlaybookInstance` to use hours-first due-date computation with days as fallback
- Updated `buildStepSnapshot` to capture `dueWithinHours` + `overdueRecipient` in the immutable JSON snapshot
- Added `overdueRecipientSchema` to validation package and extended `updatePlaybookStepSchema`
- Registered both workflow cron routes in vercel.json so they fire in production

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration** - `0911b2f` (feat)
2. **Task 2: generatePlaybookInstance + Zod + vercel.json** - `a545080` (feat)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified
- `apps/web/prisma/migrations/20260425030001_phase46_playbook_step_overdue_fields/migration.sql` - CREATE TYPE OverdueRecipient + ALTER TABLE PlaybookStep to add dueWithinHours + overdueRecipient; ALTER TYPE NotifType to add DAILY_DIGEST
- `apps/web/prisma/schema.prisma` - OverdueRecipient enum, DAILY_DIGEST in NotifType, dueWithinHours + overdueRecipient on PlaybookStep
- `apps/web/src/server/services/workflows/generatePlaybookInstance.ts` - dueDate computed from dueWithinHours (3_600_000 ms/hr) with dueDaysFromStart fallback; buildStepSnapshot outputs dueWithinHours + overdueRecipient; buildPlaybookSnapshot type updated
- `packages/validation/src/workflows/enums.ts` - overdueRecipientSchema z.enum(['DRIVER','OWNER','BOTH'])
- `packages/validation/src/workflows/playbook.ts` - updatePlaybookStepSchema extended with dueWithinHours + overdueRecipient
- `apps/web/vercel.json` - two new cron entries: workflow-notifications (0 * * * *) and workflow-digest (0 8 * * *)

## Decisions Made
- `dueWithinHours` takes precedence over `dueDaysFromStart` — cron needs sub-day granularity; existing playbooks using days-based field still work via fallback
- `overdueRecipient` stored in stepSnapshot — cron reads from snapshot JSON, avoids extra join to PlaybookStep template table
- Raw SQL migration pattern used per project convention — Prisma 7 validate blocks `migrate dev` when `url`/`directUrl` are present in datasource block alongside `prisma.config.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cannot run `prisma migrate dev --create-only` — schema P1012 validation error**
- **Found during:** Task 1 (Schema migration)
- **Issue:** Prisma 7.6 validate refuses to run when schema.prisma has `url`/`directUrl` in the datasource block AND prisma.config.ts also exists. `prisma migrate dev` exits with P1012 error.
- **Fix:** Wrote migration SQL by hand following the established project pattern (used in all Phases 32-45). Applied via `node scripts/migrate.mjs` with env vars sourced from `.env`. For `prisma generate`, temporarily removed `url`/`directUrl` from datasource block, ran generate, then restored them (same pattern as commit 47cc79f in Phase 45-05).
- **Files modified:** migration.sql (created manually), schema.prisma (temporary datasource edit)
- **Verification:** Migration output: "Applied: 20260425030001_phase46_playbook_step_overdue_fields". `prisma generate` output: "Generated Prisma Client (v7.6.0)". 112 occurrences of new type names in generated index.d.ts.
- **Committed in:** `0911b2f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Blocking issue resolved with established project workaround. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in `apps/web/.next/types/validator.ts` (deleted `[stopId]/messages/route.ts` → replaced with `[id]/messages/`) — unrelated to this plan, not caused by any Task 1 or 2 changes. Same issue noted in Phase 45-01 SUMMARY.

## User Setup Required
None - no external service configuration required. Migration applied automatically via `node scripts/migrate.mjs`.

## Next Phase Readiness
- `OverdueRecipient` enum and `dueWithinHours` + `overdueRecipient` fields available on `PlaybookStep` via `@/generated/prisma`
- `overdueRecipientSchema` importable from `@drivecommand/validation`
- vercel.json cron routes registered — Plan 02 (workflow-notifications cron handler) will be called hourly in production
- Plan 02 (cron handler for step overdue notifications) is now unblocked

## Self-Check: PASSED
