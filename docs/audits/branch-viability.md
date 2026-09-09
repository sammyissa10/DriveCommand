# Supabase preview branch — viability as a verification target

**Phase 0.** Investigation for [`phase-0-revised.md`](../../.planning/phase-0-revised.md)
§8 (Prompt 1) and §9 (Prompt 2), both of which are written against a target
described as "a Supabase preview branch".

- **Date:** 2026-09-09
- **Project:** `oqdhberkghtnszrkdvfm` (drivecommand, us-west-1, PG 17.6.1.084)
- **Organization:** `smtxeyavhusrpylmpywu` — Pro plan, branching available
- **Scope:** investigation only. No migration applied to anything, no
  application code or configuration changed, no branch left running.

**Verdict: a preview branch is NOT a usable verification target for Prompt 1
or Prompt 2, and the reason is worse than the premise assumed.** The premise
was that a branch built from Supabase's 36-entry ledger would be *missing some
tables*. Measured, a branch is built from nothing at all: **0 tables in
`public`**, against production's 98.

---

## 1. The two ledgers, side by side

| | `public._prisma_migrations` | `supabase_migrations.schema_migrations` |
|---|---|---|
| Entries | **141** | **36** |
| All finished | 141 / 141 | n/a (no status column) |
| Written by | `apps/web/scripts/migrate.mjs`, and by hand | Supabase MCP `apply_migration`, Supabase CLI |
| Holds the SQL body? | No — name + checksum only | Yes — `statements text[]` |
| Earliest entry | `00000000000000_init` (full baseline) | `20260328004709_add_customer_email_notifications` (a delta) |

Repo migration directories on disk: **141** (142 entries in
`apps/web/prisma/migrations/` less `migration_lock.toml`), matching the Prisma
ledger's 141 exactly.

### Name overlap

| Comparison | Count |
|---|---|
| Exact matches (`version \|\| '_' \|\| name` = `migration_name`) | **0** |
| Matches on the descriptive suffix only | 27 |
| Supabase rows with no repo counterpart by either rule | 9 |
| Prisma rows absent from the Supabase ledger | **114** |

**Zero entries correspond exactly.** The overlap is only the human-readable
suffix, because Supabase stamps `version` with the wall-clock time of the
`apply_migration` call while the repo directory carries its own authored
timestamp. `add_carrier_truck_defects`, for instance, is
`20260825120000_add_carrier_truck_defects` in the repo and version
`20260825074123` in the Supabase ledger — same work, two names, and no
mechanical way to join them.

The 9 Supabase rows without a counterpart are mostly not orphans. Seven have
repo migrations under differently-named directories:

| Supabase ledger name | Repo directory |
|---|---|
| `add_vehicle_id_display_name_to_carrier_trucks` | `20260417100001_add_vehicle_id_display_name` |
| `widen_facilities_facility_type_check_driver_residence` | `20260802173535_widen_facility_type_check` |
| `add_appointment_is_firm_to_stops` | `20260802230853_add_appointment_is_firm` |
| `add_raw_response_to_document_import_pages` | `20260803115314_add_raw_response` |
| `add_resolution_provenance_to_document_imports` | `20260806040500_add_resolution_provenance` |
| `add_end_stop_facility_and_matrix_cache` | `20260811120000_end_stop_facility_and_matrix_cache` |
| `20260902120000_seed_notification_email_config` | same, re-stamped `20260902175602` |

That last row is the tell: the repo's full directory name was written into the
Supabase `name` column and given a *fresh* version prefix, so even a
deliberate attempt to keep the two in step produced a non-matching key.

### The carrier RLS migrations

Confirmed absent from the Supabase ledger, as the premise stated:

| Repo migration | In `_prisma_migrations` | In Supabase ledger |
|---|---|---|
| `20260404100013_carrier_rls_policies` | yes | **no** |
| `20260527000001_quick410_advisor_rls_fix` | yes | **no** |
| `20260602000001_phase1_grant_app_user_dml` | yes | **no** |
| `20260909120000_reconcile_rls_policy_drift` | **no** | **no** |
| `20260404100004_carrier_drivers_trucks` | yes | **no** |
| `20260404100005_carrier_route_templates` | yes | **no** |
| `20260404100007_carrier_dispatches` | yes | **no** |

The fourth row is Prompt 1's own reconciliation migration, correctly recorded
as unapplied anywhere (quick-591).

### Which ledger the app treats as authoritative

**`_prisma_migrations`, exclusively.** `apps/web/scripts/migrate.mjs`:

- creates `_prisma_migrations` if absent (`CREATE TABLE IF NOT EXISTS`);
- reads applied names from it — `SELECT migration_name FROM "_prisma_migrations"
  WHERE finished_at IS NOT NULL` — and skips any directory already listed;
- writes one row per migration it runs, with the literal checksum `'manual'`
  and `applied_steps_count = 1`.

It contains no reference to `supabase_migrations` anywhere. The Supabase ledger
is written only when a human or an agent calls `apply_migration` (or the CLI),
and is invisible to the runner that actually applies this repo's schema. This
is DEC-17 restated from the other direction: the two tables are independent,
and neither writes the other.

---

## 2. What a preview branch is actually seeded from

**Supabase's own migration ledger — not a production schema snapshot, and not
production data.** Three independent sources agree, and the measurement in §3
then shows the ledger contributes nothing here.

**Documentation.** [Branching](https://supabase.com/docs/guides/deployment/branching)
lists the six deployment steps. Two matter:

> 2. **Pull** — Retrieves database migrations from your main project (also
>    initialises the migration history table when Branching via Dashboard)
>
> 5. **Migrate** — Applies pending database migrations and vault secrets to
>    your branch

and, on the same page:

> **Data-less**: New branches do not start with any data from your main
> project. This is meant to better protect your sensitive production data.

[GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
adds that the SQL comes from the repo when that integration is used:

> The migrations in the `migrations` subdirectory of your Supabase directory
> are automatically run.
>
> No production data is copied to your Preview branch.

**The Management API.** `create_branch` returned `"with_data": false`, and the
tool's own contract states: *"This will apply all migrations from the main
project to a fresh branch database. Note that production data will not carry
over."*

**This repository.** There is no `supabase/` directory, no `config.toml` and no
`seed.sql` anywhere in the tree (verified by `find`). So the GitHub-integration
path has no migration source to read, and no seed file to run. The only
candidate source is the database-side ledger, whose `statements text[]` column
does hold real SQL (populated for all 36 rows, 150–3,728 characters each).

**So the answer to the question as posed is: the Supabase ledger** — never a
schema snapshot of production. And that ledger cannot rebuild this database
even in principle, because it has no baseline. Its earliest entry is:

```sql
-- Add emailNotifications column to Customer table
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "emailNotifications" BOOLEAN NOT NULL DEFAULT true;
```

An `ALTER TABLE` against a table that no entry in the ledger ever creates. The
ledger begins on 2026-03-28, four days after the project was created and long
after `migrate.mjs` had built the schema from `00000000000000_init` onward. It
is a record of 36 out-of-band patches, not a description of a database.

---

## 3. The branch, measured

Created `branch-viability-probe` → project ref `txwyhlmyblinnyaunvrm`. Waited
for `status: FUNCTIONS_DEPLOYED` / `preview_project_status: ACTIVE_HEALTHY`
before querying. `FUNCTIONS_DEPLOYED` is the final deployment step, after
`migrate` and `seed`, so the migration phase had completed — the readings below
are of a finished branch, not one still building.

All queries read-only. **Branch deleted in the same session; `list_branches`
now returns `main` alone.**

### The thirteen carrier tables

The thirteen are the exact set that `20260404100013_carrier_rls_policies`
alters. Every one is absent:

| Table | On branch |
|---|---|
| `carrier_documents` | **absent** |
| `carrier_drivers` | **absent** |
| `carrier_expenses` | **absent** |
| `carrier_trucks` | **absent** |
| `clients` | **absent** |
| `contracts` | **absent** |
| `dispatches` | **absent** |
| `driver_pay_records` | **absent** |
| `facilities` | **absent** |
| `loads` | **absent** |
| `route_template_stops` | **absent** |
| `route_templates` | **absent** |
| `stops` | **absent** |

**0 of 13.** The three named in the prompt — `stops`, `route_template_stops`
and `carrier_documents`, which are also quick-591's three FORCE-RLS-with-zero-
policies tables and the ones Prompt 1 exists to fix — are all absent.

### The wider picture

| | Branch | Production |
|---|---|---|
| Tables in `public` | **0** | **98** |
| Enum types in `public` | **0** | — |
| `public._prisma_migrations` exists | **no** | yes (141 rows) |
| Rows in `supabase_migrations.schema_migrations` | **0** | 36 |
| `auth.users` present | yes | yes |
| Tables in `auth` | 23 | — |
| Non-system tables, all schemas | 40 | — |

Two findings here are sharper than expected.

**The branch is entirely empty of application schema.** Not partially built,
not missing the carrier tables — 0 tables in `public`. Prompt 1's migration
would fail on its first statement, and so would every one of the 141 repo
migrations that assumes a predecessor.

**The Pull step copied nothing.** `supabase_migrations.schema_migrations`
*exists* on the branch (the count query returned 0 rather than an error), which
matches the documented "initialises the migration history table" — but it was
initialised **empty**. Production's 36 rows did not carry over. So the branch
was not even built from the incomplete ledger; it was built from an empty one.
That is consistent with there being no `supabase/` directory for the clone/pull
steps to read and no GitHub integration wired to this repo.

The branch is a healthy, correctly provisioned Supabase project — auth, storage
and the platform schemas are all present. It simply contains none of this
application.

---

## 4. Verdict

**A preview branch is not a usable verification target for Prompt 1's migration
or Prompt 2's cutover click-through.** Both prompts' `Target:` line needs to
change before either can run.

**Prompt 1** applies policy, grant and default-privilege DDL across thirteen
carrier tables and drops the `app_user` bypass path. Against a branch, every
`ALTER TABLE`, `CREATE POLICY` and `GRANT` targets an object that does not
exist. The check items quick-591 left open — *"`prisma migrate deploy` applies
cleanly to the branch"* and *"per-table policy counts identical before and
after"* — cannot be met on a branch: the first fails at statement one, and the
second compares two zeroes.

**Prompt 2** cuts the runtime connection from `postgres` to `app_user` and
clicks through the application against it. It needs the schema, the grants
*and* the `app_user` role. The role is created by
`20260515000001_db_security_standardization`, a repo migration absent from the
Supabase ledger, and roles are per-cluster — a branch is a separate project, so
it does not inherit production's roles. (Stated as inference: I measured 0
tables and 0 ledger rows on the branch, but deleted it before querying
`pg_roles`, so I did not confirm the role's absence directly.) Beyond that,
Prompt 2's click-through needs *tenant data* to distinguish "RLS is working"
from "the page is empty", and branches are data-less by design — the one
property Supabase will not relax, since it is the whole point of branching.

There is also a pre-existing ceiling this audit does not lift. quick-591
established that `CREATE EVENT TRIGGER` and `CREATE EXTENSION pgaudit` need
superuser, that the migration runner's `postgres` role has `rolsuper = false`,
and that **a branch hands you the same `postgres` role**. That conclusion stands
and is unaffected by anything here.

### What would make one

Four options, strongest first.

**1. Seed a second project from the repo's own migrations.** Create a fresh
Supabase project, point `DIRECT_URL` at it, and run `node scripts/migrate.mjs`.
That is the applier this repo actually uses, it starts from
`00000000000000_init`, and it would build all 141 migrations in order —
including the role, the carrier tables and all three carrier RLS migrations.
The result is a database whose schema provably matches what a production
`migrate.mjs` run produces, which is the property both prompts need. It also
needs no new tooling: the runner exists and is already the deployment path.
Cost is a second project rather than a branch, and it needs test tenant data
loaded for Prompt 2's click-through. **This is the recommendation.**

**2. Restore a production snapshot into a second project.** Gives schema *and*
data, so Prompt 2's click-through has something to render and cross-tenant
tests have real rows to fail against. It is the only option that verifies
against the exact bytes production holds — relevant given this repo's history
of drift between schema, ledgers and reality. Against it: production data
includes real tenants' operational records and driver home addresses, the
Phase 7 `DRIVER_RESIDENCE` privacy work exists precisely because those are
sensitive, and a restored copy is a second place they live. Only worth doing
with the data scrubbed, which is its own piece of work.

**3. Backfill the Supabase ledger so branching works as designed.** Write a
`supabase/` directory with `config.toml` and a `migrations/` folder mirroring
the repo's 141, then reconcile `supabase_migrations.schema_migrations` against
it. This is the only option that makes branching a *durable* capability rather
than a one-off, and it would end the two-ledger split that produced this
finding. It is also the largest and riskiest: it means writing a baseline that
reproduces 98 tables, and getting it wrong yields branches that are silently
wrong rather than obviously empty. Not worth it to unblock two prompts; worth
reconsidering if branch-per-PR becomes a goal.

**4. Verify by inspection, as quick-591 did.** Prompt 1's migration is already
established as a no-op against production by construction, verified by reading
`pg_policies`. The same method — replay the migration's expected policy set,
diff against live `pg_policies`, run the drift detector — covers Prompt 1
without applying anything anywhere. It does **not** cover Prompt 2, which is a
behavioural change that has to be exercised. Reasonable as an interim for
Prompt 1 only.

**Not viable:** applying to production to verify. Both prompts state production
is never written from those sessions, and the `db push` guard shipped in
quick-591 blocks the accidental path.

---

## 5. Reproduction

```sql
-- ledger sizes
SELECT count(*) FROM supabase_migrations.schema_migrations;   -- 36
SELECT count(*) FROM public._prisma_migrations;               -- 141

-- overlap
WITH s AS (SELECT version, name, version||'_'||name AS full_id
           FROM supabase_migrations.schema_migrations),
     p AS (SELECT migration_name,
                  substring(migration_name from '^[0-9]+_(.*)$') AS suffix
           FROM public._prisma_migrations)
SELECT (SELECT count(*) FROM s JOIN p ON p.migration_name = s.full_id) AS exact,
       (SELECT count(*) FROM s JOIN p ON p.suffix = s.name)            AS by_suffix;
-- 0, 27

-- on the branch (project ref txwyhlmyblinnyaunvrm, since deleted)
SELECT count(*) FROM pg_tables WHERE schemaname='public';              -- 0
SELECT count(*) FROM supabase_migrations.schema_migrations;            -- 0
SELECT to_regclass('public.stops') IS NOT NULL;                        -- false
```

Branch cost while it existed: $0.01344/hour, confirmed via `get_cost` before
creation. Total runtime under ten minutes.
