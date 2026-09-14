# quick-601 — `before`

Generated 2026-09-14T20:22:55.556Z against staging (`wyixpgunnjmzguhggocz`).


| direction | probe | result |
|---|---|---|
| legitimate | INSERT "Tenant" (no RETURNING) — the sweep's derived failure | `42501` new row violates row-level security policy for table "TenantNotificationSettings" |
| legitimate | INSERT "Tenant" RETURNING id — what Prisma actually emits | `42501` new row violates row-level security policy for table "Tenant" |
| legitimate | INSERT "Tenant" RETURNING id with the bypass flag set | OK — rows=1 |
