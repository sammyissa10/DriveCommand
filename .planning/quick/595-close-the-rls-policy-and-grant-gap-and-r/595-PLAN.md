---
phase: quick-595
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
branch_expected: A
files_modified:
  - apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql
  - apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/rollback.sql
  - apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/deferred-bypass-drop.sql
  - apps/web/scripts/migrate.mjs
  - apps/web/src/lib/db/extensions/tenant-rls.ts
  - apps/web/prisma/schema.prisma
  - docs/audits/rls-policy-grant-closure.md

must_haves:
  truths:
    - "Every table on staging that runs FORCE RLS has at least one policy"
    - "Every tenant-scoped table on staging grants DML to app_user"
    - "A future table created in schema public automatically grants to app_user"
    - "scripts/migrate.mjs refuses to seed when DIRECT_URL and DATABASE_URL name different Supabase projects"
    - "The drift detector, pointed at staging, reports zero missing and zero unexpected"
    - "Production is unchanged and the committed migration is the exact file that ran against staging"
  artifacts:
    - path: "apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql"
      provides: "Idempotent policy + grant + default-privilege + index closure"
      contains: "CREATE POLICY tenant_isolation_policy ON stops"
    - path: "apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/rollback.sql"
      provides: "Statement-for-statement inverse, unapplied"
    - path: "apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/deferred-bypass-drop.sql"
      provides: "Prepared, unapplied DROP of bypass_rls_policy (Branch A)"
    - path: "docs/audits/rls-policy-grant-closure.md"
      provides: "Raw pre/post verification output and the recorded deviations"
    - path: "apps/web/scripts/migrate.mjs"
      provides: "Project-ref mismatch guard immediately before the seeder spawn"
      contains: "PRODUCTION_REF"
  key_links:
    - from: "apps/web/prisma/migrations/20260912130000_.../migration.sql"
      to: "stops policy"
      via: "dispatch_id -> dispatches.org_id (NOT via load_id)"
      pattern: "dispatches[\\s\\S]*org_id = current_tenant_id\\(\\)"
    - from: "apps/web/src/lib/db/extensions/tenant-rls.ts"
      to: "EXEMPT_MODELS"
      via: "GridView and GridPreference entries with the owning column named"
      pattern: "'GridView'"
---

<objective>
Close the RLS policy, grant and default-privilege gap on the STAGING project only, and
prepare — without applying — the removal of the `app_user` bypass path.

Purpose: three FORCE-RLS tables run with zero policies, nine tables grant nothing to
`app_user`, and `pg_default_acl` carries no `app_user` entry so every future table inherits
the zero-grant defect. All three are invisible today because the runtime connects as
`postgres`, which has `rolbypassrls = true`. They become live failures at the Prompt 2
cutover. This plan closes them on staging in one idempotent migration that a human can later
apply to production unchanged.

Output: one new migration directory with `migration.sql`, `rollback.sql` and a prepared-but-
unapplied `deferred-bypass-drop.sql`; a project-ref guard in `scripts/migrate.mjs`; two
`EXEMPT_MODELS` entries; two `@@index` declarations; and an audit record holding the raw
pre/post evidence.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phase-0-revised.md
@docs/audits/role-guard-storage-audit.md
@docs/audits/staging-environment.md
@docs/audits/policy-drift-gate.md
@apps/web/scripts/migrate.mjs
@apps/web/scripts/audit/rls-policy-replay.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
</context>

<evidence>

Everything in this block was measured read-only before planning. **Do not re-query production
for any of it.** Production is `oqdhberkghtnszrkdvfm` and is NEVER written. Staging is
`wyixpgunnjmzguhggocz` and is the only write target.

**Pre-baseline (drift detector, against production, raw):**
```
Migration files read 149 | Statements parsed 403 | Policies expected (net) 179
Policies live 179 | Missing 0 | Unexpected 0 | RESULT: CLEAN (exit 0)
FORCE RLS + zero policies      : carrier_documents, route_template_stops, stops
RLS enabled not forced + zero  : _prisma_migrations
```

**Canonical policy shape** (read from staging `pg_policies`, e.g. `loads`, `route_templates`,
`carrier_truck_defects`): PERMISSIVE, `FOR ALL`, `TO public`,
`USING (org_id = current_tenant_id()) WITH CHECK (org_id = current_tenant_id())`.
`current_tenant_id()` is `SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID`,
STABLE, sql.

**Column facts** (from `pg_attribute` / `information_schema`, not `schema.prisma`):
```
stops.dispatch_id                      uuid NOT NULL     stops.load_id  uuid NULLABLE
route_template_stops.route_template_id uuid NOT NULL
carrier_documents.uploaded_by          uuid NOT NULL
route_matrix_cache.org_id              uuid NOT NULL
grid_view."userId" uuid NOT NULL, grid_view."gridId" varchar(100) NOT NULL  (camelCase, quoted)
"User"."tenantId"  is the tenant column on User                            (camelCase, quoted)
grid_preference — PRODUCTION ONLY, absent from the migration chain. DO NOT CREATE IT.
```

**Grant evidence** (app code only, `src/generated` excluded):
```
Plan            reads 3  / writes 2      Promo                   reads 2  / writes 1
NotificationTemplate reads 15 / writes 2 NotificationEmailConfig reads 3  / writes 2
carrier_catalog_meta reads 0  / writes 0
gridView        reads 5  / writes 5      gridPreference          reads 1  / writes 1
```
Every write to `Plan` / `Promo` / `NotificationTemplate` / `NotificationEmailConfig` lives in
`src/app/(admin)/actions/{plans,promos,notifications}.ts` — the sysadmin path, which per
`role-guard-storage-audit.md` §4 runs on the privileged `DATABASE_URL` and **not** as
`app_user`. So `app_user` needs **SELECT only** on those four. That is the evidence answering
the brief's "plus any write the sysadmin path provably needs" — the answer is **none**.

**Staging baseline** (identical to production on this surface):
```
FORCE RLS + zero policies : carrier_documents, route_template_stops, stops
Zero app_user grants      : Plan, Promo, NotificationTemplate, NotificationEmailConfig,
                            carrier_catalog_meta, grid_view, grid_preference (absent),
                            route_matrix_cache, _prisma_migrations
bypass_rls_policy instances: 86 of 179 total policies
app_user rolcanlogin = false on staging (production is true) | rolbypassrls false
app_user rolconfig: none | pg_default_acl app_user entries in public: 0
Isolation suite baseline  : 17/17 pass (3 files, 2.23s)
```

**Indexes already present** (so the policy subqueries are covered):
`stops_dispatch_id_idx` YES · `route_template_stops_route_template_id_idx` YES ·
`route_matrix_cache_org_idx` YES. **`carrier_documents` has NO index on `uploaded_by`** and
`grid_view` has `(gridId, userId)` but no leading `(userId)` index — both must be created.

</evidence>

<deviation_from_brief>

**The brief says to scope `stops` via `load_id`. That is wrong and must be deviated from.**
Measured on production:

```
stops total                                         791
stops with load_id NULL                              74   (9.4%)
stops with dispatch_id NULL                           0
stops where load.org_id IS DISTINCT FROM dispatch.org_id   0
```

A policy routed through `load_id` alone **denies 74 rows to every tenant** — including every
fuel stop, layover and end stop, which is precisely the Phase 7 end-stop row that exists to
stop a trip looking like it finishes at the last delivery.

Route the policy through `dispatch_id -> dispatches.org_id`: NOT NULL, 100% coverage, and
provably never in disagreement with the load path (0 divergent rows).

**Do NOT write an `OR` of both paths.** If the two ever diverge, `OR` exposes one stop to
**both** tenants — it turns a coverage fix into an isolation hole.

This deviation, with these four numbers, must appear in the migration header, in
`docs/audits/rls-policy-grant-closure.md`, and in the plan summary.

</deviation_from_brief>

<hazards>

Read all of these before writing a line of SQL. Each one has bitten this repo already.

1. **The drift detector parses `CREATE POLICY` only when it starts a line.** The regex in
   `scripts/audit/rls-policy-replay.ts` is `/^[ \t]*(CREATE|DROP)\s+POLICY .../gim`. A
   `CREATE POLICY` hidden inside a `DO $$ ... EXECUTE format('CREATE POLICY ...') $$` block
   is invisible to the replay, so the policy goes live and is then reported as
   **unexpected** — the gate fails. Achieve idempotency for policies with
   `DROP POLICY IF EXISTS x ON t;` followed by `CREATE POLICY x ON t ...;`, **both at
   column 0**. The replay applies DROP then CREATE in file order and nets to present.
   Never wrap a `CREATE POLICY` in dynamic SQL in this file.

2. **The detector and `migrate.mjs` both read only `migration.sql`.** `migrate.mjs` filters
   on `existsSync(join(dir, 'migration.sql'))`; the detector `statSync`s the same path. A
   sibling `rollback.sql` or `deferred-bypass-drop.sql` in the same directory is inert to
   both — which is exactly why the deferred DROP can be staged there safely.

3. **A `--` comment line is invisible to the parser** (it starts with `-`, not `CREATE`), so
   commented SQL is safe, but see task 1 for why the rollback goes in a sibling file anyway.

4. **`migrate.mjs` applies with `DIRECT_URL`, then spawns a seeder that resolves
   `DATABASE_URL`.** Pinning only one of them applies DDL to staging and seeds **production**.
   Both must be set inline on every run.

5. **`prisma.config.ts` loads dotenv from the repo-root `.env` and resolves
   `DIRECT_URL || DATABASE_URL` = PRODUCTION.** Any bare `npx prisma migrate ...` hits
   production. `prisma validate` does not connect and is safe.

6. **`CREATE INDEX CONCURRENTLY` is illegal here** — `migrate.mjs` wraps each migration in
   `BEGIN`/`COMMIT` (SQLSTATE 25001). Plain `CREATE INDEX IF NOT EXISTS` only. The tables are
   tiny (`carrier_documents` 41 rows, `grid_view` 0), so the ACCESS EXCLUSIVE hold is
   sub-millisecond.

7. **The chain must still replay from zero** (quick-593). If `app_user` does not exist on a
   fresh project, a `RAISE EXCEPTION` would break replay. Guard the grant block on
   `pg_roles` and **skip with a `RAISE NOTICE`**, never an exception.

8. **This migration changes nothing at runtime today.** The app connects as `postgres`, which
   has `rolbypassrls = true`, so FORCE RLS and every policy remain decorative until Prompt 2.
   State that in the header so nobody reads a green deploy as proof the policies work.

9. **DEC-14 / DEC-17.** Read `pg_constraint` and `information_schema` rather than inferring a
   column name from its neighbours. And neither Supabase MCP tool writes the
   `_prisma_migrations` row — which is moot here because `migrate.mjs` writes it itself, and
   `migrate.mjs` is the only permitted applier.

</hazards>

<branch_logic>

A background agent is classifying all 213 `app.bypass_rls` sites across 104 runtime files as
DECORATIVE or CROSS_TENANT into `docs/audits/bypass-call-classification.md`.

- **BRANCH A — tripwire fires (more than 20 CROSS_TENANT). This is the expected branch.**
  Ship items 1, 2, 5, 6, 7, 8, 9 plus the rollback. Do **not** drop `bypass_rls_policy`.
  Do **not** move any application path to a privileged connection. Stage the DROP in
  `deferred-bypass-drop.sql`, unapplied, so the follow-up is one step.

- **BRANCH B — 20 or fewer CROSS_TENANT.** Additionally drop `bypass_rls_policy` from every
  table in `migration.sql` (explicit `DROP POLICY IF EXISTS bypass_rls_policy ON <table>;`
  lines at column 0, one per table) and move the CROSS_TENANT paths to the privileged
  connection.

Preliminary counting of the obvious candidates alone — auth/login/invitation/email-confirm/
signup, public tracking, the 8 cron routes, the `(admin)` actions, sender-config,
tenant.repository — already exceeds 20, so **Branch A is expected**.

**The branch is decided by reading the document, not by assuming.** If the document does not
exist when task 1 runs, execute **Branch A** and record in the summary that the drop remains
deferred pending classification. Never guess low.

</branch_logic>

<tasks>

<task type="auto">
  <name>Task 1: Decide the branch, then author the migration, its rollback and the deferred bypass drop</name>
  <files>
apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql
apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/rollback.sql
apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/deferred-bypass-drop.sql
  </files>
  <action>
**Step 1 — branch decision (do this first and record it).**
Read `docs/audits/bypass-call-classification.md`. Count the rows classified CROSS_TENANT.
Write the count and the resulting branch into the migration header and the summary. If the
file is absent, take Branch A and say so. Expected: Branch A.

**Step 2 — one pre-check against STAGING, read-only.**
The evidence block gives every column except one: the data type of `"User".id`. Confirm it is
`uuid` (so `u.id = carrier_documents.uploaded_by` needs no cast) via `information_schema`
against **staging**, using the Supabase MCP read path or a read-only `psql`-equivalent query.
If it is `text`, add an explicit `::uuid` cast and say so in the header. Do not re-measure
anything else — the evidence block is authoritative.

Also grep the migration chain for `CREATE ROLE app_user` and record in the summary whether a
from-zero replay creates the role. This decides nothing in the SQL (the guard skips either
way) but the next prompt needs the answer.

**Step 3 — create the directory**
`apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/`.
It sorts after `20260912120100_support_ticket_foreign_keys_and_enum`. One new directory, no
edits to any already-applied migration.

**Step 4 — write `migration.sql`.** In this order:

*Header comment.* State: the branch and the CROSS_TENANT count that chose it; the `stops`
deviation with all four numbers from `<deviation_from_brief>`; that the file is idempotent and
a safe no-op on a second run and against production, whose state differs (`grid_preference`
exists there and not on staging); that **nothing changes at runtime today** because the app
connects as `postgres` with `rolbypassrls = true`; that the rollback lives in the sibling
`rollback.sql` and the bypass drop in the sibling `deferred-bypass-drop.sql`, neither of which
`migrate.mjs` or the drift detector reads; and that the policy idempotency idiom is
`DROP IF EXISTS` + `CREATE` **at column 0** because the drift replay's parser is line-anchored
and cannot see dynamic SQL.

*Part 1 — the three zero-policy FORCE-RLS tables.* Three `DROP POLICY IF EXISTS` /
`CREATE POLICY` pairs, every keyword at column 0, all `PERMISSIVE, FOR ALL, TO public`,
`USING` and `WITH CHECK` identical, matching the canonical shape:

- `stops` — `EXISTS (SELECT 1 FROM dispatches d WHERE d.id = stops.dispatch_id AND d.org_id = current_tenant_id())`.
  `dispatches` is the `@@map` of the `Trip` model. Route via `dispatch_id`, never `load_id`,
  never an `OR`.
- `route_template_stops` — `EXISTS (SELECT 1 FROM route_templates rt WHERE rt.id = route_template_stops.route_template_id AND rt.org_id = current_tenant_id())`.
  0 orphan templates measured.
- `carrier_documents` — `EXISTS (SELECT 1 FROM "User" u WHERE u.id = carrier_documents.uploaded_by AND u."tenantId" = current_tenant_id())`.
  Quote `"User"` and `"tenantId"`. **Do not add a tenant column and do not write a backfill
  for this table** — 0 documents have a missing uploader and 0 have an uploader with a NULL
  `tenantId`.

Add a short comment noting that each subquery reads an RLS-protected table, so the effective
predicate is "parent visible AND parent's org matches" — equivalent, because each parent's own
`tenant_isolation_policy` is the same predicate, and correctly denying when the GUC is unset
(`current_tenant_id()` returns NULL).

*Part 2 — `route_matrix_cache`.* `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, then
the `DROP`/`CREATE` pair on `org_id = current_tenant_id()`. Comment that this closes the
quick-520 hazard recorded in CLAUDE.md — RLS off and no `app_user` grant meant the L2 matrix
cache would return zero rows and silently stop caching the moment the role flipped.

*Part 3 — no new `bypass_rls_policy`.* State explicitly in a comment that the four policies
above ship **without** a companion `bypass_rls_policy`, deliberately diverging from the shape
of the 86 tables that have one, because item 3's direction of travel is to remove them. Note
the consequence: after the Prompt 2 cutover these four tables ignore `app.bypass_rls` while
the other 86 still honour it.

*Part 4 — grants.* One `DO $$ ... $$` block guarded on
`EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')`; if absent, `RAISE NOTICE` and
skip (never `RAISE EXCEPTION` — the chain must replay from zero). Inside it:
- `route_matrix_cache` — `SELECT, INSERT, UPDATE, DELETE`.
- `"Plan"`, `"Promo"`, `"NotificationTemplate"`, `"NotificationEmailConfig"`,
  `carrier_catalog_meta` — **`SELECT` only.** Comment the evidence: every write to the first
  four lives in `src/app/(admin)/actions/` on the privileged connection per
  `role-guard-storage-audit.md` §4, and `carrier_catalog_meta` has 0 reads and 0 writes in
  app code and is granted SELECT only to close the zero-grant class, not because anything
  reads it.
- `grid_view` — full DML.
- `grid_preference` — full DML, wrapped in its own
  `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='grid_preference')`
  guard with `EXECUTE`, because the table exists on production and **not** on staging.
  **Do not create it.**
- `_prisma_migrations` — **no grant.** Add a comment saying so, and that it therefore remains
  in the detector's "RLS enabled, not forced, zero policies" bucket by design.

*Part 5 — default privileges.* Inside the same `app_user` guard:
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;`
No `FOR ROLE` clause — it therefore attaches to the current role, which is `postgres`, the role
`migrate.mjs` runs as on both staging and production. Comment that, and that default privileges
are per-creating-role, so a table created by any other role still needs an explicit grant.

*Part 6 — role settings.* Inside the same guard:
- `ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';` — the instance-wide
  value is `0` (no limit). 30s is ~6x Prisma's 5s default interactive-transaction timeout, so
  it cannot cut a legitimate transaction, and it bounds a leaked one on a 60-connection
  ceiling. Reversible with one `ALTER ROLE ... RESET`.
- `ALTER ROLE app_user WITH LOGIN;` — staging has `rolcanlogin = false`, production already
  `true`, so this is a no-op on production. It grants no access on its own: the role still has
  no password, which Prompt 2 sets.

*Part 7 — indexes.* Plain, never `CONCURRENTLY`:
- `CREATE INDEX IF NOT EXISTS carrier_documents_uploaded_by_idx ON carrier_documents (uploaded_by);`
  — covers the new `carrier_documents` policy subquery; measured absent.
- `CREATE INDEX IF NOT EXISTS "grid_view_userId_idx" ON grid_view ("userId");` — the existing
  `(gridId, userId)` index cannot serve a `userId`-leading lookup, which is the column the
  application's where clauses use.
Comment that `stops_dispatch_id_idx`, `route_template_stops_route_template_id_idx` and
`route_matrix_cache_org_idx` already exist, so the other three policy subqueries are covered.

**Step 5 — write `rollback.sql` as a sibling file.** Justify the choice in its header, in these
terms: the repo has precedent (`20260527000001_quick410_advisor_rls_fix/rollback.sql`); a
rollback kept as a commented block inside `migration.sql` invites someone to uncomment it in
place, which would edit an already-applied migration — forbidden; and both `migrate.mjs` and
the drift detector read only `migration.sql`, so a sibling file cannot be applied by accident
and cannot perturb the detector's expected set.

Contents, statement-for-statement inverse, every statement idempotent:
`DROP POLICY IF EXISTS tenant_isolation_policy` on the four tables;
`ALTER TABLE route_matrix_cache NO FORCE ROW LEVEL SECURITY` then `DISABLE ROW LEVEL SECURITY`;
`REVOKE` each grant; `ALTER DEFAULT PRIVILEGES ... REVOKE ...`;
`ALTER ROLE app_user RESET idle_in_transaction_session_timeout`;
`DROP INDEX IF EXISTS` for the two new indexes.
State loudly at the top: **`ALTER ROLE app_user WITH NOLOGIN` is deliberately NOT in the
rollback** — production's `rolcanlogin` was already `true` before this migration, so reversing
it would lock a role this migration did not unlock. Also state that the rollback does not touch
`current_tenant_id()`, the `app_user` role itself, or any `bypass_rls_policy`.

**Step 6 — write `deferred-bypass-drop.sql` as a sibling file (Branch A).** Header: NOT
APPLIED, why (the tripwire fired at N CROSS_TENANT sites), and that promoting it means copying
it into a **new** migration directory as `migration.sql` — never renaming or editing this one.
Body: one explicit `DROP POLICY IF EXISTS bypass_rls_policy ON <table>;` per table, at
column 0, generated from the live staging `pg_policies` list of the 86 instances. Add a warning
that when it is promoted, the detector's expected set falls by 86 in the same apply that removes
them live, so the two must land together or the gate reports 86 unexpected. Under Branch B this
file is not created and these statements go into `migration.sql` instead.

**Do not delete any of the 213 `app.bypass_rls` calls. Do not restore any of the 59 JWT
policies. Do not create `grid_preference`. Do not rename any GUC.**
  </action>
  <verify>
`grep -c '^CREATE POLICY' migration.sql` returns 4 and `grep -c '^DROP POLICY' migration.sql`
returns 4. `grep -n 'load_id' migration.sql` returns nothing. `grep -n 'CONCURRENTLY'` returns
nothing. `grep -n 'bypass_rls_policy' migration.sql` returns only comment lines under Branch A.
`grep -n 'RAISE EXCEPTION' migration.sql` returns nothing. `npx prisma validate` succeeds
(it does not connect).
  </verify>
  <done>
Three files exist in the new migration directory. The branch decision and its CROSS_TENANT
count are recorded in the migration header. The `stops` deviation appears with all four
numbers. Nothing has been applied to any database yet.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add the project-ref guard to migrate.mjs, prove it both ways, then apply to staging and verify</name>
  <files>
apps/web/scripts/migrate.mjs
docs/audits/rls-policy-grant-closure.md
  </files>
  <action>
**Step 1 — write the guard.** In `apps/web/scripts/migrate.mjs`, immediately before the seeder
spawn (currently lines ~84-97, the `spawnSync('npx', ['tsx', scriptPath], { env: process.env })`
block), insert a project-ref comparison. Follow the shape already used by
`scripts/seed-staging.ts` (`const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm'`).

Behaviour, exactly:
- Derive the Supabase project ref from each of `DIRECT_URL` and `DATABASE_URL`: take
  `new URL(u).username`, and if it contains a `.`, the ref is the part after the first dot
  (`postgres.<ref>`); otherwise fall back to a `db.<ref>.supabase.co` hostname match; otherwise
  undefined.
- If `DIRECT_URL` is unset, no mismatch is possible (both halves already use `DATABASE_URL`) —
  proceed.
- If both are set and both refs are derivable and **differ** — print both URLs **masked**
  (password replaced by `****`) and both refs, print a one-line explanation that the applier
  uses `DIRECT_URL` while the spawned seeder resolves `DATABASE_URL`, do **not** spawn the
  seeder, and `process.exit(1)`.
- If a ref cannot be derived from one or both — print a loud warning, **skip the seeder**, and
  exit 0. Fail-safe in both directions: never seed the wrong database, never break a deploy
  over a connection string shape the guard cannot parse.

Add a header comment naming the hazard: pinning only `DIRECT_URL` applies DDL to staging and
writes starter playbooks into production.

**Step 2 — prove the guard blocks.** Run from `apps/web` with `DIRECT_URL` set to the staging
string and `DATABASE_URL` set to the same string **with the ref replaced by the sentinel
`zzzzzzzzzzzzzzzzzzzz`**. Use a sentinel, **never the production ref** — the comparison is what
is being tested, and the production string must not enter this session's environment at all.
Expected: migrations report up to date (or apply, if run after step 4), then the guard refuses
and exits 1 without spawning the seeder. Capture the masked output verbatim.

**Step 3 — prove the guard permits a matched pair.** Re-run with both variables set inline to
the same staging session-mode string. Expected: no refusal, seeder spawns, exit 0. Capture the
masked output.

**Step 4 — apply.** From `apps/web`, in Git Bash (PowerShell does not accept the inline `VAR=x`
prefix), with **both** variables set inline to the staging string and the password read from the
out-of-repo file rather than typed on a command line:

```
DATABASE_URL="postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres" \
DIRECT_URL="postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres" \
node scripts/migrate.mjs
```

Print both values masked before running. The pooler host is `aws-0-us-west-1`, **not** `aws-1`.

**FORBIDDEN, without exception:** `prisma migrate deploy`, `prisma migrate dev`,
`prisma migrate resolve`, `prisma db push`, Supabase `apply_migration`, Supabase `execute_sql`
for DDL. `prisma.config.ts` resolves to production. `migrate.mjs` is the only applier, and the
committed file must be the exact file that ran — state its path in the summary.

**Step 5 — prove idempotency.** Re-run the identical command. Expected: `Database up to date`,
zero statements executed. Then, separately, prove the SQL itself is re-runnable by confirming
every statement carries `IF EXISTS` / `IF NOT EXISTS` / a `DO` guard — a second `migrate.mjs`
run skips by `migration_name` and so does not exercise the SQL.

**Step 6 — verification, all against STAGING, all raw output captured.**

1. Drift detector, `DATABASE_URL` pinned inline to staging (the script has no dotenv override,
   so an inline value wins):
   `DATABASE_URL="<staging>" npx tsx scripts/audit/rls-policy-drift.ts`
   Expect **0 missing / 0 unexpected**, and — predicted, so a mismatch is visible — migration
   files 150, statements parsed 411, policies expected 183, policies live 183. If the numbers
   differ, stop and investigate before proceeding; a live count above expected means a
   `CREATE POLICY` was written where the line-anchored parser cannot see it.
2. Zero tables with FORCE RLS and zero policies. Expect the severe bucket to read `none`.
   `_prisma_migrations` must still appear in the "RLS enabled, not forced" bucket — that is by
   design and is not a regression.
3. Zero tenant-scoped tables with zero `app_user` grants — query
   `information_schema.role_table_grants` for grantee `app_user` and diff against the nine-table
   list. `_prisma_migrations` is the only permitted zero, and `grid_preference` is absent on
   staging.
4. `pg_default_acl` returns non-zero for `app_user` in schema `public`; record `defaclrole`
   (expect `postgres`) and `defaclobjtype = 'r'`.
5. `SELECT rolcanlogin, rolbypassrls, rolconfig FROM pg_roles WHERE rolname = 'app_user'` —
   expect `rolcanlogin = true`, `rolbypassrls = false`, `rolconfig` containing
   `idle_in_transaction_session_timeout=30s`.
6. `_prisma_migrations` on staging holds the row for the new directory.
7. The two new indexes exist in `pg_indexes`.

**Step 7 — write `docs/audits/rls-policy-grant-closure.md`** holding: the branch decision and
its count; the raw pre output (from the evidence block) and the raw post output side by side;
all seven verification results; both guard proof runs verbatim, masked; the `stops` deviation
with its four numbers; and a follow-ups section listing (a) user-scoped RLS on `grid_view` /
`grid_preference` as a Phase 1 item, (b) the deferred `bypass_rls_policy` drop and where the
prepared file lives, (c) `grid_preference` still absent from the migration chain — deliberately
not closed here, (d) whether the chain creates `app_user` on a from-zero replay.
  </action>
  <verify>
Both guard proof runs captured: mismatch exits 1 with a refusal and no seeder spawn; matched
pair exits 0. `migrate.mjs` applied the migration to staging and the second run prints
`Database up to date`. The drift detector against staging reports 0 missing / 0 unexpected.
All seven verification queries return the expected values and are pasted raw into the audit doc.
  </verify>
  <done>
Staging has four new policies, `route_matrix_cache` is FORCE RLS with a policy and full DML to
`app_user`, the five reference tables have SELECT, `grid_view` has DML, `pg_default_acl` carries
an `app_user` entry, `app_user` can log in with a 30s idle-in-transaction cap, and both indexes
exist. Production is untouched. The audit document holds the raw evidence for every claim.
  </done>
</task>

<task type="auto">
  <name>Task 3: Exempt the two grid models, declare the indexes, run the gates, commit</name>
  <files>
apps/web/src/lib/db/extensions/tenant-rls.ts
apps/web/prisma/schema.prisma
  </files>
  <action>
**Step 1 — `EXEMPT_MODELS`.** In `apps/web/src/lib/db/extensions/tenant-rls.ts`, add to the
`new Set([...])` (around line 71), following the existing comment style where every entry names
its owning column:

```
'GridView',       // no tenantId — user-scoped on "userId" (camelCase column)
'GridPreference', // no tenantId — user-scoped on "userId" (camelCase column)
```

`CarrierCatalogMeta` is already present; do not duplicate it. Add a short block comment above
the two entries stating, in these words or closer:

> Exemption from tenant policy is NOT exemption from access control. Both tables have RLS
> disabled today and rely entirely on application `where` clauses on `userId`. User-scoped RLS
> on these two is a Phase 1 item, logged in
> `docs/audits/rls-policy-grant-closure.md`.

**Do not touch anything else in this file** — not the tenant context resolver, not the
extension's injection logic, not middleware. Two names and a comment is the whole change.

**Step 2 — declare the two indexes in `schema.prisma`** so the model and the database agree,
per the repo's standing rule that schema and applied migration ship together. Pin the names
explicitly with `map:` so they match the SQL exactly rather than relying on Prisma's name
derivation:
- On `model CarrierDocument`: `@@index([uploadedBy], map: "carrier_documents_uploaded_by_idx")`
- On `model GridView`: `@@index([userId], map: "grid_view_userId_idx")`
Leave the existing `@@index([gridId, userId])` and `@@unique` on `GridView` alone. No other
schema change — no new models, no new columns, and specifically **not** a `grid_preference`
model change.

**Step 3 — gates.**
- `npx prisma validate` — succeeds; it does not connect.
- `npx prisma generate` — succeeds. Index-only additions do not change the client API.
- `npx tsc --noEmit` in `apps/web`. **Check it is not lying**: if the only errors are syntax
  errors, or are all in files this task did not touch (especially anything under `.next/`),
  the gate is blind, not green — delete `apps/web/.next/dev/types/validator.ts` and
  `apps/web/tsconfig.tsbuildinfo` and re-run. Probe it by injecting
  `const __probe: number = 'x';` into `tenant-rls.ts`, confirming tsc reports **that** error,
  then deleting the probe.
- The 17 isolation tests: run `src/__tests__/isolation` exactly the way the 17/17 baseline was
  taken — **do not repoint them at staging**. They are unaffected by this migration because the
  runtime role has `rolbypassrls = true`. Expect 17/17 across 3 files. If the count differs
  from 17, report the delta rather than adjusting the number.

**Step 4 — commit.** One commit. Include the three migration files, `migrate.mjs`,
`tenant-rls.ts`, `schema.prisma` and the audit document. Message names the branch taken and the
fact that nothing was applied to production, e.g.
`fix(quick-595): close the RLS policy, grant and default-privilege gap on staging (Branch A)`.
**Do not push** — the user pushes and deploys.

**Step 5 — the summary must state, explicitly:**
- Which branch was executed, the CROSS_TENANT count that chose it, and where the prepared DROP
  file lives.
- The `stops` deviation with all four numbers, and why an `OR` of both paths was rejected.
- That exemption from tenant policy is not exemption from access control, and that both grid
  tables rely on application `where` clauses on `userId` today.
- That the committed migration is byte-identical to the file that ran, with its path.
- That production was never written, and that this migration changes no runtime behaviour today
  because the app connects as `postgres` with `rolbypassrls = true`.
- The remaining open items: the deferred bypass drop, user-scoped RLS on the two grid tables,
  `grid_preference` absent from the chain, and whether a from-zero replay creates `app_user`.
  </action>
  <verify>
`grep -n "'GridView'\|'GridPreference'" apps/web/src/lib/db/extensions/tenant-rls.ts` returns
both with their owning-column comments. `npx prisma validate` and `npx prisma generate` succeed.
`npx tsc --noEmit` is clean and was probed. `src/__tests__/isolation` is 17/17. `git status`
shows only the seven intended files. `git log -1` shows one commit and no push.
  </verify>
  <done>
Both grid models are exempt with the owning column named, both indexes are declared in the
schema with pinned names, every gate passes and was probed rather than assumed, and one commit
holds the whole change.
  </done>
</task>

</tasks>

<verification>

Against STAGING only, every result pasted raw into `docs/audits/rls-policy-grant-closure.md`:

1. `scripts/migrate.mjs` applies cleanly; a re-run prints `Database up to date`.
2. Drift detector with `DATABASE_URL` pinned inline to staging: **0 missing / 0 unexpected**.
   Predicted: 150 files, 411 statements, 183 expected, 183 live.
3. Zero tables with FORCE RLS and zero policies. `_prisma_migrations` remains in the
   "enabled, not forced" bucket by design.
4. Zero tenant-scoped tables with zero `app_user` grants. `_prisma_migrations` is the only
   permitted zero; `grid_preference` is absent on staging.
5. `pg_default_acl` returns non-zero for `app_user` in schema `public`, `defaclrole = postgres`.
6. `app_user`: `rolcanlogin = true`, `rolbypassrls = false`,
   `rolconfig` has `idle_in_transaction_session_timeout=30s`.
7. The `migrate.mjs` guard **blocks** on mismatched project refs — proved by running it with a
   sentinel mismatched ref and capturing the refusal — and **permits** a matched pair, proved by
   a second run that exits 0.
8. The 17 isolation tests still pass, 17/17.
9. `npx prisma validate` succeeds. `npx tsc --noEmit` is clean **and was probed**.
10. Production ref `oqdhberkghtnszrkdvfm` appears nowhere in any command run this session.

</verification>

<success_criteria>
- One new migration directory sorting after `20260912120100_support_ticket_foreign_keys_and_enum`,
  containing `migration.sql`, `rollback.sql` and `deferred-bypass-drop.sql`.
- The committed `migration.sql` is byte-identical to the file `migrate.mjs` ran; its path is
  stated in the summary.
- `stops` is scoped via `dispatch_id`, not `load_id`, and not an `OR` of both; the deviation is
  recorded with all four measured numbers.
- Four new `tenant_isolation_policy` rows; no new `bypass_rls_policy`; no `bypass_rls_policy`
  dropped under Branch A.
- None of the 213 `app.bypass_rls` calls deleted; no application path moved to a privileged
  connection under Branch A.
- `grid_preference` not created; no GUC renamed; the tenant resolver, the RLS extension's logic
  and middleware untouched; no package installed.
- All ten verification items pass with raw evidence in `docs/audits/rls-policy-grant-closure.md`.
- One commit, not pushed.
</success_criteria>

<output>
After completion, create
`.planning/quick/595-close-the-rls-policy-and-grant-gap-and-r/595-SUMMARY.md`
covering every item in Task 3 Step 5.
</output>
