---
phase: quick-592
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - .gitignore
  - apps/web/.env.staging          # gitignored, never committed
  - apps/web/scripts/seed-staging.ts
  - docs/audits/staging-environment.md
must_haves:
  truths:
    - "A Supabase project named drivecommand-staging exists in org smtxeyavhusrpylmpywu, region us-west-1, status ACTIVE_HEALTHY"
    - "Its public schema was built by `node scripts/migrate.mjs` and by nothing else"
    - "Table count and _prisma_migrations count are reported against production's 98 and 141, with any difference explained by an actual name-level diff"
    - "All thirteen carrier tables are confirmed present and named individually"
    - "app_user exists on staging with rolsuper=false and rolbypassrls=false, and whether a repo migration created it is stated as fact"
    - "Whether Supavisor accepts app_user.<staging_ref> on port 5432 is settled by a real connection, not by inference"
    - "Two tenants carry the row set both Prompt 2 and Prompt 3 need, with per-table counts"
    - "Production (oqdhberkghtnszrkdvfm) was read but never written"
  artifacts:
    - path: "apps/web/.env.staging"
      provides: "STAGING_DATABASE_URL, STAGING_DIRECT_URL, STAGING_DATABASE_URL_APP_USER"
      committed: false
    - path: ".gitignore"
      provides: ".env.staging ignore rule, added BEFORE any secret is written"
    - path: "apps/web/scripts/seed-staging.ts"
      provides: "DB-only two-tenant seed, no Supabase Auth dependency"
    - path: "docs/audits/staging-environment.md"
      provides: "ref, region, counts, env keys, Supavisor result, test data inventory"
  key_links:
    - from: "scripts/migrate.mjs"
      to: "staging 5432 session pooler"
      via: "DIRECT_URL and DATABASE_URL set inline on the command, both pointing at staging"
    - from: "seed-staging.ts"
      to: "staging"
      via: "explicit connectionString argument — never dotenv, never .env.local"
---

# Quick 592 — Create and seed drivecommand-staging as the Phase 0 verification target

**Date:** 2026-09-09
**Mode:** quick
**Source:** `.planning/phase-0-revised.md` §3.6, §3.7; `docs/audits/branch-viability.md` §4

## Problem

A preview branch came up with **zero tables** against production's 98, because
Supabase seeds a branch from its own 36-entry ledger, which has no baseline and
which no runner in this repo reads (§3.6). Prompt 1 needs a schema to verify
against and Prompt 2 needs a click-through target, and neither can be production.
The decision already taken is a **second Supabase project seeded by
`scripts/migrate.mjs`**, the repo's own applier, starting from
`00000000000000_init`. Cost of $10/month is confirmed by the user.

Two things must additionally be settled here rather than during the cutover:
§3.7 established that production runs the **transaction** pooler on 6543 while
`app_user` needs **session** semantics on 5432, and that whether Supavisor even
accepts a non-`postgres` role (`app_user.<ref>`) is **unverified**. Both are
answered on this project or Prompt 2 is planned on a guess.

---

## Execution split — read this first

The executor has **Read, Write, Edit, Bash, Grep, Glob only**. It has **no MCP
tools**. The split is therefore fixed:

| Step | Who | Mechanism |
|---|---|---|
| Cost confirmation, project creation, waiting for ACTIVE_HEALTHY | **Orchestrator** | Supabase MCP |
| Capturing the staging project ref and region | **Orchestrator** | MCP `get_project` / `list_projects` |
| Establishing a usable `postgres` password for staging | **Orchestrator** | MCP `execute_sql` (see Task 1) |
| Production baseline (98 tables, 141 migrations, prod table name list) | **Orchestrator** | MCP `execute_sql`, **read-only**, production |
| Everything from `.gitignore` onward | **Executor** | Bash / Write |
| All staging SQL after Task 1 | **Executor** | `node` + the already-installed `pg` package |

`psql` is **not installed** on this machine (verified). Every raw connection —
the migrate run, the role checks, the Supavisor probe, the seed — goes through
`node` with `pg`, which `scripts/migrate.mjs` already imports. **Install
nothing.**

The executor can query staging directly once it holds the connection string, so
staging verification does **not** need to bounce back to the orchestrator. Only
the production baseline does.

---

## Hard prohibitions

- **Never write to `oqdhberkghtnszrkdvfm`.** Production is read-only here, and
  only for the baseline counts and table list.
- **Never run `prisma migrate deploy`, `apply_migration`, or `prisma db push`.**
  `scripts/migrate.mjs` is the applier. (`db push` against a Supabase host is
  refused by `scripts/guard-no-prod-db-push.mjs` anyway — do not reach for the
  override.)
- **Never put a staging string in `.env.local` or `.env`, and never commit one.**
- **Never copy production data.**
- **Never let a staging script load `dotenv`, `_bootstrap-env.ts`, or any `.env*`
  file.** `_bootstrap-env.ts` loads repo-root `.env`, repo-root `.env.local` and
  `apps/web/.env.local` — all three point at **production**. A staging script
  that imports it, or that imports anything under `src/lib/db/`, is one silent
  fallback away from writing production rows. Pass the connection string
  explicitly.
- **Install no package.**

---

## Tasks

<task type="auto">
  <name>Task 1 — ORCHESTRATOR ONLY: create the project and capture the production baseline</name>
  <files>none (MCP work; no files written in this task)</files>
  <action>
This task is executed by the ORCHESTRATOR with Supabase MCP tools. Do not
delegate it — the executor cannot perform it.

1. Call `get_cost` for a project in org `smtxeyavhusrpylmpywu`, then
   `confirm_cost`. The user has already approved $10/month; this call exists
   only to obtain the `confirm_cost_id` that `create_project` requires.
2. `create_project` with name `drivecommand-staging`, organization_id
   `smtxeyavhusrpylmpywu`, region `us-west-1` (same as production), and the
   confirm_cost_id.
3. Poll `get_project` until status is `ACTIVE_HEALTHY`. Record the **project
   ref** and confirm the region reads `us-west-1`.
4. **Establish a password for the `postgres` role.** If `create_project`
   returned a database password, use it. If it did not — likely — set one:
   `ALTER USER postgres WITH PASSWORD '<generated>';` via MCP `execute_sql`
   **against the staging project_id**. Generate an alphanumeric password of at
   least 32 characters: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url').replace(/[^A-Za-z0-9]/g,''))"`.
   Alphanumeric only — `@ : / ? # &` break a URL-form connection string, and a
   percent-encoded password is a debugging tax nobody needs at 2am.
   **This ALTER runs against staging and only staging. Confirm the project_id
   argument on the call before sending it.**
5. Capture the **production baseline**, read-only, project_id
   `oqdhberkghtnszrkdvfm`, one result set per call (Supabase `execute_sql`
   returns only the last statement's result — bundling is how a diagnostic gets
   silently dropped):
   - `SELECT count(*) FROM pg_tables WHERE schemaname='public';` — expect 98
   - `SELECT count(*) FROM public._prisma_migrations;` — expect 141
   - `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;` —
     keep the full list; Task 2 diffs against it
   - `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('postgres','app_user');`
     — production's `app_user` state, for the audit's comparison column
6. Hand the executor, in the task prompt (not in a file):
   - staging project ref
   - the `postgres` password
   - production's table count, migration count, full table-name list, and the
     `pg_roles` result

**STOP condition:** if project creation fails or does not reach ACTIVE_HEALTHY,
stop and report. Do not fall back to a branch — §3.6 already established a
branch cannot serve this purpose.
  </action>
  <verify>`get_project` returns status ACTIVE_HEALTHY, region us-west-1, name drivecommand-staging. A trivial `SELECT 1` via `execute_sql` against the staging project_id succeeds.</verify>
  <done>Staging ref, region, postgres password, and the four production baseline results are in hand and passed to the executor.</done>
</task>

<task type="auto">
  <name>Task 2 — EXECUTOR: gitignore, env file, migrate, verify schema, app_user, Supavisor probe</name>
  <files>.gitignore, apps/web/.env.staging</files>
  <action>
**2a. `.gitignore` FIRST, before any secret touches disk.**
`git check-ignore -v apps/web/.env.staging` currently prints nothing — the
existing rules are `.env*.local`, `.env.local` and `.env`, **none of which match
`.env.staging`**. Add to the `# env files` block in the repo-root `.gitignore`:

```
.env.staging
.env*.staging
```

Then prove it: `git check-ignore -v apps/web/.env.staging` must print a matching
rule. **Do not proceed to 2b until it does.**

**2b. Determine the pooler host — by connecting, not by assuming.**
Production uses `aws-1-us-west-1.pooler.supabase.com` and staging is the same
region, so start there. Supavisor addresses roles as `<role>.<project_ref>`, so
the username is `postgres.<staging_ref>`. Confirm with a throwaway `node -e`
using `pg` that a `SELECT 1` succeeds on port 5432 before writing the file. If
DNS or auth fails, try `aws-0-us-west-1.pooler.supabase.com` before concluding
anything. If TLS is refused, append `?sslmode=require`; only if that fails, set
`ssl: { rejectUnauthorized: false }` **in the probe script alone**, never in the
stored connection strings.

**2c. Write `apps/web/.env.staging`** with exactly these three keys, real
credentials, no placeholders:

```
STAGING_DATABASE_URL="postgresql://postgres.<ref>:<pw>@<pooler-host>:6543/postgres?pgbouncer=true"
STAGING_DIRECT_URL="postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres"
STAGING_DATABASE_URL_APP_USER="postgresql://app_user.<ref>:<app_user_pw>@<pooler-host>:5432/postgres?connection_limit=1&pool_timeout=20"
```

Head the file with a comment: staging only, never `.env.local`, never committed.
`STAGING_DATABASE_URL_APP_USER` is written in 2f once app_user has a password —
write the first two now.

**2d. Run the migrations with the repo's own applier.**
From `apps/web` (the script resolves `process.cwd()/prisma/migrations`):

```
cd apps/web
DIRECT_URL="<staging 5432 session string>" DATABASE_URL="<staging 5432 session string>" node scripts/migrate.mjs
```

Both variables, both pointing at **5432**, and here is why that is not
belt-and-braces: `migrate.mjs` prefers `DIRECT_URL` for the DDL, but on success
it spawns `npx tsx scripts/seed-starter-playbooks.ts` with `env: process.env`,
and that script imports `src/lib/db/prisma`, which builds its pool from
`DATABASE_URL`. Leave `DATABASE_URL` unset or pointing elsewhere and the
playbook seed writes to the wrong database or dies. 6543 is also not reachable
from a developer machine (documented in `scripts/_bootstrap-env.ts`), so the
transaction-mode string is the wrong one for both halves here.

Safety property worth stating: `migrate.mjs` reads **only `process.env`** — it
loads no `.env` file — so with both variables set inline on the command there is
no path by which it reaches production.

Expect 141 migrations applied (141 directories contain a `migration.sql`;
production's ledger holds 141 rows).

**STOP condition — this is a finding, not an obstacle.** If any migration
fails, `migrate.mjs` rolls that migration back and exits non-zero. **Stop.
Report the migration directory name and the verbatim Postgres error.** Do not
edit the migration, do not skip it, do not hand-insert a `_prisma_migrations`
row, do not switch appliers. A migration that cannot replay from
`00000000000000_init` is a real defect in the chain — production is only
healthy because it accumulated state out of band — and that defect is a more
valuable finding than a seeded staging project.

**2e. Verify the schema.** Write one throwaway `node` script (or a sequence of
`node -e` calls) using `pg`, connected on the 5432 session string, and report:

- `SELECT count(*) FROM pg_tables WHERE schemaname='public';` — against
  production's **98**
- `SELECT count(*) FROM public._prisma_migrations;` — against production's
  **141**
- `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;` —
  diff against the production list supplied by the orchestrator, in **both
  directions**, and name every table on either side of the difference

Any count difference must be **explained by that name-level diff**, not waved
at. A table present in production and absent from staging is an object applied
out of band and never mirrored into a migration (DEC-17 is the known family) —
name it. "Close enough" is not a result.

Confirm all **thirteen** carrier tables individually — the set altered by
`20260404100013_carrier_rls_policies`:

1. `carrier_documents`
2. `carrier_drivers`
3. `carrier_expenses`
4. `carrier_trucks`
5. `clients`
6. `contracts`
7. `dispatches`
8. `driver_pay_records`
9. `facilities`
10. `loads`
11. `route_template_stops`
12. `route_templates`
13. `stops`

Report all thirteen by name with a present/absent verdict each — including
`stops`, `route_template_stops` and `carrier_documents`, the three the branch
experiment specifically lacked. Count the verdicts: thirteen lines, not twelve.
Use `to_regclass` per name so an absent table yields NULL rather than an error
that aborts the batch.

**2f. `app_user`.**

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'app_user';
```

`20260515000001_db_security_standardization` contains
`CREATE ROLE app_user NOLOGIN` inside an `IF NOT EXISTS` guard (verified during
planning), so the role **should** be present with `rolcanlogin = false`.

- If **absent**: say so plainly. That means role creation is not in the
  migration chain and production's `app_user` was created out of band — a
  finding that changes Prompt 2's scope. Report it; do not create the role by
  hand and then describe the environment as if a migration had.
- If **present**: confirm `rolsuper = false` and `rolbypassrls = false` and
  report both. Note that it is `NOLOGIN` — **a password alone does not grant
  login.** Grant both:
  `ALTER ROLE app_user WITH LOGIN PASSWORD '<generated alphanumeric>';`
  Generate the password the same way as Task 1. Then append
  `STAGING_DATABASE_URL_APP_USER` to `.env.staging`.
  Re-read `pg_roles` afterwards and confirm `rolsuper` and `rolbypassrls` are
  **still false** — a login grant must not have widened anything.

**2g. The Supavisor probe — step 6, the one that gates Prompt 2.**
Write a small `node` + `pg` script that opens a connection using
`STAGING_DATABASE_URL_APP_USER` (username `app_user.<staging_ref>`, port 5432,
session mode) and runs:

```sql
SELECT current_user, session_user, current_setting('server_version');
```

- **Success** — `current_user` returns `app_user`: report it verbatim. Supavisor
  accepts a non-`postgres` role and Prompt 2's cutover route is open.
- **Rejection — STOP and report.** Report the exact error text and the username
  attempted. Do **not** work around it by connecting on the direct
  `db.<ref>.supabase.co` host and calling the question answered — the production
  cutover runs through Supavisor, so a direct-host success answers a different
  question. Do not fall back to `postgres`. **This finding blocks Prompt 2's
  production cutover and its value is in being known now rather than
  mid-cutover** (§3.7 lists it as explicitly unverified).

Delete every throwaway probe script when finished; leave nothing behind. (A
previous task left a `__probe.ts` sitting in `src/lib/` for a whole phase.)
  </action>
  <verify>`git check-ignore -v apps/web/.env.staging` prints a rule. `node scripts/migrate.mjs` exits 0 reporting the applied count. Table count, migration count, thirteen named carrier tables, `pg_roles` for app_user, and the `SELECT current_user` result are all captured as literal output.</verify>
  <done>Staging schema is built by the repo applier, the counts are reported against 98 and 141 with any delta named table by table, all thirteen carrier tables have a verdict, app_user's three role flags are stated, and the Supavisor question is answered by a real connection or reported as a blocking rejection.</done>
</task>

<task type="auto">
  <name>Task 3 — EXECUTOR: seed two tenants, write the audit, check the tree</name>
  <files>apps/web/scripts/seed-staging.ts, docs/audits/staging-environment.md</files>
  <action>
**3a. Evaluate `scripts/seed-qa-accounts.ts` and record the verdict.**
The task requires it to be evaluated rather than ignored. Findings established
during planning — confirm them, then state them in the audit:

1. It creates **Supabase Auth users** via `supabaseAdmin.auth.admin.createUser`
   using `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. On this
   machine those resolve to **production** (`oqdhberkghtnszrkdvfm`). Running it
   with only `DATABASE_URL` repointed would write rows to staging and auth users
   to production. That alone disqualifies reuse as-is.
2. Its coverage is short and asymmetric: tenant 1 gets owner/manager/one driver,
   one truck, two facilities; tenant 2 gets an owner and a client and nothing
   else. **No load, no stops, no trip, no route template, no document row, no
   second driver.**

Verdict: **do not reuse; write a new DB-only script.** Say exactly that in the
audit, with both reasons. Leave `seed-qa-accounts.ts` untouched.

**3b. Write `apps/web/scripts/seed-staging.ts`.**

Constraints:
- Takes its connection string from an explicit argument or from a
  `STAGING_DIRECT_URL` environment variable set on the command line. **No
  `dotenv`, no `_bootstrap-env`, no import from `src/lib/db/`.**
- Refuses to run if the connection string contains `oqdhberkghtnszrkdvfm` —
  fail closed, print the reason, exit non-zero. Cheap, and it is the one
  mistake that cannot be undone.
- Idempotent: look up by a stable natural key before inserting, the way
  `seed-qa-accounts.ts` does, so a re-run reports SKIP rather than duplicating.
- Prints a per-table created/skipped count at the end.
- No Supabase Auth calls at all.

Per tenant (**two tenants**, symmetric — call them e.g. `staging-org-a` /
`staging-org-b`, and do not reuse the `qa-test-org` slugs):

| Requirement | Model / table | Notes |
|---|---|---|
| tenant | `Tenant` | unique slug |
| owner | `User` role `OWNER` | |
| dispatcher | `User` role `MANAGER` | **`UserRole` is `OWNER \| MANAGER \| DRIVER` — there is no `DISPATCHER` value.** MANAGER is the dispatcher; `Trip.dispatcherId` is a `User` FK and points at this row. Do not invent an enum value. |
| two drivers | `User` role `DRIVER` ×2 + `CarrierDriver` ×2 | `CarrierDriver.userId` links them; Prompt 3's driver-visibility test needs two |
| client | `CarrierClient` → `clients` | |
| truck | `CarrierTruck` → `carrier_trucks` | |
| load with stops | `CarrierLoad` → `loads`, `CarrierStop` ×2 → `stops` | **`CarrierStop.dispatchId` is NOT NULL**, so a load with stops also requires a `Trip` row in `dispatches`. `Trip` requires `primaryDriverId` (CarrierDriver), `truckId` and `scheduledDeparture`; set `dispatcherId` to the MANAGER user. Stops also require `facilityId` → seed two `CarrierFacility` rows (`facilities`) per tenant, a pickup and a delivery. |
| route template | `RouteTemplate` → `route_templates` + `RouteTemplateStop` ×2 | **`route_template_stops.stop_type` admits only `pickup\|delivery\|fuel_stop\|layover` — `relay_handoff` is a 23514 here.** `route_templates.schedule_type ∈ fixed_days\|frequency\|on_call`, `equipment_type ∈ dry_van\|flatbed\|reefer\|tanker\|step_deck\|other`. |
| one document row | `CarrierDocument` → `carrier_documents` | |

Read `prisma/schema.prisma` for the required (non-optional, no-default) columns
of each model rather than guessing, and remember the standing rule: several
carrier tables carry CHECK constraints seeded in early migrations that do not
track the app's vocabulary (`stops.stop_type` admits only
`pickup|delivery|fuel_stop|layover|relay_handoff`; `facility_type` has no
`shipper`/`receiver` — use `warehouse` / `customer_site`). A 23514 on insert is
the constraint telling you the vocabulary, not a bug in the seed — read
`pg_constraint` on staging and use the values it permits.

Prisma is fine here (the generated client is present) as long as the client is
constructed with an explicit `PrismaPg` adapter over a `Pool` built from the
passed connection string. Raw `pg` inserts are equally acceptable if that is
less ceremony — the requirement is the rows, not the ORM.

**3c. Run it against staging** with `STAGING_DIRECT_URL` set inline, then report
**per-table counts** with a real query, not from the script's own log:

```sql
SELECT 'tenants', count(*) FROM "Tenant" WHERE slug LIKE 'staging-org-%';
-- then, per table, scoped to the two tenant ids:
-- "User", carrier_drivers, clients, carrier_trucks, facilities,
-- dispatches, loads, stops, route_templates, route_template_stops,
-- carrier_documents
```

One result set per call. Both tenants must be non-empty and symmetric.

**3d. Write `docs/audits/staging-environment.md`** recording, at minimum:

- Project **ref**, name, region, Postgres version, plan cost, creation date
- **Table count** in `public` against production's 98, with the name-level diff
  and an explanation for every difference in either direction
- **`_prisma_migrations` count** against production's 141, and the number
  `migrate.mjs` reported applying
- The **thirteen carrier tables**, listed individually with a verdict each
- **`app_user`**: present or absent, whether a repo migration created it
  (`20260515000001_db_security_standardization`), `rolsuper`, `rolbypassrls`,
  `rolcanlogin` before and after the LOGIN grant, and the same three flags for
  production's `app_user` for comparison
- **Which env keys were created** — key **names** and which file they live in.
  **No passwords, no full connection strings, no project-ref-bearing URLs with
  credentials.** The audit is committed; the credentials are not.
- **The Supavisor `app_user` result from step 6**, verbatim: the username
  attempted, the host, the port, and either the `current_user` value returned or
  the exact rejection text — plus, if rejected, a sentence stating that this
  blocks Prompt 2's production cutover.
- **What test data exists**: the two tenants, the per-table counts, and the
  explicit note that **no Supabase Auth users were created**, so nobody can log
  in to staging yet. Creating them needs the staging project's service-role key
  from the dashboard; name it as a follow-up for Prompt 2's click-through rather
  than leaving it to be discovered.
- The `seed-qa-accounts.ts` evaluation verdict from 3a.
- A **deviations** section (see 3e).

**3e. Check the tree, and report the deviation honestly.**
`git status` should show:
- `.gitignore` — modified
- `docs/audits/staging-environment.md` — new
- `apps/web/scripts/seed-staging.ts` — new

The task's own closing check says "only the audit file and a .gitignore
change". The seed script is a **third file**, and that is a deliberate,
reported deviation: step 7 authorises writing a seed script when the existing
helper does not serve, and a script written into a gitignored location would be
worse (unreviewable, and lost to the next task). It contains **no credentials**
— confirm that by reading it back. State the deviation in the audit's
deviations section rather than letting a reviewer find an unexplained file.

`apps/web/.env.staging` must **not** appear in `git status` at all. If it does,
2a did not take effect — fix the ignore rule before doing anything else, and
confirm nothing has been staged.

Also confirm, by reading them back, that neither `apps/web/.env.local` nor the
repo-root `.env` / `.env.local` was modified.
  </action>
  <verify>Per-table counts queried from staging show both tenants populated across all eleven tables. `docs/audits/staging-environment.md` contains every item in the 3d list. `git status --porcelain` shows exactly three paths and `.env.staging` is not among them. `grep -iE "postgresql://|password" docs/audits/staging-environment.md` returns nothing.</verify>
  <done>Two symmetric tenants exist with counts reported per table, the audit records ref/region/counts/env-key-names/Supavisor result/test data/deviations, and the working tree contains only the three intended files with no secret in any of them.</done>
</task>

---

## Success criteria

- [ ] `drivecommand-staging` is ACTIVE_HEALTHY in `smtxeyavhusrpylmpywu`, `us-west-1`; ref recorded
- [ ] Schema built by `node scripts/migrate.mjs` — no `migrate deploy`, no `apply_migration`, no `db push`
- [ ] Table count and `_prisma_migrations` count reported against 98 and 141, every difference named table by table
- [ ] Thirteen carrier tables confirmed individually, `stops` / `route_template_stops` / `carrier_documents` among them
- [ ] `app_user` present with `rolsuper=false` and `rolbypassrls=false` — or its absence reported as a finding about the migration chain
- [ ] `SELECT current_user` through the 5432 pooler as `app_user.<ref>` returns `app_user`, **or** the rejection is reported verbatim as a Prompt 2 blocker
- [ ] Two tenants populated; per-table counts reported from a query, not from a log
- [ ] `.gitignore` rule added **before** any credential was written; `.env.staging` untracked
- [ ] `docs/audits/staging-environment.md` written, containing no credential
- [ ] Production untouched: no write of any kind to `oqdhberkghtnszrkdvfm`

## Output

On completion write `.planning/quick/592-create-and-seed-drivecommand-staging-as-/592-SUMMARY.md`
covering: what was created, the two count comparisons with the diff explanation,
the `app_user` and Supavisor results (the two findings this task exists to
produce), what test data landed, and anything that hit a STOP condition.
