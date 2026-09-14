# Every trigger in the cutover path, and what it needs

**Date:** 2026-09-14
**Status:** MEASUREMENT ONLY. No grant, trigger, policy, migration or application file was changed.
Production and staging were opened with `BEGIN READ ONLY` and `SELECT` only — no DDL, no DML, not
even a rolled-back write probe.
**Predecessors:** `docs/audits/admin-connection.md` §5 (the two grants found only by running the
matrix) · `docs/audits/policy-satisfiability-sweep.md` · `docs/audits/bypass-replacement-design.md`
§4.1 · `docs/audits/wrapper-migration-scope.md`
**Answers:** the question `admin-connection.md` §5 raised and did not generalise — *a trigger inherits
the caller's role unless it is `SECURITY DEFINER`, so what else is out there?*

---

## 0. Summary

| | production | staging |
|---|---|---|
| triggers on `public` tables, **all kinds** | **1293** | 1285 |
| …of which **internal** (`tgisinternal`, i.e. FK/constraint enforcement) | **1292** | 1284 |
| …of which **user-defined** | **1** | **1** |
| user triggers that are **NOT `SECURITY DEFINER`** | **1 of 1** | 1 of 1 |
| user triggers that **will fail at cutover** | **1** (conditional on the calling role — §6) | same |
| `RULE`s in `public` (other than `_RETURN`) | **0** | **0** |
| `INSTEAD OF` triggers / triggers on views | **0** | **0** |
| distinct functions called from a `DEFAULT` clause | **3** (`now`, `gen_random_uuid`, `nextval`) | same |
| functions called from a policy expression | **3** (`current_tenant_id`, `auth.uid`, `auth.jwt`) | same |
| event triggers (DDL-time, not table triggers) | 7 | 7 |

**The headline is narrower and sharper than expected.** There is exactly **one** user-defined trigger
in `public` on either database — the one `admin-connection.md` §5 already found. Everything else is
1292 PostgreSQL-internal referential-integrity triggers, which run with the **table owner's**
privileges and are exempt from RLS, and which this sweep corroborates empirically rather than by
citation (§3.3).

**But the one trigger is worse than §5 recorded, and in a way that grants cannot fix.**
§5 measured it against `app_admin` and closed it with three grants. Measured here against the role
that will actually run the *sign-up* path — `app_user` — it is **unsatisfiable by construction**:

> `"Tenant".tenant_bootstrap_insert` admits the INSERT only when `app.current_tenant_id` is **unset**.
> The trigger it fires then inserts into `"TenantNotificationSettings"`, whose only non-bypass policy
> is `WITH CHECK ("tenantId" = current_tenant_id())`. At that moment `current_tenant_id()` is **NULL**
> — that is the precondition for the outer INSERT having been allowed at all — so the check is
> `NEW."id" = NULL` → NULL → **not true**.

The two policies contradict each other, and no ordering of statements resolves it: `"Tenant".id` is
`@default(dbgenerated("gen_random_uuid()"))`, so the application cannot know the id to put in the GUC
before the INSERT, and if it could, setting the GUC is exactly what `tenant_bootstrap_insert` forbids.
**`app_user` has every grant it needs on both tables. It is RLS, not privilege, that stops it.**

### Verdict list, severity order

| # | Trigger / mechanism | Verdict | What it needs |
|---|---|---|---|
| **1** | `trg_seed_tenant_notification_settings` on `"Tenant"`, reached as **`app_user`** | **WILL FAIL** — `42501 new row violates row-level security policy for table "TenantNotificationSettings"`. Structural, not a missing grant. | One of: route `provisionTenant` onto the admin connection (extends B5); make `seed_tenant_notification_settings()` `SECURITY DEFINER`; or add an INSERT policy on `"TenantNotificationSettings"` that admits the bootstrap case. **Naming the options only — §6 does not choose.** |
| **2** | The same trigger reached as **`app_admin`** | **WORKS** (measured by B5), but carries a **probable over-grant**: `TenantNotificationSettings` SELECT. `ON CONFLICT … DO NOTHING` is not documented as requiring SELECT — only `DO UPDATE` is. | A write probe to confirm, then drop the grant if unneeded. On a `BYPASSRLS` role, grants are the only remaining control, so an unnecessary one is the one place over-granting is not free. |
| **3** | `RI_FKey_cascade_del` / `RI_FKey_restrict_del` on **`"Tenant"` DELETE** — an **81-FK fan-out** (20 `CASCADE`, 61 `RESTRICT`) | **UNPROVEN, not failing.** Owner-privilege rule says it works, and `app_admin` holds DELETE on **none** of the 20 cascading tables. B5's `S12` probe passed against a **throwaway empty tenant**, where cascades delete nothing and restricts find nothing. | An exercise against a tenant that actually has rows. Nothing to change unless that fails. |
| **4** | `RI_FKey_check_ins` on `"Tenant"."homeBaseFacilityId"` → `facilities` | **LATENT.** `app_admin` can INSERT `"Tenant"` and has **no SELECT on `facilities`**. Never exercised because the column is NULL on every insert B5 made. | Nothing, if the owner-privilege rule holds (§3.3 says it does). Named so it is not discovered later. |
| **5** | 1292 internal RI triggers generally | **PASS.** Run as the table owner, exempt from RLS. Corroborated empirically, not just cited — §3.3. | — |
| **6** | 7 event triggers, 0 rules, 3 DEFAULT functions, 3 policy functions | **PASS.** §5 of this document. | — |

---

## 1. Every trigger in `public`

### 1.1 The one user trigger

Read from `pg_trigger` / `pg_proc` on **production**; staging is byte-identical in the function body.

| field | value |
|---|---|
| table | `public."Tenant"` |
| trigger | `trg_seed_tenant_notification_settings` |
| timing / level | **AFTER**, **FOR EACH ROW** |
| event | **INSERT** |
| function | `public.seed_tenant_notification_settings()` |
| **`prosecdef`** | **`false` — NOT `SECURITY DEFINER`** |
| language / owner | `plpgsql` / `postgres` |
| `tgenabled` | `O` (enabled, origin) |
| shipped by | `20260514200001_add_notification_system` |

```sql
CREATE TRIGGER trg_seed_tenant_notification_settings
  AFTER INSERT ON public."Tenant"
  FOR EACH ROW EXECUTE FUNCTION seed_tenant_notification_settings()
```

**It is the only non-`SECURITY DEFINER` user trigger in `public`, because it is the only user trigger
in `public`.**

### 1.2 The 1292 internal triggers

All are PostgreSQL's own referential-integrity triggers, in `pg_catalog`, written in C. Grouped by
function on production:

| function | triggers |
|---|---|
| `pg_catalog.RI_FKey_check_ins` | 323 |
| `pg_catalog.RI_FKey_check_upd` | 323 |
| `pg_catalog.RI_FKey_cascade_upd` | 315 |
| `pg_catalog.RI_FKey_setnull_del` | 165 |
| `pg_catalog.RI_FKey_restrict_del` | 114 |
| `pg_catalog.RI_FKey_cascade_del` | 44 |
| `pg_catalog.RI_FKey_noaction_upd` | 8 |
| | **1292** |

1292 + 1 = **1293 ✓**, which is every row `pg_trigger` holds for a `public` table. 323 of them
correspond to the 323 foreign keys on production (321 on staging).

### 1.3 Other schemas, for completeness

`public` is the scope of this sweep, and it is also very nearly the whole story:

| schema | user triggers | relevance |
|---|---|---|
| `storage` | 4 | Supabase Storage's own. The application's R2 uploads never touch this schema, and the Prisma connection has no reason to write it. |
| `realtime` | 1 | Supabase Realtime's own. Same. |
| `public` | 1 | §1.1 |

There are **no `INSTEAD OF` triggers and no triggers on views** on either database.

---

## 2. What the trigger function touches

```sql
CREATE OR REPLACE FUNCTION public.seed_tenant_notification_settings()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  INSERT INTO "TenantNotificationSettings" ("id", "tenantId", "triggerKey", "isActive", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), NEW."id", t."triggerKey", TRUE, NOW(), NOW()
  FROM "NotificationTemplate" t
  WHERE t."isActive" = TRUE
  ON CONFLICT ("tenantId", "triggerKey") DO NOTHING;
  RETURN NEW;
END;
$function$
```

| what | object | operation |
|---|---|---|
| reads | `public."NotificationTemplate"` | `SELECT` (`t."triggerKey"`, filtered on `t."isActive"`) |
| writes | `public."TenantNotificationSettings"` | `INSERT`, with `ON CONFLICT ("tenantId","triggerKey") DO NOTHING` |
| sequences | **none** | the `id` comes from `gen_random_uuid()`, not a sequence |
| calls | `gen_random_uuid()`, `now()` | both built-in |
| calls (nested) | **none** | neither `gen_random_uuid()` nor `now()` is user-defined |

**Nesting depth stopped at one level, and that is complete rather than a truncation**: the only
functions this function calls are two built-ins, and neither has a body in `public` that could reach
further. There is no second level to follow. The one-level rule would matter if the body called a
user-defined function; it does not.

`ON CONFLICT` targets the unique index on `("tenantId","triggerKey")`, which is what makes the trigger
idempotent across the `seedStarterPlaybooks`-style repeat applies.

---

## 3. Privileges, per role, quoted from the catalogue

### 3.1 The two tables the trigger function touches

Quoted verbatim from `information_schema.role_table_grants` (`table_schema='public'`), and
cross-checked against `pg_class.relacl`. **Not read from migration files.**

**Production** — `app_admin` does not exist there, so the column is empty by fact, not by omission:

| table | `app_user` | `app_admin` | needed by the trigger |
|---|---|---|---|
| `NotificationTemplate` | `SELECT` | *(role does not exist)* | SELECT — **held** |
| `TenantNotificationSettings` | `DELETE,INSERT,SELECT,UPDATE` | *(role does not exist)* | INSERT — **held** |

```
pg_class.relacl, production:
  NotificationTemplate        {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
                               authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres,
                               app_user=r/postgres}
  TenantNotificationSettings  {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
                               authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres,
                               app_user=arwd/postgres}
```

`app_user=r` is SELECT; `app_user=arwd` is INSERT/SELECT/UPDATE/DELETE. Both sufficient.

**Staging** (`app_admin` exists):

| table | `app_user` | `app_admin` | needed |
|---|---|---|---|
| `NotificationTemplate` | `SELECT` | `SELECT` | SELECT — both **hold** |
| `TenantNotificationSettings` | `DELETE,INSERT,SELECT,UPDATE` | `INSERT,SELECT` | INSERT — both **hold** |

```
pg_class.relacl, staging:
  NotificationTemplate        … app_user=r/postgres, app_admin=r/postgres
  TenantNotificationSettings  … app_user=arwd/postgres, app_admin=ar/postgres
```

**So no role is missing a privilege the trigger needs.** §5 of `admin-connection.md` closed the grant
question correctly and completely. The failure in §4 below is a different mechanism entirely.

**One grant is probably unnecessary.** `app_admin` holds `SELECT` on `TenantNotificationSettings`,
added by B5 on the stated reasoning that it is *"required by the `ON CONFLICT` clause independent of
INSERT"*. PostgreSQL's `INSERT` documentation attaches the SELECT requirement to
`ON CONFLICT DO UPDATE` — *"SELECT privilege is also required on any column whose values are read in
the ON CONFLICT DO UPDATE expressions or condition"* — and says nothing of the sort for `DO NOTHING`,
which reads no column. The observed `42501` in B5 names `TenantNotificationSettings` and is fully
explained by the missing **INSERT** alone. This is **not** provable read-only — it needs a write probe
with SELECT revoked — so it is reported as probable, not established.

### 3.2 Functions, sequences and defaults

```
pg_proc.proacl:
  public.seed_tenant_notification_settings   secdef=false  {=X/postgres, postgres=X/postgres,
                                                            anon=X/postgres, authenticated=X/postgres,
                                                            service_role=X/postgres}
  public.current_tenant_id                   secdef=false  {=X/postgres, …}
  pg_catalog.now                             secdef=false  proacl NULL  (default: EXECUTE to PUBLIC)
  pg_catalog.gen_random_uuid                 secdef=false  proacl NULL  (default: EXECUTE to PUBLIC)
  extensions.gen_random_uuid                 secdef=false  {=X/postgres, postgres=X*/postgres,
                                                            dashboard_user=X/postgres}
```

`=X` is EXECUTE granted to **PUBLIC**, so `app_user` and `app_admin` can execute all of them.

**Which `gen_random_uuid` the DEFAULTs bind to:** `pg_depend` records **no** dependency from any
`pg_attrdef` row on production to a `pg_proc` row, which is the signature of a **pinned** built-in —
i.e. `pg_catalog.gen_random_uuid` (built into PostgreSQL since 13), not the `extensions` (pgcrypto)
copy. Either way the answer is the same, since both grant EXECUTE to PUBLIC; the distinction is
recorded so nobody re-derives it.

**Sequences:** there is exactly **one** sequence in `public` on either database.

```
policy_drop_audit_id_seq
  owner  postgres
  relacl {postgres=rwU/postgres, anon=rwU/postgres, authenticated=rwU/postgres, service_role=rwU/postgres}
```

**Neither `app_user` nor `app_admin` holds `USAGE`.** It is reached only through the
`policy_drop_audit.id` DEFAULT, and `policy_drop_audit` is written only by the `sql_drop` **event
trigger** `policy_drop_audit_trigger`, which fires on DDL. No application path inserts into it, and
`app_user` has no grant on the table either. **Not a cutover blocker** — but it is the one place a
missing `USAGE` could bite, so it is named.

**Every DEFAULT clause in `public`**, by the function it calls (production: 407 defaults; staging: 433):

| function | occurrences (prod) | grant implication |
|---|---|---|
| *(literal — no call)* | 253 | none |
| `gen_random_uuid()` | 96 | EXECUTE to PUBLIC — none |
| `now()` / `CURRENT_TIMESTAMP` | 57 | EXECUTE to PUBLIC — none |
| `nextval('policy_drop_audit_id_seq')` | **1** | USAGE, held by neither role — see above |

### 3.3 The 1292 RI triggers — measured, not merely cited

PostgreSQL's documented behaviour is that referential-integrity checks run with the privileges of the
**table owner** and are **exempt from row-level security** (*"referential integrity checks, such as
unique or primary key constraints and foreign key references, always bypass row security"*).

Citing that would be weak here, because it is exactly the class of assumption this whole audit exists
to distrust. It is instead **corroborated by a measurement already in the repository**:

```sql
-- staging: tables app_admin can INSERT into, whose FK target app_admin CANNOT read
 inserted_table | referenced_table | conname                         | admin_can_insert_src | admin_select_on_target
----------------+------------------+---------------------------------+----------------------+------------------------
 AutomationRun  | AutomationRule   | AutomationRun_ruleId_fkey       | true                 | false
 Tenant         | facilities       | Tenant_homeBaseFacilityId_fkey  | true                 | false
```

`app_admin` holds `INSERT` on `AutomationRun` and **no SELECT on `AutomationRule`**, yet quick-600's
both-directions matrix inserted `AutomationRun` rows with a valid `ruleId` and passed 22/22. That
INSERT necessarily fired `RI_FKey_check_ins` against `AutomationRule`. **The check ran and did not
raise `42501`**, which is only explicable by the owner-privilege rule.

Corroborating the same rule from the other side: **0 of 323** foreign keys on production reference a
table on which `app_user` lacks `SELECT` (`has_table_privilege('app_user', tgt.oid, 'SELECT')`), so
for `app_user` specifically the question is moot regardless of which rule applies.

The second row is **latent**: `Tenant_homeBaseFacilityId_fkey` was never exercised because every
`"Tenant"` insert B5 made left `homeBaseFacilityId` NULL, and an RI check is skipped for a NULL FK
value. It is listed in §0 as verdict 4 so it is not discovered later as a surprise.

---

## 4. RLS on the tables the trigger touches — where it actually breaks

| table | `relrowsecurity` | `relforcerowsecurity` | non-bypass policies |
|---|---|---|---|
| `NotificationTemplate` | **false** | false | none — RLS is off |
| `TenantNotificationSettings` | **true** | **true** | `tenant_isolation_policy` FOR ALL `USING/WITH CHECK ("tenantId" = current_tenant_id())` |

`NotificationTemplate` is RLS-off, so the trigger's `SELECT` half is safe for every role.

`TenantNotificationSettings` is where it breaks, and only for a role RLS applies to:

| calling role | `rolbypassrls` | outcome |
|---|---|---|
| `postgres` (today) | **true** | RLS not applied. **Works.** This is why nothing has ever seen it. |
| `app_admin` | **true** | RLS not applied. **Works** — what B5 measured. |
| `app_user` | **false** | RLS applied, and the table is `FORCE`. **Fails** — see below. |

### The contradiction, stated exactly

For the trigger's INSERT to be admitted under `app_user`, `WITH CHECK ("tenantId" = current_tenant_id())`
must be TRUE, where `"tenantId"` is `NEW."id"` — the id of the tenant row just inserted.

For the **outer** INSERT into `"Tenant"` to have been admitted under `app_user` at all, the only
applicable policy is `tenant_bootstrap_insert`:

```sql
WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL)
```

which is true **precisely when `current_tenant_id()` is NULL**. So at the instant the trigger fires,
`current_tenant_id()` is NULL by construction, and `NEW."id" = NULL` evaluates to NULL — not TRUE.
The insert is refused.

**No ordering fixes this.** `"Tenant".id` is `@default(dbgenerated("gen_random_uuid()"))`
(`schema.prisma:130`) — the **database** generates it — so the application cannot set the GUC to the
new id beforehand; and even if it supplied its own id, setting the GUC is the one thing
`tenant_bootstrap_insert` forbids. The `set_config(... , tenant.id, TRUE)` that
`bypass-replacement-design.md` §4.1 places *after* the insert is too late: an `AFTER INSERT FOR EACH
ROW` trigger runs inside the same statement.

### When it fires, precisely

This is **not** a failure at the `DATABASE_URL` flip. It is staged, and the intermediate state works,
which is what makes it dangerous:

| state | outcome |
|---|---|
| today — `DATABASE_URL` = `postgres` | works (`rolbypassrls`) |
| `DATABASE_URL` → `app_user`, `bypass_rls_policy` still present, `provision-tenant.ts` still setting `app.bypass_rls='on'` | **works** — `TenantNotificationSettings.bypass_rls_policy` is FOR ALL and permissive, and the GUC is transaction-scoped so it covers the trigger too |
| the `app.bypass_rls` line removed from `provision-tenant.ts` (what A2 does to every DECORATIVE site) | **FAILS** |
| step 7 — `bypass_rls_policy` dropped | **FAILS** |

**Whichever of the last two happens first is when sign-up breaks.**

---

## 5. RULEs, policy functions, DEFAULT functions, event triggers

- **RULEs: none.** `pg_rewrite` holds no row for a `public` relation with `rulename <> '_RETURN'` on
  either database. Nothing to assess.
- **Functions called from a policy expression: 3**, all `prosecdef = false` —
  `public.current_tenant_id()` (EXECUTE to PUBLIC), `auth.uid()` and `auth.jwt()`. The latter two are
  the dead policies of `policy-satisfiability-sweep.md` §3; `app_user` lacks `USAGE` on schema `auth`
  but the stored policy expressions carry a resolved OID and never re-resolve the name, so they
  evaluate to NULL rather than raising. Unchanged by this sweep, re-confirmed here.
- **Functions called from a DEFAULT clause: 3** — §3.2. Two are built-ins with EXECUTE to PUBLIC; the
  third is `nextval` on the one sequence, reachable only from a DDL event trigger.
- **Generated columns: 0** on both databases (`pg_attribute.attgenerated`), so no generation
  expression to assess.
- **Event triggers: 7**, all DDL-time (`ddl_command_end` / `sql_drop`):
  `issue_graphql_placeholder`, `issue_pg_cron_access`, `issue_pg_graphql_access`, `issue_pg_net_access`,
  `pgrst_ddl_watch`, `pgrst_drop_watch`, `policy_drop_audit_trigger`. Six are Supabase-owned; the
  seventh is the repo's own policy-drop forensics trigger. **None can be fired by DML**, so none is on
  the `app_user` or `app_admin` path — they fire for `migrate.mjs`, which runs as `postgres`.

---

## 6. The verdict, with the user-facing operations that fire it

**One trigger will fail, and it has two entry points in code.**

### 6.1 `trg_seed_tenant_notification_settings`, reached as `app_user`

**What it needs:** not a grant — `app_user` already holds `INSERT` on `TenantNotificationSettings` and
`SELECT` on `NotificationTemplate` (§3.1). It needs the RLS contradiction in §4 resolved. The
available shapes, named and not chosen: route `provisionTenant` onto the admin connection (an
extension of B5); declare `seed_tenant_notification_settings()` `SECURITY DEFINER`; or add an INSERT
policy on `"TenantNotificationSettings"` that admits the bootstrap case.

**The user-facing operations that fire it:**

| Operation | Entry point | Path to the INSERT | Routed? |
|---|---|---|---|
| **Self-serve sign-up** — a new company creating its account | `apps/web/src/app/(auth)/sign-up/actions.tsx` | → `provisionTenant()` in `apps/web/src/lib/onboarding/provision-tenant.ts`, `tx.tenant.create()` at **:59**, inside `prisma.$transaction` on the **bare tenant client** with `set_config('app.bypass_rls','on',TRUE)` at :35 | **NO** — quick-600 lists `provision-tenant.ts`'s transaction as still unrouted (B3/§4.1) |
| **The repository twin of the same flow** | `apps/web/src/lib/db/repositories/tenant.repository.ts` | `provisionTenant()`, `tx.tenant.create()` at **:36**, same shape | **NO** — quick-600 routed only this file's `findTenantByUserId` (:67) and `listAllTenants` (:85); the `create` was left on the tenant client |
| **SysAdmin creates a tenant** | `apps/web/src/app/(admin)/actions/tenants.ts` | `adminDb.tenant.create()` at **:101** | **YES** — on `app_admin`, which bypasses RLS. **This one works.** |

So the failing surface is **sign-up**, and the reason it is not already known is that the only
`"Tenant"` INSERT anyone has exercised under a non-bypassing role is the *sysadmin* one, which B5
routed to the bypassing role.

### 6.2 The `"Tenant"` DELETE fan-out — unproven rather than failing

`(admin)/actions/tenants.ts:625` (**SysAdmin deletes a tenant**) is routed to `app_admin`. A
`DELETE FROM "Tenant"` fires **81 inbound FK triggers**: **20 `CASCADE`** and **61 `RESTRICT`**,
measured on staging. `app_admin` holds `DELETE` on **none** of the 20 cascading tables.

Per §3.3's owner-privilege rule this is fine. But the only evidence is B5's `S12`, which — by its own
description — created **a throwaway tenant** to isolate the DELETE from an unrelated
`User_tenantId_fkey` constraint. Against an empty tenant, 20 cascades delete zero rows and 61
restricts find zero rows, so **the fan-out has never actually been exercised**. Naming it, not fixing
it.

---

## 7. Cross-check against the `withTenantContext` migration

**Zero of the 456 units performs the operation that fires the failing trigger.**

Both unrouted `"Tenant"` INSERT sites use the **bare `prisma` client** inside
`prisma.$transaction(...)` with an explicit `set_config('app.bypass_rls','on',TRUE)` —
they are BOOTSTRAP sites in `bypass-replacement-design.md` §1.1, not tenant-client units. Verified
directly: `grep -n "getTenantPrisma" ` over `provision-tenant.ts` and `tenant.repository.ts` returns
**nothing** in either file.

The consequence is the part worth carrying:

> **The wrapper migration will never surface this.** It moves units that acquire a tenant client, and
> neither failing site is one. The trigger fails inside the *bootstrap* work (B3 / §4.1) — a different
> checklist item, owned by nobody today — and it fails at the moment `provision-tenant.ts`'s bypass
> line is deleted, which is an A2-shaped edit that looks routine.

For completeness, the one `"Tenant"` write site that **is** among the 456 —
`saveOperationsSettings` in `(owner)/settings/operations/actions.ts:40`, via `getTenantPrismaForOrg`
— is an **UPDATE**, and the trigger is `AFTER INSERT` only. It does not fire it.

---

## 8. What this sweep did not measure

1. **No write probe of any kind**, so §4's failure is derived from the policy corpus and the catalogue,
   not executed. It is a construction argument over two quoted `WITH CHECK` expressions and a measured
   column default, which is about as strong as a derivation gets — but it is a derivation. A task
   permitted to write can settle it in one rolled-back transaction as `app_user` on staging:
   `INSERT INTO "Tenant" (name, slug) VALUES (…)` with `app.current_tenant_id` unset.
2. **§3.1's "SELECT is probably unnecessary" is unproven** for the same reason. It needs a probe with
   the grant revoked.
3. **The 81-FK `"Tenant"` DELETE fan-out was not exercised** — §6.2.
4. **Scope was `public`.** The 4 `storage` and 1 `realtime` triggers were counted and dismissed on the
   grounds that the Prisma connection does not write those schemas; that was not tested.
5. **`pg_depend`'s silence is read as "pinned built-in"** in §3.2. That is the standard meaning and both
   candidate functions grant EXECUTE to PUBLIC, so the conclusion does not rest on it.

---

## Provenance

Five read-only scripts run from the repo root against `DIRECT_URL` (production, as `postgres`) and
`STAGING_DIRECT_URL` (staging, as `postgres`), each refusing to start on a project-ref mismatch, every
statement inside `BEGIN READ ONLY … ROLLBACK`. Written to the session scratchpad, not the repository.

| script | produced |
|---|---|
| `trig-enum.js` | `pg_trigger` / `pg_proc` / `pg_rewrite` / `pg_attrdef` / sequence / event-trigger dumps from both databases |
| `trig-grants.js` | §3.1's `information_schema.role_table_grants` and `pg_class.relacl` quotes, §4's RLS table, the 323-FK `app_user` exposure sweep |
| `trig-final.js` | per-schema trigger counts, the `INSTEAD OF` check, the `pg_depend` default-binding probe, `app_admin` FK exposure |
| `ri.js` | §3.3's `AutomationRun → AutomationRule` corroboration and §6.2's 81-FK `"Tenant"` fan-out |
| `enumerate.js` (reused from the satisfiability sweep) | the 183/183 policy alignment re-confirmed at task start |
