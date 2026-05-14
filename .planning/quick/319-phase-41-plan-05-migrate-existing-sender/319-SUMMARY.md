---
phase: 319-phase-41-plan-05-migrate-existing-sender
plan: "01"
subsystem: notifications
tags: [notifications, email, cron, dispatcher, digest, sysadmin]
dependency_graph:
  requires:
    - quick-315 (notification data layer — NotificationTemplate, NotificationSendLog)
    - quick-316 (dispatcher — dispatchNotification)
    - quick-318 (tenant + per-user settings UI)
  provides:
    - Existing send* senders route through dispatchNotification internally
    - Three new scheduled digest cron routes (daily driver, weekly owner, compliance 30-day)
    - SysAdmin health tile in Send Log tab
    - Developer reference doc at docs/notifications.md
  affects:
    - apps/web/src/lib/email/ (9 sender files wrapped)
    - apps/web/src/app/api/cron/ (1 updated + 3 new routes)
    - apps/web/vercel.json (3 new cron entries)
    - apps/web/src/app/(admin)/notifications/ (health tile + send-log-tab)
tech_stack:
  added: []
  patterns:
    - "Wrap-don't-rewrite: public API unchanged, legacy body preserved as legacyX fallback"
    - "Digest payload builder returns null on empty data to skip dispatch"
    - "Cross-tenant cron pattern: bypass_rls tenant fetch + per-tenant withTenantRLS scope"
key_files:
  created:
    - apps/web/src/lib/notifications/digests/daily-driver-payload.ts
    - apps/web/src/lib/notifications/digests/weekly-owner-payload.ts
    - apps/web/src/lib/notifications/digests/compliance-30day-payload.ts
    - apps/web/src/app/api/cron/digest-daily-driver/route.ts
    - apps/web/src/app/api/cron/digest-weekly-owner/route.ts
    - apps/web/src/app/api/cron/digest-compliance-30day/route.ts
    - apps/web/src/app/(admin)/notifications/health-tile.tsx
    - docs/notifications.md
  modified:
    - apps/web/src/lib/email/send-driver-invitation.ts
    - apps/web/src/lib/email/send-owner-invitation.ts
    - apps/web/src/lib/email/send-maintenance-reminder.ts
    - apps/web/src/lib/email/send-document-expiry-reminder.ts
    - apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
    - apps/web/src/lib/email/send-geofence-alert.ts (header comment only, stays legacy)
    - apps/web/src/lib/email/send-sysadmin-invoice.ts
    - apps/web/src/lib/email/send-fleet-message-notifications.ts
    - apps/web/src/lib/email/customer-notifications.ts
    - apps/web/src/app/api/cron/send-reminders/route.ts
    - apps/web/src/app/(admin)/actions/notifications.ts (extended SendLogStats + topFailingTrigger)
    - apps/web/src/app/(admin)/notifications/send-log-tab.tsx (HealthTile import + render)
    - apps/web/vercel.json (3 new cron entries)
decisions:
  - "send-geofence-alert.ts kept on full legacy path — no truck.geofence trigger exists yet; wrapper pattern applied via header comment only"
  - "sendOwnerReplyNotification gained optional tenantId field — callers that omit it fall through to legacy automatically"
  - "getNotificationSendLogStats extended in-place (not a new action) to add topFailingTrigger via groupBy FAILED last 24h"
  - "HealthTile uses sentToday/failedToday (midnight-to-now) as the 24h approximation — documented in JSDoc"
metrics:
  duration: "~35 min"
  completed: "2026-05-14"
  tasks_completed: 4
  files_changed: 21
---

# Phase 319 Plan 05: Migrate Existing Senders + Digest Crons + Health Tile Summary

Wraps all existing `send*` email senders through `dispatchNotification` without changing call sites, adds three scheduled digest cron routes, and adds a SysAdmin health monitoring tile with per-tenant customization support automatically applied to all existing notifications.

## Files Wrapped (Task 1)

| File | Trigger Key |
|---|---|
| `send-driver-invitation.ts` | `driver.invited` |
| `send-owner-invitation.ts` | `user.invited` |
| `send-maintenance-reminder.ts` | `truck.maintenance_due` |
| `send-document-expiry-reminder.ts` | `truck.document_expiring` |
| `send-driver-document-expiry-reminder.ts` | `driver.license_expiring` |
| `send-sysadmin-invoice.ts` | `invoice.created` |
| `send-fleet-message-notifications.ts` (sendDriverMessageNotification) | `message.received` |
| `send-fleet-message-notifications.ts` (sendOwnerReplyNotification) | `message.received` |
| `customer-notifications.ts` (sendLoadStatusEmail) | `customer.tracking_link_sent` or `customer.delivered_notification` |

## send-geofence-alert.ts Status

Kept entirely on the legacy path. No `truck.geofence` trigger key exists in the notification system. The file has a header comment explaining the deferral. Trigger migration is planned for a future phase when the trigger key is added.

## Cron Route Updates (Task 2 + 3)

- **send-reminders** (existing): Replaced per-owner send* loops with `dispatchNotification` calls for `truck.maintenance_due`, `truck.document_expiring`, and `driver.license_expiring`. Removed `recordNotification`/`markNotificationSent`/`generateIdempotencyKey` — the dispatcher handles these. JSON summary shape preserved exactly.
- **digest-daily-driver** (new): `0 22 * * *` UTC (5 PM EST daily), DRIVER recipients
- **digest-weekly-owner** (new): `0 22 * * 5` UTC (Friday 5 PM EST), OWNER recipients
- **digest-compliance-30day** (new): `0 14 * * 1` UTC (Monday 9 AM EST), OWNER recipients

## vercel.json Cron Count

9 existing entries + 3 new digest entries = **12 total cron entries**.

## HealthTile

Location: `apps/web/src/app/(admin)/notifications/health-tile.tsx`, rendered at the top of the SysAdmin Send Log tab (`/admin/notifications`).

`getNotificationSendLogStats` was extended in-place (no new action file) to add `topFailingTrigger: string | null`. The extension groups `FAILED` rows by `triggerKey` in the last 24h and returns the highest-count trigger. The health tile shows last-24h sent/failed/failure rate plus a red banner with `topFailingTrigger` when failure rate exceeds 5%.

## docs/notifications.md Sections

1. Architecture overview
2. How to add a new notification trigger (numbered checklist)
3. How to test a notification locally
4. Scheduled digests (table with UTC + EST + trigger + recipients)
5. Excluded from migration (send-support-notifications.ts + send-geofence-alert.ts)
6. Troubleshooting (7 common error patterns with fixes)

## New Peer Dependencies

None. No new shadcn or Radix components were added (HealthTile reuses Card from existing shadcn install).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Field] sendOwnerReplyNotification lacked tenantId**
- **Found during:** Task 1
- **Issue:** `OwnerReplyNotificationParams` had no `tenantId` field; the wrapper pattern requires it to route through the dispatcher.
- **Fix:** Added optional `tenantId?: string` at the end of the interface (non-breaking). When absent, falls through to legacy automatically.
- **Files modified:** `apps/web/src/lib/email/send-fleet-message-notifications.ts`
- **Commit:** 8921f6b

None of the other deviations were unexpected — all followed the plan exactly as written.

## Self-Check: PASSED

All 18 key files verified to exist on disk. All 4 commits verified in git log. `npx tsc --noEmit` passes. `npm run build` compiles successfully (1 pre-existing MDX warning unrelated to this plan).
