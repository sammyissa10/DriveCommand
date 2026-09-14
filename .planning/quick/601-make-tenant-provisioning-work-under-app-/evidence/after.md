# quick-601 — `after`

Generated 2026-09-14T20:26:42.031Z against staging (`wyixpgunnjmzguhggocz`).

- **bypassBefore**: `86`
- **bypassAfter**: `86`
- **droppedTables**: `["ActivationProgress","AppEvent","Customer","Load","Subscription","Tenant","TenantNotificationSettings","Truck","User","carrier_drivers","carrier_trucks","clients","contracts","dispatches","loads"]`

| direction | probe | result |
|---|---|---|
| legitimate | provisionTenant() — sign-up | OK — tenantId=a687b099-ffd9-47fa-9902-5f1ce14d5111 planKey=starter |
| legitimate | trg_seed_tenant_notification_settings wrote its rows (the sweep's failure) | OK — rows=2 (expected 2) |
| legitimate | confirmTenantEmail() — email confirmation | OK — status=confirmed |
| legitimate | confirmTenantEmail() again — idempotency | OK — status=already-confirmed |
| legitimate | hydrateTenant() — onboarding hydration + sample seed | OK — phase=HYDRATED seeded=true |
| legitimate | getOnboardingFlags() — activation checklist | OK — {"hasClient":false,"hasContract":false,"hasLoad":false,"hasTrip":false} |
| legitimate | counter-assertion: the seeded rows ARE readable as this tenant (all-false flags are the isSample filter, not RLS) | OK — clients=1 carrier_trucks=1 loads=2 |
| legitimate | INSERT "AppEvent" tenant.created — sign-up actions.tsx step 3 | OK — rows=1 |
| cross-tenant | INSERT "Tenant" whose id is NOT the declared GUC | `42501` new row violates row-level security policy for table "Tenant" |
| cross-tenant | INSERT "Tenant" with NO GUC set at all (exactly what the old policy allowed) | `42501` new row violates row-level security policy for table "Tenant" |
| cross-tenant | SELECT the provisioned tenant from a DIFFERENT tenant context | OK — rows=0 |
| cross-tenant | UPDATE the provisioned tenant from a DIFFERENT tenant context | OK — rows=0 |
| cross-tenant | counter-read: the row IS there (so 0 rows above means refused, not absent) | OK — rows=1 |
| cross-tenant | INSERT "TenantNotificationSettings" for a tenant that is not ours | `42501` new row violates row-level security policy for table "TenantNotificationSettings" |
