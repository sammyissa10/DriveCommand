# quick-610 — cold-pool BEFORE

project `wyixpgunnjmzguhggocz` · role `app_user` · tripwire armed · one process per site

| # | file:line | fn | verdict | detail |
|---|---|---|---|---|
| s1 | `src/app/(owner)/actions/dashboard.ts:85` | `_fetchNotificationAlerts` | **RAISED `TC001`** | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s2 | `src/app/(owner)/actions/dashboard.ts:330` | `_fetchDashboardMetrics` | **RAISED `TC001`** | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s3 | `src/app/(owner)/actions/tenant-notification-settings.ts:374` | `listTenantUsers` | **RAISED `TC001`** | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s4 | `src/app/(owner)/actions/tenant-notification-settings.ts:513` | `listTenantSendLog` | **RAISED `TC001`** | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s5 | `src/app/(owner)/actions/tenant-notification-settings.ts:543` | `getTenantSendLogStats` | **RAISED `TC001`** | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s6 | `src/lib/db/repositories/base.repository.ts:11` | `TenantRepository constructor (inherited by every subclass)` | **RAISED `TC001`** | tenant context is required: app.current_tenant_id is the EMPTY STRING |
