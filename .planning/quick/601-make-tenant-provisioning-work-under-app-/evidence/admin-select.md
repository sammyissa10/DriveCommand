# quick-601 — `admin-select`

Generated 2026-09-14T20:26:56.145Z against staging (`wyixpgunnjmzguhggocz`).


| direction | probe | result |
|---|---|---|
| legitimate | app_admin "Tenant" INSERT with SELECT HELD | OK — rows=1 |
| legitimate | app_admin "Tenant" INSERT with SELECT REVOKED | `42501` permission denied for table TenantNotificationSettings |
