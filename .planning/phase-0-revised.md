# Phase 0 (Revised): Tenant Isolation

Supersedes `phase-0-tenant-isolation.md` (Prompts A1–A4).
Date: 2026-09-09
Status: **approved — awaiting go on Prompt 4**

---

## 1. Working rules for this phase

1. Every Phase 0 session runs **from the repo root**. The session must be
   able to run the drift detector, read the extension source, and write to
   `.planning/` directly. A session with database access but no checkout is
   not a valid Phase 0 session.
2. **Read-only queries against production are allowed** for evidence.
3. **No write of any kind to production originates from a session.** Every
   production change is a migration file that exists in the repo, applied by
   a human.
4. **One artifact, one path.** Migrations are applied to the preview branch
   with `prisma migrate deploy` using the branch connection string, so the
   file that ran on the branch is byte-identical to the file a human later
   runs on production. `apply_migration` and resolved-not-run mirrors are not
   used in this phase.
5. All four prompts target a **Supabase preview branch**. Production cutover
   is a separate, human-run step.
6. One branch and one PR per prompt. No prompt starts until the previous PR
   is merged.
7. The drift detector runs immediately before and immediately after each
   prompt. Both raw outputs go in the PR description.
8. No DDL through `execute_sql`.

**Execution order: 4 → 1 → 2 → 3.**

---

## 2. Locked decisions

Not up for revision in this phase.

| Decision | Value | Why |
|---|---|---|
| Tenant GUC name | `app.current_tenant_id` | Referenced by `current_tenant_id()` and every live policy |
| GUC scope | Session scope — `set_config(..., FALSE)` | `TRUE` caused P2028 deadlocks on the Supavisor session pooler |
| Policy shape | `tenant_isolation_policy` FOR ALL | Matches ~90 live tables; per-command policies would fork the shape |
| Column naming | `tenantId` and `org_id` handled explicitly per table | Dual naming is real: `Load."tenantId"`, `loads.org_id` |
| `carrier_documents` tenancy | Derive through `uploaded_by` | Avoids a schema migration on a live table |
| `getAdminDb()` refactor | **Dropped** | Churn; 12 vestigial bypass flags were just removed |
| Index creation | Plain `CREATE INDEX`, no `CONCURRENTLY` | Largest affected table is 757 rows |
| Connection routing | Supavisor session mode, existing pooler host | Change the role, not the route |

---

## 3. Answers to the five open questions

**Q1 — Environment.** Supabase **preview branch** for all four prompts,
including Prompt 2. Production is under a thousand rows; the cutover risk is
grants and code paths, not volume, and a branch exposes both. Prompt 2 on the
branch must include a manual click-through of Loads, Drivers, Live Tracking,
Settlements, Driver Portal, SysAdmin, and document upload and download.
Production cutover happens afterward by env flip in a low-traffic window,
with `DB_ROLE_ENFORCEMENT=warn` for the first 24 hours, then `strict`.

**Q2 — Drift detector.** Developer runs `npm run audit:rls-policy-drift` from
the repo and pastes the raw output. **Prompt 1 is not scoped until that
output exists.** If it still reports 59 missing policies against a database
where only 3 tables have zero policies, Prompt 1 begins by reconciling the
detector's expectation set against `pg_policies` and fixing whichever side is
wrong, with the reasoning written into the PR.

**Q3 — `route_matrix_cache`.** It carries `org_id`, therefore it is
tenant-scoped. It gets RLS, FORCE, `tenant_isolation_policy`, and full DML
grants, identical to every other tenant table. Added to Prompt 1.

**Q4 — `grid_view` / `grid_preference`.** Read their columns in Prompt 4. If
either carries a user id, it is user-scoped: add to `EXEMPT_MODELS` with that
reason written next to the entry. If either carries no owner column at all,
stop and report it as a defect rather than exempting it.

**Q5 — `bypass_rls_policy`.** Prompt 4 determines which connection the
sysadmin cross-tenant read path uses.

- If it uses the privileged `DATABASE_URL`: **drop `bypass_rls_policy` from
  every table** in Prompt 1 and remove any remaining `app.bypass_rls`
  `set_config` calls. A `BYPASSRLS` role does not need a policy.
- If it runs as `app_user`: create a dedicated admin role, restrict the
  policy `TO` that role, and confirm `app_user` is not a member of it.

Either way, verify the sysadmin surfaces still work on the branch before
merging.

---

## 4. Evidence gathered 2026-09-09 (production, read-only)

### 4.1 Environment

`oqdhberkghtnszrkdvfm` is named `drivecommand`, Postgres 17.6.1,
`us-west-1`, `ACTIVE_HEALTHY`, created 2026-03-24. `list_branches` returns
empty. Live application traffic present:

```
usename        application_name        backend_type     state   conns
-------------- ----------------------- ---------------- ------- -----
postgres       Supavisor               client backend   idle    2
authenticator  PostgREST 14.5          client backend   idle    1
pgbouncer      Supavisor (auth_query)  client backend   idle    1
postgres       mgmt-api                client backend   active  1
supabase_admin postgres_exporter       client backend   idle    1
```

The app connects as `postgres` through Supavisor. `postgres` has
`rolbypassrls = true`, so every FORCE RLS policy is currently decorative.

### 4.2 Policy and grant state

```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       COALESCE(p.policy_count,0) AS policy_count,
       COALESCE(g.app_user_grants,'') AS app_user_grants
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (SELECT schemaname, tablename, COUNT(*) AS policy_count
           FROM pg_policies GROUP BY 1,2) p
       ON p.schemaname = n.nspname AND p.tablename = c.relname
LEFT JOIN (SELECT table_name,
                  string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
                    AS app_user_grants
           FROM information_schema.role_table_grants
           WHERE grantee = 'app_user' AND table_schema = 'public'
           GROUP BY table_name) g
       ON g.table_name = c.relname
WHERE n.nspname = 'public' AND c.relkind = 'r';
```

Every row that is not clean:

```
table_name                 rls_enabled  rls_forced  policy_count  app_user_grants
-------------------------- -----------  ----------  ------------  ---------------------------
carrier_documents          true         true        0             DELETE,INSERT,SELECT,UPDATE
route_template_stops       true         true        0             DELETE,INSERT,SELECT,UPDATE
stops                      true         true        0             DELETE,INSERT,SELECT,UPDATE
_prisma_migrations         true         false       0             (none)
NotificationEmailConfig    false        false       0             (none)
NotificationTemplate       false        false       0             (none)
Plan                       false        false       0             (none)
Promo                      false        false       0             (none)
carrier_catalog_meta       false        false       0             (none)
grid_preference            false        false       0             (none)
grid_view                  false        false       0             (none)
route_matrix_cache         false        false       0             (none)
```

All other tables in `public` (approx. 90) report `rls_enabled = true`,
`rls_forced = true`, `policy_count >= 2`, full DML to `app_user`.

Reconciliation against the plan's stated 59 / 13 / 3 baseline: the **3**
zero-policy tables reproduce exactly, the **9** zero-grant tables reproduce
exactly, the **59 across 13** does not reproduce. See Q2.

### 4.3 Roles

```
rolname        rolsuper  rolbypassrls  rolcanlogin
-------------- --------  ------------  -----------
app_user       false     false         true
postgres       false     true          true
service_role   false     true          false
supabase_admin true      true          true
```

`app_user` exists, can log in, has neither `SUPERUSER` nor `BYPASSRLS`. Only
its password and connection string are missing.

`pg_default_acl` returns **0** entries mentioning `app_user` for schema
`public`. Every future table acquires the zero-grant defect automatically.

### 4.4 Tenant context function

```sql
CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid LANGUAGE sql STABLE
AS $function$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$function$
```

The `TRUE` is `current_setting`'s *missing_ok* argument, not `set_config`'s
transaction-local argument. Session scope lives in application code.

### 4.5 `bypass_rls_policy` is open to `app_user`

Identical on every tenant-scoped table:

```
tablename       | policyname             | cmd | roles    | qual
----------------+------------------------+-----+----------+------------------------------------------------
loads           | bypass_rls_policy      | ALL | {public} | (current_setting('app.bypass_rls', true) = 'on')
loads           | tenant_isolation_policy| ALL | {public} | (org_id = current_tenant_id())
Load            | bypass_rls_policy      | ALL | {public} | (current_setting('app.bypass_rls', true) = 'on')
Load            | tenant_isolation_policy| ALL | {public} | ("tenantId" = current_tenant_id())
carrier_drivers | bypass_rls_policy      | ALL | {public} | (current_setting('app.bypass_rls', true) = 'on')
carrier_drivers | tenant_isolation_policy| ALL | {public} | (org_id = current_tenant_id())
```

PERMISSIVE, `FOR ALL`, `TO public`. `public` includes `app_user`, and
Postgres places no privilege barrier on custom GUCs, so `app_user` can run
`set_config('app.bypass_rls', 'on', false)` on itself and turn off tenant
isolation across the entire database in one statement. Cutting over to
`app_user` produces no enforcement until this is fixed. Resolution in Q5.

### 4.6 Table sizes

```
table_name             est_rows  total_size  tenancy_candidates
---------------------- --------  ----------  --------------------------
stops                       757      624 kB  load_id
route_template_stops         30       96 kB  route_template_id
carrier_documents            41      192 kB  uploaded_by, load_id
loads                       374      272 kB  org_id
route_templates              10      144 kB  org_id
carrier_catalog_meta         93       80 kB  (none)
route_matrix_cache           -1       64 kB  org_id
grid_view                    -1       32 kB  (none)
grid_preference              -1       32 kB  (none)
```

Plain `CREATE INDEX` holds `ACCESS EXCLUSIVE` for single-digit milliseconds
at this size, so `CONCURRENTLY` is unnecessary. It is also unavailable inside
a wrapped transaction, which is what any transactional apply path gives you
(SQLSTATE `25001`).

**Procedure for later, once a table crosses roughly 1M rows:** the concurrent
index statement goes into its own repo migration, isolated from any other
statement, applied through `prisma migrate deploy` or `psql -f`. Both run
statements outside an explicit transaction, so `CONCURRENTLY` succeeds. It
remains one artifact on one path — the same file runs on the branch and on
production. Never through `execute_sql`.

### 4.7 Connection ceiling

```
name                                  setting
------------------------------------- -------
max_connections                       60
superuser_reserved_connections        3
idle_in_transaction_session_timeout   0
statement_timeout                     120000
```

57 usable connections. Direct port 5432 from Vercel serverless is not
viable. Supavisor **session mode** preserves the session semantics that
session-scoped `set_config` requires; transaction mode (6543) does not and is
actively dangerous with this design. `connection_limit=1&pool_timeout=20`.
`idle_in_transaction_session_timeout` is disabled instance-wide and must be
set on the `app_user` role.

---

## 5. Prompt sequence

| # | Prompt | Output | Target |
|---|---|---|---|
| 4 | Role guard, storage key, and open-question audit | `docs/audits/role-guard-storage-audit.md` | Read-only |
| 1 | Policies, grants, default privileges, bypass lockdown | Migration + Prisma mirror | Preview branch |
| 2 | `app_user` cutover | Env + assertion + smoke script | Preview branch |
| 3 | Cross-tenant suite + connection-reuse test | Test suite + CI job | Test database |

---

## 6. Prompt 4 — Role guard, storage key, and open-question audit

```
Task: Role guard, storage key, and open-question audit. Investigation only.
No code changes, no schema changes, no migrations.

Target: read-only. Production may be queried read-only for evidence. No
write of any kind to production originates from this session.

Before you start:
- Run from the repo root. Confirm you can see apps/web, packages/database,
  and .planning before doing anything else.
- Read the existing auth guard implementation (requireAuth, requireRole,
  requireAdminAccess) and the Supabase Storage upload and signed-URL paths.
- Read .planning/phase-0-revised.md sections 3 and 4.
- Do not install any package.

Context: Tenant scoping and RLS coverage are already audited. Four things
are not, and Prompt 1 cannot be scoped without them.

Build:
1. Enumerate every tRPC procedure, route handler, server action, and cron
   or job handler. For each record: the guard applied (none, auth-only,
   role-checked, admin-only), the roles permitted, and whether the tenant
   is derived from the session or from a client-supplied value. Flag every
   route reachable with no guard and every route where the role is checked
   but the tenant is not.

2. Map the Supabase Storage key scheme for the driver-documents bucket and
   every other bucket in use. Determine whether a key contains a tenant
   identifier, whether it is predictable, and whether the signed-URL path
   validates that the requested key belongs to the session tenant before
   signing. Determine whether an uploaded key prefixed with another
   tenant's identifier is accepted on write. Flag every path where a
   crafted key would be signed or accepted.

3. Read the columns of grid_view and grid_preference. If either carries a
   user id, classify it user-scoped and state the exact column name. If
   either carries no owner column at all, stop and report it as a defect;
   do not propose an exemption.

4. Determine which database connection the sysadmin cross-tenant read path
   uses. Trace it from the route handler to the Prisma client to the
   connection string. State plainly whether it runs on the privileged
   DATABASE_URL or as app_user. Quote the file and line.

5. Grep and quote, verbatim with file and line, every occurrence of:
   set_config, app.current_tenant_id, app.bypass_rls, RESET, DISCARD.
   For each set_config call state the third argument and whether the call
   is unconditional or guarded by a comparison against the current value.

Write findings to docs/audits/role-guard-storage-audit.md: a route table
(guard, roles, tenant source, risk), a storage path table, and a findings
section for items 3, 4, and 5 with exact file and line. List the
highest-risk findings in order at the top.

Do not:
- Change any application code, schema, or configuration.
- Create or apply any migration.
- Call apply_migration or execute_sql against any project.
- Propose fixes. This prompt reports; Prompt 1 fixes.

Check before finishing:
- The audit file exists and every route in the router appears in it.
- Items 3, 4, and 5 are each answered with a file and line, not a summary.
- git status shows only the new audit file.

If the approach does not work, say what failed and suggest an alternative
before stopping. Commit at the end with a clear message.
```

---

## 7. Prompt 1 — Policies, grants, default privileges, bypass lockdown

**Gate:** do not run until the raw `npm run audit:rls-policy-drift` output
and `docs/audits/role-guard-storage-audit.md` both exist.

```
Task: Close the RLS policy, grant, and default-privilege gap, and remove
the app_user bypass path.

Use the GSD skill to build this.

Target: a Supabase preview branch. Production is never written from this
session. The deliverable is a migration file in the repo that a human
applies to production later.

Before you start:
- Run from the repo root.
- Read .planning/phase-0-revised.md in full, and
  docs/audits/role-guard-storage-audit.md.
- Run npm run audit:rls-policy-drift and paste the raw output before
  changing anything. This is the pre-baseline for the PR.
- If the detector reports 59 missing policies while pg_policies shows only
  3 tables with zero policies, stop building and reconcile first:
  determine whether the detector's expectation set or the database is
  wrong, fix that one thing, and write the reasoning into the PR before
  proceeding to the rest of this prompt.
- Do not install any package.
- Do not rename any GUC. The project uses app.current_tenant_id with
  session scope, set_config(..., FALSE). This is a deliberate deviation
  from spec Section 2.5 because TRUE causes P2028 deadlocks on the
  Supavisor session pooler. Preserve it exactly.
- Briefly explain your approach in 2-3 sentences, then build.

Build, as one migration file in the repo's migration format, idempotent,
with a rollback section:

1. tenant_isolation_policy on the three FORCE-RLS tables that have none,
   following the exact FOR ALL shape used by the tables that pass:
   - stops, via load_id to loads.org_id
   - route_template_stops, via route_template_id to route_templates.org_id
   - carrier_documents, via uploaded_by. Do not add a tenant column to
     this table and do not write a backfill for it.

2. route_matrix_cache: ENABLE and FORCE ROW LEVEL SECURITY,
   tenant_isolation_policy on org_id, full DML grants to app_user.

3. bypass_rls_policy, per the finding in the Prompt 4 audit item 4:
   - If the sysadmin cross-tenant path uses the privileged DATABASE_URL:
     DROP bypass_rls_policy from every table, and delete every remaining
     app.bypass_rls set_config call in application code.
   - If it runs as app_user: create a dedicated admin role, recreate the
     policy TO that role instead of TO public, and assert app_user is not
     a member of it.

4. Grants for the nine zero-grant tables, split by classification:
   - Tenant-scoped (route_matrix_cache): SELECT, INSERT, UPDATE, DELETE.
   - Global reference read by the app (Plan, Promo, NotificationTemplate,
     NotificationEmailConfig, carrier_catalog_meta): SELECT only, plus any
     write privilege the sysadmin path provably needs per the audit.
   - grid_view and grid_preference: per the Prompt 4 classification. If
     user-scoped, grant DML and add to EXEMPT_MODELS with the owning
     column named in a comment beside the entry.
   - _prisma_migrations: no grant.
   Missing SELECT on a global reference table will break the app at
   cutover. Verify each one against actual read paths, not assumption.

5. ALTER DEFAULT PRIVILEGES IN SCHEMA public so future tables grant to
   app_user automatically.

6. ALTER ROLE app_user SET idle_in_transaction_session_timeout to a
   sensible value. The instance-wide setting is 0.

7. Composite indexes required by spec Section 5.2 that are missing on any
   table in this set. Plain CREATE INDEX inside the migration transaction.
   Do not use CONCURRENTLY.

8. Handle dual column naming by reading the actual column from
   information_schema per table. Older models use camelCase Postgres
   columns (tenantId), carrier models use snake_case (org_id). Do not
   assume either.

9. Apply the migration to the preview branch with prisma migrate deploy,
   using the branch connection string. Do not use apply_migration and do
   not create a resolved-not-run mirror. The file that runs on the branch
   must be byte-identical to the file a human later runs on production.
   One artifact, one path.

Do not:
- Point prisma migrate deploy, or anything else that writes, at the
  production project ref. The branch connection string only.
- Use apply_migration or execute_sql for any DDL.
- Change application code beyond these two, both of which are expected and
  allowed, so do not stop to ask about them:
  (a) removing app.bypass_rls set_config calls if branch 3a applies, and
  (b) adding grid_view and grid_preference to EXEMPT_MODELS with the
      owning column named in a comment beside each entry.
- Modify the tenant context resolver, the RLS Prisma extension, or
  middleware.
- Enable RLS on genuinely global reference or system tables.
- Use CREATE INDEX CONCURRENTLY.

Check before finishing:
- prisma migrate deploy applies the migration cleanly to the preview
  branch, and _prisma_migrations on the branch contains the row.
- The committed migration file is the exact file that ran. State its path
  and confirm nothing was applied out-of-band.
- npm run audit:rls-policy-drift reports zero findings. Paste the raw
  post-baseline output.
- Zero tables in public have FORCE RLS with zero policies.
- Zero tenant-scoped tables have zero grants to app_user.
- pg_default_acl returns a non-zero count for app_user in schema public.
- No bypass_rls_policy anywhere is TO public.
- The 17 existing isolation tests still pass.
- npx prisma validate and npx prisma generate succeed.
- Print a before/after table of the drift counts.

If the approach does not work, say what failed and suggest an alternative
before stopping. Commit at the end with a clear message.
```

---

## 8. Prompt 2 — `app_user` cutover

```
Task: Cut the application's runtime database connection from the postgres
superuser role to app_user, on the preview branch.

Use the GSD skill to build this.

Target: the Supabase preview branch only. Production cutover is a later,
human-run env flip and is not part of this prompt.

Before you start:
- Run from the repo root.
- Confirm Prompt 1's PR is merged and npm run audit:rls-policy-drift
  reports zero findings against the branch. If it does not, stop. Cutting
  over with a missing grant produces permission-denied errors across the
  app, and with a missing policy produces silently empty pages.
- Confirm DATABASE_URL_APP_USER is present in apps/web/.env.local and
  points at the branch. If absent, stop and say so. Do not fall back to
  DATABASE_URL.
- Do not install any package.
- Briefly explain your approach in 2-3 sentences, then build.

Context: the app connects as postgres, which has rolbypassrls = true, so
RLS currently enforces nothing. app_user has no BYPASSRLS and, after
Prompt 1, holds correct grants.

Build:
1. Point the runtime Prisma datasource at DATABASE_URL_APP_USER. Keep the
   privileged DATABASE_URL for migrations and the sysadmin cross-tenant
   read path only.
2. The connection string uses Supavisor session mode on the existing
   pooler host with connection_limit=1 and pool_timeout=20. Do not use
   direct port 5432 and do not use transaction mode on 6543. max
   _connections on this instance is 60; direct connections from Vercel
   serverless will exhaust it, and transaction mode breaks session-scoped
   set_config.
3. A startup assertion that queries pg_roles for the connected role and
   checks rolbypassrls and rolsuper. Gate it on DB_ROLE_ENFORCEMENT:
   "strict" throws, "warn" logs a structured warning and continues. The
   gate exists so rollback is possible; postgres has rolbypassrls = true
   and a hard throw would refuse to boot on rollback.
4. Activate the app_user measurement harness scaffolded in quick-589.
5. A smoke script that connects as app_user with no tenant context set and
   runs a bare SELECT against loads, drivers, carrier_drivers,
   driver_settlements, and carrier_documents, asserting zero rows on each.

Do not:
- Change any query logic, repository, or route handler.
- Change getTenantPrisma or the tenant-rls extension internals.
- Modify the GUC name or its session scope.
- Point anything at the production project ref.

Check before finishing:
- The no-context smoke script returns zero rows on all five tables.
- With app.current_tenant_id set to tenant A, zero tenant B rows are
  visible; and the reverse.
- The startup assertion fires in strict mode when pointed at postgres.
  Prove it, then revert.
- Manual click-through on the branch, every one of these loads correct
  data with no permission error and no empty state: Loads, Drivers, Live
  Tracking, Settlements, Driver Portal, SysAdmin, document upload,
  document download. Report each one individually as pass or fail. Do not
  report "all surfaces verified" as a single line.
- List every file changed.
- State the rollback explicitly: DATABASE_URL_APP_USER reverted and
  DB_ROLE_ENFORCEMENT set to warn, two environment variables, no code
  change and no rebuild.

If the approach does not work, say what failed and suggest an alternative
before stopping. Report exactly which surfaces broke. Commit at the end
with a clear message.
```

---

## 9. Prompt 3 — Cross-tenant suite, connection-reuse test, unconditional GUC

```
Task: Make session-scope leakage impossible rather than unlikely, and prove
it with an endpoint-level cross-tenant suite.

Use the GSD skill to build this.

Target: test database only. Never production, never the preview branch's
live data.

Before you start:
- Run from the repo root.
- Read the 17 existing isolation tests. They are model-level; this suite is
  endpoint-level and sits alongside them, not on top of them.
- Read docs/audits/role-guard-storage-audit.md. Every route it flagged as
  unguarded or tenant-unchecked is added to this suite's coverage list
  before you start writing tests.
- Find the existing test runner and CI configuration. Use them. Do not add
  a second test framework.
- Do not install any package. If you think one is needed, stop and explain
  why.
- Briefly explain your approach in 2-3 sentences, then build.

Context: the tenant GUC is session-scoped, so it survives the transaction
and stays on the pooled server connection. If any request reaches a query
before its set_config runs, it inherits the previous request's tenant.

Build:
1. Change the scoped client to set app.current_tenant_id unconditionally at
   the top of every transaction, rather than only when it differs from the
   current value. Keep session scope, set_config(..., FALSE). Do not switch
   to transaction scope; TRUE causes P2028 deadlocks on the Supavisor
   session pooler.
2. Connection-reuse leak test:
   a. Set app.current_tenant_id to tenant A on one pooled connection, run a
      query, end the transaction.
   b. On the same physical connection, without setting the GUC, run a bare
      SELECT against loads, carrier_drivers, and driver_settlements.
   c. Assert zero rows.
   d. Repeat with the GUC set to tenant B and assert zero tenant A rows.
   e. Assert the test fails if step 1's unconditional set is reverted.
      Prove this, then restore.
3. Fix the vitest configuration so DATABASE_URL loads. Unskip the 61
   skipped security tests. Report which fail and fix the underlying guard,
   never the test.
4. Seed two tenants A and B, each with an owner, dispatcher, driver,
   client, truck, load, trip with stops, route template, checklist,
   compensation template, settlement, and one uploaded document.
5. As each role in tenant A, for every tRPC procedure and route handler
   touching a tenant-scoped model: attempt read, list, update, soft-delete,
   hard-delete, and download using tenant B identifiers. Every attempt
   returns 404 or 403. Never 200, never 500, never an error message that
   confirms the record exists.
6. Assert list endpoints return only tenant A rows.
7. Assert a create carrying a client-supplied tenantId or org_id for B is
   rejected or overwritten with the session tenant.
8. Assert a Supabase Storage signed URL for a tenant B object in
   driver-documents cannot be generated from a tenant A session, and that
   an upload with a tenant-B-prefixed key is rejected.
9. One shared helper derives the attack list from the router definition, so
   a new procedure added without coverage fails the suite with "endpoint
   not covered" rather than passing silently.
10. Wire the suite into CI on every pull request.

Do not:
- Run against production or the preview branch's data.
- Weaken any guard to make a test pass. Fix the guard and report it.
- Change the GUC name or switch it to transaction scope.

Check before finishing:
- Suite passes locally.
- Remove one tenant filter deliberately, confirm the suite fails, restore.
- Revert the unconditional set_config, confirm the reuse test fails,
  restore.
- Add a dummy procedure with no coverage, confirm "endpoint not covered"
  fires, remove it.
- All 61 previously skipped tests now run. State the pass count and list
  any guard fixed as a result.
- Summary lists every endpoint covered and every guard found missing.

If the approach does not work, say what failed and suggest an alternative
before stopping. Commit at the end with a clear message.
```

---

## 10. After Prompt 3

Production cutover, human-run, not from a session:

1. Run `prisma migrate deploy` against production in a low-traffic window,
   using the same migration file that ran on the branch, unchanged.
2. Re-run the drift detector against production; expect zero findings.
3. Set `DATABASE_URL_APP_USER` to the production `app_user` Supavisor
   session-mode string. `DATABASE_URL` stays on the privileged `postgres`
   string — migrations and the sysadmin cross-tenant read path continue to
   use it.
4. Set `DB_ROLE_ENFORCEMENT=warn`. Watch for 24 hours.
5. Set `DB_ROLE_ENFORCEMENT=strict`.

Rollback at any point: point `DATABASE_URL_APP_USER` back at the `postgres`
string and set `DB_ROLE_ENFORCEMENT=warn`. Two environment variables, no
code change, no rebuild.
