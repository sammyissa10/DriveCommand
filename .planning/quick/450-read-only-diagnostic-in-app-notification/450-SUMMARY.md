# Quick Task 450 — Diagnostic Summary

**Task:** Read-only diagnostic — in-app notification bugs (read-state reverts + age display)
**Date:** 2026-06-15
**Status:** COMPLETE — no code changes made

---

## Q1 — Which write path do compliance + dispatch notifications actually use today?

### Notification type inventory

There are **two distinct in-app write functions** and **two distinct notification source types** in the user's report.

---

#### A. "Dispatch Generated" (type: `dispatch_generated`)

**Source:** `/api/cron/carrier-auto-dispatch/route.ts` — runs at 00:00 UTC nightly  
**Write path:** **LEGACY** — `createNotification()` from `apps/web/src/lib/carrier/in-app-notifications.ts`  
**Table written:** `InAppNotification` via `getTenantPrisma().inAppNotification.create()`  
**No idempotency guard on in-app write.** The cron has no dedup mechanism for the notification itself — if it fires more than once or if a template generates multiple dispatches, it writes one row per dispatch per run.

```
carrier-auto-dispatch cron
  → generateDispatches()
  → result.notifications[]
  → after(() => createNotification({ type: 'dispatch_generated', ... }))   ← LEGACY
```

---

#### B. "Dispatch Assigned" / load.assigned (type: `dispatch_assigned`)

**Source:** `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` — `createAssignment()` server action  
**Write path:** **PHASE 41 DISPATCHER** — `dispatchNotification('load.assigned', ...)` → `writeInAppNotification()`  
**Table written:** `InAppNotification` via base `prisma.$transaction`  
**Has idempotency via `NotificationSendLog`.**

```
createAssignment() server action
  → dispatchNotification('load.assigned', { tenantId, payload })
    → writeInAppNotification() in apps/web/src/lib/notifications/in-app-writer.ts  ← PHASE 41
```

---

#### C. Compliance — truck maintenance + document expiry (type: `compliance_alert` via dispatcher)

**Source:** `/api/cron/send-reminders/route.ts` — migrated to Phase 41 in Plan 05  
**Write path:** **PHASE 41 DISPATCHER** — `dispatchNotification('truck.maintenance_due', ...)` / `dispatchNotification('truck.document_expiring', ...)`  
**Has idempotency.**

```
send-reminders cron
  → dispatchNotification('truck.maintenance_due', ...)
  → dispatchNotification('truck.document_expiring', ...)
  → writeInAppNotification()  ← PHASE 41
```

---

#### D. Compliance — carrier batch alerts (type: `compliance_alert` via legacy)

**Source:** `/api/cron/carrier-compliance-alerts/route.ts`  
**Write path:** **LEGACY** — `sendComplianceAlertNotifications()` → `createNotification({ type: 'compliance_alert', ... })`  
**No in-app idempotency guard.** Email has idempotency via `NotificationLog` (`wasNotificationAlreadySent`) but `createNotification()` is called unconditionally after the email sends — one `InAppNotification` row per alert per day per cron run.

```
carrier-compliance-alerts cron
  → getComplianceAlerts(tenant.id)
  → sendComplianceAlertNotifications(tenant.id, alerts)
    → recordNotification() + sendEmail() + markNotificationSent()   ← email idempotency
    → for each alert: createNotification({ type: 'compliance_alert', ... })  ← LEGACY, no dedup
```

---

### Does fixing ONLY the dispatcher idempotency close Bug A for the user's case?

**NO — not fully.**

| Notification type | Write path | Affected by dispatcher fix? |
|---|---|---|
| `dispatch_generated` (auto-dispatch cron) | Legacy `createNotification()` | ❌ No |
| `dispatch_assigned` (createAssignment action) | Phase 41 dispatcher | ✅ Yes |
| `compliance_alert` via send-reminders | Phase 41 dispatcher | ✅ Yes |
| `compliance_alert` via carrier-compliance-alerts | Legacy `createNotification()` | ❌ No |

The "Dispatch Generated" type — the dominant type in the Demo org's notification center (all 20 rows in the primary query) — flows through the **legacy `createNotification()` path** and is **not touched** by any fix to the dispatcher.

The `carrier-compliance-alerts` cron's in-app writes are also on the legacy path.

**Correct fix scope:**
- Dispatcher idempotency fix closes Bug A only for `dispatch_assigned` (load.assigned) and Phase-41-migrated compliance types
- Bug A for `dispatch_generated` requires addressing the legacy path: either add a dedup guard inside `createNotification()` or add a `UNIQUE` constraint on `(org_id, entity_type, entity_id, type)` with `ON CONFLICT DO NOTHING` (smallest correct fix — one SQL migration, no app code change for the cron)
- Bug A for `carrier-compliance-alerts` compliance rows requires the same treatment

**Smallest correct fix for legacy path:** Add a unique constraint on `in_app_notifications(org_id, entity_id, type)` with `ON CONFLICT DO NOTHING` in the create call, OR wrap `createNotification()` with a `upsert` using the same key. A unique index is safer (enforced at DB level, catches all callers). A daily-scoped idempotency key pattern (like `dispatch_generated:{dispatchId}:{YYYY-MM-DD}`) avoids blocking legitimate repeat notifications on different days.

---

## Q2 — Real data vs. display artifact: age ordering

### The 20 rows (full result, org_id = 7e9eca25, ORDER BY created_at DESC):

All 20 rows are `type = dispatch_generated`, `title = "Dispatch Generated"`, `read = true`.

| # | id (short) | created_at (UTC) | read |
|---|---|---|---|
| 1 | bd41e6ad | 2026-06-15 00:00:35.853 | true |
| 2 | 0d2cb778 | 2026-06-12 00:00:35.822 | true |
| 3 | f10b15c1 | 2026-06-11 00:00:37.55 | true |
| 4 | 6ea4138e | 2026-06-10 00:00:37.832 | true |
| 5 | 658373a7 | 2026-06-09 00:00:05.646 | true |
| 6 | 1c14e89b | 2026-06-08 00:00:16.961 | true |
| 7 | b6a1c788 | 2026-06-05 00:01:06.263 | true |
| 8 | 7160021c | 2026-06-04 00:01:07.282 | true |
| 9 | e6c74f74 | **2026-06-03 00:00:57.743** | true |
| 10 | 6dec389a | **2026-06-03 00:00:57.743** | true |
| 11 | f38d3bcd | **2026-06-03 00:00:57.743** | true |
| 12 | 4ca56589 | **2026-06-03 00:00:57.743** | true |
| 13 | 27f4c415 | **2026-06-03 00:00:57.743** | true |
| 14 | 75dc68ab | **2026-06-03 00:00:57.743** | true |
| 15 | c906b460 | 2026-05-26 00:00:36.91 | true |
| 16 | f76fb546 | 2026-05-25 00:00:36.341 | true |
| 17 | 941eabba | 2026-05-22 00:00:31.108 | true |
| 18 | 091e4f03 | 2026-05-21 00:00:49.787 | true |
| 19 | 2dfc635d | 2026-05-20 00:01:46.566 | true |
| 20 | 9428f297 | 2026-05-19 00:00:08.645 | true |

### Verdict: display/relativeTime artifact — the data is in order

The `created_at` values ARE monotonically descending. No row sits out of order relative to its list position. Each timestamp is ≤ the previous row's timestamp.

**The "18d between 7d and 11d" observation was a display artifact or misread**, not real database disorder.

### Notable data pattern: 6 rows with identical millisecond timestamps on 2026-06-03

Rows 9–14 all have `created_at = 2026-06-03 00:00:57.743+00` — same to the millisecond. This is because the carrier-auto-dispatch cron processed 6 route templates simultaneously on that night and wrote all 6 `InAppNotification` rows within the same transaction batch. When rows share identical `created_at`, their relative order on display is **indeterminate** (depends on Postgres heap order, not time order). This could cause same-day notifications to appear shuffled between page refreshes — a legitimate secondary ordering issue but not the "18d anomaly."

### Schema definition: `created_at` on `InAppNotification`

From `apps/web/src/generated/prisma/schema.prisma` line 2535:
```
createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz
```

This is `@default(now())` only — **not `@updatedAt`**. `created_at` is set once at insert time and is never overwritten on update. The theory that `created_at` is being mis-mapped to `@updatedAt` is **ruled out** by the schema.

---

## Summary of findings

| Question | Answer |
|---|---|
| "Dispatch Generated" write path | Legacy `createNotification()` — carrier-auto-dispatch cron |
| "Dispatch Assigned" write path | Phase 41 `dispatchNotification('load.assigned')` |
| Compliance (truck/doc) write path | Phase 41 `dispatchNotification('truck.maintenance_due' / 'truck.document_expiring')` |
| Compliance (carrier batch alerts) write path | Legacy `createNotification()` — carrier-compliance-alerts cron |
| Dispatcher-only fix closes Bug A? | **No** — dispatch_generated and carrier compliance alerts are on legacy path |
| Legacy path fix needed? | Yes — dedup guard or unique constraint on the createNotification call site |
| Age ordering: real or artifact? | **Display/relativeTime artifact** — DB timestamps are correctly ordered |
| created_at overwritten on update? | **No** — field is `@default(now())` only, not `@updatedAt` |
| Same-timestamp ordering issue? | Yes, minor — 6 rows on 2026-06-03 share exact millisecond, order is indeterminate |
