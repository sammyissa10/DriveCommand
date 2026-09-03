# RLS Policy Drift Detector

**Task:** quick-585 · **Type:** detector build, read-only against production
**Companion:** [`rls-policy-drop-forensics.md`](./rls-policy-drop-forensics.md) (quick-584)

---

## 1. What this detector exists to catch

quick-584's forensic investigation established that **59 RLS policies across 13
carrier tables** silently vanished from production sometime between 2026-05-28
and 2026-08-24. Ten of those thirteen tables carry `org_id` and were
re-covered — invisibly — by a later standardization migration
(`20260515000001_db_security_standardization`), so tenant isolation on those
tables kept working by coincidence. Three tables (`stops`,
`carrier_documents`, `route_template_stops`) were left with **zero** live
policies. The mechanism that removed them could not be determined from
surviving evidence: the one surface that would have recorded it
(`log_statement = 'ddl'`) was enabled and did capture the statements, but
Supabase's Postgres log retention is roughly 24 hours and the loss was
discovered about three months after it happened. This detector is item 1 of
that report's "Monitoring that would catch a recurrence" list — described
there as "the single highest-value item: it needs no new infrastructure and
detects loss regardless of cause."

**Postgres stores no policy creation timestamp.** `pg_policy` has no
timestamp column, and there is no `pg_stat_last_ddl`. There is therefore no
way to ask Postgres directly "when was this policy created" or "has a policy
been silently removed since last week." A **replay diff** — parse every
`CREATE`/`DROP POLICY` out of the repository's migration history, replay them
in order to compute the set of policies the repo *expects* to exist, and diff
that against what `pg_policy` actually holds live — is the only detector
available for this class of loss. It does not need a timestamp; it only
needs the repo's own migration history, which is permanent, and one
read-only query against the live database.

---

## 2. How it works

`apps/web/scripts/audit/rls-policy-replay.ts` is a pure, DB-free library:

1. **Parse.** Every `CREATE POLICY` / `DROP POLICY [IF EXISTS]` statement is
   extracted from each migration file with a **line-anchored** regex
   (optional leading whitespace, then the keyword at the start of a line).
   This anchor is deliberate and load-bearing: an unanchored match across the
   corpus returns 330 hits, two more than the anchored 328. The two extras
   are inside a `DO $$ … EXECUTE format('CREATE POLICY …')` block in
   `20260802120000_document_import_phase1/migration.sql` — lines that begin
   with a single-quote (a string literal passed to `format()`), not the
   keyword itself. The anchor excludes exactly those two, and that exclusion
   is also why 8 live policies on four `document_import*` tables show up as
   "unexpected" below — the dynamic `DO` block really did create them, and a
   static-text parser structurally cannot see inside dynamic SQL without
   evaluating it, which would change every downstream number.
2. **Replay, in migration order.** CREATE adds a policy key
   (`table.policy_name`) to a running set; DROP removes it.
   Counting raw `CREATE POLICY` occurrences would be wrong: the 2026-05-15
   standardization migration alone contains a **balanced 46 DROP / 46
   CREATE** (drop the old per-command policy, create the new standardized
   pair, across 23 tables), so a naive count produces 46 phantom
   discrepancies against a migration that, net, changes nothing about the
   *set* of policies present. Only an ordered replay produces the correct
   net-expected set.
3. **Diff both directions** against live `pg_policy`: `missing` (a migration
   creates it, the database does not have it) and `unexpected` (the database
   has it, no migration creates it — a policy added out-of-band is as much a
   drift signal as one silently removed).
4. **Subtract an explicit baseline.** See §3.
5. **Classify zero-policy tables** into two severity classes: FORCE RLS +
   zero policies (the severe class — quick-582 found this is how
   `carrier_documents` was invisible to a grant-only audit, because forced
   RLS with zero policies denies every row to every role), and RLS enabled
   but not forced + zero policies (less severe, but still a real gap for
   every non-owner role).

`apps/web/scripts/audit/rls-policy-drift.ts` is the runner: it reads the
migration corpus from disk, replays it, runs two read-only queries against
`pg_policy` / `pg_class` (joined on `pg_class.oid` — never `::regclass` on a
literal, since this schema mixes PascalCase and snake_case table names),
loads the committed baseline, and prints either a human-readable report or
(`--json`) a machine-readable summary. It never performs a write of any
kind.

---

## 3. The baseline is a shrinking list, not a threshold

`apps/web/scripts/audit/rls-policy-baseline.json` is an explicit, named list
of `table.policy_name` entries — never a tolerance number, a count
threshold, or a suppression flag. The committed script exposes **no**
`--write-baseline`, `--ignore`, or `--allow` flag; there is no code path
that can regenerate or relax it programmatically.

- A finding **not** in the baseline is a **new** finding and fails the check.
- A baseline entry that is **no longer actually missing/unexpected live** is
  reported as a **stale baseline entry** and *also* fails the check, naming
  the exact line to delete. This is what forces the file to shrink as
  policies are rebuilt — there is no way for an entry to sit in the baseline
  unused forever without failing the build. As each of the 59 missing
  policies is eventually rebuilt, its baseline line must be deleted or the
  check starts failing that same day.
- When every list in the baseline is empty, the intended action is to
  **delete the file** and remove the baseline-loading code from
  `rls-policy-drift.ts` — the file's own header comment says so.

---

## 4. Sample run against production (2026-09-03)

Connection: production database, read-only role, direct port 5432 (per
`_bootstrap-env.ts`). Connection string is never printed by the script;
below, the project host is masked as `***`.

### `npm run audit:rls-policy-drift -- --json` (abridged — full lists in §4 continued below)

```json
{
  "generatedAt": "2026-09-03T19:03:29.000Z",
  "migrationFiles": 140,
  "statementsParsed": 328,
  "expectedCount": 230,
  "liveCount": 179,
  "missing": [ /* 59 entries — see full human report below */ ],
  "unexpected": [
    "document_import_pages.bypass_rls_policy",
    "document_import_pages.tenant_isolation_policy",
    "document_imports.bypass_rls_policy",
    "document_imports.tenant_isolation_policy",
    "document_profiles.bypass_rls_policy",
    "document_profiles.tenant_isolation_policy",
    "facility_external_references.bypass_rls_policy",
    "facility_external_references.tenant_isolation_policy"
  ],
  "zeroPolicyForced": ["carrier_documents", "route_template_stops", "stops"],
  "zeroPolicyEnabled": ["_prisma_migrations"],
  "baseline": { "suppressedMissing": 0, "suppressedUnexpected": 0, "staleMissing": [], "staleUnexpected": [] },
  "exitCode": 1
}
```

(`exitCode: 1` here because this first run was against the empty skeleton
baseline, before it was populated — see below. `baseline.suppressedMissing:
0` confirms nothing was pre-suppressed.)

**Reproduction check — exact match against quick-584:**

| metric | quick-584 (forensics §5) | this run |
|---|---|---|
| statements parsed | 328 | **328** |
| policies expected | 230 | **230** |
| policies live | 179 | **179** |
| missing | 59 | **59** |
| tables with missing policies | 13 | **13** |
| tables at zero live policies | 3 | **3** (`carrier_documents`, `route_template_stops`, `stops`) |
| unexpected live policies | 8 | **8** (four `document_import*` tables) |

Arithmetic: `230 − 59 + 8 = 179` ✓. Per-table missing counts and the exact
policy names were cross-checked one-for-one against forensics §5's table and
code block — every name matches. No divergence; execution proceeded.

### Human-readable report, with the populated baseline in place

```
RLS Policy Drift — replay diff against live pg_policy
========================================================================

  Migration files read     : 140
  Statements parsed        : 328
  Policies expected (net)  : 230
  Policies live            : 179
  Missing (expected−live)  : 59
  Unexpected (live−expect) : 8

MISSING, by table (expected/live/missing):
  facilities                   6/2/4
  route_templates              6/2/4
  dispatches                   6/2/4
  carrier_drivers              7/2/5
  carrier_trucks                6/2/4
  carrier_expenses             8/2/6
  driver_pay_records           7/2/5
  clients                       6/2/4
  contracts                     6/2/4
  loads                         7/2/5
  stops                         6/0/6
  carrier_documents             4/0/4
  route_template_stops          4/0/4

MISSING policy keys:
  - carrier_documents.carrier_documents_insert
  - carrier_documents.carrier_documents_org_delete
  - carrier_documents.carrier_documents_org_update
  - carrier_documents.carrier_documents_select
  - carrier_drivers.carrier_drivers_driver_self_select
  - carrier_drivers.carrier_drivers_org_delete
  - carrier_drivers.carrier_drivers_org_insert
  - carrier_drivers.carrier_drivers_org_select
  - carrier_drivers.carrier_drivers_org_update
  - carrier_expenses.carrier_expenses_driver_insert
  - carrier_expenses.carrier_expenses_driver_select
  - carrier_expenses.carrier_expenses_org_delete
  - carrier_expenses.carrier_expenses_org_insert
  - carrier_expenses.carrier_expenses_org_select
  - carrier_expenses.carrier_expenses_org_update
  - carrier_trucks.carrier_trucks_org_delete
  - carrier_trucks.carrier_trucks_org_insert
  - carrier_trucks.carrier_trucks_org_select
  - carrier_trucks.carrier_trucks_org_update
  - clients.clients_org_select
  - clients.clients_owner_delete
  - clients.clients_owner_insert
  - clients.clients_owner_manager_update
  - contracts.contracts_org_select
  - contracts.contracts_owner_delete
  - contracts.contracts_owner_insert
  - contracts.contracts_owner_update
  - dispatches.dispatches_org_delete
  - dispatches.dispatches_org_insert
  - dispatches.dispatches_org_select
  - dispatches.dispatches_org_update
  - driver_pay_records.driver_pay_records_driver_select
  - driver_pay_records.driver_pay_records_org_delete
  - driver_pay_records.driver_pay_records_org_insert
  - driver_pay_records.driver_pay_records_org_select
  - driver_pay_records.driver_pay_records_org_update
  - facilities.facilities_org_delete
  - facilities.facilities_org_insert
  - facilities.facilities_org_select
  - facilities.facilities_org_update
  - loads.loads_driver_select
  - loads.loads_org_delete
  - loads.loads_org_insert
  - loads.loads_org_select
  - loads.loads_org_update
  - route_template_stops.route_template_stops_org_delete
  - route_template_stops.route_template_stops_org_insert
  - route_template_stops.route_template_stops_org_select
  - route_template_stops.route_template_stops_org_update
  - route_templates.route_templates_org_delete
  - route_templates.route_templates_org_insert
  - route_templates.route_templates_org_select
  - route_templates.route_templates_org_update
  - stops.stops_driver_select
  - stops.stops_driver_update
  - stops.stops_org_delete
  - stops.stops_org_insert
  - stops.stops_org_select
  - stops.stops_org_update

UNEXPECTED (live, no migration creates it):
  - document_import_pages.bypass_rls_policy
  - document_import_pages.tenant_isolation_policy
  - document_imports.bypass_rls_policy
  - document_imports.tenant_isolation_policy
  - document_profiles.bypass_rls_policy
  - document_profiles.tenant_isolation_policy
  - facility_external_references.bypass_rls_policy
  - facility_external_references.tenant_isolation_policy

ZERO-POLICY TABLES:
  FORCE RLS + zero policies (severe)     : carrier_documents, route_template_stops, stops
  RLS enabled, not forced, zero policies : _prisma_migrations

BASELINE:
  Reference   : docs/diagnostics/rls-policy-drop-forensics.md (quick-584)
  Recorded at : 2026-09-03
  Suppressed missing entries    : 59
  Suppressed unexpected entries  : 8

========================================================================
RESULT: CLEAN (exit 0) — no drift beyond the baseline.
```

Connection host, masked: `postgresql://postgres:***@***.pooler.supabase.com:5432/postgres`.

### Tamper probes (Task 2, step 6 — proving the baseline is not a rubber stamp)

**Probe A — delete a real baseline entry** (removed
`carrier_documents.carrier_documents_insert` from `missing.entries`, ran the
check, restored it):

```
BASELINE:
  Suppressed missing entries    : 58
  Suppressed unexpected entries  : 8

  NEW findings — not in the baseline:
    - missing: carrier_documents.carrier_documents_insert

========================================================================
RESULT: DRIFT DETECTED (exit 1)
```

Exit 1, naming the exact policy. Restoring the entry and re-running returned
exit 0.

**Probe B — add a fabricated entry** (`clients.definitely_not_a_real_policy`,
appended to `missing.entries`, ran the check, removed it):

```
BASELINE:
  Suppressed missing entries    : 59
  Suppressed unexpected entries  : 8

  STALE baseline entries — these are no longer actually missing/unexpected live.
  Delete each line below from rls-policy-baseline.json:
    - missing: clients.definitely_not_a_real_policy

========================================================================
RESULT: DRIFT DETECTED (exit 1)
```

Exit 1, reported as a **stale baseline entry** (not a new finding — the
policy was never actually missing, so it fails the opposite way). Removing
the fabricated entry and re-running returned exit 0.

---

## 5. CI credential gap — finding

`.github/workflows/` has exactly four workflow files as of quick-585 (plus
the new `rls-policy-drift.yml` this task adds):

| workflow | trigger | secrets used |
|---|---|---|
| `ci.yml` | `pull_request` (master, develop only — **no push trigger**) | none — `DATABASE_URL` is the **dummy** `postgresql://ci:ci@localhost:5432/ci`, set only because Vitest needs the variable defined even for mocked tests |
| `deploy-web.yml` | `push` (master, paths `apps/web/**`, `packages/**`) | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `doc-drift.yml` | `pull_request` (docs/content paths) | none |
| `playwright.yml` | `push` (master) + `pull_request` (master) | `PLAYWRIGHT_BASE_URL`, `TEST_OWNER_EMAIL/PASSWORD`, `TEST_SYSADMIN_EMAIL/PASSWORD`, `TEST_DRIVER_EMAIL/PASSWORD` |

**No workflow has any database URL secret.** The only place `DATABASE_URL`
appears in CI is the dummy value in `ci.yml`. `SUPABASE_SERVICE_ROLE_KEY`
(present only in `deploy-web.yml`) is a **PostgREST/API key** — it
authenticates HTTP calls to Supabase's REST/Auth API — and cannot drive a
`pg` (node-postgres) connection to `pg_catalog`, which is what this detector
needs.

**Conclusion: a new read-only secret is required.** `RLS_AUDIT_DATABASE_URL`
— a Postgres connection string for a role with `SELECT` on `pg_catalog` and
nothing else. No extra grant is needed for the query itself: `pg_policy` and
`pg_class` are world-readable to any role that can connect. The connection
must point at the **direct** port-5432 host, not the 6543 pooler — the same
constraint `_bootstrap-env.ts` already works around for local development,
because the pooler is not reachable from outside Vercel's network.

**quick-585 deliberately did not create this credential.** Per the task's
hard constraints, creating a CI secret was explicitly out of scope. The new
`.github/workflows/rls-policy-drift.yml` checks for
`secrets.RLS_AUDIT_DATABASE_URL` at the start of every run; when it is
absent (true today), the workflow emits a `::notice::` explaining the gap
and pointing here, and **exits 0** — the build does not fail for a missing
credential. The check is inert until a repository or organization
maintainer adds the secret.

---

## 6. pgaudit — availability and cost (not installed)

**Availability — already established, read-only, not re-queried here per
the task's constraints.** `pg_available_extensions` on project
`oqdhberkghtnszrkdvfm` (Postgres 17.6.1.084, region us-west-1) reports
pgaudit `default_version = 17.1`, `installed_version = null`. It is already
present in `shared_preload_libraries`, so enabling it is
`CREATE EXTENSION pgaudit;` plus setting `pgaudit.log = 'ddl'` — no restart
required beyond what `shared_preload_libraries` already covers, since
pgaudit is already loaded. **It is available on this plan.**

**Cost — log volume of `pgaudit.log = 'ddl'`.** Measured read-only via
`pg_stat_statements` (`track_utility = on`, already installed, `stats_reset
= 2026-08-24T12:23:57Z`):

- **89** DDL-class statement executions (leading verb `CREATE`, `ALTER`, or
  `DROP`) recorded across **27** distinct normalized statements, over the
  ~10.28 days between `stats_reset` and the query time
  (2026-09-03T19:08:14Z).
- That is **≈ 8.7 DDL statements/day** on this database under current
  workload (migrations, ad-hoc index/table creation by scripts, and the
  handful of enum `ALTER TYPE … ADD VALUE` statements Phase 10 shipped).
- Average statement text length in that sample: **≈ 104 bytes** (max 325,
  min 31).
- **Estimated log volume:** a pgaudit DDL log line is the raw statement text
  plus a fixed-format prefix (timestamp, PID, session/database/user,
  `AUDIT: SESSION,…,DDL,<command tag>,<object type>,<object name>,` plus the
  statement) — assumption: **~150–350 bytes of prefix/metadata** per line on
  top of the statement text. At ~8.7 statements/day × (~104 bytes statement +
  ~250 bytes assumed prefix) ≈ **~3 KB/day**, generously **on the order of a
  few KB/day, single-digit tens of KB/day at the upper bound** if DDL volume
  spikes during active migration work. This is a trivial volume by any
  storage or ingestion measure.

**The decisive point is retention, not volume.** quick-584's loss was
discovered roughly **three months** after it happened, and pgaudit — like
`log_statement = 'ddl'`, which is **already on** and already captured every
DDL statement at the time it ran — writes to the **same Postgres log**
whose Supabase retention is on the order of 24 hours. A few kilobytes a day
of extra, richer log lines does not help if the log itself is gone before
anyone thinks to look. `log_statement='ddl'` already tells you *that* a DDL
statement ran and *what* it was; pgaudit's marginal value here is
**object-level attribution** (which table, which policy, which role) — a
readability improvement, not a durability one.

**Conclusion: pgaudit is worth having only in combination with a log drain
or another durable sink** (Supabase log drain to an external destination
with real retention, or — the alternative already named in the forensics
report's monitoring list — an event trigger on `sql_drop` writing into a
durable Postgres table, which survives log rotation entirely because it is
data, not a log line). Priced here as an option; **not installed, no
decision made.**

---

## 7. What this task deliberately did not do

- Did **not** rebuild any of the 59 missing policies. They remain missing;
  that is a separate, future task.
- Did **not** install pgaudit. Availability and log-volume cost are priced
  above; `CREATE EXTENSION pgaudit` was never run.
- Did **not** create `RLS_AUDIT_DATABASE_URL` or any other CI secret. The
  workflow is wired to use it and skips with a notice until it exists.
- Did **not** modify `EXEMPT_MODELS`, `getTenantPrisma`, `lib/db/prisma.ts`,
  or any application access path.
- Did **not** run any migration, and issued no `CREATE`, `ALTER`, `DROP`,
  `GRANT`, `REVOKE`, `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` statement
  against the database at any point — every query in this task (including
  the ad hoc `pg_stat_statements` pricing queries in §6, run via a temporary,
  now-deleted script) was a `SELECT` against `pg_catalog` /
  `pg_stat_statements`.
