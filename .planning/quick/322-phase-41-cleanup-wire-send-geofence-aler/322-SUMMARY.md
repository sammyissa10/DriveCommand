---
phase: quick-322
plan: 01
subsystem: notifications / geofencing
tags: [notifications, dispatcher, geofence, email, phase-41-cleanup]
dependency_graph:
  requires:
    - quick-321 (external_email rule type + recipient resolver fix)
    - Phase 41 Plan 05 (dispatcher infrastructure)
  provides:
    - geofence.alert trigger key in TriggerKey union + NotificationPayload
    - geofence.alert seed template in NotificationTemplate table
    - sendGeofenceAlert wired through dispatchNotification with legacy fallback
    - TenantNotificationSettings rows for all 13 existing tenants
  affects:
    - apps/web/src/lib/email/send-geofence-alert.ts
    - apps/web/src/lib/notifications/types.ts
    - apps/web/prisma/seeds/notification-template-data/route.ts
tech_stack:
  added: []
  patterns:
    - dispatcher-wrapper pattern (same as send-driver-invitation.ts)
    - legacy fallback inside try/catch (preserved original behavior)
key_files:
  created:
    - apps/web/prisma/seeds/backfill-geofence-settings.ts
  modified:
    - apps/web/prisma/seeds/notification-template-data/route.ts
    - apps/web/src/lib/notifications/types.ts
    - apps/web/src/lib/email/send-geofence-alert.ts
decisions:
  - TenantNotificationSettings schema has no emailEnabled/smsEnabled/inAppEnabled columns (those live on UserNotificationPreference); backfill SQL adjusted to only insert id/tenantId/triggerKey/isActive/createdAt/updatedAt
  - Used Prisma createMany with skipDuplicates (idempotent) instead of raw SQL for backfill
metrics:
  duration: ~20 minutes
  completed: 2026-05-14
  tasks: 2 auto + 1 checkpoint
  files: 4
---

# Quick 322: Wire sendGeofenceAlert Through Dispatcher (Phase 41 Cleanup) Summary

Wired `sendGeofenceAlert` through `dispatchNotification('geofence.alert')` — closing the last sender that bypassed the Phase 41 dispatcher infrastructure. Geofence alerts now produce `SendLog` audit rows and are customizable per tenant from `/settings/notifications`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add geofence.alert to seed catalog and types union | `8e75758` | `route.ts`, `types.ts` |
| 2 | Refactor sendGeofenceAlert as dispatcher wrapper + backfill | `40054ae`, `0efc180` | `send-geofence-alert.ts`, `backfill-geofence-settings.ts` |

## Task 1: Seed + Types Changes

### types.ts
- Comment updated: `// Union of all 35 trigger keys` → `// Union of all 36 trigger keys`
- `'geofence.alert'` added to TriggerKey union under `// Route (4)` section
- Typed payload entry added to NotificationPayload:
  ```typescript
  'geofence.alert': {
    loadId: string;
    loadNumber: string;
    stopType: string;
    stopAddress: string;
    driverName: string;
    licensePlate: string;
  };
  ```

### route.ts
- 4th entry appended to `routeTemplates` array after `route.delayed`
- `triggerKey: 'geofence.alert'`, `category: ROUTE`
- Recipients: `[{ type: 'role', role: 'OWNER' }, { type: 'role', role: 'MANAGER' }]` (matches legacy behavior)

### Seed run output
```
Total templates to seed: 36
Validation: passed

Inserted: 1
Updated:  35
Total:    36
```

## Task 2: Wrapper Refactor + Call Site Audit

### sendGeofenceAlert call site audit

| File | Line | tenantId source variable | Status |
|------|------|--------------------------|--------|
| `apps/web/src/lib/geofencing/geofence-check.ts` | 108 | `tenantId` (function param from GPS device token) | already passes |
| `apps/web/src/lib/geofencing/geofence-check.ts` | 163 | `tenantId` (function param from GPS device token) | already passes |

No new call sites found. `geofence-check.ts` required no changes.

### send-geofence-alert.ts changes
- Added `import { dispatchNotification } from '@/lib/notifications/dispatcher'`
- `sendGeofenceAlert` now calls `dispatchNotification('geofence.alert', { tenantId, payload, relatedEntity: { type: 'Load', id: data.loadId } })`
- Original DB-query + Gmail send body preserved as `legacySendGeofenceAlert` fallback inside `catch`
- `tenantId` remains required in `GeofenceAlertData` interface (no signature change)

### Backfill: TenantNotificationSettings

Schema discovery: `TenantNotificationSettings` has no `emailEnabled`/`smsEnabled`/`inAppEnabled` columns — those are on `UserNotificationPreference`. Backfill SQL adjusted to insert only required columns.

```
TenantNotificationSettings backfill — geofence.alert
====================================================
Total tenants:              13
Already have settings row:  0
To backfill:                13
Inserted:                   13 rows

Verification:
  Total tenants:   13
  Settings rows:   13
  STATUS: MATCH - all tenants have geofence.alert settings
```

## Verification

- `tsc --noEmit`: passed (both after Task 1 and Task 2)
- `npm run build`: succeeded locally (Turbopack, 63s compile, exit 0)
- Seed: `Inserted 1, Updated 35` confirmed in production `NotificationTemplate` table
- Backfill: 13/13 tenants verified to have `TenantNotificationSettings` row for `geofence.alert`
- Vercel deploy: `Production: https://drive-command-r7c6uh28k-sammyissa10s-projects.vercel.app` (exit 0, "Deployment completed")
- GitHub: pushed to `master` (0efc180)

## Task 3 Checkpoint (pending human verification)

Production is deployed. User needs to verify:
1. A real or manually invoked geofence event produces `SENT` `SendLog` rows for OWNER + MANAGER recipients
2. No `FAILED` rows in `SendLog`
3. No `[notifications] dispatcher failed, falling back to legacy geofence sender` warning in Vercel logs

See plan Task 3 for exact verification SQL and instructions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TenantNotificationSettings backfill SQL column mismatch**
- **Found during:** Task 3 pre-flight (checkpoint automation)
- **Issue:** Plan's backfill SQL referenced `emailEnabled`, `smsEnabled`, `inAppEnabled` columns that do not exist on `TenantNotificationSettings` — those fields live on `UserNotificationPreference`
- **Fix:** Used Prisma `createMany` with only the actual columns (`tenantId`, `triggerKey`, `isActive`), added schema discovery step before running
- **Files modified:** `apps/web/prisma/seeds/backfill-geofence-settings.ts` (new file, correct schema)
- **Commit:** `0efc180`

## Self-Check: PASSED

Files confirmed:
- `apps/web/prisma/seeds/notification-template-data/route.ts` — FOUND (geofence.alert 4th entry)
- `apps/web/src/lib/notifications/types.ts` — FOUND ('geofence.alert' in TriggerKey + NotificationPayload)
- `apps/web/src/lib/email/send-geofence-alert.ts` — FOUND (dispatchNotification import + call)
- `apps/web/prisma/seeds/backfill-geofence-settings.ts` — FOUND

Commits confirmed:
- `8e75758` — feat(quick-322): add geofence.alert to seed catalog and types union — FOUND
- `40054ae` — feat(quick-322): refactor sendGeofenceAlert as dispatcher wrapper with legacy fallback — FOUND
- `0efc180` — chore(quick-322): add one-time backfill script for geofence.alert tenant settings — FOUND
