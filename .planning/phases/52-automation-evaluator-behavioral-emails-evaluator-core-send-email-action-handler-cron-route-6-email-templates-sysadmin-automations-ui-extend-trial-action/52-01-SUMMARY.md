---
phase: 52-automation-evaluator-behavioral-emails-evaluator-core-send-email-action-handler-cron-route-6-email-templates-sysadmin-automations-ui-extend-trial-action
plan: 01
subsystem: api
tags: [prisma, automation, email, react-email, nodemailer, evaluator, cron]

# Dependency graph
requires:
  - phase: 47-tenant-self-onboarding
    provides: AutomationRule, AutomationRun, AppEvent models; seeded welcome_owner and activation_celebration rules
  - phase: 51-activation-gaps
    provides: AppEvent fire points for tenant.created and tenant.activated

provides:
  - PENDING/SENT enum values on AutomationRunStatus (migration applied to Supabase)
  - scheduledAt, eventId, errorMessage columns on AutomationRun
  - Partial unique index AutomationRun_eventId_ruleId_key for event-driven idempotency
  - runEvaluator() function (two-path: event-driven scheduling + execute-due-runs)
  - executeSendEmailAction() with template registry lookup and owner context resolution
  - TEMPLATE_REGISTRY with welcome-owner and activation-celebration entries
  - ActivationCelebrationEmail React Email template
  - welcome-owner.tsx signature updated: Tom → Sammy

affects:
  - 52-02: cron route that calls runEvaluator() and directly creates PENDING runs for cron-driven rules

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evaluator two-path pattern: event-driven scheduling (Path 1) + execute-due-runs (Path 2) in one call"
    - "Optimistic locking via updateMany WHERE status=PENDING prevents double-execution on concurrent ticks"
    - "Event-driven idempotency via UNIQUE index on (eventId, ruleId) WHERE eventId IS NOT NULL"
    - "All AutomationRun writes use bypass_rls + TX_OPTIONS pattern"
    - "TEMPLATE_REGISTRY pattern: ruleKey → { subject fn, buildElement fn }"
    - "actionsJson uses templateKey field (not template) to match TEMPLATE_REGISTRY keys"

key-files:
  created:
    - apps/web/prisma/migrations/20260503000001_phase52_01_automation_run_schema/migration.sql
    - apps/web/src/lib/automations/evaluator.ts
    - apps/web/src/lib/automations/actions/send-email.ts
    - apps/web/src/lib/automations/template-registry.ts
    - apps/web/src/emails/activation-celebration.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/emails/welcome-owner.tsx
    - apps/web/src/generated/prisma/

key-decisions:
  - "actionsJson templateKey field used instead of template field — seeded rows updated in DB one-time fix"
  - "confirm_email templateKey skipped with console.warn — out of scope for Phase 52"
  - "delaySeconds read from rule via (rule as any).delaySeconds — no schema field, defaults to 0"
  - "Evaluator last-tick derives from most-recent AutomationRun.firedAt, fallback 10 min ago"

patterns-established:
  - "Automation evaluator: runEvaluator() handles both event-driven and execute-due-runs in single call"
  - "Template registry: keyed by string matching actionsJson templateKey, returns subject fn + buildElement fn"

# Metrics
duration: 8min
completed: 2026-05-03
---

# Phase 52 Plan 01: Automation Evaluator Core Summary

**Two-path automation evaluator (event-driven scheduling + execute-due-runs), send_email action handler with TEMPLATE_REGISTRY, and schema migration adding PENDING/SENT enum values + scheduledAt/eventId/errorMessage columns to AutomationRun**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-03T21:50:38Z
- **Completed:** 2026-05-03T21:58:24Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Schema migration applied to Supabase: PENDING/SENT enum values + 3 new AutomationRun columns + 2 indexes
- runEvaluator() created with event-driven scheduling path (Path 1) and execute-due-runs path (Path 2) with optimistic locking
- executeSendEmailAction() handler with TEMPLATE_REGISTRY lookup, owner context resolution, and gmail-client integration
- ActivationCelebrationEmail React Email template created with Sammy signature
- welcome-owner.tsx signature updated from Tom to Sammy throughout
- Seeded AutomationRule rows fixed: actionsJson updated from legacy `template` field to correct `templateKey` field

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration — add PENDING/SENT enum values + new AutomationRun columns** - `5a21712` (feat)
2. **Task 2: Evaluator core + send_email handler + template registry + email templates** - `7cbeb30` (feat)
3. **Task 3: Verify seeded actionsJson + TypeScript check + deploy** - (DB data fix only, no code commit)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `apps/web/prisma/migrations/20260503000001_phase52_01_automation_run_schema/migration.sql` - Migration: PENDING/SENT enum values, scheduledAt/eventId/errorMessage columns, two indexes
- `apps/web/prisma/schema.prisma` - Added PENDING/SENT to AutomationRunStatus enum; added 3 fields + 2 indexes to AutomationRun model
- `apps/web/src/generated/prisma/` - Regenerated Prisma client
- `apps/web/src/lib/automations/evaluator.ts` - runEvaluator() with two execution paths; exports EvaluatorResult interface
- `apps/web/src/lib/automations/actions/send-email.ts` - executeSendEmailAction() with template registry + owner context + gmail-client call
- `apps/web/src/lib/automations/template-registry.ts` - TEMPLATE_REGISTRY with welcome-owner and activation-celebration entries
- `apps/web/src/emails/activation-celebration.tsx` - New React Email template for onboarding completion with Sammy signature
- `apps/web/src/emails/welcome-owner.tsx` - Updated intro and sign-off from Tom to Sammy

## Decisions Made
- **actionsJson templateKey fix**: The seeded AutomationRule rows used a legacy `template` field; the evaluator reads `templateKey`. Fixed via one-time Prisma update (not a migration) — reduced actionsJson to single send_email action per rule, dropping out-of-scope confirm_email and in_app_message entries.
- **confirm_email skip**: Plan specified skipping `confirm_email` templateKey with console.warn — done. Only send_email actions with known TEMPLATE_REGISTRY keys execute.
- **delaySeconds**: AutomationRule has no `delaySeconds` schema field; evaluator reads it via `(rule as any).delaySeconds ?? 0` to default to immediate scheduling.
- **TEMPLATE_REGISTRY keys use kebab-case**: `welcome-owner` and `activation-celebration` match the template file names and are now consistent in actionsJson.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed actionsJson format mismatch between seeded data and evaluator**
- **Found during:** Task 3 (Verify seeded actionsJson)
- **Issue:** Seeded AutomationRule rows used `template` field (e.g., "welcome_owner"), but evaluator reads `templateKey` field (e.g., "welcome-owner"). No email would have sent without this fix.
- **Fix:** Updated both rules via Prisma to use `[{ type: 'send_email', templateKey: 'welcome-owner' }]` and `[{ type: 'send_email', templateKey: 'activation-celebration' }]` respectively. Dropped out-of-scope confirm_email and in_app_message entries.
- **Files modified:** No code files — DB data fix only
- **Verification:** Queried Prisma after update, confirmed correct format
- **Committed in:** N/A (DB data fix, not tracked in Git)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential correctness fix — evaluator would silently skip all actions without it. No scope creep.

## Issues Encountered
- Vercel CLI not globally available in bash path; used `npx vercel --prod` from repo root. Build succeeded: "Compiled successfully in 67s".

## User Setup Required
None - no external service configuration required beyond what was already in place.

## Next Phase Readiness
- runEvaluator() is ready to be called from the cron route (Plan 52-02)
- TEMPLATE_REGISTRY ready for Plan 52-02 to add: no-progress-nudge, add-driver-nudge, dispatch-load-nudge, trial-ending-soon templates
- DB schema fully migrated, Prisma client regenerated, indexes in place
- welcome-owner.tsx and activation-celebration.tsx both use Sammy signature

## Self-Check: PASSED
- migration.sql: FOUND at apps/web/prisma/migrations/20260503000001_phase52_01_automation_run_schema/migration.sql
- evaluator.ts: FOUND at apps/web/src/lib/automations/evaluator.ts
- send-email.ts: FOUND at apps/web/src/lib/automations/actions/send-email.ts
- template-registry.ts: FOUND at apps/web/src/lib/automations/template-registry.ts
- activation-celebration.tsx: FOUND at apps/web/src/emails/activation-celebration.tsx
- Commit 5a21712: FOUND
- Commit 7cbeb30: FOUND
- DB enum values confirmed: {FIRED,SKIPPED_CONDITION,SKIPPED_ALREADY_RAN,FAILED,PENDING,SENT}
- DB columns confirmed: scheduledAt, eventId, errorMessage on AutomationRun
- Vercel build: Compiled successfully in 67s, no errors

---
*Phase: 52-automation-evaluator-behavioral-emails*
*Completed: 2026-05-03*
