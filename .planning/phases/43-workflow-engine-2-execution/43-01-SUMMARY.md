---
phase: 43-workflow-engine-2-execution
plan: "01"
subsystem: database
tags: [prisma, postgresql, supabase, rls, workflow-engine, migration]

# Dependency graph
requires:
  - phase: 42-workflow-engine-foundation
    provides: StepTemplate, Playbook, PlaybookStep models + 5 enums (PlaybookEntityType, PlaybookCategory, PhaseType, StepType, AssigneeRole)
provides:
  - PlaybookInstance model with tenantId/playbookId/entityType/entityId/status/completionPercent/isDispatchReady
  - StepInstance model with playbookInstanceId/stepTemplateId/stepSnapshot/status/assigneeRole/result
  - PlaybookNotification model with tenantId/playbookInstanceId/notificationType/channel/recipientUserId
  - InstanceStatus enum (NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED)
  - StepStatus enum (NOT_STARTED, IN_PROGRESS, COMPLETE, FAILED, SKIPPED)
  - NotifType enum (STEP_ASSIGNED, STEP_OVERDUE, INSTANCE_BLOCKED, DISPATCH_READY, STEP_FAILED, APPROVAL_NEEDED)
  - NotifChannel enum (PUSH, SMS, IN_APP, EMAIL)
  - isDispatchReady boolean on User and Truck
  - isRequired, isDispatchBlocker, dueDaysFromStart, dueBeforeDispatch on PlaybookStep
  - RLS policies (tenant_isolation + bypass_rls) on all 3 new tables
affects: [43-02, 43-03, 43-04, 43-05, 43-06, 43-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PlaybookInstance uses snapshot pattern (playbookSnapshot JSON) to freeze state at launch time"
    - "StepInstance isolation via PlaybookInstance JOIN (no tenantId column) — same pattern as PlaybookStep"
    - "All new UUID PKs use dbgenerated('gen_random_uuid()') not @default(uuid())"
    - "bypass_rls_policy uses current_setting('app.bypass_rls', TRUE)::text = 'on' — matches existing pattern"

key-files:
  created:
    - apps/web/prisma/migrations/20260423200001_workflow_engine_execution/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/generated/prisma/index.d.ts
    - apps/web/src/generated/prisma/index.js
    - apps/web/src/generated/prisma/edge.js
    - apps/web/src/generated/prisma/index-browser.js
    - apps/web/src/generated/prisma/package.json
    - apps/web/src/generated/prisma/schema.prisma

key-decisions:
  - "Backfill UPDATE in migration uses quoted column names (\"overrideConfig\") — PostgreSQL is case-sensitive"
  - "StepInstance has no tenantId column — RLS isolation via playbookInstanceId JOIN (same as PlaybookStep)"
  - "PlaybookInstance uses Restrict delete on playbookId FK to prevent orphaned instances when playbook is deleted"
  - "isDispatchReady on both User and Truck enables dual-sided dispatch readiness check at the entity level"

patterns-established:
  - "Snapshot pattern: new instance tables freeze a JSON copy of their parent config at creation time"
  - "Dual bypass_rls: every new table gets both tenant_isolation_policy and bypass_rls_policy in the same migration"

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 43 Plan 01: Schema Foundation Summary

**Prisma schema extended with PlaybookInstance, StepInstance, and PlaybookNotification models plus 4 enums and dispatch-readiness fields; migration applied to Supabase with RLS policies**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-24T04:57:46Z
- **Completed:** 2026-04-24T05:02:35Z
- **Tasks:** 2
- **Files modified:** 7 (schema + generated client), 1 created (migration SQL)

## Accomplishments
- Added 4 new enums (InstanceStatus, StepStatus, NotifType, NotifChannel) to schema and DB
- Created 3 new tables (PlaybookInstance, StepInstance, PlaybookNotification) with full FK constraints and 7 composite indexes
- Added `isDispatchReady` boolean to both User and Truck, and 4 dispatch-blocker columns to PlaybookStep
- Applied migration to Supabase with RLS policies (tenant isolation + bypass_rls) on all 3 new tables
- Regenerated Prisma client — all new types accessible in `src/generated/prisma/index.d.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Phase 43 enums and new models to schema.prisma** - `79be97f` (feat)
2. **Task 2: Write migration SQL for all Phase 43 schema additions** - `6a05ddf` (chore)

## Files Created/Modified
- `apps/web/prisma/schema.prisma` - Added 4 enums, 3 models, isDispatchReady fields, 4 PlaybookStep columns, back-relations
- `apps/web/prisma/migrations/20260423200001_workflow_engine_execution/migration.sql` - Full DDL for all Phase 43 additions with RLS policies
- `apps/web/src/generated/prisma/index.d.ts` - Regenerated with PlaybookInstance, StepInstance, PlaybookNotification types

## Decisions Made
- Backfill UPDATE in migration must use quoted column names (`"overrideConfig"`) — PostgreSQL lowercases unquoted identifiers
- StepInstance deliberately has no `tenantId` column — RLS isolation via `playbookInstanceId` JOIN avoids denormalization
- `PlaybookInstance.playbookId` uses `onDelete: Restrict` to prevent orphaned instances if a playbook is deleted
- `isDispatchReady` added to both User and Truck to support the dual entity-level readiness check defined in the spec

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unquoted column name in migration backfill UPDATE**
- **Found during:** Task 2 (migration SQL application)
- **Issue:** `overrideConfig` in the backfill UPDATE was unquoted — PostgreSQL lowercased it to `overrideconfig`, causing `column "overrideconfig" does not exist` error
- **Fix:** Quoted all references to `overrideConfig` in the UPDATE statement as `"overrideConfig"`
- **Files modified:** `apps/web/prisma/migrations/20260423200001_workflow_engine_execution/migration.sql`
- **Verification:** Migration applied successfully; `prisma migrate status` shows DB up to date
- **Committed in:** `6a05ddf` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Essential fix for correct migration execution. No scope creep.

## Issues Encountered
- Pre-existing stale `.next/types/validator.ts` references deleted route `[stopId]/messages` (renamed to `[id]/messages`). This causes 1 TypeScript error unrelated to our schema changes. The Prisma-generated types themselves compile correctly — the error is in Next.js's generated route validator cache which requires a fresh `next build` to clear.

## User Setup Required
None - migration auto-applied to Supabase. No environment variables or dashboard steps needed.

## Next Phase Readiness
- All Phase 43 database schema in place — PlaybookInstance, StepInstance, PlaybookNotification tables exist in Supabase
- Prisma client regenerated — all new types available for service layer development
- Plans 43-02 through 43-07 can now proceed (all depend on these tables)
- Pre-existing `.next` stale type issue should be cleared by a `next build` during deployment

---
*Phase: 43-workflow-engine-2-execution*
*Completed: 2026-04-24*
