---
phase: 46-workflow-engine-5-polish-analytics
plan: "02"
subsystem: api
tags: [workflow-engine, cron, notifications, push, prisma, typescript]

# Dependency graph
requires:
  - phase: 46-01
    provides: OverdueRecipient enum on PlaybookStep, overdueRecipient field in stepSnapshot JSON, dueWithinHours field in stepSnapshot JSON
provides:
  - sendStepOverdue fans out to DRIVER/OWNER/BOTH based on overdueRecipient param
  - Overdue cron reads overdueRecipient + dueWithinHours from stepSnapshot
  - Pre-phase-46 steps (no dueWithinHours) marked isOverdue=true without sending alert
  - All TODO(phase-5) SMS comments removed from notifications.ts
affects: [46-03, 46-04, 46-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "overdueRecipient fan-out: cron reads from stepSnapshot JSON, passes to sendStepOverdue, which builds deduped recipientIds list"
    - "Pre-phase-46 guard: if snap.dueWithinHours is falsy, mark isOverdue=true and continue — no alert sent"

key-files:
  created: []
  modified:
    - apps/web/src/server/services/workflows/notifications.ts
    - apps/web/src/app/api/cron/workflow-notifications/route.ts

key-decisions:
  - "Default overdueRecipient is 'OWNER' — aligns with existing behavior; no breaking change for callers that don't pass the param"
  - "Dedup via [...new Set(recipientIds)] prevents double-push when BOTH is set and the assignee is also a dispatcher"

patterns-established:
  - "sendStepOverdue signature uses destructured object with default: overdueRecipient = 'OWNER' — future callers specify only what they need"

# Metrics
duration: 3min
completed: 2026-04-25
---

# Phase 46 Plan 02: Overdue Cron Fan-out + TODO Cleanup Summary

**sendStepOverdue now fans out to DRIVER/OWNER/BOTH from stepSnapshot; pre-phase-46 steps skip alert gracefully; all TODO(phase-5) SMS comments removed**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-25T04:00:00Z
- **Completed:** 2026-04-25T04:03:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Updated `sendStepOverdue` signature to accept `overdueRecipient` (DRIVER/OWNER/BOTH, default OWNER)
- Fan-out logic builds a deduped `recipientIds` array: DRIVER includes assignee, OWNER includes dispatchers, BOTH includes both
- Cron Sweep 1 now selects `stepSnapshot` alongside `entityId`/`entityType` context fields
- Per-step guard: if `snap.dueWithinHours` is falsy (pre-phase-46 step), mark `isOverdue=true` and skip alert
- Removed all `TODO(phase-5)` comments from file header and `sendStepAssigned` function

## Task Commits

Each task was committed atomically:

1. **Task 1: overdueRecipient fan-out + TODO(phase-5) removal** - `80de7ce` (feat)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified
- `apps/web/src/server/services/workflows/notifications.ts` - sendStepOverdue updated with overdueRecipient param + fan-out; TODO(phase-5) comments removed from header and sendStepAssigned
- `apps/web/src/app/api/cron/workflow-notifications/route.ts` - Sweep 1 selects stepSnapshot; per-step snap read for dueWithinHours guard and overdueRecipient fan-out

## Decisions Made
- Default `overdueRecipient = 'OWNER'` — preserves existing behavior for any callers that don't pass the param, no breaking change
- Dedup with `[...new Set(recipientIds)]` — prevents double push when BOTH is set and the assigned user is also a dispatcher (same userId would appear in both lists)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `apps/web/.next/types/validator.ts` (deleted `[stopId]/messages/route.ts`) — unrelated, not caused by this plan. Same issue noted in Phase 46-01 SUMMARY.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Per-step overdue alerting is now fully functional: cron reads `overdueRecipient` from `stepSnapshot`, fans out correctly, and guards against pre-phase-46 legacy steps
- Plan 03 (workflow analytics or daily digest) is unblocked
- No Twilio dependency was added

## Self-Check: PASSED
