---
phase: quick-321
plan: 01
subsystem: notifications
tags: [bug-fix, dispatcher, recipient-resolver, external-email, seed]
dependency_graph:
  requires: [quick-320]
  provides: [driver.invited email delivery, user.invited email delivery]
  affects: [dispatcher, recipient-resolver, notification templates]
tech_stack:
  added: []
  patterns: [external_email rule type, userId-null recipient fanout]
key_files:
  created:
    - apps/web/src/lib/notifications/__tests__/recipient-resolver.test.ts
  modified:
    - apps/web/src/lib/notifications/types.ts
    - apps/web/src/lib/notifications/recipient-resolver.ts
    - apps/web/src/lib/notifications/dispatcher.ts
    - apps/web/src/lib/notifications/idempotency.ts
    - apps/web/prisma/seeds/notification-template-data/driver.ts
    - apps/web/prisma/seeds/notification-template-data/user.ts
decisions:
  - "Added external_email rule type rather than overloading the related rule to keep type semantics clear: related=userId lookup, external_email=raw email lookup"
  - "email-only recipients get inAppEnabled=false hardcoded because InAppNotification.userId is a non-null FK — no schema change needed"
  - "Dispatcher records SKIPPED_DISABLED (not FAILED) for in-app channel on userId-null recipients to distinguish from actual errors"
  - "Per-tenant settings confirmed to NOT need backfill — dispatcher reads defaultRecipients from the global NotificationTemplate row only"
metrics:
  duration: ~20 minutes
  completed: 2026-05-14
  tasks: 4
  files: 7
---

# Phase quick-321 Plan 01: Fix Dispatcher Recipient Resolver UUID Crash Summary

Fix the `invalid input syntax for type uuid` crash on `driver.invited` and `user.invited` notifications by introducing a new `external_email` recipient rule type that accepts a raw email from the payload (no User row required), updating the invitation seed templates, and making the dispatcher safe for userId=null recipients.

## Root Cause (Case A + C)

**Case A — Missing rule type:** `recipient-resolver.ts` had no handler for email-based recipients. The `related` rule treats the payload value as a `userId` (UUID), calls `prisma.user.findFirst({ where: { id: <value> } })`, and Postgres rejects it with `invalid input syntax for type uuid` when the value is an email string like `sammy.issa21+phase41final@gmail.com`.

**Case C — Wrong seed shape:** Both invitation templates used `{ type: 'related', payloadKey: 'driverEmail' }` and `{ type: 'related', payloadKey: 'invitedEmail' }`. Since invitations are sent **before** the User row exists, a userId lookup is fundamentally incorrect for this flow.

The resolver throwing before fan-out caused the outer catch `[notifications] dispatch failed before fan-out` seen in Vercel logs, and the dispatcher fell back to the legacy Gmail SMTP sender.

---

## Changes

### 1. `apps/web/src/lib/notifications/types.ts`

Extended the `DefaultRecipientRule` union from 3 to 4 variants:

```typescript
// Before
| { type: 'related'; payloadKey: string }

// After
| { type: 'related'; payloadKey: string }
| { type: 'external_email'; payloadKey: string }
```

Added JSDoc explaining all 4 variants with explicit guidance on when to use `external_email` vs `related`.

### 2. `apps/web/src/lib/notifications/recipient-resolver.ts`

- Made `ResolvedRecipient.userId` `string | null` (was `string`)
- Added a second dedup map `emailOnlyMap: Map<string, { email }>` for email-only recipients
- Added `external_email` branch in the rule loop:
  - Validates payload value is a non-empty string containing `@`
  - Calls `prisma.user.findFirst({ where: { tenantId, email, isActive: true } })` — if a User row exists, promotes to `userMap` (full prefs honored); otherwise inserts to `emailOnlyMap`
- After user-pref loading, appends email-only recipients with `userId: null, emailEnabled: true, inAppEnabled: false`

### 3. `apps/web/src/lib/notifications/dispatcher.ts`

Made all per-recipient fan-out logic safe for `userId: null`:

- `buildIdempotencyKey` calls now pass `r.email` as `emailFallback` parameter
- `pref-off` idempotency key uses `r.userId ?? \`email:${r.email}\`` as discriminator
- In-app channel split into three branches:
  - `r.userId !== null && r.inAppEnabled` → existing send logic (unchanged)
  - `r.userId === null` → push `SKIPPED_DISABLED` audit row with `errorMessage: 'Recipient has no User row; in-app channel not applicable'`, no `writeInAppNotification` call
  - `r.userId present && inAppEnabled false` → existing `SKIPPED_USER_PREF` logic (unchanged)
- Per-recipient catch logs `r.userId ?? r.email` instead of `r.userId` so external-email failures are identifiable

### 4. `apps/web/src/lib/notifications/idempotency.ts`

Changed `buildIdempotencyKey` signature:

```typescript
// Before
(triggerKey, relatedEntity, userId: string, isDigest): string

// After
(triggerKey, relatedEntity, userId: string | null, isDigest, emailFallback?: string): string
```

Uses `userId ?? \`email:${emailFallback ?? 'unknown'}\`` as the recipient discriminator in the key.

### 5. `apps/web/prisma/seeds/notification-template-data/driver.ts` (line 26)

```typescript
// Before
defaultRecipients: [{ type: 'related', payloadKey: 'driverEmail' }],
// After
defaultRecipients: [{ type: 'external_email', payloadKey: 'driverEmail' }],
```

### 6. `apps/web/prisma/seeds/notification-template-data/user.ts` (line 49)

```typescript
// Before
defaultRecipients: [{ type: 'related', payloadKey: 'invitedEmail' }],
// After
defaultRecipients: [{ type: 'external_email', payloadKey: 'invitedEmail' }],
```

---

## Production Database Update

The seed script (`npm run seed:notifications`) targets `DIRECT_URL` from `.env.local`, which is the production Supabase connection. It ran successfully:

```
Inserted: 0
Updated:  35
Total:    35
```

Both invitation template rows were updated. Before/after JSON:

| triggerKey | Before | After |
|---|---|---|
| `driver.invited` | `[{"type":"related","payloadKey":"driverEmail"}]` | `[{"type":"external_email","payloadKey":"driverEmail"}]` |
| `user.invited` | `[{"type":"related","payloadKey":"invitedEmail"}]` | `[{"type":"external_email","payloadKey":"invitedEmail"}]` |

**Per-tenant settings:** No backfill required. The dispatcher reads `defaultRecipients` from the global `NotificationTemplate` row (line 111 in dispatcher.ts). `TenantNotificationSettings` only carries `customBlockJson` and `customSubject`. Updating the global template row immediately fixes all tenants.

---

## Tests

### New tests — `recipient-resolver.test.ts` (6 tests, all pass)

1. `external_email with no existing User row returns email-only recipient (userId=null)`
2. `external_email matching an existing User row promotes to User-backed recipient with prefs`
3. `external_email with missing payload key returns empty array without calling user.findFirst`
4. `external_email normalizes email to lowercase`
5. `two external_email rules with the same email are deduplicated`
6. `role rule type still resolves User-backed recipients normally` (regression guard)

### Existing tests — `dispatcher.test.ts` (6 tests, all still pass)

- globally inactive trigger
- tenant-disabled trigger
- email-off + in-app-on per-user pref
- idempotent re-send
- variable substitution through full pipeline
- one recipient throws — others still receive

**Total: 12 notification tests pass, 0 fail.**

Pre-existing failures in `tests/unit/auth/` and `src/app/api/driver-pay/__tests__/settlements-paid.test.ts` are unrelated to this change (mock infrastructure issue predating quick-321).

---

## Post-Deploy Verification SQL

After `vercel --prod` succeeds, run this SQL via Supabase MCP to confirm the fix is working in production:

```sql
SELECT id, "triggerKey", "recipientEmail", "recipientUserId", channel, status, "errorMessage", "createdAt"
FROM "NotificationSendLog"
WHERE "createdAt" > NOW() - INTERVAL '5 minutes'
ORDER BY "createdAt" DESC;
```

**Expected result after sending a new driver invitation:**
- Row 1: `triggerKey='driver.invited'`, `channel='EMAIL'`, `status='SENT'`, `recipientEmail='<address>'`, `recipientUserId=NULL`
- Row 2: `triggerKey='driver.invited'`, `channel='IN_APP'`, `status='SKIPPED_DISABLED'`, `errorMessage='Recipient has no User row; in-app channel not applicable'`

**Verification steps:**
1. Go to `/carrier/fleet/drivers` on production
2. Send a driver invitation to a fresh email (e.g., `sammy.issa21+quick321verify@gmail.com`)
3. Run the SQL above within 2 minutes
4. Confirm EMAIL row is SENT with recipientUserId=NULL
5. Confirm the invitation email arrives in the inbox

---

## Follow-Up Tickets

- **TODO(quick-321):** Consider pushing an audit row in the per-recipient catch block (currently only logs + increments `failed++`). Low priority — errors there are already isolated per recipient. Left as a comment in dispatcher.ts line ~280.

---

## Commits

| Hash | Message |
|------|---------|
| `3502538` | feat(quick-321): add external_email rule type to resolver + dispatcher |
| `507c318` | feat(quick-321): update driver.invited + user.invited seeds to use external_email rule |
| `2731a9d` | test(quick-321): add unit tests for external_email rule type in recipient resolver |

## Self-Check: PASSED
