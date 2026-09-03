# Forensics — How the Carrier RLS Policies Were Dropped Without a Ledger Entry

**Date:** 2026-09-03 · **Task:** quick-584 · **Type:** read-only forensic
**Project:** Supabase `oqdhberkghtnszrkdvfm` (Postgres 17.6) · **Connected role:** `postgres`

Follow-up to quick-583 §2. Nothing was created, altered or dropped. No migration was run.
No test suite, seed or npm script was executed — executing a suspected mechanism would have
been the worst available move.

> **Verdict up front: the mechanism CANNOT be determined from surviving evidence.** The
> surface that would have answered it — Postgres DDL statement logging — **is enabled and
> was capturing these statements**, but its retention is ~24 hours and the event is ~3
> months old. What this task *did* establish is that the loss is **four times larger than
> reported** (59 policies across 13 tables, not 14 across 3), and its footprint falsifies
> several otherwise-plausible mechanisms.

---

## 1. Audit surfaces and their coverage

| surface | status | covers 2026-05-28 → today? |
|---|---|---|
| **Postgres DDL logging** (`log_statement`) | **`ddl` — ENABLED** | **NO** — see below |
| `postgres_logs` via Management API | available | **NO — oldest row `2026-09-02T18:45`, 226 rows, ~24h** |
| `query_logs` tool window | hard-capped at **24 hours** per call | **NO** |
| **pgaudit** | in `shared_preload_libraries`, **extension NOT installed** (`pg_extension` = 0) | **NO — never recorded anything** |
| **`pg_stat_statements`** (`track_utility = on`) | installed, **records utility statements** | **NO — `stats_reset` = 2026-08-24**, after the event |
| `_prisma_migrations` | 141 rows, intact | Yes, but records nothing relevant |
| `supabase_migrations.schema_migrations` | intact | Yes — one unrelated entry in the window |
| `pg_policy` timestamps | **do not exist** — see §6 | n/a |

### `pg_stat_statements` — checked, and it yields a useful negative

Not named in the brief, but it is the one surface that can outlive the log window:
`track_utility` is `on`, so `DROP POLICY` *is* recorded there. Its counters were reset on
**2026-08-24**, roughly three months after the event, so it cannot see the removal.

It is still worth reporting, because of what it contains. Exactly **four** policy DDL
statements are present, and all four are accounted for:

```
CREATE POLICY bypass_rls_policy        ON carrier_truck_defects   (1 call)
CREATE POLICY tenant_isolation_policy  ON carrier_truck_defects   (1 call)
DROP POLICY IF EXISTS bypass_rls_policy       ON carrier_truck_defects  (1 call)
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_truck_defects  (1 call)
```

These are the paired statements from `20260825120000_add_carrier_truck_defects`, which ran
on 2026-08-25. **Conclusion: no unexplained policy DDL has executed against this database
since 2026-08-24.** The removal is older than that window, and — usefully — nothing is
dropping policies *now*.

**This is the single most important line in the report:** `log_statement = 'ddl'` means
every `DROP POLICY` executed against this database **was written to the Postgres log at the
time**. The evidence existed. It has simply aged out — Supabase log retention is days, not
months, and the oldest retrievable Postgres log row is 2026-09-02, roughly three months
after the event. **The surface that would have answered this question expired before the
question was asked.** Nothing was worked around; there is no deeper log to reach.

`pgaudit` is preloaded but never installed as an extension, so the richer object-level audit
trail was never being written at all.

---

## 2. Every `DROP POLICY` in the repository

169 occurrences across 20 files. Excluding `.planning/` narrative documents, the executable
set is:

| file | count | targets |
|---|---|---|
| `migrations/20260515000001_db_security_standardization/migration.sql` | **46** | `tenant_isolation_policy` / `bypass_rls_policy` on 23 tables — **each paired with a CREATE** (46 DROP / 46 CREATE, balanced) |
| `migrations/20260527000001_quick410_advisor_rls_fix/migration.sql` | 14 | the three target tables — **each paired with a CREATE** |
| `migrations/20260527000001_quick410_advisor_rls_fix/rollback.sql` | 15 | three target tables — recreates **11**, so running it cannot yield zero |
| `migrations/20260327000008_add_rls_support_tickets/migration.sql` | 4 | `SupportTicket`, `TicketMessage` — paired |
| `migrations/20260327000005_add_driver_hos_and_incident/migration.sql` | 4 | `DriverHOSEntry`, `DriverIncident` — paired |
| `migrations/20260327000002_add_route_driver_and_route_name/migration.sql` | 2 | `RouteDriver` — paired |
| `migrations/20260327000006_add_push_token/migration.sql` | 2 | `PushToken` — paired |
| `migrations/20260825120000_add_carrier_truck_defects/migration.sql` | 2 | `carrier_truck_defects` — paired |
| `migrations/20260515_pii_encryption_pr1/migration.sql` | 2 | paired |
| `migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql` | 1 | `Tenant` |
| **`scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql`** | **1** | `tenant_jwt_self_read` on `"Tenant"` — **the only DROP POLICY outside `prisma/migrations`** |

**No file in the repository drops any of the 59 missing policies.** The lone non-migration
DDL file targets `Tenant.tenant_jwt_self_read`, and `Tenant` still carries
`tenant_self_read` live, so it was not run either.

I also confirmed the standardization migration's seven `DO $$` blocks are **NULL-check
guards, not dynamic DDL** — they `RAISE EXCEPTION` on un-backfilled rows. There is no
`EXECUTE format(...)` loop anywhere that could drop policies by pattern.

---

## 3. Runtime DDL paths — three candidates examined, all ruled out

| candidate | verdict | evidence |
|---|---|---|
| `scripts/audit/test-advisor-fix-isolation.ts` | **Not the mechanism** | Contains no `DROP POLICY`, `CREATE POLICY` or `ALTER TABLE`. Uses raw `pg.Pool` for `INSERT`s wrapped in `BEGIN`/`ROLLBACK`. Exits 0 with a warning if `DATABASE_URL_APP_USER` is unset rather than falling back to the privileged role. |
| `src/__tests__/isolation/group-{a,b,c}-isolation.test.ts` | **Not the mechanism** | `CREATE POLICY` appears only inside `//` comments documenting the policy under test. No DDL is executed. |
| `scripts/audit/406b-resolve-blockers.ts` | **Not the mechanism** | Its header states the `CREATE POLICY` snippets are markdown output; no `query(` call begins with a DDL verb. |

**No seed, script, test fixture or application code path issues policy DDL at runtime.** The
"test suite pointed at production" hypothesis the brief raises is specifically falsified: the
one script that *does* connect to production for isolation testing is read-only-plus-rollback
and refuses to run as the privileged role.

---

## 4. `prisma db push` / `migrate reset` exposure

- **No `package.json` script in the repo uses `db push`, `migrate reset` or `migrate dev`.**
  Root scripts are turbo passthroughs; `apps/web` has `start: node scripts/migrate.mjs && next start`,
  and `migrate.mjs` only applies `migration.sql` files, skipping by `migration_name`.
- **No CI workflow invokes them.** Every hit for `db push` across the repo is inside
  `.planning/` narrative documents.
- **But the tool is in the project's history.** quick-102 and quick-14 record using
  `prisma db push` manually against this database, and ROADMAP §115 describes creating
  migration SQL "for tables that were added via db push". So a human running `db push`
  locally against a production `DATABASE_URL` is an established practice here, not a
  hypothetical.
- `.env.local`'s `DATABASE_URL` points at the **production** pooler.

**This remains the most plausible unfalsified mechanism**, because `db push` reconciles the
database to `schema.prisma`, and **RLS policies never appear in `schema.prisma`** — but see
§5, where the footprint does not cleanly match it either. It cannot be confirmed without the
expired logs.

---

## 5. The full discrepancy — the loss is 59 policies, not 14

Method: parsed every `CREATE POLICY` / `DROP POLICY` out of all migration files, replayed
them in migration order to compute the set the repo expects, and diffed against live
`pg_policy`.

- **328** CREATE/DROP statements parsed
- **230** policies the migrations should have left in place
- **179** policies live
- **51** net missing overall → **59** missing within the carrier scope (offset by 8 live
  policies on four `document_import*` tables that no migration creates — those were applied
  by Supabase MCP during Document Import Phase 1 and never mirrored, a separate DEC-17 case)

### Missing, by table

| table | expected | live | missing |
|---|---|---|---|
| `carrier_expenses` | 8 | 2 | 6 |
| **`stops`** | 6 | **0** | **6** |
| `carrier_drivers` | 7 | 2 | 5 |
| `driver_pay_records` | 7 | 2 | 5 |
| `loads` | 7 | 2 | 5 |
| **`carrier_documents`** | 4 | **0** | **4** |
| `carrier_trucks` | 6 | 2 | 4 |
| `clients` | 6 | 2 | 4 |
| `contracts` | 6 | 2 | 4 |
| `dispatches` | 6 | 2 | 4 |
| `facilities` | 6 | 2 | 4 |
| **`route_template_stops`** | 4 | **0** | **4** |
| `route_templates` | 6 | 2 | 4 |
| | | **total** | **59** |

### The footprint is perfectly clean, and that is the finding

| source migration | missing | surviving |
|---|---|---|
| `20260404100013_carrier_rls_policies` | **48** | 0 |
| `20260527000001_quick410_advisor_rls_fix` | **11** | 0 |
| `20260515000001_db_security_standardization` | **0** | **20** |

**Every policy created by the April carrier migration and by quick-410 is gone. Every policy
created by the May standardization survives.** The missing set is precisely the April
per-command naming scheme — `*_org_select` / `*_org_insert` / `*_org_update` /
`*_org_delete`, plus `*_driver_*` and `*_owner_*` variants — across all 13 carrier tables:

```
carrier_documents     carrier_documents_insert, _select, _org_update, _org_delete
carrier_drivers       _org_select, _org_insert, _org_update, _org_delete, _driver_self_select
carrier_expenses      _org_select, _org_insert, _org_update, _org_delete, _driver_select, _driver_insert
carrier_trucks        _org_select, _org_insert, _org_update, _org_delete
clients               clients_org_select, clients_owner_insert, clients_owner_manager_update, clients_owner_delete
contracts             _org_select, _owner_insert, _owner_update, _owner_delete
dispatches            _org_select, _org_insert, _org_update, _org_delete
driver_pay_records    _org_select, _org_insert, _org_update, _org_delete, _driver_select
facilities            _org_select, _org_insert, _org_update, _org_delete
loads                 _org_select, _org_insert, _org_update, _org_delete, _driver_select
route_template_stops  _org_select, _org_insert, _org_update, _org_delete
route_templates       _org_select, _org_insert, _org_update, _org_delete
stops                 _driver_select, _driver_update, _org_select, _org_insert, _org_update, _org_delete
```

The ten tables that carry `org_id` were re-covered on 2026-05-15 by the standardized
`tenant_isolation_policy` + `bypass_rls_policy` pair, so they still have isolation and the
loss is invisible. **The three tables with no `org_id` were not in that migration's scope, so
for them the loss is total** — which is why quick-582 surfaced only those three.

### Two hypotheses the footprint falsifies

- **"Something dropped every policy not named `tenant_isolation_policy` / `bypass_rls_policy`."**
  **False.** `in_app_notifications_select/insert/update_policy`, `PushToken.user_isolation_policy`,
  `Tenant.tenant_self_read`, `SysAdminInvoice.sysadmin_invoices_deny_tenant_users` and
  `SysAdminInvoiceItem.sysadmin_invoice_items_deny_tenant_users` all survive with
  non-standard names.
- **Point-in-time restore.** **Impossible.** A PITR to any instant would have to preserve
  2026-05-15 while discarding 2026-04-05 *and* 2026-05-27. No single point in time produces
  that ordering.

### Corroborated timeline

`.planning/quick/405-.../405-SUMMARY.md` (May 2026) inventoried these tables and printed
`route_template_stops_org_select [SELECT]`, `stops_org_select [SELECT]` and
"carrier_documents already has 3 policies". quick-412 (2026-05-28) then asserted
`current_tenant_id()` coverage on all three and measured `carrier_documents` returning 11
rows as `app_user`. **The policies were demonstrably live on 2026-05-28.** The removal is
after that date.

---

## 6. Timestamps — the brief's step 6 rests on a false premise

**Postgres stores no creation or modification timestamp for policies.** `pg_policy` has no
timestamp column; there is no `pg_stat_last_ddl`. The step as written cannot be answered,
and no amount of querying will produce a policy creation date.

The available proxy is **OID ordering** — OIDs come from a global monotonic counter, so
relative order is recoverable even though wall-clock time is not. Treat it as strong
circumstantial evidence, not proof: the counter can wrap (not plausible at these values) and
ordering is not formally guaranteed across catalogs.

| policy | OID | inference |
|---|---|---|
| `User.tenant_isolation_policy` | 17582 | original 2026-02 migrations |
| `DriverHOSEntry.*` | 21078–21079 | 2026-03 |
| `in_app_notifications_select_policy` | 35833 | mid-2026 |
| **`facilities.tenant_isolation_policy`** | **53105** | **the 2026-05-15 standardization block** |
| `facilities.bypass_rls_policy` | 53106 | same batch |
| `loads` / `dispatches` / `clients` / `carrier_trucks` / `route_templates` | 53099–53114 | same contiguous batch |
| `audit_log.*` | 53297–53298 | end of that batch |
| `carrier_compliance_alert_log.*` | 60767 | later (≈June) |
| `carrier_truck_defects.*` | 66428 | 2026-08-25 |

**Answering step 6 directly:** the surviving control policies on `facilities` (53105/53106)
sit inside the contiguous 53099–53114 block, i.e. they were created by the **2026-05-15**
standardization — *before* 2026-05-28, not after. So the survivors were **not** recreated
after the loss event. There is a conspicuous OID gap between 53298 and 60767 where
quick-410's 2026-05-27 policies would have sat; nothing occupies it.

That rules out "everything was rebuilt later and these three were forgotten". The survivors
are original; the missing ones were removed.

---

## Conclusion — mechanism CANNOT be determined

I will not name a mechanism, because a wrong attribution here is worse than an open question
and the footprint does not uniquely identify one. What is established:

- The loss is **59 policies across 13 carrier tables**, not 14 across 3.
- It removed **exactly and only** the output of two migrations
  (`20260404100013_carrier_rls_policies`, `20260527000001_quick410_advisor_rls_fix`) while
  sparing every policy from `20260515000001_db_security_standardization`.
- It happened **after 2026-05-28** (quick-405's inventory and quick-412's verification) and
  **before 2026-08-24** (`pg_stat_statements` has recorded no unexplained policy DDL since
  its reset on that date). That is the tightest bracket the surviving evidence supports.
- **No repository artefact can account for it** — no migration, script, seed, test or
  application code path drops these policies, and three plausible runtime candidates were
  examined and individually ruled out.
- Two attractive hypotheses are **falsified**: a name-pattern sweep (contradicted by five
  surviving non-standard-named policies) and a point-in-time restore (no single instant
  produces the observed ordering).
- The most plausible **unfalsified** hypothesis remains a manual `prisma db push` against
  the production `DATABASE_URL` — the practice is documented in this repo's own history,
  `.env.local` points at production, and `db push` reconciles to `schema.prisma`, which
  never contains RLS policies. **It cannot be confirmed**, and it does not obviously explain
  why the 2026-05-15 policies survived while the 2026-05-27 ones did not.

**The surface that would have answered this is `log_statement = 'ddl'`, which was enabled and
did capture the statements. Supabase's log retention (~24 hours reachable; oldest row
2026-09-02) expired roughly three months before the question was asked.**

### Monitoring that would catch a recurrence

1. **A policy-count assertion in CI or a cron.** Compare live `pg_policy` against the set the
   migrations should have produced — the ~40-line replay written for §5 is the whole
   mechanism, and it would have caught this the day after it happened. This is the single
   highest-value item: it needs no new infrastructure and detects loss regardless of cause.
2. **Install `pgaudit`** — it is already in `shared_preload_libraries`, so enabling the
   extension and setting `pgaudit.log = 'ddl'` is a one-line change that produces an
   object-level DDL trail rather than a raw statement log.
3. **Ship Postgres logs off-platform** (Supabase log drain → any sink with >24h retention).
   DDL logging is already on; only the retention is inadequate.
4. **An event trigger on `sql_drop`** recording `DROP POLICY` into a durable table — the only
   option that survives log rotation entirely and is queryable months later.
5. **Remove the ability to `db push` at production.** A separate read-only role for local
   work, or a guard script refusing `db push` when `DATABASE_URL` resolves to the production
   host, closes the most plausible unfalsified path.

Until at least item 1 exists, rebuilding the policies means rebuilding them into a database
where the same silent removal would again go unnoticed — which is precisely the concern the
brief raised.
