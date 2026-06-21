# Quick Task 450 — Plan

## Task
Read-only diagnostic: in-app notification bugs (read-state reverts + age display).

## Mode
READ ONLY — no code edits, no migrations, no fixes.

## Investigation Steps

### Task 1 — Trace compliance + dispatch write paths
- Read `docs/specs/Notifications System Technical Documentation.md`
- Read `apps/web/src/lib/carrier/in-app-notifications.ts` (legacy createNotification)
- Read `apps/web/src/lib/notifications/in-app-writer.ts` (Phase 41 writeInAppNotification)
- Read `apps/web/src/lib/carrier/notifications.ts` (sendComplianceAlertNotifications + sendDispatchAssignedNotification)
- Read `apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts`
- Read `apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts`
- Read `apps/web/src/app/api/cron/send-reminders/route.ts`
- Read `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`
- Determine which write function each notification type calls

### Task 2 — Resolve age ordering with real DB data
- Run SQL via Supabase MCP: SELECT id, type, title, created_at, read FROM in_app_notifications WHERE org_id = '7e9eca25-1f97-46ed-9365-e67be49436d5' ORDER BY created_at DESC LIMIT 20
- Inspect whether created_at values are monotonically descending
- Check InAppNotification schema for @updatedAt vs @default(now()) on createdAt

### Task 3 — Write findings document
- SUMMARY.md with explicit answers to Q1 and Q2

## Success Criteria
- Q1 answered: which write path each notification type uses, yes/no on dispatcher-only fix scope
- Q2 answered: 20 DB rows reported, ordering verdict, schema field cited
- No code changes made
