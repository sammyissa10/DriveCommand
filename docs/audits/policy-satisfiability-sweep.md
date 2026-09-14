# Satisfiability of all 180 RLS policies

**Date:** 2026-09-14
**Status:** MEASUREMENT ONLY. No policy, migration, application file or database object was changed.
Production and staging were opened with `BEGIN READ ONLY` and `SELECT` only — no DDL, no DML, no
rolled-back write probe, no `bypass_rls_policy` touched.
**Predecessors:** `docs/audits/bypass-replacement-design.md` · `docs/audits/rls-policy-satisfiability-fixes.md`
(quick-597) · `docs/audits/wrapper-migration-scope.md`
**Answers:** the satisfiability question asked of **all 180** policies rather than only of the tables a
bypass site reads.

---

## 0. Summary

**Both databases are aligned, byte for byte.** Measured at the start of this task:

| | production `oqdhberkghtnszrkdvfm` | staging `wyixpgunnjmzguhggocz` |
|---|---|---|
| `pg_policy` rows in `public` | **180** | **180** |
| `bypass_rls_policy` rows | 86 | 86 |
| tables with `relrowsecurity = true` | 91 | 91 |
| digest of `(table\|policy\|cmd\|permissive\|USING\|WITH CHECK\|roles)`, sorted | `22617e5611ecb5fcfba56938b7dc0fa8` | `22617e5611ecb5fcfba56938b7dc0fa8` |
| newest `_prisma_migrations` row | `20260913120000_rls_policy_satisfiability_fixes` | same |
| `app_user.rolbypassrls` | false | false |

Set difference in both directions is empty. One **schema** difference, not a policy one:
`grid_preference` exists on production (RLS off) and does not exist on staging. Noted, not a blocker.

### Verdict counts — 91 RLS-enabled tables

| verdict | tables | meaning |
|---|---|---|
| **LIVE** | **89** | at least one non-bypass policy is satisfiable by `app.current_tenant_id`, which the application sets |
| **OPEN** | **1** | `AutomationRule` — permissive predicate with a tenant-independent branch, reused as the write check |
| **DARK** | **0** | no table has *only* dead non-bypass policies |
| **NO_POLICY** | **1** | `_prisma_migrations` — RLS enabled, zero policies |
| | **91 ✓** | |

**Three policies of the 180 are dead**, and none of them is load-bearing, because each sits beside a
live `tenant_isolation_policy` on the same table:

| table | dead policy | keys on | why dead |
|---|---|---|---|
| `UserNotificationPreference` | `user_isolation_policy` FOR ALL | `auth.uid()` | reads `request.jwt.claim.sub` / `request.jwt.claims`; NULL on every Prisma connection |
| `in_app_notifications` | `in_app_notifications_select_policy` FOR SELECT | `auth.jwt() ->> 'org_id'` | same |
| `in_app_notifications` | `in_app_notifications_update_policy` FOR UPDATE | `auth.jwt() ->> 'org_id'` | same |

**The dangerous case the brief describes — a table whose only non-bypass policy is dead — does not
exist on either database today.** The two tables that carry a dead policy each carry a satisfiable
`FOR ALL` tenant policy beside it, so the dead one is dead weight, not a lock.

**The real cutover blockers are a different shape than "a dark table": they are a dark COMMAND on a
live table, and a grant gap.** The flat per-table verdict hides them, so §5.2 states them separately.

### Cutover blockers, severity order

| # | Blocker | Evidence | What it needs |
|---|---|---|---|
| **1** | **`"Tenant"` has no INSERT, UPDATE or DELETE policy.** Its only non-bypass policy is `tenant_self_read` **FOR SELECT**. Eleven production write sites break, one of which is already inside the wrapper migration's 456 units. | §5.2, §7 | an UPDATE policy (`id = current_tenant_id()`), an INSERT policy for the bootstrap transaction, and the admin connection (B5) for the sysadmin and delete paths. `bypass-replacement-design.md` §3.1 items 1–3 already designs all three. |
| **2** | **`_prisma_migrations` — RLS enabled, zero policies, zero `app_user` grants.** Safe only while `DIRECT_URL` stays on `postgres`. `apps/web/vercel.json` runs `node scripts/migrate.mjs` as its `buildCommand`, and that script resolves `DIRECT_URL \|\| DATABASE_URL`: if the cutover moves both variables, **every deploy fails at the migration step**. | §5.1 | a decision, recorded: either keep `DIRECT_URL` on a privileged role (and say so in the cutover runbook) or grant `app_user` DML plus a policy. Nothing in the repo records the dependency today. |
| **3** | **`SupportTicket` — 7 of 88 production rows are unreachable by any policy.** `tenantId` is nullable by design; `NULL = current_tenant_id()` is NULL at every GUC value. 3 are OPEN. | §5.3 | the product decision quick-597 §5(c) named and did not make. Unchanged: still 7 rows, still one hard-deleted submitter, still 0 `TicketMessage` rows on them. |
| **4** | **`AutomationRule` — OPEN.** `(scope = 'SYSTEM' OR "tenantId" = current_tenant_id())` FOR ALL with **no explicit `WITH CHECK`**, so PostgreSQL derives the write check from the read predicate. All 6 production rows are `scope = 'SYSTEM'`, so at cutover any tenant-scoped connection may UPDATE or DELETE **every platform automation rule**, and may INSERT a rule naming another tenant. | §6 | an explicit `WITH CHECK` that does not carry the `SYSTEM` branch. No code path exploits it today. |
| **5** | **Three dead policies** (`UserNotificationPreference.user_isolation_policy`, `in_app_notifications_select_policy`, `in_app_notifications_update_policy`). Not a blocker — they grant nothing and deny nothing. | §3, §4 | a tidy-up drop, or a rebuild once a GUC exists that something writes. They are listed so a later reader does not mistake them for enforcement. |
| **6** | **`policy_drop_audit` has no `app_user` grant** (RLS off, 5 rows on production, 9 on staging). It is the only other public table besides `_prisma_migrations` with zero grants. | §5.1 | a grant, or a statement that nothing at runtime reads it. |

---

## 1. Every policy and what its expression depends on

180 policies collapse into **17 distinct `(name, command, permissive, USING, WITH CHECK)` shapes**.
The shape count is the useful unit: 86 of the 180 are byte-identical copies of one expression and 91
are copies of twelve. Every shape below is quoted verbatim from
`pg_get_expr(polqual, polrelid)` / `pg_get_expr(polwithcheck, polrelid)` on production.

**Every policy in the database is PERMISSIVE and applies to `{}` — i.e. PUBLIC, all roles.** There is
no restrictive policy and no role-targeted policy anywhere. (That is deliberate; quick-597 §8 records
why a restrictive policy would silently neuter `bypass_rls_policy`.)

### S1 — `bypass_rls_policy` · ALL · permissive · **86 tables**

```
USING (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK  -- none declared; derived from USING under FOR ALL
```
**Depends on:** GUC `app.bypass_rls`. No column, no function, no subquery.
**Tables (86):** `ActivationProgress AppEvent AutomationRule AutomationRun Customer CustomerInteraction
DispatchOverrideAudit DocFeedback Document DriverHOSEntry DriverIncident DriverInvitation DriverRouteJoin
ExpenseCategory ExpenseTemplate ExpenseTemplateItem FleetMessage FuelRecord GPSLocation Invoice InvoiceItem
Load MaintenanceEvent NotificationLog NotificationSendLog NotificationSubscription PayrollRecord Playbook
PlaybookInstance PlaybookNotification PlaybookStep PlaybookTrigger PushToken Route RouteDriver RouteExpense
RoutePayment RouteStop SafetyEvent ScheduledService StepInstance StepTemplate Subscription SupportTicket
SysAdminInvoice SysAdminInvoiceItem Tag TagAssignment Tenant TenantHealthScore TenantIntegration
TenantMetricsDaily TenantNotificationSettings TicketMessage Truck User UserNotificationPreference audit_log
carrier_compliance_alert_log carrier_document_types carrier_drivers carrier_expenses carrier_truck_defects
carrier_trucks client_contacts clients contracts dispatches document_import_pages document_imports
document_profiles driver_bonuses driver_compensation_templates driver_deductions driver_disputes
driver_pay_audit_logs driver_pay_records driver_settlements facilities facility_external_references
in_app_notifications load_driver_assignments load_pay_components loads pay_component_attachments route_templates`

The four RLS-enabled tables **without** a bypass policy are `stops`, `carrier_documents`,
`route_template_stops` and `route_matrix_cache` — deliberately, per `20260912130000` Part 3.

### S2 — `tenant_isolation_policy` · ALL · permissive · **49 tables**

```
USING      ("tenantId" = current_tenant_id())
WITH CHECK ("tenantId" = current_tenant_id())
```
**Depends on:** column `"tenantId"`; function `public.current_tenant_id()`; transitively GUC
`app.current_tenant_id`.
**Tables (49):** `ActivationProgress AppEvent AutomationRun Customer CustomerInteraction
DispatchOverrideAudit DocFeedback Document DriverInvitation DriverRouteJoin ExpenseCategory ExpenseTemplate
ExpenseTemplateItem FleetMessage FuelRecord GPSLocation Invoice InvoiceItem Load MaintenanceEvent
NotificationLog NotificationSendLog NotificationSubscription PayrollRecord Playbook PlaybookInstance
PlaybookNotification PlaybookStep PlaybookTrigger PushToken Route RouteDriver RouteExpense RoutePayment
RouteStop SafetyEvent ScheduledService StepInstance StepTemplate Subscription SysAdminInvoice
SysAdminInvoiceItem TenantHealthScore TenantIntegration TenantMetricsDaily TenantNotificationSettings Truck
User UserNotificationPreference`

### S3 — `tenant_isolation_policy` · ALL · permissive · **`AutomationRule`**

```
USING      ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
WITH CHECK  -- none declared; derived from USING
```
**Depends on:** columns `scope`, `"tenantId"`; enum type `"AutomationScope"`; `current_tenant_id()`;
GUC `app.current_tenant_id`. **The `scope` branch depends on no GUC at all** — see §6.

### S4 — `tenant_isolation_policy` · ALL · permissive · **3 tables**

```
USING      ("tenantId" = current_tenant_id())
WITH CHECK  -- none declared; derived from USING
```
**Depends on:** as S2. **Tables:** `DriverHOSEntry DriverIncident SupportTicket`.
Differs from S2 only in that the check is derived rather than declared — same predicate, but it is the
shape in which `SupportTicket`'s nullable key bites (§5.3).

### S5 — `tenant_isolation_policy` · ALL · permissive · **2 tables**

```
USING      (("tenantId")::text = current_setting('app.current_tenant_id'::text, true))
WITH CHECK  -- none declared; derived from USING
```
**Depends on:** column `"tenantId"`; **GUC `app.current_tenant_id` read inline**, not through
`current_tenant_id()`. **Tables:** `Tag TagAssignment`.
Text-to-text with no cast and no `NULLIF`, so it filters silently rather than raising — the distinction
`bypass-replacement-design.md` §1.3(b) drew against `audit_log`, which used to cast. `audit_log` no
longer does (S9), leaving these two as the only policies that read the GUC without the helper.

### S6 — `tenant_self_read` · **SELECT** · permissive · **`Tenant`**

```
USING (id = current_tenant_id())
```
**Depends on:** column `id`; `current_tenant_id()`; GUC `app.current_tenant_id`.
**The only policy on `"Tenant"` other than the bypass, and it is `FOR SELECT`.** Blocker 1.

### S7 — `tenant_isolation_policy` · ALL · permissive · **`TicketMessage`**

```
USING ("ticketId" IN ( SELECT "SupportTicket".id
                         FROM "SupportTicket"
                        WHERE ("SupportTicket"."tenantId" = current_tenant_id())))
WITH CHECK  -- none declared; derived from USING
```
**Depends on:** column `"ticketId"`; **table `"SupportTicket"` and its columns `id`, `"tenantId"`**;
`current_tenant_id()`; GUC `app.current_tenant_id`. `"SupportTicket"` carries RLS itself, so this
policy's satisfiability is contingent on that table's — measured satisfiable in quick-597 §2.2.

### S8 — `user_isolation_policy` · ALL · permissive · **`UserNotificationPreference`** — **DEAD**

```
USING      ("userId" = auth.uid())
WITH CHECK ("userId" = auth.uid())
```
**Depends on:** column `"userId"`; function `auth.uid()`; transitively GUCs
`request.jwt.claim.sub` and `request.jwt.claims`, and the JSON claim `sub`. §3.

### S9 — `tenant_isolation_policy` · ALL · permissive · **`audit_log`**

```
USING (tenant_id = current_tenant_id())
WITH CHECK  -- none declared; derived from USING
```
**Depends on:** column `tenant_id`; `current_tenant_id()`; GUC `app.current_tenant_id`.
The `::uuid` cast quick-597 change 1 removed is gone on production as well as staging — confirmed in
this sweep. The derived `WITH CHECK` still contradicts `writeAuditLog`'s stated contract; that is
quick-597 §5(b), unchanged and not re-measured here.

### S10 — `tenant_isolation_policy` · ALL · permissive · **20 tables**

```
USING      (org_id = current_tenant_id())
WITH CHECK (org_id = current_tenant_id())
```
**Depends on:** column `org_id`; `current_tenant_id()`; GUC `app.current_tenant_id`.
**Tables (20):** `carrier_compliance_alert_log carrier_document_types carrier_drivers carrier_expenses
carrier_truck_defects carrier_trucks client_contacts clients contracts dispatches document_import_pages
document_imports document_profiles driver_pay_records facilities facility_external_references
in_app_notifications loads route_matrix_cache route_templates`

`route_matrix_cache` being in this list is a **correction to `bypass-replacement-design.md` §2.3/§2.5**,
which recorded it as `relrowsecurity = false`, zero policies, no `app_user` grant. On production today
it has RLS on, a satisfiable `tenant_isolation_policy`, and full DML to `app_user`. CLAUDE.md's note
that it "returns zero rows and silently stops caching when that role flips" is now stale in both
directions — the grant exists and the policy exists.

### S11 — `tenant_isolation_policy` · ALL · permissive · **`carrier_documents`**

```
USING / WITH CHECK (EXISTS ( SELECT 1 FROM "User" u
                              WHERE ((u.id = carrier_documents.uploaded_by)
                                AND (u."tenantId" = current_tenant_id()))))
```
**Depends on:** column `uploaded_by`; **table `"User"`, columns `id` and `"tenantId"`**;
`current_tenant_id()`; GUC `app.current_tenant_id`.

### S12 — `tenant_isolation_policy` · ALL · permissive · **9 tables**

```
USING      (tenant_id = current_tenant_id())
WITH CHECK (tenant_id = current_tenant_id())
```
**Depends on:** column `tenant_id`; `current_tenant_id()`; GUC `app.current_tenant_id`.
**Tables (9):** `driver_bonuses driver_compensation_templates driver_deductions driver_disputes
driver_pay_audit_logs driver_settlements load_driver_assignments load_pay_components
pay_component_attachments`

### S13 — `in_app_notifications_insert_policy` · **INSERT** · permissive · **`in_app_notifications`**

```
USING       -- none; INSERT policies carry only WITH CHECK
WITH CHECK (org_id = current_tenant_id())
```
**Depends on:** column `org_id`; `current_tenant_id()`; GUC `app.current_tenant_id`.
Confirmed on production as the repaired form — quick-597 change 4 replaced `WITH CHECK (true)`. Had it
still read `true` this sweep would have reported it as the one genuinely OPEN write door.

### S14 — `in_app_notifications_select_policy` · **SELECT** · permissive — **DEAD**

```
USING (org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)
```
**Depends on:** column `org_id`; function `auth.jwt()`; transitively GUCs `request.jwt.claim` and
`request.jwt.claims`, and the JSON claim `org_id`. §3.

### S15 — `in_app_notifications_update_policy` · **UPDATE** · permissive — **DEAD**

Identical expression to S14, on the UPDATE command. Same dependencies, same verdict.

### S16 — `tenant_isolation_policy` · ALL · permissive · **`route_template_stops`**

```
USING / WITH CHECK (EXISTS ( SELECT 1 FROM route_templates rt
                              WHERE ((rt.id = route_template_stops.route_template_id)
                                AND (rt.org_id = current_tenant_id()))))
```
**Depends on:** column `route_template_id`; **table `route_templates`, columns `id` and `org_id`**;
`current_tenant_id()`; GUC `app.current_tenant_id`.

### S17 — `tenant_isolation_policy` · ALL · permissive · **`stops`**

```
USING / WITH CHECK (EXISTS ( SELECT 1 FROM dispatches d
                              WHERE ((d.id = stops.dispatch_id)
                                AND (d.org_id = current_tenant_id()))))
```
**Depends on:** column `dispatch_id`; **table `dispatches`, columns `id` and `org_id`**;
`current_tenant_id()`; GUC `app.current_tenant_id`.

**Accounting:** 86+49+1+3+2+1+1+1+1+20+1+9+1+1+1+1+1 = **180 ✓**

### The helper functions, read from `pg_proc` on production

```sql
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID; $$        -- prosecdef = false

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  select coalesce(nullif(current_setting('request.jwt.claim',  true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$
```

None is `SECURITY DEFINER`. `current_tenant_id()` `NULLIF`s the empty string, which is why the pool's
`''` default filters instead of raising; that is the single most load-bearing line in the whole policy
corpus.

---

## 2. GUC census

Five distinct GUC names are reachable from the 180 policies, three of them only transitively through
`auth.uid()` / `auth.jwt()`.

| GUC | policies depending on it | writers in the repository | verdict |
|---|---|---|---|
| `app.current_tenant_id` | **91** | **12 source sites** (below) | **LIVE** |
| `app.bypass_rls` | **86** | 773 occurrences repo-wide, ~210 executable sites in `apps/web/src` | **LIVE** (and being removed — that is the whole Phase 0 programme) |
| `request.jwt.claims` | **3** | **1**, and it cannot satisfy either policy | **DEAD on every request path** |
| `request.jwt.claim` | **2** | **0** | **DEAD** |
| `request.jwt.claim.sub` | **1** | **0** | **DEAD** |
| `app.current_user_id` | **0** | **0** | dead, and now depended on by nothing — see the note below |

91 + 86 + 3 = 180 when the three dead policies are counted once each (`in_app_notifications`'s two
policies each depend on both `request.jwt.claim` and `request.jwt.claims`; `UserNotificationPreference`'s
depends on `request.jwt.claim.sub` and `request.jwt.claims`).

### `app.current_tenant_id` — the 12 writers

```
$ grep -rn "set_config(\s*['\"`]app\.current_tenant_id" apps/web/src
apps/web/src/lib/db/prisma.ts:69                                 set_config('app.current_tenant_id', '', false)   <- the pool's per-connection default
apps/web/src/lib/db/extensions/tenant-rls.ts:13                  (doc comment)
apps/web/src/lib/db/extensions/tenant-rls-bound.prototype.ts:76  "SELECT set_config('app.current_tenant_id', $1, true)"   <- unwired prototype
apps/web/src/lib/context/tenant-context.ts:179                   "SELECT set_config('app.current_tenant_id', $1, false)"
apps/web/src/lib/context/tenant-context.ts:205                   "SELECT set_config('app.current_tenant_id', $1, false)"
apps/web/src/lib/context/tenant-context.ts:225                   set_config('app.current_tenant_id', ${tenantId}, TRUE)
apps/web/src/lib/integrations/samsara.ts:109, :169
apps/web/src/lib/integrations/motive.ts:116, :174
apps/web/src/app/api/auth/login/route.ts:74, :113
```

`tenant-context.ts` is the one that matters: `getTenantPrisma` and `getTenantPrismaForOrg` both write
the GUC there, and they are acquired at **449 `await` call sites across the 456 units** the wrapper
migration will move. Re-counted in this task and unchanged from `wrapper-migration-scope.md`:
`await getTenantPrisma(` = 369, `await getTenantPrismaForOrg(` = 80, total 449.

**`withTenantContext` does not exist yet** — `grep -n "withTenantContext" apps/web/src/lib/context/tenant-context.ts`
returns nothing. The migration is unstarted.

### `app.current_user_id` — zero writers, and now zero dependants

```
$ grep -rn "app\.current_user_id" apps/web/{src,scripts,prisma,tests,tests-db}
apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql:11    (comment)
apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql:176   (comment, quoting the dropped policy)
apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql:179   (comment)
apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql:291   (comment, the rollback block)
apps/web/prisma/migrations/20260327000006_add_push_token/migration.sql:23                     CREATE POLICY ... (dropped by the above)
apps/web/src/lib/notifications/send-push.ts:19-20                                             (comment)
apps/web/src/lib/auth/mobile-auth.ts:21                                                       (comment)
```

**Seven hits, zero of them a write.** Four are comments in the migration that dropped the only policy
that read it; one is the `CREATE POLICY` that migration dropped; two are prose in application files
recording that nothing sets it. `packages/` returns no match at all. The GUC is unwritten and, since
quick-597 dropped `"PushToken".user_isolation_policy`, unread — it no longer appears in any of the 180.

### `request.jwt.*` — one writer, and it satisfies nothing

```
$ grep -rn "request\.jwt\.claim" apps/web/{src,scripts,prisma,tests,tests-db}
apps/web/prisma/seeds/seed-fleet-intelligence.ts:33
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', '{"app_metadata":{"bypass_rls":true}}', TRUE)`;
apps/web/prisma/migrations/20260909120000_reconcile_rls_policy_drift/migration.sql:59   (comment)
```

**One writer, and it is a seed script, not a request path.** `npm run seed:fleet` is invoked by hand.
Its payload is `{"app_metadata":{"bypass_rls":true}}` — no `sub` key, so `auth.uid()` still returns NULL,
and no `org_id` key, so `auth.jwt() ->> 'org_id'` still returns NULL. **Even the one writer cannot
satisfy either dead policy.** `request.jwt.claim` and `request.jwt.claim.sub` have no writer anywhere,
in `apps/`, `packages/` or the root scripts.

### Role- and database-level defaults

```
$ grep -rniE "ALTER (ROLE|DATABASE|USER)\s+\S+\s+SET" .
apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql:314
  ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';
.planning/quick/595-.../595-PLAN.md:344   (the same statement, quoted)
```

**The only `ALTER ROLE … SET` in the repository sets a timeout, not a GUC any policy reads.** There is
no `ALTER DATABASE … SET`, and no `postgresql.conf` route is available on Supabase. So the only way any
of the five GUCs acquires a value is a `set_config` in application code, which is what the table above
enumerates.

---

## 3. `auth.uid()` / `auth.jwt()` — measured, not argued

Three policies key on these. All three are **dead on the Prisma path**. Four independent measurements,
each quoted with its query.

### 3.1 As `app_user` on staging — the GUCs those functions read are NULL

`STAGING_DATABASE_URL_APP_USER`, one fresh `pg.Client` per case, each case inside
`BEGIN READ ONLY … ROLLBACK`.

```
-- role
SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)
=>  [{"current_user":"app_user","rolbypassrls":false}]

-- gucs   (GUC case: app.current_tenant_id untouched by the script)
SELECT current_setting('app.current_tenant_id',true), current_setting('request.jwt.claims',true),
       current_setting('request.jwt.claim',true),     current_setting('request.jwt.claim.sub',true),
       current_setting('app.current_user_id',true)
=>  [{"app_current_tenant_id":null,"request_jwt_claims":null,"request_jwt_claim":null,
      "request_jwt_claim_sub":null,"app_current_user_id":null}]
```

Repeated with `app.current_tenant_id` set to `''` and to a real UUID. **All three `request.jwt.*` GUCs
are NULL in every case**, and `app.current_user_id` with them:

```
GUC case ''                                       => request_jwt_claims: null, request_jwt_claim: null, request_jwt_claim_sub: null
GUC case '00000000-0000-0000-0000-000000000001'   => request_jwt_claims: null, request_jwt_claim: null, request_jwt_claim_sub: null
```

### 3.2 As `app_user` on staging — the function BODIES, inlined, return NULL

The bodies are copied verbatim from `pg_proc` (§1). Inlining them is the only way to evaluate the
functions as `app_user` — see 3.4 for why a direct call cannot be made.

```
SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
                (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid  AS auth_uid_body,
       (coalesce(nullif(current_setting('request.jwt.claim',true),''),
                 nullif(current_setting('request.jwt.claims',true),''))::jsonb ->> 'org_id')::uuid AS auth_jwt_org_id_body,
       (SELECT count(*) FROM in_app_notifications) AS ian_rows
=>  {"auth_uid_body":null,"auth_jwt_org_id_body":null,"ian_rows":"0"}
```

`"userId" = NULL` and `org_id = NULL` are NULL, never TRUE. Both policies admit nothing.

### 3.3 Against real rows — on production, over 190 live `in_app_notifications` rows

Staging carries **0** rows in both tables (`UserNotificationPreference` 0, `in_app_notifications` 0 —
quoted above), so the in-situ half could not be measured there without writing fixtures, which this
task is forbidden to do. It was instead measured on **production, read-only, as `postgres`**, by
evaluating the two predicates as ordinary expressions over the real rows. The result does not depend on
the role: `auth.jwt()` returns NULL on this connection too, which the last line shows.

```
-- app.current_tenant_id set (transaction-local) to the org_id owning the most rows
SELECT count(*) AS total,
       count(*) FILTER (WHERE org_id = current_tenant_id())                         AS admitted_tenant_isolation_policy,
       count(*) FILTER (WHERE org_id = ((auth.jwt() ->> 'org_id')::uuid))           AS admitted_select_policy_authjwt,
       count(*) FILTER (WHERE (org_id = ((auth.jwt() ->> 'org_id')::uuid)) IS NULL) AS authjwt_predicate_null
FROM in_app_notifications
=>  {"total":190,"admitted_tenant_isolation_policy":90,"admitted_select_policy_authjwt":0,"authjwt_predicate_null":190}

SELECT auth.jwt()::text, auth.uid()::text
=>  {"j":null,"u":null}
```

**The live policy admits 90 of 190 real rows; the dead one admits 0, and its predicate is NULL — not
false — for all 190.** The same `SELECT auth.uid(), auth.jwt()` returns NULL on both databases as
`postgres` with no PostgREST in the path.

### 3.4 A separate finding: `app_user` cannot call `auth.uid()` by name at all

The first probe run returned, for every GUC case:

```
SELECT auth.uid()::text, auth.jwt()::text, (auth.jwt() ->> 'org_id')
=>  ERROR [42501] permission denied for schema auth
```

This is **not** the reason the policies are dead, and it is worth being precise about, because reading
it the wrong way would predict that every query against those two tables errors at cutover — which is
false, and quick-597 §2.2 already measured it as false (`in_app_notifications` read cleanly as
`app_user`, returning 0 rows, not an error).

Measured cause, on both databases:

```
SELECT has_schema_privilege('app_user','auth','USAGE'),
       has_function_privilege('app_user','auth.uid()','EXECUTE'),
       has_function_privilege('app_user','auth.jwt()','EXECUTE')
=>  production: {"schema_auth_usage":false,"exec_auth_uid":true,"exec_auth_jwt":true}
=>  staging   : {"schema_auth_usage":false,"exec_auth_uid":true,"exec_auth_jwt":true}
```

`app_user` holds EXECUTE on both functions and lacks USAGE on the schema. Schema USAGE is checked
during **name resolution**, which happens when ad-hoc SQL is parsed — so a hand-written
`SELECT auth.uid()` raises. A policy expression is stored in `pg_policy` as an already-resolved node
tree carrying the function's OID; no name is resolved at query time, so the stored expression evaluates
normally and simply returns NULL. Two consequences worth recording:

- **The three dead policies fail closed, silently, exactly as described** — no error, no rows.
- **Any future attempt to repair them in place, or any application query that calls `auth.uid()`
  directly, will fail with `42501` under `app_user` until schema USAGE is granted.** That is a separate
  latent trap and is not on any current checklist.

---

## 4. Per-table verdicts

91 tables carry `relrowsecurity = true`; 90 are `relforcerowsecurity = true`
(`_prisma_migrations` is the one that is not). 8 further public tables have RLS off entirely:
`NotificationEmailConfig NotificationTemplate Plan Promo carrier_catalog_meta grid_preference grid_view
policy_drop_audit`. They are outside the policy question by construction and appear here only in §5.1.

| verdict | count | tables |
|---|---|---|
| **LIVE** | **89** | every RLS-enabled table except the two below |
| **OPEN** | **1** | `AutomationRule` |
| **DARK** | **0** | — |
| **NO_POLICY** | **1** | `_prisma_migrations` |
| **total** | **91 ✓** | |

`AutomationRule` is counted once, as OPEN. It is also LIVE in the narrow sense — its `"tenantId"`
branch is satisfiable — but the verdict that matters for a cutover is the one that describes what the
policy lets through, so OPEN takes precedence and the counts stay exclusive.

**The two tables that carry a dead policy are LIVE**, and the reason is worth stating because it is the
difference between an untidy database and an outage:

| table | policies | verdict |
|---|---|---|
| `UserNotificationPreference` | `bypass_rls_policy` ALL · `tenant_isolation_policy` ALL (live) · `user_isolation_policy` ALL (**dead**) | **LIVE** — the dead one is permissive, so it is OR'd in and contributes nothing in either direction |
| `in_app_notifications` | `bypass_rls_policy` ALL · `tenant_isolation_policy` ALL (live) · `in_app_notifications_insert_policy` INSERT (live) · `_select_policy` SELECT (**dead**) · `_update_policy` UPDATE (**dead**) | **LIVE** — `tenant_isolation_policy` is `FOR ALL` and already covers SELECT and UPDATE correctly |

### 4.1 The extension the flat verdict hides — dark COMMANDS on live tables

A table can be LIVE and still have a command no live non-bypass policy covers. Computed over all 91,
treating `FOR ALL` as covering all four commands and deriving the INSERT check from `USING` where
PostgreSQL does:

| table | commands with no live non-bypass policy | `app_user` grants |
|---|---|---|
| **`Tenant`** | **INSERT, UPDATE, DELETE** | SELECT, INSERT, UPDATE, DELETE |
| **`_prisma_migrations`** | SELECT, INSERT, UPDATE, DELETE | **none** |

**Two, and no others.** Every other RLS-enabled table has a `FOR ALL` live policy. `Tenant` is the
blocker: it has the grants, so `app_user` is permitted to write the row and the policy then refuses it —
an `ERROR 42501 new row violates row-level security policy`, not a silent zero.

### 4.2 Satisfiable policy, unsatisfiable ROWS

The predicate being satisfiable does not mean every row can satisfy it. Measured on production for all
85 policies whose key is a single column, plus the five join- and disjunction-based policies:

| table | key | rows | rows no policy can admit |
|---|---|---|---|
| `SupportTicket` | `"tenantId"` (**nullable**) | 88 | **7** |
| `stops` | `dispatch_id` → `dispatches.org_id` | 798 | 0 (no orphan, no null `org_id`) |
| `carrier_documents` | `uploaded_by` → `"User"."tenantId"` | 46 | 0 (no null FK, no orphan, no null tenant) |
| `route_template_stops` | `route_template_id` → `route_templates.org_id` | 31 | 0 |
| `TicketMessage` | `"ticketId"` → `"SupportTicket"."tenantId"` | 4 | 0 (none of the 4 hangs off a null-tenant ticket) |
| `AutomationRule` | `scope` OR `"tenantId"` | 6 | 0 (all 6 are `scope = 'SYSTEM'`) |
| every other RLS table | — | — | **0** — the key column is `NOT NULL` with no null rows |

**`SupportTicket` is the only table in the database with rows no policy can reach.** Unchanged in count
from quick-597's preflight; the table has grown from 87 rows to 88 and the 7 are the same 7.

---

## 5. What is not LIVE, and what reads it

### 5.1 NO_POLICY — `_prisma_migrations`

`relrowsecurity = true`, `relforcerowsecurity = **false**`, **zero policies including no
`bypass_rls_policy`**, and **no `app_user` grant of any kind**. Production holds 152 rows, staging 151.

It is reachable today only because the connection is `postgres`, which both owns the table (and force
is off) and carries `rolbypassrls`. Under `app_user` the failure is `42501 permission denied` on the
grant, before RLS is ever consulted — so this is a grant blocker wearing a policy blocker's clothes.

**What reads and writes it, by file and line:**

| File:line | Statement |
|---|---|
| `apps/web/scripts/migrate.mjs:124` | `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (…)` |
| `apps/web/scripts/migrate.mjs:137` | `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL` |
| `apps/web/scripts/migrate.mjs:147` | `DELETE FROM "_prisma_migrations" WHERE "finished_at" IS NULL` |
| `apps/web/scripts/migrate.mjs:167` | `INSERT INTO "_prisma_migrations" (…)` |
| `apps/web/scripts/audit/app-user-grant-audit.ts:95` | excluded from the grant sweep by name |
| `apps/web/scripts/audit/app-user-harness-targets.ts:26, :53` | named as predicted class (a) and the sole class (c) |
| `apps/web/scripts/audit/verify-phase1-grants.ts:75` | named in the expected-no-grant list |
| `apps/web/scripts/audit/rls-policy-drift.ts:54` | documented as expected to have RLS with no policies |

**What goes dark, and when.** `migrate.mjs:108` resolves `process.env.DIRECT_URL || process.env.DATABASE_URL`.
`apps/web/vercel.json` sets `"buildCommand": "node scripts/migrate.mjs && prisma generate && next build"`,
and `apps/web/package.json:10` sets `"start": "node scripts/migrate.mjs && next start"`.

- If the cutover moves **`DATABASE_URL` only**, nothing goes dark: the applier keeps using `DIRECT_URL`.
- If the cutover moves **both**, **every Vercel build fails at the first migration step** — before the
  app is reached, so it is loud rather than silent. That is the better failure mode, but it is
  undocumented: nothing in the repo records that `DIRECT_URL` must stay privileged.

**No application request path reads this table.** Zero hits in `apps/web/src`. It is a cutover
*sequencing* item, not a live-surface blocker.

`policy_drop_audit` is the same grant shape without the RLS: RLS off, zero policies, **no `app_user`
grant**, 5 rows on production and 9 on staging. Written only by migration SQL. Zero hits in
`apps/web/src`. A cleanup item.

### 5.2 The blocker the per-table verdict hides — `"Tenant"` writes

`"Tenant"` is LIVE for SELECT and has no INSERT, UPDATE or DELETE policy at all. **Eleven production
write sites**, enumerated by
`grep -rn "\.tenant\.(create|update|delete|upsert|updateMany|deleteMany)" apps/web/src` with tests
excluded:

| File:line | Statement | What breaks |
|---|---|---|
| `apps/web/src/app/(owner)/settings/operations/actions.ts:40` | `tenantPrisma.tenant.update(…)` | **`/settings/operations` — the only UI for both Document Import inspection settings.** The sharpest case: it runs on a **correctly scoped** client (`getTenantPrismaForOrg(session.tenantId, session.userId)` at :39) with the GUC set, and still fails, because `tenant_self_read` is `FOR SELECT`. |
| `apps/web/src/lib/onboarding/hydrate-tenant.ts:41` | `tx.tenant.update({ provisioningPhase: HYDRATED })` | sample-data seeding is never marked complete |
| `apps/web/src/app/api/email-confirm/[token]/route.ts:67` | `tx.tenant.update({ emailConfirmedAt })` | email confirmation never records |
| `apps/web/src/lib/onboarding/provision-tenant.ts:59` | `tx.tenant.create(…)` | **sign-up** |
| `apps/web/src/lib/db/repositories/tenant.repository.ts:35` | `tx.tenant.create(…)` | the repository twin of sign-up |
| `apps/web/src/app/(admin)/actions/tenants.ts:98` | `prisma.tenant.create(…)` | sysadmin tenant creation |
| `apps/web/src/app/(admin)/actions/tenants.ts:190, :229, :432, :542` | `prisma.tenant.update(…)` ×4 | sysadmin tenant edits, status, trial |
| `apps/web/src/app/(admin)/actions/tenants.ts:625` | `prisma.tenant.delete(…)` | sysadmin tenant deletion |

Seven of these eleven are outside the 211 bypass sites and outside every prior count — the same seven
`bypass-replacement-design.md` §1.3(a) flagged. This sweep confirms them and adds the exact line for
each. The remedy is already designed (§3.1 items 1–3 of that document) and is not restated here.

### 5.3 The only rows no policy can reach — `SupportTicket`

7 of 88 production rows carry `tenantId IS NULL`. Read off production in this sweep:

| ticket | status | created |
|---|---|---|
| TKT-0001 | CLOSED | 2026-03-28 |
| TKT-0036 | CLOSED | 2026-05-17 |
| TKT-0037 | CLOSED | 2026-05-17 |
| TKT-0038 | **OPEN** | 2026-05-17 |
| TKT-0044 | **OPEN** | 2026-05-18 |
| TKT-0061 | **OPEN** | 2026-05-19 |
| TKT-0067 | CLOSED | 2026-07-17 |

Identical to quick-597's preflight set. **What reads them today:** only the sysadmin dashboard, via
`getAllTickets` in `apps/web/src/actions/support-tickets.ts` (the raw `$queryRaw` at :239-240), which
works solely because `postgres` carries `BYPASSRLS`. `getMyTickets` (:217) and `getTicketById` (:371)
both filter `submittedBy: userId` and the submitter is a hard-deleted user, so no tenant-facing path
reaches them. **What goes dark at cutover:** the 3 OPEN tickets disappear from the sysadmin ticket
list. Still a product decision, still not made here.

---

## 6. OPEN — `AutomationRule`

```sql
tenant_isolation_policy  FOR ALL  PERMISSIVE  TO PUBLIC
  USING      ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
  WITH CHECK  -- none declared; PostgreSQL derives it from USING
```

**What the predicate actually permits.**

The `scope = 'SYSTEM'` branch references **no GUC and no tenant**. It is true or false purely on the
row's own data, so it is satisfied identically by a correctly scoped connection, a GUC-less cron, and a
connection scoped to any other tenant. Measured as `app_user` on staging with the GUC untouched, set to
`''`, and set to a foreign UUID — the result is the same in all three cases:

```
SELECT count(*) AS visible_rows, count(*) FILTER (WHERE scope='SYSTEM') AS system_scope,
       count(*) FILTER (WHERE "tenantId" IS NULL) AS null_tenant FROM "AutomationRule"
=>  {"visible_rows":"6","system_scope":"6","null_tenant":"6"}     -- all three GUC cases
```

Production carries the same 6 rows, all `scope = 'SYSTEM'`, all `tenantId IS NULL`. **There is not one
TENANT-scope row in either database**, so the `"tenantId"` branch has never decided anything and the
table is, in practice, fully visible to any connection holding a grant.

For **reads** that is defensible: a SYSTEM automation rule is platform configuration, not tenant data.

For **writes** it is not, and that is the finding. Because no `WITH CHECK` is declared on a `FOR ALL`
policy, PostgreSQL derives the write check from the read predicate — so the tenant-independent branch
becomes a write permission:

- **INSERT** — a connection scoped to tenant A may insert a row with `scope = 'SYSTEM'` and **any**
  `tenantId`, including tenant B's. The check passes on the `scope` branch before `tenantId` is
  considered.
- **UPDATE / DELETE** — a connection scoped to any tenant, or to none, may modify or delete **all 6
  production rows**, since every one of them satisfies `scope = 'SYSTEM'`. That includes flipping
  `isActive` on every platform behavioural-email rule, and rewriting `actionsJson`.

`app_user` holds full `SELECT, INSERT, UPDATE, DELETE` on the table, so nothing else stands in the way
once the bypass is gone.

**Does any current code path exploit it?** No — not deliberately and not accidentally. Every site is
enumerated by `grep -rn "automationRule" apps/web/src --exclude-dir=generated`, which returns six:

| File:line | Statement | Guard |
|---|---|---|
| `apps/web/src/app/(admin)/actions/automations.ts:20` | `prisma.automationRule.findMany` | `requireAdminAccess()` at :19 |
| `apps/web/src/app/(admin)/actions/automations.ts:42` | `prisma.automationRule.findUnique` | `requireAdminAccess()` |
| `apps/web/src/app/(admin)/actions/automations.ts:70` | **`prisma.automationRule.update({ data: { isActive } })`** — the only write in the repo | `requireAdminAccess()` |
| `apps/web/src/app/(admin)/actions/automations.ts:97` | `prisma.automationRule.findUnique` | `requireAdminAccess()` |
| `apps/web/src/app/api/cron/automations/route.ts:135` | `prisma.automationRule.findUnique` | cron secret |
| `apps/web/src/lib/automations/evaluator.ts:72` | `prisma.automationRule.findMany` | called from the cron sweep |

All six use the bare `prisma` client — **none of them is one of the 456 units**, and the single write is
behind `isSystemAdmin()`. So the openness is entirely latent: today the application is the only thing
enforcing it, and at cutover the database still will not.

The read side is arguably intended and the write side is arguably an oversight; distinguishing them is
a one-line `WITH CHECK`, and naming that is as far as this document goes.

---

## 7. Cross-check against the `withTenantContext` migration

`wrapper-migration-scope.md` counts **456 units across 198 files** that acquire a tenant client.
Re-counted today, unchanged: `await getTenantPrisma(` = 369, `await getTenantPrismaForOrg(` = 80,
449 call sites, and the AST-derived unit count of 456 stands. `withTenantContext` itself does not exist
yet — the migration is unstarted.

| table | verdict | units of the 456 that touch it | classification |
|---|---|---|---|
| `_prisma_migrations` | NO_POLICY | **0** — every reader is `apps/web/scripts/migrate.mjs` or an `apps/web/scripts/audit/*` script, none of which acquires a tenant client; zero hits anywhere in `apps/web/src` | **cleanup / sequencing item.** Not a live-surface blocker. It becomes a *build* blocker only if `DIRECT_URL` moves with `DATABASE_URL`. |
| `AutomationRule` | OPEN | **0** — all six call sites use the bare `prisma` client | **latent.** The wrapper migration neither fixes nor worsens it; only a `WITH CHECK` does. |
| `"Tenant"` (writes) | LIVE for SELECT, no policy for INSERT/UPDATE/DELETE | **1** — `saveOperationsSettings` in `apps/web/src/app/(owner)/settings/operations/actions.ts`, which calls `getTenantPrismaForOrg` at :39 and writes at :40 | **cutover blocker on a live surface.** It is the one case where the wrapper migration actively *delivers a request to a policy that will refuse it*. The other ten `Tenant` writers are bootstrap or sysadmin and belong to the admin connection (B5). |
| `SupportTicket` (7 null-tenant rows) | LIVE, rows unreachable | the 4 sites `bypass-replacement-design.md` §1.3(c) lists are bypass sites on the bare client, **0 of 456** | product decision, unchanged. |

**There is no dark table sitting under a live surface.** The one thing that fits that description is a
dark *command* — `Tenant` UPDATE — and exactly one of the 456 units drives it.

---

## 8. What this task did not measure

Stated so nobody reads a gap as a clearance.

1. **No in-situ row measurement of the two dead policies as `app_user`.** Both tables are empty on
   staging (measured: 0 and 0), production has no `app_user` connection string in any env file, and
   seeding a fixture is a write this task is forbidden to make. §3.3 measures the predicates over 190
   real production rows instead, as `postgres`, having first shown that `auth.jwt()` returns NULL on
   that connection too. That is sound but it is an expression evaluation, not a policy evaluation.
2. **No write probe of any kind.** The `Tenant` UPDATE refusal and the `AutomationRule` cross-tenant
   INSERT acceptance are both derived from the policy corpus, not executed. quick-597 demonstrated the
   equivalent shape on `in_app_notifications` with `BEGIN … ROLLBACK`; repeating it for these two needs
   a task whose scope permits it.
3. **`audit_log`'s derived `WITH CHECK` was not re-measured.** quick-597 §5(b) leaves it PARTIAL — the
   `22P02` is closed, the contract conflict is not. This sweep confirms the policy's current expression
   (S9, no cast) and nothing further.
4. **Grants were checked only for RLS-enabled tables plus the nine `app-user-harness-targets.ts` names.**
   Production's only zero-grant public tables are `_prisma_migrations` and `policy_drop_audit`; the
   other seven of the predicted class (a) now hold grants. `grid_preference` is on production and
   absent from staging, which is a schema drift this task noticed and did not investigate.
5. **`bypass_rls_policy` is untouched and uncounted in every verdict.** 86 rows before and after, same
   table set on both databases.

---

## Appendix — the 91 RLS-enabled tables

**LIVE (89).** `ActivationProgress AppEvent AutomationRun Customer CustomerInteraction
DispatchOverrideAudit DocFeedback Document DriverHOSEntry DriverIncident DriverInvitation DriverRouteJoin
ExpenseCategory ExpenseTemplate ExpenseTemplateItem FleetMessage FuelRecord GPSLocation Invoice InvoiceItem
Load MaintenanceEvent NotificationLog NotificationSendLog NotificationSubscription PayrollRecord Playbook
PlaybookInstance PlaybookNotification PlaybookStep PlaybookTrigger PushToken Route RouteDriver RouteExpense
RoutePayment RouteStop SafetyEvent ScheduledService StepInstance StepTemplate Subscription SupportTicket
SysAdminInvoice SysAdminInvoiceItem Tag TagAssignment Tenant TenantHealthScore TenantIntegration
TenantMetricsDaily TenantNotificationSettings TicketMessage Truck User UserNotificationPreference audit_log
carrier_compliance_alert_log carrier_document_types carrier_documents carrier_drivers carrier_expenses
carrier_truck_defects carrier_trucks client_contacts clients contracts dispatches document_import_pages
document_imports document_profiles driver_bonuses driver_compensation_templates driver_deductions
driver_disputes driver_pay_audit_logs driver_pay_records driver_settlements facilities
facility_external_references in_app_notifications load_driver_assignments load_pay_components loads
pay_component_attachments route_matrix_cache route_template_stops route_templates stops`

**OPEN (1).** `AutomationRule`

**DARK (0).** —

**NO_POLICY (1).** `_prisma_migrations`

89 + 1 + 0 + 1 = **91 ✓**

### Provenance

Every number above comes from one of five read-only scripts run from the repo root against
`DIRECT_URL` (production, as `postgres`), `STAGING_DIRECT_URL` (staging, as `postgres`) and
`STAGING_DATABASE_URL_APP_USER` (staging, as `app_user`). They were written to the session scratchpad,
not to the repository, because this task may not add files outside `docs/audits/`. Each refuses to
start if the resolved URL does not contain the expected project ref or does contain the other one, and
every statement runs inside `BEGIN READ ONLY … ROLLBACK`.

| script | what it produced |
|---|---|
| `enumerate.js` | `pg_policy` / `pg_class` / `role_table_grants` / `pg_proc` dumps from both databases → `policies.json` |
| `analyse.js` | the 17 shapes, the dependency extraction, the GUC census, the per-table verdicts |
| `percmd.js` | per-command live coverage (§4.1) and the `app_user` grant sweep |
| `appuser.js` / `authpriv.js` | the §3 measurements as `app_user` on staging |
| `nullkeys.js` / `orphans.js` / `predicate.js` / `counts.js` / `final.js` | §4.2 row-level satisfiability, §3.3, and the alignment table in §0 |
