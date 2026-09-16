# quick-615 — every routed FILE, both directions (BEFORE)

project `wyixpgunnjmzguhggocz` (staging) · ADMIN lane `app_admin` · TENANT lane `app_user` · **tripwire `on`** · counter-reads as `postgres`

Every probe cell runs in its OWN `BEGIN … ROLLBACK`, so a `TC001` cannot abort the matrix into a run of `25P02`s. SQLSTATE is read off the cause chain and `TC001` is recognised by CODE, never by message prose.

tenant A = `b5623cdd-dc19-4900-b75d-0ecfcaf191b8` (Staging Alpha Carriers) · tenant B = `8c6136c4-eb7b-4a89-a524-d1d0e2c8d045` (Staging Beta Logistics)
`Tenant` rows: **2** at entry, **2** at close · SYSTEM `AutomationRule` rows: **6** at entry, **6** at close
`bypass_rls_policy` tables: **86**

## the app_admin grant delta, measured against the LIVE catalog

| table | needed by a routed statement | held by `app_admin` | missing |
|---|---|---|---|
| `ActivationProgress` | SELECT | *(none)* | SELECT |
| `AppEvent` | SELECT | INSERT, SELECT | — |
| `AutomationRule` | SELECT | SELECT, UPDATE | — |
| `AutomationRun` | SELECT | INSERT, SELECT, UPDATE | — |
| `DriverInvitation` | SELECT, INSERT, UPDATE | SELECT | INSERT, UPDATE |
| `Load` | SELECT | SELECT | — |
| `NotificationSendLog` | SELECT | *(none)* | SELECT |
| `Route` | SELECT | *(none)* | SELECT |
| `Subscription` | SELECT | SELECT, UPDATE | — |
| `SupportTicket` | SELECT | SELECT, UPDATE | — |
| `Tenant` | SELECT | DELETE, INSERT, SELECT, UPDATE | — |
| `TicketMessage` | SELECT | INSERT, SELECT | — |
| `Truck` | SELECT | SELECT | — |
| `User` | SELECT, UPDATE | SELECT | UPDATE |

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
| listNotificationSendLog + getDeliveryStatistics — NotificationSendLog | ADMIN — app_admin, no GUC | must be 42501 — NO GRANT YET | the routed statement on its new receiver | **ERROR [42501]** permission denied for table NotificationSendLog | — | — |
| listNotificationSendLog + getDeliveryStatistics — NotificationSendLog | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is UNSET | — | — |
| listNotificationSendLog + getDeliveryStatistics — NotificationSendLog | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **2** |

### `app/(admin)/actions/sysadmin-invoices.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :83 — Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>> | ADMIN — app_admin, no GUC | NO PROBE — NOT A RUNTIME STATEMENT | a type query in a return-type annotation; erased by the compiler, issues no SQL <br>**UNPROVEN:** nothing to probe — 614 §2.1 B-2 is a type, not a statement. The file holds ZERO runtime bare statements and 10 getAdminDb calls. | — | — | — |

### `app/(admin)/actions/tenants.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route) | ADMIN — app_admin, no GUC | must be 42501 — Route is UNGRANTED | the routed statement on its new receiver | **ERROR [42501]** permission denied for table Route | — | — |
| getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route) | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own tenant (B) still readable on the SAME connection = **1** |
| getSystemMetrics — Load + SupportTicket platform counts | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | loads = **0** · open_tickets = **2** | — | — |
| getSystemMetrics — Load + SupportTicket platform counts | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| getSystemMetrics — Load + SupportTicket platform counts | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **1** |
| createTenant :123 — DriverInvitation INSERT (receiver swap onto adminDb) | ADMIN — app_admin, no GUC | must be 42501 — NO INSERT GRANT YET | the routed statement on its new receiver | **ERROR [42501]** permission denied for table DriverInvitation | DriverInvitation rows on staging (unchanged — every probe is rolled back) = **2** | — |
| createTenant :123 — DriverInvitation INSERT (receiver swap onto adminDb) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | DriverInvitation rows on staging (unchanged — every probe is rolled back) = **2** | — |
| resendOwnerInvitation :376 — DriverInvitation UPDATE | ADMIN — app_admin, no GUC | must be 42501 — NO UPDATE GRANT YET | the routed statement on its new receiver | **ERROR [42501]** permission denied for table DriverInvitation | tenant A's invitations still present = **1** | — |
| resendOwnerInvitation :376 — DriverInvitation UPDATE | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | tenant A's invitations still present = **1** | — |
| updateOwnerEmail :472/:480 — User SELECT then UPDATE | ADMIN — app_admin, no GUC | must be 42501 — NO UPDATE GRANT YET | the routed statement on its new receiver | **ERROR [42501]** permission denied for table User | the user row still exists = **1** | — |
| updateOwnerEmail :472/:480 — User SELECT then UPDATE | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | the user row still exists = **1** | — |

### `app/(admin)/actions/users.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| getAllUsers — User across every tenant, joined to Tenant.name | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | users_visible = **10** · tenant_names_visible = **10** | — | — |
| getAllUsers — User across every tenant, joined to Tenant.name | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| getAllUsers — User across every tenant, joined to Tenant.name | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) rows readable on the SAME connection = **4** |
| updateUserProfile :115/:130 — User UPDATE (and its compensating rollback) | ADMIN — app_admin, no GUC | must be 42501 — NO UPDATE GRANT YET | the routed statement on its new receiver | **ERROR [42501]** permission denied for table User | the user row still exists = **1** | — |
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
| :20 — ActivationProgress for an ARBITRARY tenant | ADMIN — app_admin, no GUC | must be 42501 — NO GRANT YET | the routed statement on its new receiver | **ERROR [42501]** permission denied for table ActivationProgress | — | — |
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
| :292 — auth.users, the GRANT class | ADMIN — app_admin, no GUC | must be 42501 — NO auth USAGE, NO table grant | the three display columns the statement already reads | **ERROR [42501]** permission denied for schema auth | — | — |
| :292 — auth.users, the GRANT class | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be 42501, NOT TC001 — a privilege problem, which the tripwire can never signal | the same three columns on the tenant connection | **ERROR [42501]** permission denied for schema auth | — | — |
| auth.users — THE COUNTER-ASSERTION | ADMIN — app_admin, no GUC | must be 42501 BEFORE **and** AFTER — the column grant names three columns and no more | encrypted_password is REFUSED on the very connection that can read the display columns | **ERROR [42501]** permission denied for schema auth | — | — |

### `app/api/cron/auto-close-tickets/route.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| :25 — the real stale-ticket scan (SupportTicket + a TicketMessage NOT EXISTS) | ADMIN — app_admin, no GUC | must SUCCEED | the routed statement on its new receiver | n = **0** | — | — |
| :25 — the real stale-ticket scan (SupportTicket + a TicketMessage NOT EXISTS) | TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries) | must be TC001 | the OLD receiver, with the GUC a sysadmin/cron request actually carries | **ERROR [TC001]** tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| :25 — the real stale-ticket scan (SupportTicket + a TicketMessage NOT EXISTS) | TENANT — app_user, REAL tenant GUC | foreign must be 0, PAIRED with own > 0 | the old receiver under ANOTHER tenant's GUC — cross-tenant refusal | n = **0** | — | own (tenant B) ticket messages readable on the SAME connection = **1** |

### `app/api/cron/automations/route.ts`

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| the four candidateQuery sweeps — ActivationProgress + Subscription (ADMIN class) | ADMIN — app_admin, no GUC | must be 42501 — ActivationProgress is UNGRANTED | the routed statement on its new receiver | **ERROR [42501]** permission denied for table ActivationProgress | — | — |
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


---

## ADDENDUM — this file was captured BEFORE the `auth` pivot, and is NOT re-run

`02-before.md` above is the genuine pre-grant measurement: it was taken while
`app_admin` still held none of the five missing privileges, and every `42501` in
it is real. It is **deliberately not regenerated**, because the grants are now
applied to staging and a "before" re-measured after the fact would not be one.

Two consequences a reader must have, rather than discover:

1. **Its `auth` rows measure the ORIGINAL statement only.** At the time of this
   run the plan was a column-level grant on `auth.users`, so the probes were
   `SELECT id, email, raw_user_meta_data FROM auth.users` (ADMIN and
   TENANT(∅) — both `42501 permission denied for schema auth`) and the
   `encrypted_password` counter-assertion (also `42501`). That is still the
   correct before-state for the statement as it was written.

2. **The `public.auth_user_display(uuid[])` probe has no before row here**,
   because the function did not exist when this ran. Its before-state is exactly
   that: the object did not exist. `05-after.md` carries it, alongside the two
   counter-assertions that did survive the pivot unchanged — a direct
   `auth.users` read is STILL `42501` on `app_admin` after the remedy, and
   `has_schema_privilege('app_admin','auth','USAGE')` is STILL `false`.

The pivot itself, and the `WARNING: no privileges were granted for "auth"` that
forced it, are recorded in `03-grants-and-auth-exposure.md` and in the header of
`prisma/migrations/20260915170000_auth_user_display_definer_function/migration.sql`.
