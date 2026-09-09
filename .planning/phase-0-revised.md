# Phase 0 (Revised): Tenant Isolation

Supersedes `phase-0-tenant-isolation.md` (Prompts A1–A4).
Last updated: 2026-09-09
Status: **Prompt 0 complete. Prompt 0.5 awaiting approval.**

---

## 1. Working rules

1. Every Phase 0 session runs **from the repo root**. A session with database
   access but no checkout is not a valid Phase 0 session.
2. **Read-only queries against production are allowed** for evidence.
   `SELECT` through `execute_sql` is fine. No DDL, no DML, ever.
3. **No write of any kind to production originates from a session.** Every
   production change is a migration file in the repo, applied by a human.
4. **One artifact, one path.** Migrations are applied to the preview branch
   with `prisma migrate deploy` using the branch connection string, so the
   file that ran on the branch is byte-identical to the file a human later
   runs on production. `apply_migration` and resolved-not-run mirrors are not
   used in this phase.
5. **Never edit a migration that has already run.** Prisma verifies
   checksums. A correction is always a new forward migration, never an edit
   to history.
6. All prompts target a **Supabase preview branch**. Production cutover is a
   separate, human-run step.
7. One branch and one PR per prompt. No prompt starts until the previous PR
   is merged.
8. The drift detector runs immediately before and immediately after each
   prompt. Both raw outputs go in the PR description.

**Execution order: 0 (done) → 0.5 → 1 → 2 → 3.**

---

## 2. Locked decisions

| Decision | Value | Why |
|---|---|---|
| Tenant GUC name | `app.current_tenant_id` | Referenced by `current_tenant_id()` and every live policy |
| GUC scope | Session scope — `set_config(..., FALSE)` | `TRUE` caused P2028 deadlocks on the Supavisor session pooler |
| Policy shape | `tenant_isolation_policy` FOR ALL, GUC-based | The only shape that evaluates on a Prisma connection. See §3.1 |
| Column naming | `tenantId` and `org_id` handled explicitly per table | Dual naming is real: `Load."tenantId"`, `loads.org_id` |
| `carrier_documents` tenancy | Derive through `uploaded_by` | Avoids a schema migration on a live table |
| Tenant identity source | Authenticated session only | `x-tenant-id` is a veto, never a source. See §3.2 |
| `getAdminDb()` refactor | Dropped | Churn |
| Index creation | Plain `CREATE INDEX`, no `CONCURRENTLY` | Largest affected table is 757 rows |
| Connection routing | Supavisor session mode, existing pooler host | Change the role, not the route |
| 211 `app.bypass_rls` calls | Neutralised by dropping the policy, deleted separately | See §5 |

---

## 3. Findings established 2026-09-09

### 3.1 The 59 "missing" policies were never functional on the Prisma path

The drift detector reports 59 missing policies across 13 carrier tables,
suppressed against a baseline recorded 2026-09-03. `docs/diagnostics/
rls-policy-drop-forensics.md` (quick-584) established the loss removed
exactly and only the output of `20260404100013_carrier_rls_policies` and
`20260527000001_quick410_advisor_rls_fix`, while sparing every policy from
`20260515000001_db_security_standardization`, and that no repository artefact
accounts for the removal.

The migration header for the April set resolves what the forensics could not:

```
-- JWT claim structure:
--   org_id : (auth.jwt() ->> 'org_id')::uuid   — tenant scoping
--   role   : auth.jwt() ->> 'role'              — 'OWNER' | 'MANAGER' | 'DRIVER'
--   user   : auth.uid()                         — Supabase auth.uid()
```

All 59 are JWT-based. `auth.jwt()` and `auth.uid()` read
`request.jwt.claims`, a session variable PostgREST sets when a request
arrives through the Supabase API. A Prisma connection is a plain Postgres
connection with no JWT, so `auth.jwt()` returns null there and every one of
these policies would deny every row on every Prisma query.

**Verified: nothing in the product reads carrier tables through the Supabase
client.**

- `apps/web/src`: three files match `supabase.from(` / `createServerClient` /
  `createBrowserClient`, all under `lib/supabase/`, all client construction.
  Every other `.from(` hit is `Array.from`, `Buffer.from`, or
  `supabase.storage.from(BUCKET)`.
- `apps/mobile`: 1,038 `.ts`/`.tsx` files scanned, zero hits against any of
  the thirteen carrier table names.

**Consequences.** Two policy systems were built against two different context
mechanisms: April's JWT set for direct Supabase client access, May's
`current_tenant_id()` set for Prisma. Only one could ever evaluate on the
connection the app uses. The April set was inert before it was removed, which
is why three months passed with no behavioural change to notice.

**Decision.** Do not restore them. Restoring JWT policies onto the Prisma path
would return zero rows across the entire carrier surface — a total outage, not
a leak. The blanket GUC-based `tenant_isolation_policy` stays because it is the
only shape that works. Role-within-tenant and driver self-scoping move to
Phase 1, rebuilt on GUCs, scoped as new work rather than a restoration.

**Corollary.** Role-within-tenant authorization and driver self-scoping have
only ever been enforced by application `where` clauses. Driver Portal is live.
Whether those clauses are all present is an open question and becomes the
highest-value test in Prompt 3.

### 3.2 Tenant identity trust boundary — found, proven, closed

`getTenantPrisma()` read `x-tenant-id` and never compared it against the
session. Middleware overwrote that header at one line; three earlier returns
did not reach it. Both the Prisma filter and the RLS GUC derived from the same
unvalidated value, so a forged header defeated both layers at once.

Proven red-first at `0e1911bc` against the live database through the real
extension:

```
[LIVE] session tenant  = ""
[LIVE] forged header   = 37c5a354-ea02-46d8-a134-a3f552b397f0
[LIVE] rows returned   = [{ id: ac724a1f-…, tenantId: 37c5a354-…,
                            payStatus: APPROVED }]
```

After the fix: `rejected, 0 rows readable`.

Exploitable set was 36 endpoints calling `getTenantPrisma()` outside
`/api/mobile` with no session-tenant guard. Fixed at the resolver, not the
~90 call sites: the header is now a veto — absent or matching yields the
session tenant, disagreeing is logged as a security event and rejected.

Signup is not atomic and cannot be; Supabase Auth and Postgres share no
transaction. The `app_metadata` patch was non-fatal and the flow continued,
which is how a durable signable-in tenantless account could be created. It is
now fatal with retry-then-rollback, plus a guard refusing authentication for
any account already in that state.

Production check, read-only, 2026-09-09: **71 users, 0 tenantless.** Latent
hole, not an incident. The count is point-in-time and cannot prove no account
was ever stranded and later provisioned; no surviving audit surface would
answer that. The forward path is closed regardless.

Commits `0e1911bc`, `d7f9083c`, `b10e9020`.

### 3.3 Auth guard tests — stale, not broken

Three files fail completely or near-completely and are the guards Prompt 3
depends on. Triaged at `d193b877`, all three **TEST_STALE**. No guard is
defective; nothing an unauthenticated or under-privileged caller can do
follows from these failures.

| File | Last passed | Broken by |
|---|---|---|
| `require-auth.test.ts` | `d209ebe3` | `de01979f` |
| `require-role.test.ts` | `d209ebe3` | `de01979f` |
| `validate-mobile-token.test.ts` | `0a661285` | `d405e6d5` |

Both breaks are Phase 37.6 commits from 2026-03-31. **Red for five months.**

**`validate-mobile-token` carries a trap.** Its failing assertions encode the
insecure behaviour: the fixture puts claims in `user_metadata`; the guard
correctly reads `app_metadata`. `user_metadata` is user-writable via
`updateUser()`. Satisfying the test by editing the guard would let any
authenticated mobile user set their own role and tenant across ~90 mobile
routes. **The fixture moves. The guard does not.** This is the same class as
§3.2 — identity sourced from something the caller controls.

### 3.4 `vi.mock()` specifiers are invisible to import-path sweeps

`de01979f` correctly rewrote ~72 import paths and left the `vi.mock()`
specifier pointing at the module it had just deleted. `vi.mock()` takes a
string literal, so an import-path sweep passes over it and so does `tsc`. A
factory mock on a specifier nothing imports does not error — `vi.mocked()`
returns the real function and `.mockResolvedValue` is undefined on it.

**Rule for the decision log:** any module rename or deletion must grep
`vi.mock(`, `vi.doMock(`, and `jest.mock(` for the old specifier as a separate
step. Neither the compiler nor the import sweep will catch it.

### 3.5 Two gates that run and report success without checking

- The drift detector is `CLEAN (exit 0)` with 59 suppressed. A shrinking
  baseline that never shrank.
- The test suite has 17 failing files, three of them auth guards, red for
  five months.

Both are the same failure mode. Prompt 0.5 fixes the first; Prompt 3 fixes the
second.

**Current suite state:** 17 failed / 142 passed / 8 skipped (167 files).
Failures group as: workflow engine 45 across 7 files (separate subsystem, out
of Phase 0 scope), auth guards 10 across 3 files (§3.3), driver-pay 8 across 5
files, validation schemas 1.

---

## 4. Evidence gathered 2026-09-09 (production, read-only)

### 4.1 Environment

`oqdhberkghtnszrkdvfm`, named `drivecommand`, Postgres 17.6.1, `us-west-1`,
`ACTIVE_HEALTHY`. No branches at time of survey. Live traffic connects as
`postgres` via Supavisor. `postgres` has `rolbypassrls = true`, so every FORCE
RLS policy is currently decorative.

### 4.2 Policy and grant state

Every row in `public` that is not clean:

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

All other tables (approx. 90) report `rls_enabled = true`,
`rls_forced = true`, `policy_count >= 2`, full DML to `app_user`.

`pg_default_acl` returns **0** entries mentioning `app_user` for schema
`public`. Every future table acquires the zero-grant defect automatically.

### 4.3 Roles

```
rolname        rolsuper  rolbypassrls  rolcanlogin
-------------- --------  ------------  -----------
app_user       false     false         true
postgres       false     true          true
service_role   false     true          false
supabase_admin true      true          true
```

`app_user` is ready. Only its password and connection string are missing.

### 4.4 `bypass_rls_policy` is open to `app_user`

Identical on every tenant-scoped table: PERMISSIVE, `FOR ALL`, `TO public`,
`qual = current_setting('app.bypass_rls', true) = 'on'`. `public` includes
`app_user`, and Postgres places no privilege barrier on custom GUCs, so
`app_user` can set the flag on itself and disable tenant isolation across the
entire database in one statement.

Prompt 4's audit item 4 confirmed the sysadmin cross-tenant read path uses the
privileged `DATABASE_URL`. A `BYPASSRLS` role needs no policy, so the policy is
dropped rather than restricted.

### 4.5 Table sizes

```
stops 757 rows / 624 kB · route_template_stops 30 / 96 kB
carrier_documents 41 / 192 kB · loads 374 / 272 kB
route_templates 10 / 144 kB · route_matrix_cache 0 / 64 kB
grid_view 0 / 32 kB · grid_preference 0 / 32 kB
```

Plain `CREATE INDEX` holds `ACCESS EXCLUSIVE` for single-digit milliseconds.
`CONCURRENTLY` is unnecessary and unavailable inside a wrapped transaction
(SQLSTATE `25001`).

**For later, once a table crosses roughly 1M rows:** the concurrent index
statement goes in its own migration, isolated from any other statement,
applied via `prisma migrate deploy` or `psql -f`. Both run statements outside
an explicit transaction. Still one artifact on one path.

### 4.6 Connection ceiling

`max_connections = 60`, 3 superuser-reserved,
`idle_in_transaction_session_timeout = 0`. Direct port 5432 from Vercel
serverless is not viable. Supavisor session mode preserves the session
semantics session-scoped `set_config` requires; transaction mode (6543) does
not and is dangerous with this design.

### 4.7 Storage

Two buckets. The Supabase Storage path and an S3 SDK path against
`drivecommand-files`. The shared `assertTenantKey` helper requires a `tenant-`
prefix that `drivecommand-files` keys do not carry, so it is structurally
inapplicable there and correctly unused. That bucket's reads are signed with a
service-role client that bypasses Storage RLS, leaving application row checks
as the only control. No path signs or accepts a crafted key today.

---

## 5. The 211 `app.bypass_rls` calls

211 statements across 103 runtime files — driver dashboard, mobile endpoints,
public tracking, login, six cron digests. They are inert today because the app
connects as a role that bypasses RLS regardless. They **invert at cutover**:
under `app_user` each becomes a live isolation kill-switch on a path that has
never executed under enforcement.

**Do not remove 211 calls across 103 files as part of a security migration.**
Dropping `bypass_rls_policy` achieves the security property in one migration
touching zero application files — with no policy reading the GUC, all 211 are
permanently no-ops. Deletion becomes unhurried cleanup in its own PR where a
mistake costs nothing.

What is hidden inside the 211 and **is** Prompt 1's job: separating paths with
a decorative bypass from paths that genuinely need cross-tenant reads. Login
before tenant is known, public tracking, the six cron digests, and sysadmin
surfaces are legitimately cross-tenant and will break under `app_user` with the
policy gone. Those move to the privileged connection before cutover.

---

## 6. Prompt sequence

| # | Prompt | Output | Status |
|---|---|---|---|
| 4 | Role guard and storage audit | `docs/audits/role-guard-storage-audit.md` | Complete, `cc995ab1` |
| — | Auth guard triage | `docs/audits/auth-guard-test-triage.md` | Complete, `d193b877` |
| 0 | Tenant identity trust boundary | Resolver + middleware + signup | Complete, `b10e9020` |
| 0.5 | Close the recurrence path | Reconciliation migration + guards + docs | **Next** |
| 1 | Policies, grants, bypass drop | Migration | Pending |
| 2 | `app_user` cutover | Env + assertion + smoke | Pending |
| 3 | Suite repair + cross-tenant matrix | Tests + CI | Pending |

---

## 7. Prompt 0.5 — Close the recurrence path

Arms the detector at zero and closes the most plausible mechanism, **before**
Prompt 1 performs significant policy DDL. The migration in this prompt is a
deliberate no-op against live state: it drops policies that are already absent
and recreates policies that are already present, purely so the repo and the
database agree.

```
Task: Arm the policy drift gate at zero and close the path that most
plausibly caused the 2026 policy loss.

Use the GSD skill to build this.

Target: a Supabase preview branch. Production is never written from this
session.

Before you start:
- Run from the repo root. Confirm apps/web, apps/web/prisma/schema.prisma,
  and .planning are visible.
- Read .planning/phase-0-revised.md sections 3.1, 3.5 and 5.
- Read docs/diagnostics/rls-policy-drop-forensics.md, sections 4 and 5.
- Run npm run --workspace apps/web audit:rls-policy-drift and paste the raw
  output. This is the pre-baseline.
- Do not install any package.
- Briefly explain your approach in 2-3 sentences, then build.

Context: the detector reports CLEAN with 59 missing and 8 unexpected
policies suppressed against a 2026-09-03 baseline. The 59 are JWT-based
policies from 20260404100013_carrier_rls_policies and
20260527000001_quick410_advisor_rls_fix that reference auth.jwt() and
auth.uid(). Those return null on a Prisma connection, and no code in
apps/web or apps/mobile reads carrier tables through the Supabase client,
so the policies were inert before they were removed. They are not being
restored. The 8 unexpected are live policies on document_imports,
document_import_pages, document_profiles and facility_external_references
applied out of band via Supabase MCP and never mirrored (DEC-17).

Build:

1. A reconciliation migration that brings the repo into agreement with the
   database without changing live state:
   - DROP POLICY IF EXISTS for each of the 59 named April and quick-410
     policies, on their tables. They are already absent; these statements
     record the decision and zero the detector's expected set.
   - For each of the 8 out-of-band policies, DROP POLICY IF EXISTS then
     CREATE POLICY with the definition currently live, read from
     pg_policies. They are already present; this makes the repo their
     source of truth.
   - A header comment stating why the 59 are not restored: JWT-based,
     structurally inert on the Prisma connection, superseded by
     20260515000001_db_security_standardization, verified no Supabase
     client path reads these tables. Reference this file and the forensics
     document.
   Do NOT edit either historical migration file. Prisma verifies
   checksums; a correction is a new forward migration.

2. Remove the suppression baseline from scripts/audit/rls-policy-drift.ts
   entirely. After step 1 the true drift is zero, so the gate no longer
   needs a baseline and must fail on any future non-zero result. Confirm
   the script exits non-zero when drift exists by introducing one
   deliberate discrepancy, observing the failure, and reverting it.

3. Wire audit:rls-policy-drift into CI on every pull request, failing the
   build on non-zero.

4. A guard script that refuses prisma db push when DATABASE_URL resolves to
   the production host. Wire it so it runs before any db push invocation
   reachable from package.json.

5. An event trigger on sql_drop recording DROP POLICY into a durable table
   with statement, role, and timestamp. This is the only monitoring option
   that survives log rotation. Include it in the same migration.

6. Enable the pgaudit extension and set pgaudit.log = 'ddl'. It is already
   in shared_preload_libraries. If this requires a privilege the branch
   role lacks, say so and leave it as a documented manual step rather than
   failing the prompt.

7. Fix the four documents that instruct prisma db push:
   - apps/web/docs/database.md:155-160 — scoped to "local development",
     but there is no local database and .env.local is production.
   - apps/web/docs/setup.md:90-94 — unqualified, in first-time setup.
   - apps/web/docs/setup.md:161-162 — instructs resolving a "drift
     detected" warning and retrying. DELETE this entry outright. Drift is
     Prisma reporting that the database holds objects the schema does not
     describe, which is exactly what an RLS policy is.
   - apps/web/docs/stack.md:41 and docs/troubleshooting.md:35.
   Reconcile the contradiction: database.md:160 says do not use
   prisma migrate dev; troubleshooting.md:50 and CONTRIBUTING.md:166 say
   always use it. Pick the one that matches scripts/migrate.mjs and make
   all five documents agree.

Do not:
- Restore any of the 59 policies.
- Edit any migration file that has already been applied.
- Point prisma migrate deploy at the production project ref.
- Change any application code.
- Touch bypass_rls_policy, grants, or the three zero-policy tables. That
  is Prompt 1.

Check before finishing:
- prisma migrate deploy applies the reconciliation migration cleanly to
  the branch.
- Confirm live state is unchanged: policy counts per table before and
  after are identical. Paste both.
- npm run --workspace apps/web audit:rls-policy-drift reports zero missing,
  zero unexpected, and no baseline. Paste the raw post output.
- The deliberate-discrepancy probe from step 2 failed the gate. Paste it.
- The db push guard blocks against a production-shaped DATABASE_URL. Prove
  it.
- The sql_drop trigger records a test DROP POLICY on a throwaway policy on
  the branch. Paste the recorded row, then clean up.
- All five documents agree on the migration workflow. List them.
- The 17 existing isolation tests still pass.

If the approach does not work, say what failed and suggest an alternative
before stopping. Commit at the end with a clear message.
```

---

## 8. Prompt 1 — Policies, grants, default privileges, bypass drop

```
Task: Close the policy, grant, and default-privilege gap, and remove the
app_user bypass path.

Use the GSD skill to build this.

Target: a Supabase preview branch. Production is never written from this
session. The deliverable is a migration file a human later applies to
production unchanged.

Before you start:
- Run from the repo root.
- Read .planning/phase-0-revised.md sections 4 and 5, and
  docs/audits/role-guard-storage-audit.md.
- Confirm Prompt 0.5's PR is merged and the drift detector reports zero
  with no baseline. If a baseline still exists, stop.
- Run the drift detector and paste the raw pre output.
- Do not install any package.
- Do not rename any GUC. app.current_tenant_id, set_config(..., FALSE).
  The session scope is a deliberate deviation from spec Section 2.5
  because TRUE causes P2028 deadlocks on the Supavisor session pooler.
- Briefly explain your approach in 2-3 sentences, then build.

Build, as one migration file, idempotent, with a rollback section:

1. tenant_isolation_policy on the three FORCE-RLS tables that have none,
   following the exact FOR ALL GUC-based shape used by the tables that
   pass:
   - stops, via load_id to loads.org_id
   - route_template_stops, via route_template_id to route_templates.org_id
   - carrier_documents, via uploaded_by. Do not add a tenant column and do
     not write a backfill for this table.

2. route_matrix_cache: ENABLE and FORCE ROW LEVEL SECURITY,
   tenant_isolation_policy on org_id, full DML grants to app_user.

3. DROP bypass_rls_policy from every table. The sysadmin cross-tenant read
   path uses the privileged DATABASE_URL per the Prompt 4 audit, and a
   BYPASSRLS role needs no policy. Do not delete the 211 app.bypass_rls
   set_config calls in application code — dropping the policy makes them
   permanent no-ops, and their removal is a separate PR.

4. Before dropping, classify every one of the 211 call sites as either
   DECORATIVE (the path is tenant-scoped and the bypass was never needed)
   or CROSS_TENANT (the path legitimately reads across tenants and will
   break under app_user once the policy is gone). Expect login before
   tenant is known, the public tracking page, the six cron digests, and
   sysadmin surfaces in the second group. Move every CROSS_TENANT path to
   the privileged connection. Write the classification to
   docs/audits/bypass-call-classification.md. This is the load-bearing
   part of this prompt.

5. Grants for the nine zero-grant tables, split by classification:
   - Tenant-scoped (route_matrix_cache): SELECT, INSERT, UPDATE, DELETE.
   - Global reference read by the app (Plan, Promo, NotificationTemplate,
     NotificationEmailConfig, carrier_catalog_meta): SELECT, plus any
     write the sysadmin path provably needs.
   - grid_view and grid_preference: user-scoped on userId. Grant DML and
     add both to EXEMPT_MODELS with the owning column named in a comment.
     Note explicitly that exemption from tenant policy is not exemption
     from access control — both currently have RLS disabled and rely on
     application where clauses. Log user-scoped RLS as a Phase 1 item.
   - _prisma_migrations: no grant.
   A missing SELECT on a global reference table breaks the app at cutover.
   Verify each against actual read paths, not assumption.

6. ALTER DEFAULT PRIVILEGES IN SCHEMA public so future tables grant to
   app_user automatically.

7. ALTER ROLE app_user SET idle_in_transaction_session_timeout to a
   sensible value. The instance-wide setting is 0.

8. Missing composite indexes per spec Section 5.2 on the tables in this
   set. Plain CREATE INDEX. Do not use CONCURRENTLY.

9. Handle dual column naming by reading the actual column from
   information_schema per table. Do not assume tenantId or org_id.

10. Apply to the branch with prisma migrate deploy using the branch
    connection string. The committed file must be the exact file that ran.

Do not:
- Restore any of the 59 JWT policies.
- Edit any already-applied migration.
- Point prisma migrate deploy at the production project ref.
- Use apply_migration or execute_sql for DDL.
- Delete the 211 app.bypass_rls calls.
- Change application code beyond moving CROSS_TENANT paths to the
  privileged connection and adding the two EXEMPT_MODELS entries. Both are
  expected; do not stop to ask.
- Modify the tenant context resolver, the RLS extension, or middleware.

Check before finishing:
- prisma migrate deploy applies cleanly; _prisma_migrations on the branch
  holds the row.
- The committed migration file is the exact file that ran. State its path.
- The drift detector reports zero. Paste the raw post output.
- Zero tables have FORCE RLS with zero policies.
- Zero tenant-scoped tables have zero grants to app_user.
- pg_default_acl returns non-zero for app_user in schema public.
- No bypass_rls_policy exists anywhere.
- Every CROSS_TENANT path in the classification file is on the privileged
  connection. List them individually.
- The 17 existing isolation tests still pass.
- npx prisma validate and npx prisma generate succeed.

If the approach does not work, say what failed and suggest an alternative
before stopping. Commit at the end with a clear message.
```

---

## 9. Prompt 2 — `app_user` cutover

```
Task: Cut the application's runtime database connection from postgres to
app_user, on the preview branch.

Use the GSD skill to build this.

Target: the preview branch only. Production cutover is a later human-run
env flip and is not part of this prompt.

Before you start:
- Run from the repo root.
- Confirm Prompt 1's PR is merged and the drift detector reports zero
  against the branch. If not, stop. Cutting over with a missing grant
  produces permission-denied errors; with a missing policy, silently empty
  pages.
- Confirm every CROSS_TENANT path from
  docs/audits/bypass-call-classification.md is on the privileged
  connection. If any is not, stop.
- Confirm DATABASE_URL_APP_USER is present in apps/web/.env.local and
  points at the branch. If absent, stop. Do not fall back to DATABASE_URL.
- Do not install any package.
- Briefly explain your approach in 2-3 sentences, then build.

Build:
1. Point the runtime Prisma datasource at DATABASE_URL_APP_USER. Keep the
   privileged DATABASE_URL for migrations and the sysadmin cross-tenant
   read path only.
2. The connection string uses Supavisor session mode on the existing
   pooler host with connection_limit=1 and pool_timeout=20. Do not use
   direct port 5432 — max_connections is 60 and Vercel serverless will
   exhaust it. Do not use transaction mode on 6543 — it breaks
   session-scoped set_config.
3. A startup assertion querying pg_roles for the connected role, checking
   rolbypassrls and rolsuper. Gate on DB_ROLE_ENFORCEMENT: "strict" throws,
   "warn" logs and continues. The gate exists so rollback is possible;
   postgres has rolbypassrls = true and a hard throw would refuse to boot
   on rollback.
4. Activate the app_user measurement harness scaffolded in quick-589.
5. A smoke script connecting as app_user with no tenant context, running a
   bare SELECT against loads, carrier_drivers, driver_settlements,
   carrier_documents, and stops, asserting zero rows on each.

Do not:
- Change query logic, repositories, or route handlers.
- Change getTenantPrisma or the RLS extension internals.
- Modify the GUC name or its session scope.
- Point anything at the production project ref.

Check before finishing:
- The no-context smoke script returns zero rows on all five tables.
- With app.current_tenant_id set to tenant A, zero tenant B rows visible,
  and the reverse.
- The startup assertion fires in strict mode against postgres. Prove it,
  then revert.
- Manual click-through on the branch. Report each individually as pass or
  fail, not as one line: Loads, Drivers, Live Tracking, Settlements,
  Driver Portal, SysAdmin, public tracking page, login, document upload,
  document download, and one cron digest.
- List every file changed.
- State the rollback explicitly: DATABASE_URL_APP_USER reverted and
  DB_ROLE_ENFORCEMENT set to warn. Two environment variables, no code
  change, no rebuild.

If the approach does not work, say what failed and suggest an alternative
before stopping. Report exactly which surfaces broke. Commit at the end
with a clear message.
```

---

## 10. Prompt 3 — Suite repair, connection reuse, cross-tenant matrix

```
Task: Make the test suite a signal again, make session-scope leakage
impossible rather than unlikely, and prove tenant and driver isolation at
the endpoint level.

Use the GSD skill to build this.

Target: test database only. Never production, never the branch's live data.

Before you start:
- Run from the repo root.
- Read docs/audits/auth-guard-test-triage.md and
  docs/audits/role-guard-storage-audit.md. Every route the latter flagged
  as unguarded or tenant-unchecked joins this suite's coverage list.
- Read .planning/phase-0-revised.md sections 3.1, 3.3 and 3.4.
- Find the existing test runner and CI config. Use them. No second
  framework.
- Do not install any package. If you think one is needed, stop and explain.
- Briefly explain your approach in 2-3 sentences, then build.

Build:

1. Repair the three stale auth guard test files per the triage:
   - require-auth.test.ts and require-role.test.ts: the vi.mock specifier
     points at @/lib/auth/session, deleted in de01979f. Repoint it at
     @/lib/auth/supabase. The guard bodies are byte-identical before and
     after the break; do not change them.
   - validate-mobile-token.test.ts: the fixture puts claims in
     user_metadata; the guard correctly reads app_metadata. MOVE THE
     FIXTURE. Do not change the guard. user_metadata is user-writable via
     updateUser(), so making the guard read it would let any authenticated
     mobile user set their own role and tenant across ~90 mobile routes.
   - Add a check that greps vi.mock/vi.doMock/jest.mock specifiers against
     existing module paths and fails on a specifier that resolves to
     nothing. A factory mock on a dead specifier does not error, and
     neither tsc nor an import-path sweep catches it.

2. Change the scoped client to set app.current_tenant_id unconditionally
   at the top of every transaction rather than only when it differs. Keep
   session scope, set_config(..., FALSE). Do not switch to transaction
   scope; TRUE causes P2028 deadlocks on the Supavisor session pooler.

3. Connection-reuse leak test:
   a. Set app.current_tenant_id to tenant A on one pooled connection, run
      a query, end the transaction.
   b. On the same physical connection, without setting the GUC, run a bare
      SELECT against loads, carrier_drivers, and driver_settlements.
   c. Assert zero rows.
   d. Repeat with tenant B set, assert zero tenant A rows.
   e. Assert the test fails if step 2 is reverted. Prove it, then restore.

4. Driver visibility tests. Role-within-tenant and driver self-scoping have
   only ever been enforced by application where clauses; the database has
   never enforced them on the Prisma path. Driver Portal is live. For every
   driver-facing read — loads, stops, driver_pay_records, carrier_expenses,
   driver_settlements, carrier_drivers — seed two drivers in the SAME
   tenant and assert driver one cannot read driver two's rows through any
   endpoint. Report every endpoint where this fails. Do not fix silently:
   name each one.

5. Fix the vitest configuration so DATABASE_URL loads. Unskip the 61
   skipped security tests. Report which fail and fix the underlying guard,
   never the test.

6. Seed two tenants A and B, each with an owner, dispatcher, driver,
   client, truck, load, trip with stops, route template, checklist,
   compensation template, settlement, and one uploaded document. Test
   database only — never write a disposable tenant to production.

7. As each role in tenant A, for every tRPC procedure and route handler
   touching a tenant-scoped model: attempt read, list, update,
   soft-delete, hard-delete, and download using tenant B identifiers.
   Every attempt returns 404 or 403. Never 200, never 500, never an error
   revealing the record exists.

8. Assert list endpoints return only tenant A rows.

9. Assert a create carrying a client-supplied tenantId or org_id for B is
   rejected or overwritten with the session tenant.

10. Assert a signed URL for a tenant B object cannot be generated from a
    tenant A session, on BOTH buckets — the Supabase Storage path and the
    S3 drivecommand-files path. The latter signs with a service-role
    client that bypasses Storage RLS, so application row checks are its
    only control. Assert an upload with a tenant-B-prefixed key is
    rejected.

11. One shared helper derives the attack list from the router definition,
    so a new procedure added without coverage fails with "endpoint not
    covered" rather than passing silently.

12. Wire the suite into CI on every pull request.

Do not:
- Run against production or the branch's data.
- Weaken any guard to make a test pass. Fix the guard and report it.
- Change the GUC name or switch it to transaction scope.
- Touch the workflow engine tests, the driver-pay exporter tests, or the
  validation schema test. Out of scope; they are tracked separately.

Check before finishing:
- The three auth guard files pass. State that no guard body changed and
  that the mobile fixture moved to app_metadata.
- The dead-specifier check fails on a deliberately broken vi.mock. Prove
  it, then revert.
- Revert step 2, confirm the reuse test fails, restore.
- Remove one tenant filter deliberately, confirm the suite fails, restore.
- Add a dummy procedure with no coverage, confirm "endpoint not covered"
  fires, remove it.
- All 61 previously skipped tests now run. State the pass count and list
  every guard fixed.
- Report the driver visibility result per endpoint. This is the headline
  finding of this prompt.
- Give a before/after suite count measured the same way, not inherited
  from a prior summary.

If the approach does not work, say what failed and suggest an alternative
before stopping. Commit at the end with a clear message.
```

---

## 11. After Prompt 3 — production cutover

Human-run, not from a session.

1. Run `prisma migrate deploy` against production in a low-traffic window,
   using the same migration files that ran on the branch, unchanged.
2. Re-run the drift detector against production; expect zero, no baseline.
3. Set `DATABASE_URL_APP_USER` to the production `app_user` Supavisor
   session-mode string. `DATABASE_URL` stays on the privileged `postgres`
   string for migrations and the sysadmin cross-tenant read path.
4. Set `DB_ROLE_ENFORCEMENT=warn`. Watch for 24 hours.
5. Set `DB_ROLE_ENFORCEMENT=strict`.

Rollback at any point: point `DATABASE_URL_APP_USER` back at the `postgres`
string and set `DB_ROLE_ENFORCEMENT=warn`. Two environment variables, no code
change, no rebuild.

---

## 12. Follow-up list — out of Phase 0 scope

Tracked, not scheduled here.

- **Role-within-tenant and driver self-scoping at the database layer**,
  rebuilt on GUCs. Needs `app.current_user_id` and `app.current_user_role`
  set in the same `set_config` batch, plus companion functions alongside
  `current_tenant_id()`. This is Phase 1's largest item.
- **User-scoped RLS on `grid_view` and `grid_preference`.** Both currently
  rely on application `where` clauses only.
- **Delete the 211 `app.bypass_rls` calls** across 103 files, after the
  policy drop makes them no-ops.
- **Workflow engine test suite**: 45 failures across 7 files.
- **Driver-pay test failures**: 4 golden exporters plus `settlements-paid`.
- **`[settlement/finalize] R2 upload failed: TypeError: (input) => input is
  not a constructor`** — a settlement finalize path still calls Cloudflare
  R2 after the P5 migration to Supabase Storage. Determine whether this is
  live code or a test stub. If live, settlement PDFs are not being stored.
- **`resolveSenderConfig` swallows a TypeError** and falls back to env. A
  fallback that catches a type error will also swallow a genuine config
  failure.
- **`search-index.json` and the generated Prisma client are in version
  control** and are stale. Gitignore both; generate at build time.
- **`docs/audits/role-guard-storage-audit.md` P4 items**: nine private
  `requireAdminAccess` definitions with the ninth divergent;
  `markCongratsShown` is the only tenant-touching server action with no
  guard.
- **Install `pgaudit` and ship Postgres logs off-platform** if Prompt 0.5
  leaves either as a manual step. Current DDL log retention is ~24 hours.
