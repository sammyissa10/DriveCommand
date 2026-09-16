# quick-615 — every routed FILE, both directions (AFTER)

project `wyixpgunnjmzguhggocz` (staging) · ADMIN lane `app_admin` · TENANT lane `app_user` · **tripwire `on`** · counter-reads as `postgres`

Every probe cell runs in its OWN `BEGIN … ROLLBACK`, so a `TC001` cannot abort the matrix into a run of `25P02`s. SQLSTATE is read off the cause chain and `TC001` is recognised by CODE, never by message prose.

tenant A = `b5623cdd-dc19-4900-b75d-0ecfcaf191b8` (Staging Alpha Carriers) · tenant B = `8c6136c4-eb7b-4a89-a524-d1d0e2c8d045` (Staging Beta Logistics)
`Tenant` rows: **2** at entry, **2** at close · SYSTEM `AutomationRule` rows: **6** at entry, **6** at close
`bypass_rls_policy` tables: **86**

## the app_admin grant delta, measured against the LIVE catalog

| table | needed by a routed statement | held by `app_admin` | missing |
|---|---|---|---|
| `ActivationProgress` | SELECT | SELECT | — |
| `AppEvent` | SELECT | INSERT, SELECT | — |
| `AutomationRule` | SELECT | SELECT, UPDATE | — |
| `AutomationRun` | SELECT | INSERT, SELECT, UPDATE | — |
| `DriverInvitation` | SELECT, INSERT, UPDATE | INSERT, SELECT, UPDATE | — |
| `Load` | SELECT | SELECT | — |
| `NotificationSendLog` | SELECT | SELECT | — |
| `Route` | SELECT | SELECT | — |
| `Subscription` | SELECT | SELECT, UPDATE | — |
| `SupportTicket` | SELECT | SELECT, UPDATE | — |
| `Tenant` | SELECT | DELETE, INSERT, SELECT, UPDATE | — |
| `TicketMessage` | SELECT | INSERT, SELECT | — |
| `Truck` | SELECT | SELECT | — |
| `User` | SELECT, UPDATE | SELECT, UPDATE | — |

`has_schema_privilege('app_admin','auth','USAGE')` = **false** · `app_user` = **false**
auth column grants to app_user/app_admin: **0**

## fixtures

| fixture | status | detail |
|---|---|---|
| `ActivationProgress(B)` | CREATED | tenant B (tenant A already carries the single pre-existing row) |
| `AppEvent(B)` | CREATED | 1 row, eventType='quick615.fixture' |
| `AutomationRun(A)` | CREATED | 1 row on SYSTEM rule activation_celebration |
| `DriverInvitation(A)` | CREATED | 1 PENDING row |
| `NotificationSendLog(A)` | CREATED | 1 SENT row |
| `SupportTicket(A)` | CREATED | 1 OPEN ticket |
| `TicketMessage(A)` | CREATED | 1 OWNER message |
| `Route(A)` | CREATED | 1 route |
| `Subscription(A)` | CREATED | 1 TRIALING-window row |
| `AutomationRun(B)` | CREATED | 1 row on SYSTEM rule activation_celebration |
| `DriverInvitation(B)` | CREATED | 1 PENDING row |
| `NotificationSendLog(B)` | CREATED | 1 SENT row |
| `SupportTicket(B)` | CREATED | 1 OPEN ticket |
| `TicketMessage(B)` | CREATED | 1 OWNER message |
| `Route(B)` | CREATED | 1 route |
| `Subscription(B)` | CREATED | 1 TRIALING-window row |
| `Load(A,B)` | **SKIPPED** | Load_customerId_fkey needs a Customer and Customer is zero-row on staging; reported UNPROVEN rather than fabricated |
| `auth.users` | **SKIPPED** | DELIBERATE — no identity is ever fabricated. Staging already holds 9 real rows, so the cell is not vacuous. |

## the matrix, per FILE

### `app/(admin)/actions/notifications.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| listNotificationSendLog + getDeliveryStatistics — NotificationSendLog | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | send_log_rows = **18** | — | — |
| listNotificationSendLog + getDeliveryStatistics — NotificationSendLog | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is UNSET | — | — |
| listNotificationSendLog + getDeliveryStatistics — NotificationSendLog | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **2** |

### `app/(admin)/actions/sysadmin-invoices.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :83 — Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>> | ADMIN — app_admin, no GUC | NO PROBE — NOT A RUNTIME STATEMENT | a type query in a return-type annotation; erased by the compiler, issues no SQL <br>**UNPROVEN:** nothing to probe — 614 §2.1 B-2 is a type, not a statement. The file holds ZERO runtime bare statements and 10 getAdminDb calls. | — | — | — |

### `app/(admin)/actions/tenants.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route) | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | tenants = **2** · users = **10** · trucks = **2** · routes = **2** | — | — |
| getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route) | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own tenant (B) still readable on the SAME connection = **1** |
| getSystemMetrics — Load + SupportTicket platform counts | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | loads = **0** · open_tickets = **2** | — | — |
| getSystemMetrics — Load + SupportTicket platform counts | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| getSystemMetrics — Load + SupportTicket platform counts | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **1** |
| createTenant :123 — DriverInvitation INSERT (receiver swap onto adminDb) | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | **1** row(s) affected | DriverInvitation rows on staging (unchanged — every probe is rolled back) = **2** | — |
| createTenant :123 — DriverInvitation INSERT (receiver swap onto adminDb) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | DriverInvitation rows on staging (unchanged — every probe is rolled back) = **2** | — |
| resendOwnerInvitation :376 — DriverInvitation UPDATE | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | **1** row(s) affected | tenant A's invitations still present = **1** | — |
| resendOwnerInvitation :376 — DriverInvitation UPDATE | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | tenant A's invitations still present = **1** | — |
| updateOwnerEmail :472/:480 — User SELECT then UPDATE | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | **1** row(s) affected | the user row still exists = **1** | — |
| updateOwnerEmail :472/:480 — User SELECT then UPDATE | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | the user row still exists = **1** | — |

### `app/(admin)/actions/users.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| getAllUsers — User across every tenant, joined to Tenant.name | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | users_visible = **10** · tenant_names_visible = **10** | — | — |
| getAllUsers — User across every tenant, joined to Tenant.name | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| getAllUsers — User across every tenant, joined to Tenant.name | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **4** |
| updateUserProfile :115/:130 — User UPDATE (and its compensating rollback) | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | **1** row(s) affected | the user row still exists = **1** | — |
| updateUserProfile :115/:130 — User UPDATE (and its compensating rollback) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | the user row still exists = **1** | — |

### `app/(admin)/admin-support/page.tsx`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :24 — the ticket filter tenant dropdown | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | tenants = **2** | — | — |
| :24 — the ticket filter tenant dropdown | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :24 — the ticket filter tenant dropdown | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own tenant (B) still readable on the SAME connection = **1** |

### `app/(admin)/tenants/[id]/activation-progress-section.tsx`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :20 — ActivationProgress for an ARBITRARY tenant | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | n = **1** | — | — |
| :20 — ActivationProgress for an ARBITRARY tenant | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :20 — ActivationProgress for an ARBITRARY tenant | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **1** |

### `app/(admin)/tenants/[id]/automation-runs-section.tsx`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :10 — AutomationRun joined to AutomationRule, for an ARBITRARY tenant | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | runs_visible = **1** · rule_keys_visible = **1** | — | — |
| :10 — AutomationRun joined to AutomationRule, for an ARBITRARY tenant | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :10 — AutomationRun joined to AutomationRule, for an ARBITRARY tenant | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **1** |

### `app/(admin)/tenants/[id]/page.tsx`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :56 — Subscription.trialEndsAt for an ARBITRARY tenant | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | n = **1** | — | — |
| :56 — Subscription.trialEndsAt for an ARBITRARY tenant | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :56 — Subscription.trialEndsAt for an ARBITRARY tenant | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **1** |

### `actions/support-tickets.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| getAllTickets :271/:286/:290 — SupportTicket scan + User and Tenant joins | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | tickets = **2** · users = **10** · tenants = **2** | — | — |
| getAllTickets :271/:286/:290 — SupportTicket scan + User and Tenant joins | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| getAllTickets :271/:286/:290 — SupportTicket scan + User and Tenant joins | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **1** |
| :292 (ORIGINAL TEXT) — direct read of auth.users | ADMIN — app_admin, no GUC | must be 42501 BEFORE **and** AFTER — no auth privilege is ever granted to app_admin | SELECT id, email, raw_user_meta_data FROM auth.users | **ERROR [42501]** permission denied for schema auth | — | — |
| :292 (ORIGINAL TEXT) — direct read of auth.users | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be 42501, NOT TC001 — a privilege problem, which the tripwire can never signal | the same three columns on the tenant connection | **ERROR [42501]** permission denied for schema auth | — | — |
| :292 (SHIPPED) — public.auth_user_display(uuid[]) | ADMIN — app_admin, no GUC | must SUCCEED, rows > 0 — EXECUTE is live (9 real auth.users ids, resolved privileged and passed as a parameter) | SELECT id, email, raw_user_meta_data FROM public.auth_user_display($1::uuid[]) | n = **9** · emails = **9** · metas = **9** | — | — |
| :292 (SHIPPED) — public.auth_user_display(uuid[]) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be REFUSED — EXECUTE was revoked from PUBLIC and granted to app_admin alone | the tenant role calling the definer function | **ERROR [42501]** permission denied for function auth_user_display | — | — |
| auth.users — THE COUNTER-ASSERTION | ADMIN — app_admin, no GUC | must be 42501 BEFORE **and** AFTER — the remedy exposes three columns and no more | encrypted_password is REFUSED on the very connection that reads the display columns | **ERROR [42501]** permission denied for schema auth | — | — |
| schema auth — THE SECOND COUNTER-ASSERTION | ADMIN — app_admin, no GUC | must be FALSE BEFORE **and** AFTER — app_admin never gains USAGE on schema auth | has_schema_privilege('app_admin','auth','USAGE') | auth_usage = **false** | — | — |

### `app/api/cron/auto-close-tickets/route.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :25 — the real stale-ticket scan (SupportTicket + a TicketMessage NOT EXISTS) | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | n = **0** | — | — |
| :25 — the real stale-ticket scan (SupportTicket + a TicketMessage NOT EXISTS) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :25 — the real stale-ticket scan (SupportTicket + a TicketMessage NOT EXISTS) | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) ticket messages readable on the SAME connection = **1** |

### `app/api/cron/automations/route.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| the four candidateQuery sweeps — ActivationProgress + Subscription (ADMIN class) | ADMIN — app_admin, no GUC | must SUCCEED — the grant is live | the routed statement on its new receiver | activation_rows = **2** · subscription_rows = **2** | — | — |
| the four candidateQuery sweeps — ActivationProgress + Subscription (ADMIN class) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :170 — the platform-scope AutomationRule lookup (ADMIN class) | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | n = **1** | — | — |
| :170 — the platform-scope AutomationRule lookup (ADMIN class) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :187/:198 — the per-candidate dedup reads (TENANT class) | TENANT — app_user, REAL tenant GUC | must SUCCEED on the NEW receiver — a tenant client serves it | getTenantPrismaForOrg(tenantId) with the loop variable's own GUC | n = **1** | — | — |
| :187/:198 — the per-candidate dedup reads (TENANT class) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 — the OLD receiver, which is what a cron process carries | the bare client, no GUC | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |

### `lib/automations/evaluator.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :64/:73/:131 — AppEvent scan, rule lookup, due-run queue (ADMIN class) | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | events = **2** · rules = **6** · runs = **2** | — | — |
| :64/:73/:131 — AppEvent scan, rule lookup, due-run queue (ADMIN class) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :64/:73/:131 — AppEvent scan, rule lookup, due-run queue (ADMIN class) | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **1** |
| :80 — the per-event dedup read (TENANT class) | TENANT — app_user, REAL tenant GUC | must SUCCEED on the NEW receiver — a tenant client serves it | getTenantPrismaForOrg(event.tenantId) | n = **1** | — | — |
| :80 — the per-event dedup read (TENANT class) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 — the OLD receiver | the bare client, no GUC | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |

