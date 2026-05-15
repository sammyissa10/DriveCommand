---
phase: quick-323
plan: "01"
subsystem: notifications / tenant isolation
tags: [security, p0, tenant-isolation, notifications, send-log]
dependency_graph:
  requires: []
  provides: [tenant-scoped-user-picker, working-send-log-tab]
  affects: [settings/notifications, subscriber-picker, send-log-tab]
tech_stack:
  added: []
  patterns: [createTenantClient-session-bound, Promise.all-no-transaction]
key_files:
  modified:
    - apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
decisions:
  - "Use createTenantClient(tenantId) instead of getTenantPrisma() for all three deviating functions — session-bound RLS, eliminates header/session divergence"
  - "Remove array-form $transaction + $executeRaw bypass_rls from SendLog reads — postgres role has BYPASSRLS privilege, P2028 deadlock risk eliminated"
  - "Keep explicit where: { tenantId } on NotificationSendLog reads as defense-in-depth since table has no Postgres RLS"
metrics:
  duration: ~8 min
  completed: 2026-05-14
  tasks_completed: 3
  files_modified: 1
---

# Quick-323: P0 Cross-Tenant Data Leak and Broken Send Log — Summary

**One-liner:** Fixed header/session tenantId divergence in user picker and replaced P2028-risk array-form `$transaction` in Send Log actions with session-bound `createTenantClient` + `Promise.all`.

---

## Audit Table

| # | Function | Line | Prisma client used | tenantId source | Defect | Action |
|---|---|---|---|---|---|---|
| 1 | `listTenantNotificationSettings` | 128 | base `prisma` (global table) + `getTenantPrisma()` | session | None | OK — no change |
| 2 | `getSettingForTrigger` | 167 | base `prisma` (global) + `getTenantPrisma()` | session | None | OK — no change |
| 3 | `customizeTemplate` | 205 | base `prisma` (global) + `getTenantPrisma()` | session | None | OK — no change |
| 4 | `restoreDefault` | 268 | `getTenantPrisma()` | session | None | OK — no change |
| 5 | `toggleTenantNotificationActive` | 297 | base `prisma` (global) + `getTenantPrisma()` | session | None | OK — no change |
| 6 | `listTenantSubscribers` | 333 | `getTenantPrisma()` | session | None | OK — no change |
| 7 | `listTenantUsers` | 367 | `getTenantPrisma()` (header-bound) | **SPLIT**: RLS uses x-tenant-id header; `where` uses session | Header/session divergence risk — confirmed cross-tenant leak vector | **FIXED** — replaced with `createTenantClient(tenantId)` |
| 8 | `listActiveTemplatesForTenant` | 390 | base `prisma` (global) + `getTenantPrisma()` | session | None | OK — no change |
| 9 | `addSubscriber` | 420 | `getTenantPrisma()` | session | None | OK — no change |
| 10 | `removeSubscriber` | 462 | `getTenantPrisma()` | session | None | OK — RLS enforces isolation on delete |
| 11 | `listTenantSendLog` | 484 | base `prisma` + array-form `$transaction` + `$executeRaw` | session | Deprecated P2028-risk pattern; SendLog has no RLS | **FIXED** — removed $transaction, use `createTenantClient` + `Promise.all` |
| 12 | `getTenantSendLogStats` | 524 | base `prisma` + array-form `$transaction` + `$executeRaw` | session | Same deprecated pattern | **FIXED** — same fix as #11; also upgraded string status literals to `NotificationSendStatus` enum |

---

## Diff Summary

### listTenantUsers (cross-tenant leak fix)

**Before:**
```ts
const tenantDb = await getTenantPrisma();  // reads tenantId from x-tenant-id header
const users = await tenantDb.user.findMany({
  where: { tenantId, isActive: true },  // tenantId from session — different source
  ...
});
```

**After:**
```ts
const tenantDb = createTenantClient(tenantId);  // session-bound — same source as where clause
const users = await tenantDb.user.findMany({
  where: { isActive: true },  // RLS extension injects tenantId automatically
  ...
});
```

### listTenantSendLog (broken Send Log fix)

**Before:**
```ts
const [, total, rows] = await prisma.$transaction([
  prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
  prisma.notificationSendLog.count({ where }),
  prisma.notificationSendLog.findMany({ where, ... }),
]) as [unknown, number, SendLogRow[]];
```

**After:**
```ts
const tenantDb = createTenantClient(tenantId);
const [total, rows] = await Promise.all([
  tenantDb.notificationSendLog.count({ where }),
  tenantDb.notificationSendLog.findMany({ where, ... }),
]);
```

### getTenantSendLogStats (broken KPI stats fix)

**Before:** Same deprecated array-form `$transaction` with `$executeRaw` + string status literals `'SENT'`/`'FAILED'`/`'PENDING'`.

**After:** `createTenantClient` + `Promise.all` with `NotificationSendStatus.SENT` enum values.

---

## Verification Results

```
grep bypass_rls|$transaction in tenant-notification-settings.ts
  → 2 matches (both in COMMENTS only — no executable code)

grep createTenantClient in tenant-notification-settings.ts
  → Lines 9 (import), 373, 512, 542 — 3 call sites

grep "as [unknown" in tenant-notification-settings.ts
  → 0 matches

tsc --noEmit → exit 0, no errors
npm run build → exit 0, compiled successfully in 45s, TypeScript finished in 97s
```

---

## Smoke-Test Steps (for manual verification)

Sign in as an owner on **Tenant A**, then:

1. Navigate to `/settings/notifications`
2. Click "Add Subscriber" — the user picker must show **only Tenant A users** (not users from other tenants)
3. Open the **Send Log** tab — KPI cards must render with numbers (no error thrown)
4. Send Log table must show rows for Tenant A only
5. Apply filters (status / triggerKey / channel) — each must narrow the list correctly
6. Test pagination (next/prev) — must work without error

---

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as specified by the critical context.

**Note on Task 2 items 2-4 (plan's optional cleanup):** The plan suggested also removing redundant `where: { tenantId }` from `listTenantSubscribers`, `listTenantNotificationSettings`, and `listActiveTemplatesForTenant`. Per the critical context, these functions were classified as OK (those tenantId filters are harmless defense-in-depth on RLS-protected tables). Only the 3 confirmed deviating functions were touched.

---

## Self-Check

- [x] `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts` exists and modified
- [x] Commit `0016046` exists
- [x] `tsc --noEmit` clean
- [x] `npm run build` exit 0

## Self-Check: PASSED
