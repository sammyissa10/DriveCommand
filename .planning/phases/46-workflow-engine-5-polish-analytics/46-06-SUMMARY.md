---
phase: 46-workflow-engine-5-polish-analytics
plan: "06"
subsystem: email-cron
tags: [react-email, cron, vercel, workflow-engine, notifications, digest]

# Dependency graph
requires:
  - phase: 46-01
    provides: DAILY_DIGEST in NotifType enum, PlaybookNotification model, vercel.json cron registration

provides:
  - WorkflowSafetyDigestEmail react-email template
  - workflow-digest cron GET handler with per-tenant sweep + DAILY_DIGEST dedup

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sendEmail() takes { to, subject, react: ReactElement } — pass React.createElement result, not pre-rendered HTML"
    - "DAILY_DIGEST dedup via PlaybookNotification.findFirst where notificationType=DAILY_DIGEST AND createdAt >= todayStart"
    - "StepStatus.COMPLETE (not COMPLETED) — enum value per schema"
    - "Per-tenant cron sweep: query distinct tenantIds from active instances, loop with per-tenant try/catch"

key-files:
  created:
    - apps/web/src/emails/workflow-safety-digest.tsx
    - apps/web/src/app/api/cron/workflow-digest/route.ts

key-decisions:
  - "Pass React.createElement() result to sendEmail() react prop — gmail-client.ts renders internally, no pre-render needed in cron"
  - "DigestStats interface gets [key: string]: number index signature — required for logger.info() call which takes Record<string, unknown>"
  - "completedAt filter uses StepStatus.COMPLETE (not COMPLETED) matching actual Prisma enum value"

# Metrics
duration: 233s
completed: 2026-04-25
---

# Phase 46 Plan 06: Daily Safety Digest — react-email template + cron route Summary

**WorkflowSafetyDigestEmail template and workflow-digest cron with per-tenant sweep, DAILY_DIGEST dedup, and graceful error isolation per tenant**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-25T04:07:39Z
- **Completed:** 2026-04-25T04:11:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `workflow-safety-digest.tsx` react-email template with three-stat grid (overdue steps red-highlighted when > 0, completed today, active checklists), conditional overdue alert text, dark header, and CTA button
- Created `workflow-digest/route.ts` GET cron handler with:
  - CRON_SECRET bearer token auth guard (matches all other cron routes)
  - Per-tenant sweep: queries distinct tenantIds from active (NOT_STARTED / IN_PROGRESS) PlaybookInstances
  - DAILY_DIGEST dedup check: skips tenant if PlaybookNotification exists for today with notificationType=DAILY_DIGEST
  - Stats collection: overdue step count, COMPLETE steps completed since midnight UTC, active instance count
  - Email delivery to all active OWNER + MANAGER users via sendEmail({ react: ... })
  - Dedup row write after send: PlaybookNotification(notificationType=DAILY_DIGEST, channel=EMAIL)
  - Per-tenant try/catch: individual failures logged and skipped, sweep never aborts

## Task Commits

1. **Task 1: WorkflowSafetyDigestEmail template** — `2bdd548`
2. **Task 2: workflow-digest cron route** — `be1676f`

## Files Created

- `apps/web/src/emails/workflow-safety-digest.tsx` — WorkflowSafetyDigestEmail: three stat cells, conditional overdue alert, Preview component, CTA button, dark header (#0f172a)
- `apps/web/src/app/api/cron/workflow-digest/route.ts` — GET handler: CRON_SECRET auth, per-tenant sweep with bypass_rls transactions, DAILY_DIGEST dedup, React email via sendEmail({ react }), dedup row, isolated error handling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sendEmail takes `react: ReactElement`, not pre-rendered `html` string**
- **Found during:** Task 2 (before writing code, checked `gmail-client.ts`)
- **Issue:** Plan template showed calling `render(WorkflowSafetyDigestEmail(...))` and passing `html` to `sendEmail()`. But `sendEmail` signature is `{ to, subject, react: ReactElement }` — it renders internally.
- **Fix:** Used `React.createElement(WorkflowSafetyDigestEmail, props)` and passed it to `sendEmail({ react: emailElement })`. Removed the `render()` import.
- **Files modified:** `workflow-digest/route.ts` (written correctly from the start)
- **Commit:** `be1676f`

**2. [Rule 1 - Bug] StepStatus enum value is `COMPLETE`, not `COMPLETED`**
- **Found during:** Task 2 TypeScript check
- **Issue:** Plan template used `status: 'COMPLETED'` in the stepInstance count query. Prisma schema defines `StepStatus.COMPLETE`.
- **Fix:** Changed to `status: 'COMPLETE'`
- **Files modified:** `workflow-digest/route.ts`
- **Commit:** `be1676f`

**3. [Rule 1 - Bug] DigestStats needs index signature for logger call**
- **Found during:** Task 2 TypeScript check
- **Issue:** `logger.info('[CRON] ...', stats)` where logger expects `Record<string, unknown>`. DigestStats had no index signature.
- **Fix:** Added `[key: string]: number` to the interface.
- **Files modified:** `workflow-digest/route.ts`
- **Commit:** `be1676f`

---

**Total deviations:** 3 auto-fixed (Rule 1 — pre-write discovery + TypeScript errors)
**Impact on plan:** No scope change. All fixes were correctness requirements caught before or during TypeScript check.

## Issues Encountered

- Pre-existing TypeScript error in `apps/web/.next/types/validator.ts` (deleted `[stopId]/messages/route.ts`) — unrelated to this plan, same as noted in 46-01 SUMMARY.

## Self-Check: PASSED
