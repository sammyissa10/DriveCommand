---
phase: quick-320
plan: "01"
subsystem: notifications
tags: [hotfix, dispatcher, tenantId, email-wrappers, phase-41]
dependency_graph:
  requires: [quick-319]
  provides: [dispatcher-always-runs, notificationsendlog-rows-written]
  affects: [send-driver-invitation, send-owner-invitation, send-maintenance-reminder, send-document-expiry-reminder, send-driver-document-expiry-reminder, send-fleet-message-notifications, customer-notifications]
tech_stack:
  added: []
  patterns: [fail-loud-type-signatures, required-tenantId-on-all-dispatcher-wrappers]
key_files:
  modified:
    - apps/web/src/lib/email/send-driver-invitation.ts
    - apps/web/src/lib/email/send-owner-invitation.ts
    - apps/web/src/lib/email/send-maintenance-reminder.ts
    - apps/web/src/lib/email/send-document-expiry-reminder.ts
    - apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
    - apps/web/src/lib/email/send-fleet-message-notifications.ts
    - apps/web/src/lib/email/customer-notifications.ts
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/(owner)/actions/team-permissions.ts
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/app/api/mobile/owner/drivers/invite/route.ts
    - apps/web/src/app/(admin)/actions/tenants.ts
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/lib/geofencing/geofence-check.ts
    - apps/web/src/app/(owner)/actions/fleet-messages.ts
decisions:
  - "orgId === tenantId in carrier scope — passed as tenantId: orgId with explanatory comment at both call sites"
  - "customer-notifications.ts unknown-status legacy fallback preserved inside try block (not a guard, a legitimate fallback for non-dispatchable statuses)"
metrics:
  duration: "12 minutes"
  completed: "2026-05-14T22:16:05Z"
  tasks_completed: 2
  files_modified: 15
---

# Phase 41 Hotfix 320: Remove Optional tenantId from Dispatcher Wrappers

**One-liner:** Promoted tenantId from optional to required on all 7 Phase 41 Plan 05 dispatcher wrappers and removed if(!tenantId) early-return guards so the dispatcher pipeline runs unconditionally on every send, restoring NotificationSendLog writes.

## Problem

Phase 41 Plan 05 (quick-319) wrapped 7 email senders to route through `dispatchNotification`. However, all wrappers declared `tenantId?: string` (optional) and had an early-return guard:

```ts
if (!data.tenantId) {
  return await legacySendX(toEmail, data);
}
```

Since no call site was passing `tenantId` yet, EVERY production send short-circuited to the legacy path, producing zero `NotificationSendLog` rows and making per-tenant template customizations ineffective.

## Solution

**Task 1: 7 wrapper files** — Promoted `tenantId?: string` to `tenantId: string` and deleted the early-return guards. Legacy fallback bodies and try/catch shapes preserved.

| Wrapper file | Old signature | New signature | Guard removed |
|---|---|---|---|
| send-driver-invitation.ts | `tenantId?: string` | `tenantId: string` | Yes |
| send-owner-invitation.ts | `tenantId?: string` | `tenantId: string` | Yes |
| send-maintenance-reminder.ts | `tenantId?: string` | `tenantId: string` | Yes |
| send-document-expiry-reminder.ts | `tenantId?: string` | `tenantId: string` | Yes |
| send-driver-document-expiry-reminder.ts | `tenantId?: string` | `tenantId: string` | Yes |
| send-fleet-message-notifications.ts (OwnerReplyNotificationParams) | `tenantId?: string` | `tenantId: string` | Yes |
| customer-notifications.ts (LoadStatusEmailData) | `tenantId?: string` | `tenantId: string` | Yes |

Note: `DriverMessageNotificationParams` already had `tenantId: string` (required) — no change needed.

**Task 2: 9 call sites** — Added `tenantId` to every call using the in-scope variable:

| File | Function | tenantId source |
|---|---|---|
| `(owner)/actions/drivers.ts:145` | `inviteDriver` | `tenantId` local var (from session) |
| `(owner)/actions/team-permissions.ts:178` | `inviteTeamMember` | `tenantId` local var (from session) |
| `lib/carrier/fleet-drivers.ts:214` | `createCarrierDriver` | `tenantId: orgId` (+ equivalence comment) |
| `lib/carrier/fleet-drivers.ts:372` | `resendCarrierDriverInvitation` | `tenantId: orgId` (+ equivalence comment) |
| `api/mobile/owner/drivers/invite/route.ts:121` | POST handler | `tenantId` from mobile token context |
| `(admin)/actions/tenants.ts:142` | `createTenant` | `tenantId: tenant.id` (newly created row) |
| `(admin)/actions/tenants.ts:374` | `resendOwnerInvitation` | `tenantId` function parameter |
| `(owner)/actions/loads.ts:68` | `sendNotificationAndLogInteraction` | `tenantId` function parameter |
| `lib/geofencing/geofence-check.ts:265` | `notifyCustomer` | `tenantId: load.tenantId` (load typed as `any`) |
| `(owner)/actions/fleet-messages.ts:208` | `sendOwnerReply` | `tenantId: user.tenantId` (session) |

## TypeScript and Build Results

```
npx tsc --noEmit → 0 errors
npm run build    → green (all pages compiled successfully)
```

After Task 1 (wrappers required), tsc reported exactly 9+1 errors — one per call site missing tenantId (fleet-drivers.ts has 2 call sites). After Task 2 (call sites updated), tsc reported 0 errors.

## Post-Deploy Verification

Dev server started. To confirm the dispatcher pipeline is now active, trigger a driver invitation via `/carrier/fleet/drivers` then run via Supabase MCP:

```sql
SELECT "triggerKey", status, channel, "recipientEmail", "errorMessage", "createdAt"
FROM "NotificationSendLog"
WHERE "createdAt" > NOW() - INTERVAL '1 minute'
ORDER BY "createdAt" DESC;
```

Expected: 2 rows — EMAIL SENT + IN_APP SENT for `driver.invited` trigger.

## Deviations from Plan

None — plan executed exactly as written.

## Files NOT Touched (as required)

- `send-sysadmin-invoice.ts` (looks up tenantId from DB, no guard)
- `send-geofence-alert.ts` (Plan 05 intentionally skipped)
- `send-support-notifications.ts` (Plan 05 did not wrap)
- The dispatcher library in `lib/notifications/`
- `sendDriverMessageNotification` call sites (already correct)
- `prisma/schema.prisma`

## Commits

| Hash | Message |
|---|---|
| `861c3af` | fix(320-01): make tenantId required on all 7 dispatcher wrappers, remove early-return guards |
| `d664817` | fix(320-02): update all 9 call sites to pass tenantId to wrapped email senders |

## Self-Check: PASSED
