# Notification Dispatcher

Runtime engine for DriveCommand's Tenant-Configurable Notification System (Phase 41, Plan 02).

## Public API

The only function consumers should call is `dispatchNotification` exported from
`apps/web/src/lib/notifications/dispatcher.ts`.

```ts
import { dispatchNotification } from '@/lib/notifications/dispatcher';

await dispatchNotification('load.created', {
  tenantId: ctx.tenantId,
  payload: {
    loadId: load.id,
    loadNumber: load.number,
    originCity: load.pickup.city,
    destCity: load.delivery.city,
  },
  relatedEntity: { type: 'Load', id: load.id },
});
```

### Usage example — server action call site

```ts
// apps/web/src/actions/loads.ts
'use server';

import { dispatchNotification } from '@/lib/notifications/dispatcher';

// After creating the load:
await dispatchNotification('load.created', {
  tenantId,
  payload: { loadId, loadNumber, originCity, destCity },
  relatedEntity: { type: 'Load', id: loadId },
});
```

### Usage example — cron call site

```ts
// apps/web/src/app/api/cron/document-expiring/route.ts

for (const doc of expiringDocs) {
  await dispatchNotification('truck.document_expiring', {
    tenantId: doc.tenantId,
    payload: {
      truckId: doc.truckId,
      unitNumber: doc.unitNumber,
      documentType: doc.type,
      expiresAt: doc.expiresAt.toISOString(),
    },
    relatedEntity: { type: 'Document', id: doc.id },
  });
}
```

## Dispatch Flow (10 steps)

1. **Fetch `NotificationTemplate`** by `triggerKey`. If missing or `isActive === false`, write a
   `SKIPPED_DISABLED` audit row and return `{ sent:0, skipped:1, failed:0 }`.

2. **Fetch `TenantNotificationSettings`** for `(tenantId, triggerKey)`. If `isActive === false`,
   write a `SKIPPED_DISABLED` audit row and return early.

3. **Resolve recipients** via `resolveRecipients`: union of default rule matches (`role`,
   `tenant_owners`, `related`) with explicit `NotificationSubscription` rows, deduplicated by
   `userId`.

4. **Apply per-user preferences** from `UserNotificationPreference`. Default: `emailEnabled=true`,
   `inAppEnabled=true`. Disabled channel → `SKIPPED_USER_PREF` audit row.

5. **Pick template content**: `customBlockJson ?? defaultBlockJson` and
   `customSubject ?? defaultSubject` (tenant override takes precedence).

6. **Render once** via `renderTemplate`: Tiptap blockJson → raw HTML → variable substitution →
   `DynamicTemplateEmail` shell → final HTML string. Subject is substituted in parallel.
   The rendered output is shared by all recipients.

7. **Per recipient — EMAIL**: Build idempotency key, check `NotificationSendLog` for an existing
   `SENT` row with that key; if found → `SKIPPED_IDEMPOTENT`. Otherwise call
   `resend.emails.send({ from, to, subject, react: <DynamicTemplateEmail bodyHtml={html} /> })`.

8. **Per recipient — IN_APP**: Call `writeInAppNotification()` which inserts a row into the
   existing `InAppNotification` table. Independent of email outcome.

9. **Per-recipient error isolation**: each recipient is wrapped in its own try/catch. One failure
   never aborts the loop — remaining recipients still receive.

10. **Audit**: All send/skip/fail events are collected in `AuditLogEntry[]` and written to
    `NotificationSendLog` in a single `bypass_rls` transaction inside `finally` — guaranteeing
    telemetry even if an outer error occurred.

## Return value

```ts
{ sent: number; skipped: number; failed: number }
```

Counts across **all** channels and recipients. A single dispatch to 2 recipients with both EMAIL
and IN_APP channels can return up to `{ sent: 4, skipped: 0, failed: 0 }`.

## How to Add a New Trigger

1. Add the literal to the `TriggerKey` union in `apps/web/src/lib/notifications/types.ts`.

2. Add the matching `NotificationPayload` entry. Keys become `{{token}}` names in templates.

3. Seed a `NotificationTemplate` row via the seed runner
   (`scripts/seed-notification-templates.ts`) with:
   - `defaultBlockJson` — Tiptap doc JSON (use `buildDefaultTemplate` helper)
   - `defaultSubject` — subject line with `{{token}}` placeholders
   - `availableVariables` — `VariableDef[]` for the admin editor variable picker
   - `defaultRecipients` — `DefaultRecipientRule[]`

4. (Optional) Map the new trigger prefix to an `InAppNotificationType` in `in-app-writer.ts`
   if a new family is being introduced — prefer reusing an existing prefix mapping.

5. Call `dispatchNotification('your.new.trigger', { ... })` from the originating server action
   or cron route.

## Known Limitations

### `InAppNotificationType` enum is fixed

It predates this system (Quick-228) and **must not** be extended in this plan. Trigger keys are
mapped by prefix:

| Prefix | Mapped enum value |
|---|---|
| `load.*` | `load_delivered` |
| `dispatch.*` | `dispatch_assigned` |
| `pay.*` / `payroll.*` | `pay_record_ready` |
| `invoice.*` | `invoice_generated` |
| `compliance.*` / `document.*` / `truck.*` / `driver.*` | `compliance_alert` |
| `stop.*` | `stop_completed` |
| `assignment.*` | `needs_assignment` |
| `message.*` / `fleet.*` | `fleet_message` |
| (unmatched, e.g. `route.*`, `user.*`, `digest.*`, `customer.*`) | `compliance_alert` (catch-all) |

### `entityType` and `entityId` are required

`InAppNotification.entityId` is `@db.Uuid` (required). When `relatedEntity` is omitted by the
caller, the writer falls back to:
- `entityType = triggerKey`
- `entityId = '00000000-0000-0000-0000-000000000000'`

This is intentional and documented.

### `orgId` vs `tenantId` naming

The legacy `InAppNotification` table uses `orgId` for what the rest of the notification system
calls `tenantId`. The writer maps the two transparently.

### HTML injection

`dangerouslySetInnerHTML` is used in exactly **one** place:
`apps/web/src/emails/dynamic-template.tsx` — to wrap Tiptap-generated, variable-substituted HTML.
Never call it from anywhere else. The `bodyHtml` prop must always come through `renderTemplate`.

### Idempotency granularity

- **Event triggers**: dedup at second-precision (`2026-05-14T12:00:00Z`)
- **Digest triggers** (`isDigest=true`): dedup per UTC day (`2026-05-14`)

Tighter or looser windows require a code change to `buildIdempotencyKey` in `idempotency.ts`.

### No queue / no retries

Dispatch is synchronous within the request. If Resend latency or volume becomes a problem,
introduce a background job queue in a later plan — the public `dispatchNotification` API will not
change.

### React version mismatch in test environment

`@react-email/render` uses `react-dom/server` which requires exact React version parity.
The root monorepo node_modules has a minor version mismatch (`react@19.2.0` vs `react-dom@19.2.4`).
Tests mock the `template-renderer` module to bypass this — the renderer itself is tested in
production via Next.js which resolves versions correctly.

## File Map

| File | Responsibility |
|---|---|
| `dispatcher.ts` | Public API — `dispatchNotification()` — 10-step orchestrator |
| `recipient-resolver.ts` | `resolveRecipients()` — role/owner/related rules + subscriptions |
| `template-renderer.ts` | Tiptap JSON → HTML → substitution → React Email shell |
| `idempotency.ts` | Key builder + SENT-row probe |
| `audit-log.ts` | Bulk `NotificationSendLog` writer (bypass_rls) |
| `in-app-writer.ts` | `InAppNotification` row writer with trigger→enum mapping |
| `types.ts` | `TriggerKey`, `NotificationPayload`, `DefaultRecipientRule` types |
| `build-template.ts` | Helper for seeding default Tiptap block JSON |
| `__tests__/dispatcher.test.ts` | 6 Vitest unit tests (all mocked, no DB/network) |
| `../../emails/dynamic-template.tsx` | React Email shell — the only HTML injection site |
