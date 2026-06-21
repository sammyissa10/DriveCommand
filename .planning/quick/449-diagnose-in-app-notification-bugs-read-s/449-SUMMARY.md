# Quick-449 Diagnostic Report: In-App Notification Bugs

**Date:** 2026-06-15  
**Status:** COMPLETE — READ ONLY, no code changed  
**Spec:** `docs/specs/Notifications System Technical Documentation.md`

---

## Q1 — InAppNotification row shape

Schema: [schema.prisma:2525–2543](../../../../apps/web/prisma/schema.prisma#L2525)

```
InAppNotification
  id         String   (uuid, PK)
  orgId      String
  userId     String?  (null = visible to all org owners)
  type       InAppNotificationType (enum)
  title      String
  message    String
  entityType String
  entityId   String
  read       Boolean  @default(false)
  createdAt  DateTime @default(now())
```

**Only one timestamp field: `createdAt`.** There is no `readAt`, `updatedAt`, `dueDate`, `scheduledAt`, or `eventAt`. The spec (Database Architecture section) defines the same single-timestamp shape. The `read` boolean flips to `true` on mark-read and is never reset by any code path.

---

## Q2 — Which field is used for "X ago"?

**Bell `NotificationCenter`** ([notification-center.tsx:193](../../../../apps/web/src/components/navigation/notification-center.tsx#L193)):

```tsx
{relativeTime(notification.createdAt)}
```

Uses `createdAt` — the DB insert timestamp. ✓ Correct field.

**Alerts panel `NotificationsPanel`** ([notifications-panel.tsx:119](../../../../apps/web/src/components/dashboard/notifications-panel.tsx#L119)):

```tsx
{relativeTime(alert.timestamp as Date | string)}
```

Uses `alert.timestamp` — which is populated **not from any `InAppNotification` row** but from `_fetchNotificationAlerts()` in [dashboard.ts:225–277](../../../../apps/web/src/app/(owner)/actions/dashboard.ts#L225). For driver document alerts, `timestamp: expiryDate.toISOString()`. For truck document alerts, same. This is the **entity's expiry date**, not the notification creation time. ✗ **Bug B1 confirmed in `NotificationsPanel`.**

Note: `NotificationsPanel` does not exist on `/carrier/dashboard`. The bell `NotificationCenter` is the notification UI on that page.

---

## Q3 — Is `createdAt` set to `NOW()` at insert, or is an entity date injected?

Both insertion paths omit `createdAt` explicitly:

**Legacy `createNotification()`** ([in-app-notifications.ts:65–75](../../../../apps/web/src/lib/carrier/in-app-notifications.ts#L65)):
```ts
tenantPrisma.inAppNotification.create({
  data: { orgId, userId, type, title, message, entityType, entityId }
  // no createdAt → Prisma applies @default(now())
});
```

**Phase 41 `writeInAppNotification()`** ([in-app-writer.ts:73–82](../../../../apps/web/src/lib/notifications/in-app-writer.ts#L73)):
```ts
prisma.inAppNotification.create({
  data: { orgId: args.tenantId, userId, type, title, message, entityType, entityId, read: false }
  // no createdAt → Prisma applies @default(now())
});
```

**`createdAt` is always `NOW()` at DB insert time.** No entity date is injected into `InAppNotification.createdAt`. The `createdAt` field is correct by itself.

---

## Q4 — Bug B root cause: B1 (display reads wrong field) or B2 (insert-time value is stale)?

**Two different bugs in two different components:**

### B1 (confirmed) — `NotificationsPanel` reads wrong field

`_fetchNotificationAlerts()` ([dashboard.ts:225–277](../../../../apps/web/src/app/(owner)/actions/dashboard.ts#L225)) computes compliance alerts from live DB queries against expiry dates, not from `InAppNotification` rows at all. It sets `timestamp: expiryDate.toISOString()` for every document expiry alert. `relativeTime(expiryDate)` then shows how old the **expiry date** is, not when the alert was surfaced.

A document that expired 23 days ago displays "23d ago" even if the alert was just triggered. The out-of-order sequence (21h, 3d, 4d, 5d, 6d, 7d, 18d, 11d, 12d) in `NotificationsPanel` results from severity grouping (critical = expired items, sorted by how long ago they expired; warning = expiring-soon items, sorted separately), not from insertion order.

**Not a spec deviation** — `NotificationsPanel` is a synthetic alert panel computed on demand, independent of the `InAppNotification` table. But the timestamp field choice is misleading to users.

### B2 (stale row accumulation) — bell `NotificationCenter`

The "23d ago" compliance notification in the bell accurately reflects `createdAt = 23d ago` (the day the cron first inserted that row). The display is technically correct. The **underlying problem** is that compliance `InAppNotification` rows accumulate across days (see Bug A root cause below), so a 23-day-old unread compliance row coexists with recent dispatch notifications.

**The "18d appears between 7d and 11d" anomaly cannot be fully explained from static code analysis.** The GET handler sorts by `orderBy: { createdAt: 'desc' }` and the label uses `relativeTime(notification.createdAt)` — both reference the same field. A "18d ago" label appearing before "11d ago" items in a `createdAt desc` result set is mathematically inconsistent unless the underlying `createdAt` data is anomalous. **Requires DB inspection of actual `createdAt` values** to confirm (e.g., `SELECT id, created_at FROM in_app_notifications WHERE org_id = '...' ORDER BY created_at DESC LIMIT 20`).

---

## Q5 — Mark-read persistence

PATCH `/api/v1/carrier/notifications/mark-read` ([mark-read/route.ts:44–52](../../../../apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts#L44)):

```ts
result = await tenantPrisma.inAppNotification.updateMany({
  where: { id: { in: ids }, orgId },
  data: { read: true },
});
```

**Persists to DB.** The `orgId` filter ensures tenant isolation. `data: { read: true }` is correct. **A1 is NOT the cause.** The manual test confirming persistence after hard reload is valid — the mark-read endpoint works correctly.

---

## Q6 — Does bell polling overwrite read state?

`NotificationBell` ([notification-bell.tsx:26–50](../../../../apps/web/src/components/navigation/notification-bell.tsx)):
- Polls every 60s via `fetchUnreadCount()` which fetches `/api/v1/carrier/notifications?unread=true&limit=1`
- Updates only `unreadCount` state (a number)
- Does **not** call any setter that touches `NotificationCenter`'s notification list state

`NotificationCenter` ([notification-center.tsx:109](../../../../apps/web/src/components/navigation/notification-center.tsx#L109)):
- `useEffect(fetchNotifications, [])` — fetches once on mount only
- Has its own separate `notifications` state array
- No subscription to `NotificationBell`'s state

The two components are siblings in the nav, with completely separate state. **A2 is NOT the cause.** The bell's 60s poll never overwrites the notification center's list.

---

## Q7 — Is there an idempotency guard on `InAppNotification` INSERT?

### Email channel (Phase 41 dispatcher) — has guard

[dispatcher.ts:170–177](../../../../apps/web/src/lib/notifications/dispatcher.ts#L170):
```ts
const idemKey = buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false, r.email);
const alreadySent = await checkIdempotency(db, idemKey);  // ← CHECKED
if (alreadySent) { ... skip ... }
```

Email channel calls `checkIdempotency` and skips if a `NotificationSendLog` row already exists for the key.

### In-app channel (Phase 41 dispatcher) — **MISSING GUARD**

[dispatcher.ts:253–256](../../../../apps/web/src/lib/notifications/dispatcher.ts#L253):
```ts
const idemKeyApp =
  buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false) + ':inapp';
// ↑ key is BUILT but never passed to checkIdempotency
await writeInAppNotification(db, { ... });  // ← UNCONDITIONAL INSERT
```

`idemKeyApp` is computed but only used in the audit log entry (line 271). **There is no `checkIdempotency(db, idemKeyApp)` call before the `writeInAppNotification()` call.** Every dispatcher invocation inserts a new row unconditionally.

Spec reference: Dispatch Architecture, step 7 — "Compute the idempotency key. If a SENT row already exists for that key, skip." The email channel implements this; the in-app channel was never wired up to check it.

### Legacy path (`sendComplianceAlertNotifications`) — partial guard

Checks `NotificationLog.idempotencyKey` (daily key: `${type}:${entityId}:${YYYY-MM-DD}`) before calling `createNotification()`. The key resets daily → after the first day, a new daily key is generated → new `InAppNotification` rows are created each day for persistent compliance issues.

**Critical: the two idempotency systems (`NotificationLog` vs `NotificationSendLog`) use different tables and different key formats. There is no cross-table coordination.** If both the legacy and Phase 41 paths trigger for the same event, each creates its own `InAppNotification` row independently.

---

## Q8 — Bug A Root Cause: A1, A2, or A3?

**Root cause: A3 — Duplicate row insertion via missing in-app idempotency guard.**

- **A1 ruled out**: `mark-read` PATCH correctly persists `read: true` to DB (Q5).
- **A2 ruled out**: Bell polling updates only unread count, never overwrites notification list state (Q6).
- **A3 confirmed**: The Phase 41 dispatcher inserts a new `InAppNotification` row on every invocation because the in-app channel has no `checkIdempotency` call before `writeInAppNotification()` (Q7, [dispatcher.ts:253–256](../../../../apps/web/src/lib/notifications/dispatcher.ts#L253)).

**How this manifests as "read reverts":**

1. Dispatcher runs for compliance/dispatch trigger → creates row R1 (unread)
2. User opens bell → sees R1 → clicks → `PATCH mark-read { ids: [R1.id] }` → R1 becomes `read = true` in DB
3. Dispatcher runs again (next cron cycle, or retry, or another request) → creates row R2 (unread, same trigger+recipient)
4. Bell polls → unread count = 1 (R2 is unread)
5. User opens bell → `NotificationCenter` remounts → `fetchNotifications()` → receives R2 (unread) + R1 (read) → user sees R2 as "unread" → appears as if read state reverted

**Why the manual test (click → navigate → hard reload) passed:**
In that test scenario, only ONE dispatcher run had occurred for that notification, so only ONE row existed. Hard reload → GET `/api/v1/carrier/notifications` → returns that one row with `read: true` → displayed correctly. The duplicate accumulation is cron/retry-frequency-dependent, so it doesn't happen in a clean single-trigger test.

---

## Smallest Correct Fix — Bug A

**One-line diagnosis:** Add `checkIdempotency(db, idemKeyApp)` before `writeInAppNotification()` in [dispatcher.ts:255](../../../../apps/web/src/lib/notifications/dispatcher.ts#L255), mirroring the email channel pattern at lines 177–192.

**Exact change (no schema changes required):**

```ts
// BEFORE (line 255–263):
if (r.userId !== null && r.inAppEnabled) {
  const idemKeyApp =
    buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false) + ':inapp';
  try {
    await writeInAppNotification(db, { ... });
    audits.push({ ..., status: 'SENT', idempotencyKey: idemKeyApp, ... });
    sent++;
  } catch (inAppErr) { ... }
}

// AFTER:
if (r.userId !== null && r.inAppEnabled) {
  const idemKeyApp =
    buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false) + ':inapp';
  const alreadySentInApp = await checkIdempotency(db, idemKeyApp);   // ← ADD THIS
  if (alreadySentInApp) {                                              // ← ADD THIS
    audits.push({ ..., status: 'SKIPPED_IDEMPOTENT', ... });          // ← ADD THIS
    skipped++;                                                         // ← ADD THIS
  } else {                                                             // ← ADD THIS
    try {
      await writeInAppNotification(db, { ... });
      audits.push({ ..., status: 'SENT', idempotencyKey: idemKeyApp, ... });
      sent++;
    } catch (inAppErr) { ... }
  }                                                                    // ← ADD THIS
}
```

**Spec alignment:** Fully conforms to Dispatch Architecture step 7. No deviation. The `checkIdempotency` function already exists at [idempotency.ts](../../../../apps/web/src/lib/notifications/idempotency.ts) and already checks `NotificationSendLog`. The `idemKeyApp` key includes `':inapp'` suffix so it won't collide with the email channel's key for the same event.

**Caveat:** The legacy path (`createNotification()` called from `lib/carrier/notifications.ts`) is separately guarded by `NotificationLog` (different table). If both Phase 41 and legacy paths are active for the same event, the legacy path can still create a duplicate row. The full fix requires either decommissioning the legacy in-app write path or adding a shared row-level dedup (e.g., a unique index on `[orgId, userId, type, entityId]` with ON CONFLICT IGNORE). The dispatcher fix alone closes the Phase 41 duplication gap.

---

## Smallest Correct Fix — Bug B

### B1: `NotificationsPanel` expiryDate timestamp

**In [dashboard.ts](../../../../apps/web/src/app/(owner)/actions/dashboard.ts) at lines 235 and 277**, change:
```ts
timestamp: expiryDate.toISOString(),   // wrong — shows age of expiry date
```
to:
```ts
timestamp: now.toISOString(),          // correct — shows how recently this alert was surfaced
```
where `now` is already declared in that function.

**Spec alignment:** No spec deviation. `NotificationsPanel` is synthetic and not covered by the Phase 41 dispatch spec — this is a standalone fix to a data-assembly function.

**Alternative (cleaner):** Remove the "X ago" timestamp from `NotificationsPanel` items entirely and rely on the description text ("Expired 23 days ago" / "Expires in 5 days"), since those descriptions already carry temporal meaning and are computed correctly.

### B2: Compliance row accumulation in bell

**Fixing Bug A (adding the in-app idempotency guard to the dispatcher) eliminates the daily accumulation for Phase 41-dispatched compliance triggers.** Once the guard is in place, the same compliance event on day 2 produces a `SKIPPED_IDEMPOTENT` audit entry and no new row. The oldest compliance row is the only one the user sees in the bell, and it accurately reflects when compliance was first flagged.

For the "18d between 7d and 11d" ordering anomaly: run the SQL diagnostic below to determine whether it's a data issue or an unreported UI rendering bug:

```sql
SELECT id, type, title, created_at, read
FROM in_app_notifications
WHERE org_id = '<org_id>'
ORDER BY created_at DESC
LIMIT 20;
```

If `created_at` is in strict descending order, the ordering is correct and the labels should be consistent. If `created_at` shows the 18d row between 11d and 7d rows, that is the data anomaly and points to a clock skew or off-by-one in `buildIdempotencyKey`'s second-precision truncation.

---

## Spec Conformance Flags

| Fix | Spec section | Deviation? |
|-----|-------------|------------|
| Add `checkIdempotency` before in-app insert | Dispatch Architecture step 7 | **None** — fix implements what spec mandates |
| Fix `NotificationsPanel` `timestamp` field | Not covered by Phase 41 spec | N/A — standalone UI fix |
| Legacy path still has dual-write risk | Not addressed by spec's `NotificationSendLog` idempotency | **Flag** — legacy `NotificationLog` and Phase 41 `NotificationSendLog` are independent; no cross-table guard exists |
