---
phase: quick-584
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/diagnostics/rls-policy-drop-forensics.md
autonomous: true

must_haves:
  truths:
    - "A reader can name every audit surface on Supabase project oqdhberkghtnszrkdvfm and say, per surface, whether it covers 2026-05-28 to today"
    - "A reader can see every DROP POLICY statement that exists anywhere in the repo, with file and target - not only ones touching the three tables"
    - "A reader knows whether any script, test fixture, seed, or CI workflow issues DDL at runtime, and what DATABASE_URL each would resolve to"
    - "A reader can see the full two-directional diff between the policy set the repo's migrations should have produced and live pg_policy"
    - "A reader is told plainly that Postgres stores no policy creation timestamp, and is given the OID-ordering proxy with its stated limits"
    - "The report ends with either a named mechanism plus evidence, or an explicit 'cannot be determined' plus the monitoring that would catch a recurrence - never a confident guess"
  artifacts:
    - path: "docs/diagnostics/rls-policy-drop-forensics.md"
      provides: "The forensic report - audit surfaces, repo DROP POLICY inventory, runtime DDL paths, db push exposure, full policy discrepancy, control-table OID bracketing, verdict"
      min_lines: 120
  key_links:
    - from: "docs/diagnostics/rls-policy-drop-forensics.md"
      to: "docs/diagnostics/rls-policy-gap-stops.md"
      via: "explicit link - this report answers section 2 'History', the open question quick-583 left"
      pattern: "rls-policy-gap-stops"
---

<objective>
Determine, read-only, how 14 RLS policies on `stops`, `route_template_stops` and
`carrier_documents` were removed from Supabase project `oqdhberkghtnszrkdvfm` after
2026-05-28 without an entry in `_prisma_migrations`, in `supabase_migrations.schema_migrations`,
or in the repo.

Purpose: quick-583 proved the policies existed, worked, and were verified in production on
2026-05-28, and that their removal is unattributable from the evidence it gathered.
Rebuilding them before the mechanism is known risks the same silent removal recurring
undetected.

Output: `docs/diagnostics/rls-policy-drop-forensics.md`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/diagnostics/rls-policy-gap-stops.md
@.planning/quick/583-diagnostic-reconstruct-missing-rls-polic/583-SUMMARY.md
@docs/diagnostics/app-user-grant-coverage.md
</context>

<hard_constraints>

**This is a READ-ONLY forensic. The mechanism being hunted is something that issued DDL
against production. Executing a suspect would be the worst possible move.**

1. **No DDL. No DML.** No `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`,
   `TRUNCATE`, `GRANT`, `REVOKE`. Not even inside a transaction you intend to roll back.
2. **Do not recreate any policy.** Not on these three tables, not anywhere.
3. **Do not run any test suite, seed, migration, or npm/tsx script.** Steps 3 and 4 are
   answered by **reading files**, never by executing them. `npm test`, `npx prisma db push`,
   `npx prisma migrate *`, `node scripts/migrate.mjs`, `playwright test` and `vitest` are all
   forbidden for the duration of this task - including "just to see what it does".
4. **Supabase MCP: read-only tools only.** Permitted: `execute_sql` (with a **single
   `SELECT`** per call), `list_migrations`, `list_tables`, `get_logs`, `query_logs`,
   `get_advisors`, `list_extensions`. **Forbidden: `apply_migration`**, and any
   `execute_sql` whose statement is not a `SELECT`.
5. **One `SELECT` per `execute_sql` call.** Supabase's `execute_sql` returns only the last
   statement's result (`feedback_execute_sql_last_statement`) - bundling a diagnostic
   `SELECT` behind another silently discards it.
6. **Identifiers via `pg_class.oid` joins, never `::regclass` on a literal.** This schema
   mixes PascalCase (`"Truck"`, `"User"`) and snake_case (`stops`, `carrier_documents`);
   an unquoted `'stops'::regclass` is a coin flip and a quoted one is wrong half the time.
7. **Never print a credential.** When reporting a resolved `DATABASE_URL`, report the
   **host, database and role only**, with the password masked as `***`.
8. **Files written by this task: `docs/diagnostics/rls-policy-drop-forensics.md` and the
   task's own planning docs. Nothing else.**
9. **A wrong attribution is worse than an open question.** If the mechanism cannot be
   determined, say so plainly and name the surface that would have answered it.

**Practical note:** a repo-wide `grep -r` in this tree times out (>120s - hit while
planning). Use the **Grep tool** (ripgrep) or scope `grep` to specific directories with
`--include`, and exclude `node_modules`, `.next`, `dist`.

</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Repo-side forensics - DROP POLICY inventory, runtime DDL paths, db push exposure (brief steps 2, 3, 4)</name>
  <files>
    (read-only; no files modified in this task)
    apps/web/prisma/migrations/**/migration.sql
    apps/web/scripts/**
    apps/web/package.json, package.json, apps/mobile/package.json, packages/*/package.json
    .github/workflows/*.yml
    apps/web/vitest.config.ts, apps/web/playwright.config.ts, apps/web/tests/**
    .planning/**
    .env, .env.local, apps/web/.env, apps/web/.env.local
  </files>
  <action>
**Step 2 - every DROP POLICY in the repo, not just these three tables.**

Use the Grep tool (ripgrep) with `-i`, `output_mode: content`, `-n` and a generous
`head_limit`. Search these surfaces separately so nothing is silently truncated:

  a. `apps/web/prisma/migrations/` - pattern `DROP\s+POLICY`, and also `CREATE\s+POLICY`
     and `ALTER\s+POLICY`. A `CREATE POLICY` name often sits on the line after the
     keyword - capture with `-A 2`.
  b. `apps/web/scripts/` (including its `audit/` and `backfill/` subdirectories) - `.ts`,
     `.mjs`, `.js`, `.sql`.
  c. `apps/web/tests/`, `apps/web/src/__tests__/`, `apps/web/e2e/` (whichever exist).
  d. `.planning/` - GSD quick-task artifacts. quick-410's `rollback.sql` is known to exist;
     find it and every sibling rollback file.
  e. Any `.sql` file anywhere outside `apps/web/prisma/migrations` - glob `**/*.sql`
     excluding node_modules, and list them all with their path, even if they contain no
     policy DDL. A one-off SQL file nobody remembers is exactly the shape being hunted.
  f. `apps/web/supabase/` and any root `supabase/` directory, if present.

Also search for **dynamically constructed** policy DDL, which a literal `DROP POLICY` grep
misses entirely: patterns `DO\s+\$\$`, `EXECUTE\s+format`, `pg_policy`, `pg_policies` in
`.sql` and `.ts` files. A `DO` block that loops over `pg_policies` and drops each one is the
single most likely repo-resident mechanism, and it contains the string `pg_policies`, not
`DROP POLICY <name>`.

Record **every** `DROP POLICY` found, with file path, line, and the policy plus table it
targets. Then mark which are balanced by a `CREATE POLICY` of the same name in the same
file, and which are not. quick-583 already established that
`20260515000001_db_security_standardization` is 46 DROP / 46 CREATE and balanced, and never
mentions the three tables - re-verify that count rather than restating it.

**Step 3 - runtime DDL paths.**

Read (do not run):
  - `apps/web/scripts/migrate.mjs` - what it executes, and whether it can execute anything
    other than files under `prisma/migrations`.
  - `apps/web/scripts/cleanup-test-tenants.ts` and every `seed-*.ts` - do they issue DDL, or
    only DML?
  - `apps/web/vitest.config.ts` (`setupFiles`, `globalSetup`) and every file it names.
  - `apps/web/playwright.config.ts` (`globalSetup`, `globalTeardown`) and every file it names.
  - Any test file containing `$executeRaw`, `$executeRawUnsafe`, `ALTER TABLE`, `TRUNCATE`,
    `DROP` or `CREATE POLICY`.
  - The `prisma` block in every `package.json` (`"prisma": { "seed": ... }`).

For each, state: does it issue DDL, and what connection does it open? A test suite pointed
at production that drops and recreates policies would explain the removal exactly - so
answer that question explicitly, yes or no, with the file evidence.

**Step 4 - `prisma db push` / `migrate reset` / `migrate dev` exposure.**

`prisma db push` makes the live schema match `schema.prisma` and **drops objects
schema.prisma does not represent. RLS policies are never in schema.prisma.**
`prisma migrate reset` drops and recreates the whole database. `prisma migrate dev` also
resets on drift and is exactly as dangerous here.

  - Grep every `package.json` (root, apps/web, apps/mobile, packages/*) for `db push`,
    `migrate reset`, `migrate dev`, `prisma migrate`, `prisma db`.
  - Grep `.github/workflows/*.yml` (`ci.yml`, `deploy-web.yml`, `doc-drift.yml`,
    `playwright.yml`) for the same, plus which secret each job binds to `DATABASE_URL`.
  - Grep `apps/web/scripts/` and any `.sh` / `.ps1` / `.bat` in the repo for the same.
  - Read `.env`, `.env.local`, `apps/web/.env`, `apps/web/.env.local` (whichever exist) and
    `apps/web/scripts/_bootstrap-env.ts`, and report **which `DATABASE_URL` / `DIRECT_URL` a
    locally-run prisma command would resolve to - host, database and role only, password
    masked**. Project memory says the local env points at production; confirm or refute it
    from the file rather than restating memory.
  - Report `turbo.json`'s env passthrough if it affects which env reaches a task.

State the finding as an exposure assessment: is there a command a person could plausibly
have run from this repo that would drop policies without touching either ledger, and if so
what is it and what would its blast radius have been? Note whether that blast radius matches
the observed footprint - Task 2 measures the footprint, so leave the final reconciliation to
Task 3.
  </action>
  <verify>
Every claim traces to a file path and line. The DROP POLICY inventory is repo-wide, not
filtered to the three tables. No script, test or prisma command was executed - confirm by
stating that the only tools used were file reads and greps.
  </verify>
  <done>
A written-up inventory in context covering: every DROP POLICY in the repo (file, line,
target, balanced-or-not), every dynamic policy-DDL construct, every runtime DDL path with
its connection, and the resolved DATABASE_URL for each way prisma could be invoked - with an
explicit yes/no on whether `db push` / `migrate reset` / `migrate dev` could have hit
production.
  </done>
</task>

<task type="auto">
  <name>Task 2: Database-side forensics - audit surfaces, full policy diff, OID bracketing (brief steps 1, 5, 6)</name>
  <files>
    (read-only; no files modified in this task)
    Supabase project oqdhberkghtnszrkdvfm - SELECT-only via MCP
  </files>
  <action>
**Step 1 - audit surfaces and their retention. Be honest about what has already expired.**

The event is roughly three months old (after 2026-05-28; today is 2026-09-03). Enumerate:

  - `mcp__claude_ai_Supabase__query_logs` - **its window is capped at 24 hours.** It
    therefore **cannot** cover 2026-05-28. State this explicitly as a closed door; do not
    attempt to work around it with narrower queries or repeated calls.
  - `mcp__claude_ai_Supabase__get_logs` - even shorter. Same verdict; state it.
  - Postgres log retention on this plan tier - report the tier if project metadata or
    `get_advisors` exposes it, and the corresponding retention (Free approx 1 day, Pro
    approx 7 days). Either way it does not reach 2026-05-28. Say so.
  - **pgaudit - check, do not assume.**
    `SELECT extname, extversion, extnamespace::regnamespace::text AS schema FROM pg_extension ORDER BY extname;`
    Report the full extension list (it is short and useful) and whether `pgaudit` is among
    them. If absent, state that no DDL audit trail was ever being written.
  - **`pg_stat_statements` - the one surface that might actually have survived.**
    Postgres tracks utility statements (including `DROP POLICY`) when
    `pg_stat_statements.track_utility` is on, which is the default. Run, one call each:
      1. `SELECT setting FROM pg_settings WHERE name = 'pg_stat_statements.track_utility';`
      2. `SELECT stats_reset FROM pg_stat_statements_info;`
      3. `SELECT queryid, calls, query FROM pg_stat_statements WHERE query ILIKE '%policy%' ORDER BY calls DESC LIMIT 50;`
      4. `SELECT queryid, calls, query FROM pg_stat_statements WHERE query ILIKE '%drop %' ORDER BY calls DESC LIMIT 50;`
    Caveats to state alongside any hit: the view resets on restart and on explicit reset
    (report `stats_reset`), entries are evicted once `pg_stat_statements.max` is exceeded,
    and **it carries no timestamp** - a matching entry proves the statement ran at some point
    since `stats_reset`, not when. If `stats_reset` is later than 2026-05-28, the surface
    cannot speak to the event and must be reported as such.
  - Supabase's own migration ledger: `mcp__claude_ai_Supabase__list_migrations`, plus
    `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;`
    quick-583 found one unrelated entry in the window - re-verify, do not restate.
  - `_prisma_migrations`:
    `SELECT migration_name, finished_at, applied_steps_count, rolled_back_at, checksum FROM _prisma_migrations ORDER BY finished_at;`
    Keep the full result - step 6 needs the dated anchors.
  - The Supabase dashboard's org-level audit log: there is **no MCP tool** for it and it is a
    paid-tier feature. Report it as a surface that exists but is **not reachable from here**,
    and name it as something the user can check in the dashboard.

**Step 5 - the full two-directional policy diff, whole database, not just three tables.**

  a. Live set, one call:
     `SELECT p.oid AS policy_oid, n.nspname AS schema_name, c.relname AS table_name, p.polname AS policy_name, p.polcmd, p.polpermissive, pg_get_expr(p.polqual, p.polrelid) AS using_expr, pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace ORDER BY p.oid;`
     (`pg_policy` joined through `pg_class.oid`, per constraint 6. Order by `oid` - that
     ordering is reused by step 6.)
  b. Expected set from the repo: parse `CREATE POLICY` / `DROP POLICY` / `ALTER POLICY` out
     of **every** `apps/web/prisma/migrations/*/migration.sql`, in migration-name order
     (which is chronological), and replay them on paper: a later `DROP` retires an earlier
     `CREATE`; a `DROP ...; CREATE ...` pair of the same name is a rewrite, not a removal; an
     `ALTER POLICY ... RENAME` changes the expected name. **Account for these rather than
     counting raw CREATEs** - `db_security_standardization` alone is 46/46 and would
     otherwise produce 46 phantom discrepancies.
  c. Diff **both directions** and report both:
     - **Missing live:** policies the migrations should have produced that `pg_policy` does
       not contain. The 14 are the known members; report every other member too.
     - **Unaccounted live:** policies present in `pg_policy` that no migration creates. These
       are as informative as the missing ones - they would mean something outside the ledgers
       has been *writing* policies too.
  d. Report the footprint shape: is the removal confined to the three tables, or spread? If
     confined, a targeted drop; if indiscriminate, a reset. **The footprint is the strongest
     single discriminator between mechanisms - state it as such.**
  e. Also capture, for context, which tables have RLS enabled or forced with zero policies:
     `SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname = 'public' ORDER BY policy_count, c.relname;`

**Step 6 - the brief's premise here is FALSE and must be corrected in the open, not worked
around.**

**Postgres stores no creation or modification timestamp for a policy.** `pg_policy` has no
timestamp column, and there is no `pg_stat_last_ddl`. Say this plainly in the report; do not
invent a timestamp, and do not silently substitute something else without naming the
substitution.

The available proxy is **OID ordering**. OIDs are handed out from a global monotonic counter,
so `pg_policy.oid` gives **relative creation order**, and bracketing a policy's OID against
the OIDs of objects created by migrations with a known `finished_at` in `_prisma_migrations`
yields an approximate date window.

  - Get the object OID timeline, one call:
    `SELECT c.oid, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY c.oid;`
  - Pick dated anchors: tables whose creating migration has a known `finished_at`. Good
    candidates from the ledger - a pre-2026-05-28 anchor (a table created by one of the
    `20260404100*` carrier migrations, finished 2026-04-05) and a post-2026-05-28 anchor
    (`carrier_truck_defects` from the Phase 9 migration, or the newest table in the ledger).
    Read the actual `finished_at` values from the `_prisma_migrations` result rather than
    assuming which migration created which table - confirm the table name appears in that
    migration's `migration.sql`.
  - Bracket the OIDs of the **surviving** policies on the control tables (`facilities`,
    `clients`, `carrier_trucks`, `route_templates`) against those anchors.
  - Interpret:
    - If the surviving control policies' OIDs fall **before** the post-2026-05-28 anchor,
      they are original - consistent with a **targeted** drop of the 14.
    - If they fall **after** it, they were **recreated** after 2026-05-28, which points at a
      wholesale drop-and-recreate (a reset, or `db push`, or a re-run of
      `db_security_standardization`) that simply failed to restore the 14. Different
      mechanism, different remedy.
  - **State the limits every time this evidence is used:** the OID counter wraps (very
    unlikely on this database, but state it), OID assignment is not guaranteed strictly
    monotonic across all catalogs, and a `VACUUM FULL` or table rewrite does not change a
    policy OID but does change some `pg_class` OIDs. This is **strong circumstantial
    evidence, not proof** - label it that way in the report.
  </action>
  <verify>
Every SQL call was a single `SELECT` (constraint 5) and no statement was anything other than
a `SELECT` (constraint 4). No `apply_migration` call was made. Every table identifier
resolved through a `pg_class.oid` join, never `::regclass` on a literal.
  </verify>
  <done>
In context: the audit-surface table with per-surface coverage of 2026-05-28 to today and an
explicit "expired / never existed / not reachable from here" verdict for each; the
two-directional policy diff across the whole database with the footprint shape named; and the
control-table OID bracketing with its date window and its stated limits.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write docs/diagnostics/rls-policy-drop-forensics.md</name>
  <files>docs/diagnostics/rls-policy-drop-forensics.md</files>
  <action>
Write the report. Match the house style of `docs/diagnostics/rls-policy-gap-stops.md`: dated
header naming the task, project and read-only status; a bolded **Headline** blockquote stating
the verdict up front; numbered sections; tables for anything enumerable; findings stated as
conclusions with their evidence attached, not as a narrative of the investigation.

Required sections, in this order:

1. **Header and scope** - date, task quick-584, project `oqdhberkghtnszrkdvfm`, an explicit
   "nothing was created, altered or dropped; no migration was applied; no script or test suite
   was executed" line, and a link to `docs/diagnostics/rls-policy-gap-stops.md` naming this
   report as the answer to its section 2 "History".
2. **Headline** - the verdict, in the blockquote, in two or three sentences.
3. **Audit surfaces and their coverage** - a table: surface / exists? / retention / covers
   2026-05-28? / what it said. `query_logs`'s 24-hour cap against a roughly three-month-old
   event must appear as an explicit closed door. Any surface whose retention has already
   expired is reported as expired, not worked around.
4. **Every DROP POLICY in the repo** - the full inventory, repo-wide, with file, line, target
   and balanced-or-not. Dynamic constructs (`DO $$` / `EXECUTE format` / `pg_policies` loops)
   get their own subsection, because a literal grep misses them.
5. **Runtime DDL paths** - per script, test, seed and CI job: does it issue DDL, and against
   what connection. Ends with an explicit yes/no on "could a test suite pointed at production
   have done this".
6. **`db push` / `migrate reset` / `migrate dev` exposure** - resolved `DATABASE_URL` per
   invocation route (**host, database and role only - password masked as `***`**), which
   scripts and workflows use which prisma subcommand, and the blast-radius assessment.
7. **Full policy discrepancy** - the two-directional diff, whole database. Both "missing live"
   and "unaccounted live". Footprint shape named, and what it implies about the mechanism.
8. **Control-table timestamps** - **opens by stating that Postgres records no policy creation
   or modification timestamp**, then gives the OID-ordering proxy, the bracketing against dated
   `_prisma_migrations` anchors, the resulting window, and the limits (counter wrap, non-strict
   monotonicity across catalogs). Labelled circumstantial.
9. **Verdict** - and it must be exactly one of these two shapes:
   - **A named mechanism**, with the evidence that names it and, equally, the evidence that
     rules out each rival. List the rivals considered: targeted manual `DROP POLICY` via the
     Supabase SQL editor or an MCP `execute_sql` from a prior agent session (the DEC-17
     shape - DDL applied with no ledger row); `prisma db push`; `prisma migrate reset` /
     `migrate dev`; a test-suite fixture; a partially-applied or re-run migration; a
     Supabase-side restore or branch operation.
   - **Or an explicit "cannot be determined from available evidence"**, naming which audit
     surface would have answered it and why it does not (never existed / retention expired /
     not reachable from here).
   **A confident guess is forbidden.** If the evidence supports two mechanisms equally, say so
   and report both - a wrong attribution is worse than an open question.
10. **Monitoring that would catch a recurrence** - required in **both** verdict shapes, not
    only the undetermined one. Concrete and checkable: a policy-count assertion per table added
    to the existing drift-scan gate; `pg_policy` snapshotted into a committed fixture the way
    the 31-pair address fixture guards the matcher; enabling `pgaudit` if the tier allows; an
    advisor check run on a schedule. State for each what it costs and what it would and would
    not catch. Do **not** implement any of it - this task ships a report only.
11. **What this report does NOT claim** - short and blunt. In particular: it does not recreate
    the policies, it does not choose between "add a role GUC" and "drop the role check"
    (quick-583 section 3 left that open deliberately), and it does not assert a timestamp
    Postgres does not store.

Length: substantial - this is the record that stops the next person re-deriving it. Prefer
tables over prose for anything enumerable.
  </action>
  <verify>
`docs/diagnostics/rls-policy-drop-forensics.md` exists. Grep it to confirm: it contains the
link `rls-policy-gap-stops`; section 8 contains an explicit statement that Postgres stores no
policy timestamp; section 9's verdict is one of the two permitted shapes; section 10 exists
regardless of which verdict was reached. Confirm no credential string appears - grep the file
for `postgres://`, `postgresql://` and `@aws` and check every hit is masked. Confirm
`git status` shows exactly one changed file outside `.planning/`.
  </verify>
  <done>
The report is written, all eleven sections present, the verdict is either a named mechanism
with rivals ruled out or an explicit "cannot be determined" with the surface that would have
answered it, monitoring recommendations are present either way, and no credential is exposed.
  </done>
</task>

</tasks>

<verification>
- `git status` - exactly one file changed outside `.planning/`:
  `docs/diagnostics/rls-policy-drop-forensics.md`.
- No `apply_migration` call was made; every `execute_sql` carried a single `SELECT`.
- No npm script, prisma command, seed or test suite was executed at any point.
- Live policy state is unchanged: re-run the live-set `SELECT` from Task 2(a) and confirm the
  row count matches what it returned at the start. `stops`, `route_template_stops` and
  `carrier_documents` still have **0** policies - this task must not have fixed anything.
</verification>

<success_criteria>
- Every brief step (1-6) is answered in the report, including step 6, whose false premise is
  corrected in the open rather than worked around.
- The DROP POLICY inventory is repo-wide, not filtered to the three tables.
- The policy diff is two-directional and covers the whole database.
- The verdict is a named mechanism with evidence, or an explicit "cannot be determined" with
  the surface that would have answered it. Not a guess.
- Monitoring recommendations are present regardless of verdict.
- Nothing in the database changed.
</success_criteria>

<output>
After completion, create
`.planning/quick/584-diagnostic-how-14-rls-policies-were-drop/584-SUMMARY.md`
</output>
