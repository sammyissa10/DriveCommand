# quick-610 — cold-pool AFTER

project `wyixpgunnjmzguhggocz` · role `app_user` · tripwire armed · one process per site

| # | file:line | fn | verdict | detail |
|---|---|---|---|---|
| s1 | `src/app/(owner)/actions/dashboard.ts:85` | `_fetchNotificationAlerts` | no raise | truck.findMany -> 1 row(s) · cross-tenant: own=1 foreign=0 |
| s2 | `src/app/(owner)/actions/dashboard.ts:330` | `_fetchDashboardMetrics` | no raise | user.count(role=DRIVER, isActive) -> 3 · cross-tenant: own=6 foreign=0 |
| s3 | `src/app/(owner)/actions/tenant-notification-settings.ts:374` | `listTenantUsers` | no raise | user.findMany(isActive) -> 6 row(s) · cross-tenant: own=6 foreign=0 |
| s4 | `src/app/(owner)/actions/tenant-notification-settings.ts:513` | `listTenantSendLog` | no raise | notificationSendLog.count -> 1 · cross-tenant: own=1 foreign=0 |
| s5 | `src/app/(owner)/actions/tenant-notification-settings.ts:543` | `getTenantSendLogStats` | no raise | notificationSendLog.count(30d) -> 1 · cross-tenant: own=1 foreign=0 |
| s6 | `src/lib/db/repositories/base.repository.ts:11` | `TenantRepository constructor (inherited by every subclass)` | no raise | DocumentRepository#findByTruckId -> 1 row(s) · cross-tenant: own=1 foreign=0 |
