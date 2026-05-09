---
phase: 45-workflow-engine-4-automation
plan: "03"
subsystem: workflow-notifications
tags: [notifications, push, email, cron, workflow-engine]
dependency_graph:
  requires:
    - 45-01 (DB foundation — PlaybookNotification model)
    - 45-02 (services — computeDispatchReadiness, generatePlaybookInstance, failInspectionItem, completeStep)
  provides:
    - Unified notification module (all 7 NotifType values)
    - DISPATCH_READY push on readiness flip
    - INSTANCE_BLOCKED push on status flip
    - STEP_OVERDUE daily cron sweep
    - INSTANCE_BLOCKED email escalation at 48h
  affects:
    - apps/web/src/server/services/workflows/ (computeDispatchReadiness, generatePlaybookInstance, failInspectionItem, completeStep)
    - apps/web/src/app/api/cron/ (new workflow-notifications cron route)
tech_stack:
  added:
    - WorkflowInstanceBlockedEmail React Email template (gmail-client channel)
  patterns:
    - Centralized notification module with one function per NotifType
    - writeAuditRow helper — every send writes PlaybookNotification row
    - Best-effort try/catch wrapping — notifications never block callers
    - CRON_SECRET bearer auth on cron route (consistent with all existing cron routes)
    - Prisma bypass_rls in transactions for cross-tenant cron operations
key_files:
  created:
    - apps/web/src/server/services/workflows/notifications.ts
    - apps/web/src/emails/workflow-instance-blocked.tsx
    - apps/web/src/app/api/cron/workflow-notifications/route.ts
  modified:
    - apps/web/src/server/services/workflows/computeDispatchReadiness.ts
    - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
    - apps/web/src/server/services/workflows/failInspectionItem.ts
    - apps/web/src/server/services/workflows/completeStep.ts
decisions:
  - writeAuditRow is a shared helper (1 physical playbookNotification.create) called 9 times across 7 exported functions — satisfies the "one audit row per send" requirement at runtime
  - DISPATCH_READY fires on instance.entityId as userId — this is correct for DRIVER entity type; for VEHICLE entity the sendDispatchReady function gracefully handles getUserName returning a label
  - failInspectionItem APPROVAL_NEEDED: since no MECHANIC user role exists in the schema, APPROVAL_NEEDED is sent to all OWNER/MANAGER users (same pattern as pre-refactor notifyOnFail)
  - Cron schedule NOT added to vercel.json — operational deploy step, documented in notes below
metrics:
  duration: 522s
  completed: 2026-04-24
  tasks: 3
  files: 7
---

# Phase 45 Plan 03: Workflow Notification Suite Summary

Unified all 7 NotifType values into a single `notifications.ts` module with consistent audit logging, wired DISPATCH_READY and INSTANCE_BLOCKED on status flips, and added a daily cron endpoint for STEP_OVERDUE sweeps and INSTANCE_BLOCKED email escalation.

## Notifications Module API

`apps/web/src/server/services/workflows/notifications.ts` exports:

| Function | Channel | Recipients | Trigger |
|---|---|---|---|
| `sendStepAssigned({ stepInstanceId, tenantId })` | PUSH | Assignee user | Step assigned after instance created |
| `sendStepOverdue({ stepInstanceId, tenantId })` | PUSH | OWNER/MANAGER dispatchers | Cron sweep: dueDate < now-24h |
| `sendInstanceBlocked({ playbookInstanceId, tenantId })` | PUSH | OWNER/MANAGER dispatchers | Status flip to BLOCKED |
| `sendDispatchReady({ userId, tenantId, playbookInstanceId })` | PUSH | OWNER/MANAGER dispatchers | Readiness flip false→true |
| `sendStepFailed({ stepInstanceId, tenantId, recipientRole })` | PUSH | OWNER/MANAGER dispatchers | Step FAILED (DISPATCHER or MECHANIC copy variant) |
| `sendApprovalNeeded({ stepInstanceId, tenantId, approverUserId })` | PUSH | Named approver | Ad-hoc mechanic step created |
| `sendInstanceBlockedEmail({ playbookInstanceId, tenantId })` | EMAIL | OWNER/MANAGER admin emails | Cron sweep: BLOCKED > 48h |

SMS: `// TODO(phase-5): send SMS via Twilio — see spec Section 10 and Phase 5 in docs/specs/DriveCommand_Workflow_Engine_v2.md`

## Notification Flip-Gate Pattern (DISPATCH_READY)

```typescript
const wasReady = instance.isDispatchReady;
// ... compute newIsReady ...
await prisma.playbookInstance.update(...);

// Strict false→true gate — prevents dispatcher notification spam on repeat calls
if (wasReady === false && isReady === true) {
  await sendDispatchReady({ userId: instance.entityId, tenantId, playbookInstanceId: instanceId });
}
```

Same gate pattern applied to INSTANCE_BLOCKED: `!wasBlocked && status === 'BLOCKED'`.

## Cron Schedule (Pending Ops Step)

Add to `vercel.json` on deploy:

```json
{ "path": "/api/cron/workflow-notifications", "schedule": "0 * * * *" }
```

Hourly is fine — `isOverdue: true` and `notifications.none({ notificationType: 'INSTANCE_BLOCKED', channel: 'EMAIL' })` dedup gates prevent duplicate sends on repeat runs.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

1. `completeStep.ts` was also refactored (not listed in Task 2 files explicitly, but it had an inline `sendPushToUser` call in `notifyNextStep`). Treated as Rule 2 (correctness — consistent audit trail). No behavioral change.

2. The Phase 44 test file is `workflows-fail-inspection.test.ts` (not `workflows-fail-inspection-item.test.ts` as referenced in the plan). Tests located and all 5 passed green.

## Self-Check: PASSED

| Item | Status |
|---|---|
| `notifications.ts` exists | FOUND |
| `workflow-instance-blocked.tsx` exists | FOUND |
| `cron/workflow-notifications/route.ts` exists | FOUND |
| Commit 1362bf3 (notifications module) | FOUND |
| Commit 071efc9 (wiring + refactor) | FOUND |
| Commit b301cef (cron route) | FOUND |
| Phase 44 tests 5/5 green | PASSED |
| TypeScript clean (0 new errors) | PASSED |
