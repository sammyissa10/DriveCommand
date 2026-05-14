# Notifications System — Developer Reference

## Architecture overview

DriveCommand's notification system is a tenant-configurable, multi-channel (email + in-app) pipeline built in Phase 41. The full design specification is at `docs/specs/Notifications System Technical Documentation.md`. The public entry point is `dispatchNotification()` in `apps/web/src/lib/notifications/dispatcher.ts`. The dispatcher executes a 10-step flow: template lookup, tenant settings check, recipient resolution, per-tenant content override, HTML rendering, idempotency check, Resend email send, in-app notification write, audit persistence, and error isolation. All existing `send*` sender files in `apps/web/src/lib/email/` have been wrapped (Phase 41 Plan 05) to route through the dispatcher internally while keeping their public signatures identical — callers do not need to change. Each wrapper preserves the original body as a `legacy*` fallback that runs if the dispatcher throws. `send-support-notifications.ts` and `send-geofence-alert.ts` are intentionally excluded from this migration (see below).

## How to add a new notification trigger

1. Add the new trigger key to the `TriggerKey` union and add a matching entry to the `NotificationPayload` mapped type in `apps/web/src/lib/notifications/types.ts`.
2. Add a new entry to the appropriate category seed file in `apps/web/prisma/seeds/notification-template-data/` using the `buildDefaultTemplate` helper. Set `isActive: true`, `inAppEnabled: true`, fill `availableVariables` with every payload field, and define `defaultRecipients`.
3. Run `npm run seed:notifications` (from `apps/web`) to insert or upsert the template row.
4. Add `dispatchNotification('your.trigger.key', { tenantId, payload, relatedEntity })` to the originating server action or cron job. Use `.catch(err => console.error(...))` — never let a notification failure block the primary flow.
5. The trigger automatically appears in `/admin/notifications` (SysAdmin template editor) and `/settings/notifications` (tenant configuration panel) without any UI changes.
6. For tenants that existed before the new trigger was added, the `TenantNotificationSettings` row for that trigger is created automatically by the Postgres trigger on the `NotificationTemplate` table insert. If the Postgres trigger was not running during the seed, run a one-time SQL migration: `INSERT INTO "TenantNotificationSettings" (id, "tenantId", "triggerKey", "isActive", ...) SELECT gen_random_uuid(), t.id, 'your.trigger.key', true, ... FROM "Tenant" t ON CONFLICT DO NOTHING`.

## How to test a notification locally

1. Seed templates: `cd apps/web && npm run seed:notifications`. Verify the row exists: `SELECT "triggerKey", "isActive" FROM "NotificationTemplate" WHERE "triggerKey" = 'your.trigger.key';`
2. Create (or use) a test tenant with at least one active OWNER or DRIVER user.
3. To trigger via a server action: call `dispatchNotification('your.trigger.key', { tenantId: '<test-tenant-id>', payload: { ... }, relatedEntity: { type: 'Test', id: 'test-1' } })` from a server action or API route in your local dev server.
4. To trigger a cron route: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest-daily-driver` (replace route as needed). The response is `{ success, processedTenants, sent, skipped, failed }`.
5. Inspect results: `SELECT "triggerKey", "status", "recipientEmail", "errorMessage" FROM "NotificationSendLog" ORDER BY "createdAt" DESC LIMIT 20;`
6. Check Resend dashboard (https://resend.com/emails) for outbound email delivery status if `status = 'SENT'` but email was not received.

## Scheduled digests

| Route | UTC schedule | EST equivalent | Trigger | Recipients |
|---|---|---|---|---|
| `/api/cron/digest-daily-driver` | `0 22 * * *` | 5 PM EST daily | `digest.daily_driver` | tenant DRIVERs |
| `/api/cron/digest-weekly-owner` | `0 22 * * 5` | Friday 5 PM EST | `digest.weekly_owner` | tenant OWNERs |
| `/api/cron/digest-compliance-30day` | `0 14 * * 1` | Monday 9 AM EST | `digest.compliance_30day` | tenant OWNERs |

All three routes are registered in `apps/web/vercel.json`. Each route enforces `Authorization: Bearer $CRON_SECRET` via `verifyCronSecret()`, fetches all active tenants using a `bypass_rls` transaction, finds role-appropriate recipients, and calls a payload builder that returns `null` when the recipient has nothing to report (skipping dispatch for that recipient).

## Excluded from migration

`apps/web/src/lib/email/send-support-notifications.ts` is intentionally NOT migrated through `dispatchNotification`. Support notifications target the DriveCommand support inbox — they are SysAdmin-internal operations, not tenant-configurable communications. There is no `NotificationTemplate` trigger for support alerts, and tenants should not be able to enable or disable them. These notifications will continue to use the Gmail SMTP path directly.

`apps/web/src/lib/email/send-geofence-alert.ts` is also not migrated. No `truck.geofence` trigger key exists in the notification system yet. Dispatcher migration is deferred until that trigger is added in a future phase.

## Troubleshooting

**"Template not found" in dispatcher logs**
The `NotificationTemplate` row for this trigger key is missing. Run `npm run seed:notifications` from `apps/web` and verify the row exists in the database: `SELECT id FROM "NotificationTemplate" WHERE "triggerKey" = 'your.trigger.key';`

**"Tenant disabled this trigger"**
The `TenantNotificationSettings` row for this tenant and trigger has `isActive = false`. The tenant owner can re-enable it at `/settings/notifications`. SysAdmin can also toggle it at `/admin/notifications` (Templates tab).

**"401 Unauthorized" on cron route**
The `CRON_SECRET` environment variable is not set, or the `Authorization: Bearer <value>` header does not match. Verify `CRON_SECRET` is set in `.env.local` (for local testing) and in the Vercel project environment variables (for production). The Vercel Cron scheduler automatically sends the correct Bearer token.

**Email sent (status = SENT) but recipient did not receive it**
Check the Resend dashboard for bounce or spam filter events. Also verify the recipient email address is correct in `NotificationSendLog.recipientEmail`. Check for suppression list entries in Resend settings.

**Status = SKIPPED_USER_PREF**
The recipient has disabled this notification type in their per-user preferences at `/settings/my-notifications`. This is expected behavior. The `UserNotificationPreference` table controls per-user opt-out.

**Status = SKIPPED_IDEMPOTENT**
The same notification was already sent within the idempotency window. The dispatcher checks `NotificationSendLog` for an existing `SENT` row with the same idempotency key before sending. This prevents duplicate emails on retry.

**Wrapper is falling back to legacy on every call**
Check whether `tenantId` is being passed to the `send*` function. The wrappers fall through to the legacy path when `tenantId` is absent (by design — sysadmin-internal or unauthenticated contexts). If `tenantId` is present but dispatch still fails, inspect the dispatcher logs (`[notifications] dispatcher failed`) for the underlying error — common causes are a missing template or a Resend API key misconfiguration.
