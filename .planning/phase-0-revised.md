# Phase 0 (Revised): Tenant Isolation

Supersedes `phase-0-tenant-isolation.md` (Prompts A1–A4).
Last updated: 2026-09-09
Status: **Prompts 0 and 0.5 complete. Prompt 0.75 awaiting approval.**

---

## 1. Working rules

1. Every Phase 0 session runs **from the repo root**. A session with database
   access but no checkout is not a valid Phase 0 session.
2. **Read-only queries against production are allowed** for evidence.
   `SELECT` through `execute_sql` is fine. No DDL, no DML, ever.
3. **No write of any kind to production originates from a session.** Every
   production change is a migration file in the repo, applied by a human.
4. **One artifact, one applier.** Migrations are applied with
   `node scripts/migrate.mjs` — the applier this repo actually deploys with —
   against a session-mode connection string. The file that ran on staging is
   byte-identical to the file that later runs on production, applied by the
   same code. `apply_migration`, `prisma migrate deploy`, and resolved-not-run
   mirrors are not used in this phase. See §3.6.
5. **Never edit a migration that has already run.** Prisma verifies
   checksums. A correction is always a new forward migration, never an edit
   to history.
6. All prompts target a **second Supabase project** seeded from the repo's
   own migrations. Preview branches do not work here — see §3.6. Production
   cutover is a separate, human-run step.
7. One branch and one PR per prompt. No prompt starts until the previous PR
   is merged.
8. The drift detector runs immediately before and immediately after each
   prompt. Both raw outputs go in the PR description.

**Execution order: 0 (done) → 0.5 (done) → 0.75 → 1 → 2 → 3.**

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
| Connection routing | Runtime moves 6543 → 5432 at cutover | Session-scoped GUC needs session semantics. See §3.7 |
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

### 3.6 Preview branches cannot serve as a verification target

Measured, not inferred. A branch was created, inspected, and deleted in
session (`1d18c48c`, `docs/audits/branch-viability.md`).

A preview branch came up with **zero tables in `public`**, against
production's 98. Not an incomplete replica — an empty one. None of the
thirteen carrier tables exist, including `stops`, `route_template_stops` and
`carrier_documents`, which are exactly the three tables Prompt 1 targets.

The cause is that Supabase seeds a branch from its own migration ledger,
never from a production schema snapshot and never with data. Established
from three sources: the branching documentation's Pull and Migrate steps
plus its "Data-less" note, `create_branch` returning `with_data: false`, and
the absence of any `supabase/` directory, `config.toml` or `seed.sql` in this
repo.

**That ledger could not rebuild the schema regardless of how complete it
was, because it has no baseline.** Its earliest entry is an
`ALTER TABLE "Customer"` against a table nothing in the ledger creates.

The two ledgers, for the record:

| | entries | earliest | authoritative |
|---|---|---|---|
| `_prisma_migrations` | 141 | `00000000000000_init` | Yes — `scripts/migrate.mjs` reads and writes only this |
| `supabase_migrations.schema_migrations` | 36 | an `ALTER TABLE` with no baseline | No — no runner in this repo references it |

Zero names match exactly; 27 match on descriptive suffix alone. Supabase
stamps `version` with the wall-clock time of the `apply_migration` call while
the repo directory carries its authored timestamp, so the same migration is
one key in the repo and a different key in the Supabase ledger. All three
carrier RLS migrations are absent from the Supabase ledger entirely.

**Decision.** Stand up a second Supabase project and seed it by running
`node scripts/migrate.mjs` against it. That is the applier this repo deploys
with, it starts from `00000000000000_init`, and it builds the roles, the
carrier tables and the RLS migrations in order. Rejected alternatives:
backfilling the Supabase ledger (reconstructing 141 entries into a second
ledger no runner reads, creating a permanent drift surface); a scrubbed
production snapshot (more work, and the repo migrations are the thing being
verified); verify-by-inspection only (covers Prompt 1, does nothing for
Prompt 2's click-through).

Inferred rather than measured: `app_user` is created by a repo migration
absent from the Supabase ledger, and roles are per-cluster, so a branch would
not have carried it. Moot now.

### 3.7 Production runs on the transaction pooler, not session mode

I had this wrong in an earlier revision. `application_name = Supavisor` in
`pg_stat_activity` does not distinguish the two modes, and I did not check
the port. `.env.local` settles it:

```
DATABASE_URL  → aws-1-us-west-1.pooler.supabase.com:6543  ?pgbouncer=true
DIRECT_URL    → aws-1-us-west-1.pooler.supabase.com:5432
```

`6543` is Supavisor **transaction mode**, serving runtime queries. `5432` is
Supavisor **session mode**, used for migrations. This is the standard
Prisma-on-Supabase arrangement and is correct as configured.

**Consequence for the cutover.** Session-scoped `set_config(..., FALSE)`
requires session semantics. On a transaction pooler the server connection
returns to the pool after every transaction, so session state is either
discarded or carried onto a connection handed to a different tenant. The
combination the plan calls dangerous is what production runs on today.

It is **not currently exploitable**: the app connects as `postgres`, which
has `BYPASSRLS`, so no policy evaluates and the GUC does nothing. Tenant
scoping today comes entirely from the Prisma extension's `where` clauses. The
GUC is defence-in-depth that is presently inert. It becomes live at the
`app_user` cutover.

So Prompt 2 must change **the route as well as the role**: runtime moves from
6543 to 5432. That is a materially bigger change than the earlier "change the
role, not the route" framing, and it raises a capacity question that must be
measured rather than assumed. Session mode holds a server connection for the
life of the client connection, against a 60-connection instance ceiling, with
Vercel scaling lambda instances independently. Connection capacity is now the
central risk in Prompt 2, and the second project is where it gets measured.

Also unverified: Supavisor addresses roles as `<role>.<project_ref>`, so
`app_user` would connect as `app_user.oqdhberkghtnszrkdvfm`. Whether Supavisor
accepts a non-`postgres` role on this project must be confirmed on the second
project before the production cutover, not during it.


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
`idle_in_transaction_session_timeout = 0`.

Direct port 5432 on the database host is not viable from Vercel serverless.
Supavisor session mode on the pooler host is the route the cutover targets —
see §3.7 for why the route must change, and for the capacity question that
change opens. Transaction mode (6543) cannot carry a session-scoped GUC.

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
| 0.5 | Arm the drift gate, close recurrence | Reconciliation migration + guards + docs | Complete, `54f7b4cc` |
| — | Branch viability | `docs/audits/branch-viability.md` | Complete, `1d18c48c` |
| 0.75 | Stand up the staging project | Seeded second project + connection strings | **Next** |
| 1 | Policies, grants, bypass drop | Migration | Pending |
| 2 | `app_user` cutover + route change | Env + assertion + capacity measurement | Pending |
| 3 | Suite repair + cross-tenant matrix | Tests + CI | Pending |

**Prompt 0.5 outstanding items.** `RLS_AUDIT_DATABASE_URL` is set. The
`sql_drop` event trigger is a **post-deploy** step: `policy_drop_audit_fn()`
is created by the unapplied reconciliation migration, so running
`CREATE EVENT TRIGGER` before the next deploy fails with
`42883: function does not exist` — confirmed against production 2026-09-09.
Re-run it after the migration lands, at which point the superuser ceiling
gets tested for the first time. pgaudit is deferred: it writes to the same
Postgres log that already failed, ~24h retention against a loss found three
months later, so it earns nothing until a log drain exists.

---

## 7. Prompt 0.5 — complete

Shipped at `54f7b4cc`. Prompt body retained in git history; not reproduced
here. What it delivered: a reconciliation migration recording the 59 JWT
policies as not-restored and mirroring the 8 out-of-band `document_import*`
policies; the drift gate armed at zero with no suppression list, proven
non-vacuous by a probe; a `db push` guard blocking production across seven
cases and failing closed; CI wired on every pull request; five documents
reconciled onto one migration workflow; `policy_drop_audit` table and
function created.

The migration is **unapplied**. `scripts/migrate.mjs` applies it on the next
deploy. The drift gate reads zero because the detector computes its expected
set by replaying migration files and never consults `_prisma_migrations`.
Post-deploy check: if any table's policy count moves, the file is wrong and
should be reverted.

The stray `main` branch record was left in place. Its `project_ref` and
`parent_project_ref` both point at the production project and `is_default` is
true. No read-only call reveals what deleting a default branch does to the
project it points at, so it is a dashboard action with visible consequences,
not a session action.

---

## 7.5 Prompt 0.75 — Stand up the staging project

```
Task: Create and seed a second Supabase project to serve as the
verification target for Prompts 1, 2 and 3.

Use the GSD skill to build this.

Target: a new Supabase project. Production is never written from this
session.

Before you start:
- Run from the repo root.
- Read .planning/phase-0-revised.md sections 3.6 and 3.7, and
  docs/audits/branch-viability.md.
- Call get_cost for a new project on org smtxeyavhusrpylmpywu, state the
  cost, and stop for confirmation before creating anything.
- Do not install any package.
- Briefly explain your approach in 2-3 sentences, then build.

Context: preview branches come up with zero tables because Supabase seeds
them from its own 36-entry ledger, which has no baseline. The repo's
141-entry _prisma_migrations ledger and scripts/migrate.mjs are
authoritative. Production runs runtime queries through Supavisor
transaction mode on 6543 and migrations through session mode on 5432.

Build:

1. Create a Supabase project named drivecommand-staging in org
   smtxeyavhusrpylmpywu, same region as production (us-west-1), after
   the user confirms cost.

2. Seed it by running node scripts/migrate.mjs with the connection
   pointed at the new project's session-mode string on port 5432. Use the
   repo's own applier. Do not use prisma migrate deploy, apply_migration,
   or db push.

3. Verify the seed: report the table count in public against production's
   98, and confirm all thirteen carrier tables exist, naming stops,
   route_template_stops and carrier_documents individually. Report the
   _prisma_migrations row count against production's 141. If any
   migration fails, stop and report which one and why — a failure here is
   a real defect in the migration chain, not a staging problem.

4. Confirm the app_user role exists on the new project, with
   rolsuper = false and rolbypassrls = false. It should be created by a
   repo migration. If it is absent, say so — that means role creation is
   not in the migration chain and production's app_user was created out
   of band.

5. Set a password for app_user on the staging project and record BOTH
   connection strings in apps/web/.env.staging, gitignored:
   - STAGING_DATABASE_URL      postgres role, 6543, transaction mode
   - STAGING_DIRECT_URL        postgres role, 5432, session mode
   - STAGING_DATABASE_URL_APP_USER   app_user, 5432, session mode,
     connection_limit=1, pool_timeout=20
   Do not put any of these in .env.local and do not commit them.

6. Confirm Supavisor accepts app_user. The tenant format is
   <role>.<project_ref>, so app_user connects as app_user.<staging_ref>.
   Open a connection as app_user through the 5432 pooler host and run
   SELECT current_user. If Supavisor rejects a non-postgres role, stop
   and report it — that finding blocks Prompt 2's production cutover and
   must be known now rather than during it.

7. Load minimum test data: two tenants, each with an owner, a dispatcher,
   two drivers, a client, a truck, a load with stops, a route template,
   and one document row. Prompt 2's click-through and Prompt 3's driver
   visibility tests both need populated tenants. Use the repo's existing
   seed helper if one exists; if not, say so and write the smallest one
   that serves both prompts.

8. Write docs/audits/staging-environment.md recording: project ref,
   region, table count, migration count, which env keys were created,
   the Supavisor app_user result from step 6, and what test data exists.

Do not:
- Write anything to the production project.
- Put staging strings in .env.local or commit any connection string.
- Use prisma migrate deploy, apply_migration, or prisma db push.
- Copy production data.

Check before finishing:
- Table count and migration count reported against production's 98 and
  141, with any difference explained.
- All thirteen carrier tables confirmed present, named individually.
- app_user exists with rolsuper = false and rolbypassrls = false.
- SELECT current_user through the 5432 pooler as app_user returns
  app_user, or the rejection is reported.
- Both tenants and their rows exist; give counts per table.
- git status shows only the audit file and a .gitignore change.

If the approach does not work, say what failed and suggest an alternative
before stopping. Commit at the end with a clear message.
```

---

## 8. Prompt 1 — Policies, grants, default privileges, bypass drop

```
Task: Close the policy, grant, and default-privilege gap, and remove the
app_user bypass path.

Use the GSD skill to build this.

Target: the drivecommand-staging project. Production is never written
from this session. The deliverable is a migration file a human later
applies to production unchanged.

Before you start:
- Run from the repo root.
- Read .planning/phase-0-revised.md sections 3.6, 4 and 5, and
  docs/audits/role-guard-storage-audit.md and
  docs/audits/staging-environment.md.
- Confirm Prompt 0.75's PR is merged and staging has all thirteen carrier
  tables. If staging is not seeded, stop.
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

10. Apply to staging with node scripts/migrate.mjs against
    STAGING_DIRECT_URL. Use the repo's own applier — not
    prisma migrate deploy, not apply_migration. The committed file must be
    the exact file that ran.

Do not:
- Restore any of the 59 JWT policies.
- Edit any already-applied migration.
- Point any applier at the production project ref.
- Use prisma migrate deploy, apply_migration, or execute_sql for DDL.
- Delete the 211 app.bypass_rls calls.
- Change application code beyond moving CROSS_TENANT paths to the
  privileged connection and adding the two EXEMPT_MODELS entries. Both are
  expected; do not stop to ask.
- Modify the tenant context resolver, the RLS extension, or middleware.

Check before finishing:
- scripts/migrate.mjs applies cleanly against staging;
  _prisma_migrations on staging holds the row.
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

## 9. Prompt 2 — `app_user` cutover and route change

Rewritten. The earlier version assumed runtime already ran on session mode.
It does not — see §3.7. This prompt now changes the route as well as the
role, and connection capacity is its central risk.

```
Task: Move the application's runtime database connection from postgres on
the transaction pooler to app_user on the session pooler, and measure
whether the connection ceiling holds.

Use the GSD skill to build this.

Target: the drivecommand-staging project only. Production cutover is a
later human-run step and is not part of this prompt.

Before you start:
- Run from the repo root.
- Read .planning/phase-0-revised.md section 3.7 and
  docs/audits/staging-environment.md.
- Confirm Prompt 1's PR is merged and the drift detector reports zero
  against staging. If not, stop. Cutting over with a missing grant
  produces permission-denied errors; with a missing policy, silently
  empty pages.
- Confirm every CROSS_TENANT path from
  docs/audits/bypass-call-classification.md is on the privileged
  connection. If any is not, stop.
- Confirm STAGING_DATABASE_URL_APP_USER exists in .env.staging and that
  Prompt 0.75 step 6 proved Supavisor accepts app_user. If Supavisor
  rejects the role, stop — nothing else in this prompt matters.
- Do not install any package.
- Briefly explain your approach in 2-3 sentences, then build.

Context: runtime currently uses Supavisor transaction mode on 6543 with
pgbouncer=true, as postgres. The tenant GUC is session-scoped, so it needs
session semantics that transaction mode does not provide. Today this is
inert because postgres has BYPASSRLS and no policy evaluates. It becomes
live under app_user. So the route must change from 6543 to 5432 at the
same time as the role.

Build:
1. Point the runtime Prisma datasource at the app_user session-mode
   string: port 5432 on the pooler host, connection_limit=1,
   pool_timeout=20, no pgbouncer=true. Keep the privileged postgres
   string for migrations and the sysadmin cross-tenant read path only.
2. A startup assertion querying pg_roles for the connected role, checking
   rolbypassrls and rolsuper, AND asserting the port is 5432 rather than
   6543. Gate on DB_ROLE_ENFORCEMENT: "strict" throws, "warn" logs and
   continues. The gate exists so rollback is possible; postgres has
   rolbypassrls = true and a hard throw would refuse to boot on rollback.
3. Activate the app_user measurement harness scaffolded in quick-589.
4. A smoke script connecting as app_user with no tenant context, running
   a bare SELECT against loads, carrier_drivers, driver_settlements,
   carrier_documents, and stops, asserting zero rows on each.
5. CONNECTION CAPACITY MEASUREMENT. This is the load-bearing part of this
   prompt. Session mode holds a server connection for the life of the
   client connection. max_connections on a Supabase instance of this size
   is 60, three superuser-reserved. Vercel scales lambda instances
   independently, each holding its own pool.
   - Determine the Supavisor session-mode pool size for the staging
     project and state where you read it.
   - Drive concurrent load against staging at increasing concurrency and
     record where connections saturate: what concurrency level produces
     the first pool_timeout, and what the error surfaces as to a user.
   - State the maximum concurrent lambda count the production
     configuration can support before saturation, and compare it against
     observed production concurrency if any telemetry exists.
   - If capacity is insufficient, say so plainly and stop. Do not
     proceed to the click-through. The alternatives are raising the
     compute tier, or moving the GUC to transaction scope, which is
     blocked by the P2028 deadlock and would need its own investigation.

Do not:
- Change query logic, repositories, or route handlers.
- Change getTenantPrisma or the RLS extension internals.
- Change the GUC name or switch it to transaction scope.
- Point anything at the production project ref.
- Modify .env.local.

Check before finishing:
- The no-context smoke script returns zero rows on all five tables.
- With app.current_tenant_id set to tenant A, zero tenant B rows visible,
  and the reverse.
- The startup assertion fires in strict mode against postgres, and
  against a 6543 string. Prove both, then revert.
- Capacity numbers from step 5, with the saturation concurrency stated as
  a number and the source of the pool size cited.
- Manual click-through against staging. Report each individually as pass
  or fail, not as one line: Loads, Drivers, Live Tracking, Settlements,
  Driver Portal, SysAdmin, public tracking page, login, document upload,
  document download, and one cron digest.
- List every file changed.
- State the rollback explicitly: the runtime string reverted to the
  postgres 6543 transaction-mode value and DB_ROLE_ENFORCEMENT set to
  warn. Two environment variables, no code change, no rebuild. Confirm
  the assertion's port check does not block this — it must not.

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

Target: the drivecommand-staging project. Never production.

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

6. Use the two tenants seeded on staging by Prompt 0.75, extending them
   with a checklist, compensation template and settlement if absent.
   Never write a disposable tenant to production.

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
- Run against production.
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

1. Run `node scripts/migrate.mjs` against production in a low-traffic
   window, using the same migration files that ran on staging, unchanged,
   with the connection pointed at `DIRECT_URL` (5432, session mode).
2. Re-run the drift detector against production; expect zero, no baseline.
3. Re-run the `CREATE EVENT TRIGGER` statement from
   `docs/audits/policy-drift-gate.md` §3.1. It now has a function to
   attach to. This is where the superuser ceiling gets tested.
4. Set `DATABASE_URL_APP_USER` to the production `app_user` Supavisor
   **session-mode** string — 5432, `connection_limit=1`,
   `pool_timeout=20`, no `pgbouncer=true`. `DIRECT_URL` stays on the
   privileged `postgres` string for migrations and the sysadmin
   cross-tenant read path. Note this moves runtime off the transaction
   pooler; do not do it until Prompt 2's capacity measurement says the
   ceiling holds.
5. Set `DB_ROLE_ENFORCEMENT=warn`. Watch for 24 hours, specifically for
   `pool_timeout` errors.
6. Set `DB_ROLE_ENFORCEMENT=strict`.

Rollback at any point: point the runtime string back at the `postgres`
6543 transaction-mode value and set `DB_ROLE_ENFORCEMENT=warn`. Two
environment variables, no code change, no rebuild.

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
- **Ship Postgres logs off-platform**, then install `pgaudit`. Current DDL
  log retention is ~24 hours; pgaudit writes to that same log, so it earns
  nothing until a drain exists. The `policy_drop_audit` table is the option
  that survives rotation.
- **`sql_drop` event trigger** — post-deploy step, then a superuser question.
  `postgres` has `rolsuper = false` and Postgres exposes no grantable
  privilege for `CREATE EVENT TRIGGER`. If the dashboard cannot create it,
  the fallback is calling `policy_drop_audit_fn()` explicitly from any
  migration that drops a policy, which covers the sanctioned path and leaves
  out-of-band drops unrecorded.
- **`apps/web/.env.local` has every key duplicated**, identically. Dotenv
  takes the last, so behaviour is unaffected today, but a file edited into
  that state will eventually duplicate a key with two different values.
- **The stray `main` branch record** on the production project. Dashboard
  action, not a session action.
- **`supabase_migrations.schema_migrations` drift** — 36 entries against the
  repo's 141, zero exact name matches, no baseline. Harmless while nothing
  reads it; a trap for anyone who assumes it is authoritative.
