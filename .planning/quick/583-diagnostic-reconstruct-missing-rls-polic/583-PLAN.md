---
phase: quick-583
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/diagnostics/rls-policy-gap-stops.md
autonomous: true
executor: orchestrator            # NOT a gsd-executor subagent — needs Supabase MCP
must_haves:
  truths:
    - "The report names the CONNECTED role (current_user/session_user) and its rolsuper/rolbypassrls, so a reader can tell whether the zero-policy reads were themselves privilege-filtered"
    - "For each of stops / route_template_stops / carrier_documents the report states relrowsecurity, relforcerowsecurity, and a policy count taken from BOTH pg_policy and pg_policies, with the two counts shown side by side"
    - "At least three control tables (facilities plus two more correctly-policied carrier tables) carry the same three numbers, so the zero is proven to be a fact about the tables and not about the query"
    - "The report states, per table, the actual tenant column name and type — or states plainly that the table has NO tenant column and names the join path it must scope through instead"
    - "The report reproduces the control tables' policies VERBATIM from pg_policies, including polcmd, polroles and polpermissive, not just the qual text"
    - "The report states whether the intended policies exist in repo history, naming the migration file(s) and the ledger evidence, and distinguishes 'never authored' from 'authored and dropped' from 'authored, applied, then lost'"
    - "Both ledgers are checked and reported separately: _prisma_migrations AND supabase_migrations.schema_migrations"
    - "The GUC section names the exact GUC string, the set_config scope argument (session vs transaction), and the file:line where it is set — and states whether the session-scope deviation is still what the code does"
    - "The access-path inventory covers all three tables, is enumerated by PARENT Prisma model for nested relation access, and marks each site read/write and cron/after()/request"
    - "Every access path using the bare prisma singleton rather than getTenantPrisma/getTenantPrismaForOrg is listed with file and line"
    - "Drafted policies appear as fenced SQL text in the report and are explicitly labelled NOT APPLIED"
    - "Where reconstruction is not confident, the report says so in those words instead of inventing a definition"
    - "The report ends with a one-migration-vs-staged assessment and names every access path that breaks the moment a policy exists"
    - "No policy was created, altered or dropped; no migration was applied; RLS was not enabled or disabled on anything; no file under apps/web or packages was modified"
  artifacts:
    - path: "docs/diagnostics/rls-policy-gap-stops.md"
      provides: "The full reconstruction report — confirmed status with controls, history finding, tenant column per table, verbatim control policies, GUC mechanism, access-path inventory, bare-prisma sites, drafted policies, assessment"
      min_lines: 150
  key_links:
    - from: "docs/diagnostics/rls-policy-gap-stops.md"
      to: "apps/web/prisma/migrations/20260404100013_carrier_rls_policies/migration.sql"
      via: "the step-2 history section, citing the migration that specified the policies"
      pattern: "carrier_rls_policies"
    - from: "docs/diagnostics/rls-policy-gap-stops.md"
      to: "apps/web/src/lib/context/tenant-context.ts"
      via: "the GUC section, citing the set_config call site and its scope argument"
      pattern: "app\\.current_tenant_id"
---

<objective>
quick-582 found three tables with FORCE RLS enabled and **zero policies**: `stops`,
`route_template_stops`, `carrier_documents`. FORCE RLS with no policy means the owner
bypasses and every other role gets nothing — the app works today only because it connects
as `postgres` with `BYPASSRLS`. That is a live tenant-isolation gap, independent of the
`app_user` cutover.

This task establishes **what the policies should be** before anything is written.

Purpose: give the eventual policy migration a definition that is reconstructed from
evidence (the repo's own intended SQL + the working control tables) rather than invented,
and a blast-radius list so the rollout is not a surprise.

Output: `docs/diagnostics/rls-policy-gap-stops.md`.
</objective>

<constraints>
**READ-ONLY. This is a diagnostic. The ONLY file written is `docs/diagnostics/rls-policy-gap-stops.md`.**

Forbidden, without exception and including on a branch:
- `CREATE POLICY`, `ALTER POLICY`, `DROP POLICY` — in any form, anywhere
- `apply_migration` (the MCP tool), or any migration by any other route
- `ALTER TABLE … ENABLE/DISABLE/FORCE/NO FORCE ROW LEVEL SECURITY`
- `GRANT` / `REVOKE` / `CREATE ROLE` / `ALTER ROLE`
- any `INSERT`/`UPDATE`/`DELETE`/`CREATE`/`ALTER`/`DROP` of any kind
- modifying `getTenantPrisma`, `tenant-context.ts`, `tenant-rls.ts`, or any access path
- "testing" or "dry-running" a policy against production

`execute_sql` is used for `SELECT` only.

**Method rules that this database has already broken once each:**
1. **Resolve identifiers via `pg_class.oid` joined to `pg_namespace`, never `::regclass`
   on a string literal.** This DB mixes PascalCase (`"Truck"`, `"Route"`) and snake_case
   (`stops`, `carrier_documents`); quick-581 §1.1 lost a query to exactly that.
2. **One `SELECT` per `execute_sql` call.** Supabase returns only the last statement's
   result (`feedback_execute_sql_last_statement`). Never bundle a diagnostic SELECT with
   another query.
3. **Read policies from BOTH `pg_policy` (authoritative count) and `pg_policies` (rendered
   `qual` / `with_check` text) and report both numbers.** quick-582 used both and they
   agreed; if they disagree here, that disagreement is itself the finding.
4. **Capture `polcmd`, `polroles`, `polpermissive` alongside the expression.** A policy's
   command and role scope are as load-bearing as its `USING` clause — a control's pattern
   is not reproduced by copying the `qual` alone.
5. **Prisma model → table mapping comes from `@@map` in `schema.prisma`, never a guess.**
   quick-582 established: `stops` = model **`CarrierStop`**, `route_template_stops` =
   **`RouteTemplateStop`**, `carrier_documents` = **`CarrierDocument`**. `prisma.stop.`
   returns zero hits; a table-name grep finds almost nothing.
6. **Nested relation access is invisible to a table-name grep.** `stops: { … }` inside an
   `include`/`select` on a parent model is a real read of `stops`. Enumerate those by
   **parent model**.
7. **A zero from a source scan is only a finding once the scan is proven able to return
   non-zero.** Every grep whose answer is "none" needs a sibling grep that returns hits.
</constraints>

<context>
@.planning/STATE.md
@docs/diagnostics/app-user-grant-coverage.md
@.planning/quick/582-diagnostic-app-user-grant-coverage-audit/582-SUMMARY.md
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md

Supabase project: `oqdhberkghtnszrkdvfm`.

**Leads already established (verify, do not assume):**
- `apps/web/prisma/migrations/20260404100013_carrier_rls_policies/migration.sql` is the
  migration that **specifies** all three tables' policies. Its header comment states the
  scoping intent: `route_template_stops → via route_templates.org_id`;
  `stops → via dispatches.org_id OR loads.org_id`; `carrier_documents → polymorphic:
  uploaded_by / client_id / stop_id`. It also contains the `facilities_org_*` policies —
  i.e. the control pattern and the missing pattern are **in the same file**, which is the
  single most important fact for step 2.
- Other migrations mentioning policies on these tables:
  `20260226000003_add_route_stops`, `20260508000001_driver_pay_phase1`,
  `20260527000001_quick410_advisor_rls_fix`, `20260802120000_document_import_phase1`,
  `20260825120000_add_carrier_truck_defects`.
- `apps/web/src/lib/db/extensions/tenant-rls.ts` header states the app-layer injection
  layer **exempts** `CarrierStop`, `RouteTemplateStop` and `CarrierDocument` because they
  carry no `tenantId`/`orgId` column — so for these three tables RLS is not a second line
  of defence, it is the **only** one.
- `apps/web/src/lib/context/tenant-context.ts` sets
  `SELECT set_config('app.current_tenant_id', $1, false)` — session scope. `tenantRawQuery`
  in the same file uses `TRUE`. Confirm both and report the split.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Database-side reconstruction — status, controls, tenant columns, verbatim policies, GUC function</name>
  <files>(no files written; findings held for Task 3)</files>
  <action>
All queries via Supabase MCP `execute_sql` against project `oqdhberkghtnszrkdvfm`,
**one `SELECT` per call**, identifiers resolved by `pg_class.oid`.

**1a — connected role.** `SELECT current_user, session_user, current_database();`
Then a second call for the role's attributes:
`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN (current_user, session_user, 'app_user', 'postgres');`
Record both. If the connection has `BYPASSRLS`, say so — it is why the gap is invisible
in production today.

**1b — status matrix.** One query covering the three subject tables and at least three
controls (`facilities` plus two more correctly-policied carrier tables — pick them from
the same `20260404100013` migration, e.g. `clients`, `contracts`, `route_templates`,
`dispatches`, `loads`; confirm the real table names against `pg_class` first rather than
trusting the migration comment):

```sql
SELECT n.nspname,
       c.relname,
       c.relrowsecurity,
       c.relforcerowsecurity,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count_pg_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('stops','route_template_stops','carrier_documents',
                    'facilities', /* + the two chosen controls */)
ORDER BY policy_count_pg_policy, c.relname;
```

Then a **separate** call against `pg_policies` for the same table list, aggregated to a
count, and put the two counts side by side in the report. If a subject table is absent
from the result entirely, that is a missing table, not a zero — check and say which
(quick-582 hit exactly this with `trips`).

**1c — tenant column per table.** For each of the three, list every column with type and
nullability, and specifically test for the candidate names:

```sql
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS coltype, a.attnotnull
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
  AND c.relname IN ('stops','route_template_stops','carrier_documents')
ORDER BY c.relname, a.attnum;
```

The brief asks whether each uses `org_id` or `tenantId`. **The answer may be neither** —
the RLS extension's header says all three are scoped through a parent. If a table has no
tenant column, say that plainly and instead report the **join path** to one, evidenced by
the FK graph:

```sql
SELECT con.conname, src.relname AS child, tgt.relname AS parent,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN pg_namespace n ON n.oid = src.relnamespace
WHERE con.contype = 'f' AND n.nspname = 'public'
  AND src.relname IN ('stops','route_template_stops','carrier_documents')
ORDER BY src.relname, con.conname;
```

Note explicitly whether `carrier_documents`' parent link is a real FK or a polymorphic
`parentType`/`parentId` pair — a polymorphic parent cannot be joined by an FK and changes
what a policy can express.

**1d — verbatim control policies.** For the control tables, capture the full rendered
definition **and** the raw catalogue fields:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('facilities', /* + the two chosen controls */)
ORDER BY tablename, policyname;
```

and separately:

```sql
SELECT c.relname, p.polname, p.polcmd, p.polpermissive,
       (SELECT array_agg(r.rolname ORDER BY r.rolname)
        FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS role_names,
       p.polroles
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('facilities', /* + controls */)
ORDER BY c.relname, p.polname;
```

`polroles = {0}` means PUBLIC — spell that out rather than printing the OID array.

**1e — the GUC function, from the database.** The controls' `qual` will reference a
function (expected `current_tenant_id()`, possibly `app.bypass_rls`). Get its source:

```sql
SELECT n.nspname, p.proname, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('current_tenant_id','bypass_rls','is_bypass_rls');
```

Report the exact GUC string the function reads and whether it is `current_setting(…, true)`
(missing-GUC-tolerant, returns NULL) or `current_setting(…)` (throws). That distinction
decides whether a cron path with no GUC fails **closed and silent** or **loud**.

**1f — cross-check that a zero policy count is not a visibility artefact.** `pg_policy`
is readable by any role, but state it: run the same count for one table you already know
has policies and one you know has none, in the same call, so the query is proven able to
return both answers.
  </action>
  <verify>
Every query above returned a result set that was recorded. The three subject tables show
`relrowsecurity = true`, `relforcerowsecurity = true`, and both policy counts = 0 — or,
if not, the discrepancy is recorded as the finding. Controls show non-zero counts from
both catalogues. No statement other than `SELECT` was executed.
  </verify>
  <done>
Findings in hand for: connected role + attributes; the status matrix with ≥3 controls and
two independent policy counts; per-table column list with the tenant column named or its
absence stated plus the FK join path; the controls' policies verbatim including `cmd`,
`roles`, `permissive`, `qual`, `with_check`; the `current_tenant_id()` source with its GUC
string and its NULL-vs-throw behaviour.
  </done>
</task>

<task type="auto">
  <name>Task 2: Repo-side reconstruction — policy history in both ledgers, GUC call sites, full access-path inventory, bare-prisma sites</name>
  <files>(no files written; findings held for Task 3)</files>
  <action>
**2a — what was specified.** Read
`apps/web/prisma/migrations/20260404100013_carrier_rls_policies/migration.sql` in full.
Extract, verbatim, the `CREATE POLICY` blocks for `stops` (incl. `stops_driver_select` /
`stops_driver_update`), `route_template_stops`, and `carrier_documents`, plus the
`facilities_org_*` blocks from the same file. **The control and the missing tables are
specified in the same file** — establish that, because it means the intended text is not
lost and the question is only whether it ever landed.

Then sweep the other candidate migrations for any later `CREATE POLICY` or `DROP POLICY`
naming these three tables:
```
grep -rn "POLICY" apps/web/prisma/migrations/*/migration.sql | grep -Ei "stops|carrier_documents"
grep -rln "DROP POLICY" apps/web/prisma/migrations/*/migration.sql scripts
```
Check at minimum `20260226000003_add_route_stops`, `20260508000001_driver_pay_phase1`,
`20260527000001_quick410_advisor_rls_fix`, `20260802120000_document_import_phase1`,
`20260825120000_add_carrier_truck_defects`. Note any `DROP POLICY IF EXISTS … ;` that
precedes a `CREATE` — a drop that ran with a create that did not is one of the three
histories the report must distinguish.

**2b — git history, because a dropped policy may exist only there.**
```
git log --oneline -S "CREATE POLICY stops_org_select" --all -- apps/web/prisma
git log --oneline -S "carrier_documents_select" --all -- apps/web/prisma
git log --oneline -S "route_template_stops_org_select" --all -- apps/web/prisma
git log --all --diff-filter=D --name-only -- "apps/web/prisma/migrations/*"
git log --oneline -S "DROP POLICY" --all -- apps/web/prisma scripts
```
Also search outside `prisma/`: `scripts/`, `supabase/`, any `.sql` in the repo, and any
ad-hoc `.mjs`/`.ts` that issues policy DDL (`grep -rn "CREATE POLICY" --include=*.ts
--include=*.mjs --include=*.sql .` excluding `node_modules`). A policy applied by MCP from
a chat session leaves no repo trace at all — if that is the only remaining explanation,
say so as a limitation rather than as a conclusion.

**2c — both ledgers.** These are different tables (quick-581 §2.2). Query each in its own
`execute_sql` call:
```sql
SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
FROM _prisma_migrations
WHERE migration_name ILIKE '%rls%' OR migration_name ILIKE '%carrier%'
   OR migration_name ILIKE '%security%'
ORDER BY migration_name;
```
```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 100;
```
Report specifically whether `20260404100013_carrier_rls_policies` appears in
`_prisma_migrations`, with what `applied_steps_count` (per DEC-17: `0` = a mirrored /
resolved row, `1` = actually executed by `migrate.mjs` — that number is the difference
between "recorded as done" and "ran"), and whether it appears in the Supabase ledger.
If `_prisma_migrations` reads are unavailable to the connected role, say so — quick-582
classed that table as returning zero rows silently to a non-owner.

**2d — GUC mechanism in code.** Read `apps/web/src/lib/context/tenant-context.ts` and
`apps/web/src/lib/db/extensions/tenant-rls.ts`. Report:
- the exact GUC name and the exact `set_config(...)` call with its third argument,
  file:line, for `getTenantPrisma`, `getTenantPrismaForOrg`, and `tenantRawQuery`
- that `getTenantPrisma`/`getTenantPrismaForOrg` use **session scope (`false`)** while
  `tenantRawQuery` uses **transaction scope (`TRUE`)** — confirm and state the split
- whether the memory-recorded deviation (session scope, chosen because per-transaction
  scope caused P2028 deadlocks on the Session Pooler) is **still** what the code does
- the pool `'connect'` handler in `prisma.ts` that resets the GUC to `''`, if present —
  it is what stops a stale value leaking into a new connection's first query, and a
  policy rollout depends on it
- that `CarrierStop`, `RouteTemplateStop` and `CarrierDocument` are in `EXEMPT_MODELS` in
  `tenant-rls.ts`, i.e. the app-layer injection does **not** cover these three, so a
  database policy is their only isolation mechanism

**2e — access-path inventory.** Build it per table. Direct model access first:
```
grep -rn "prisma\.carrierStop\.\|tx\.carrierStop\.\|\.carrierStop\." --include=*.ts apps/web packages
grep -rn "\.routeTemplateStop\." --include=*.ts apps/web packages
grep -rn "\.carrierDocument\." --include=*.ts apps/web packages
```
(Confirm the Prisma delegate casing against `schema.prisma`'s `@@map` before trusting the
grep — model `CarrierStop` → delegate `carrierStop`. A grep for `prisma.stop.` returns
zero and would falsely read as "no access paths".)

Then **nested access, enumerated by parent model** — this is the half a table-name grep
misses and quick-582 counted ~34 of for `stops` alone:
```
grep -rn "stops:\s*{" --include=*.ts apps/web packages
grep -rn "documents:\s*{\|carrierDocuments:\s*{" --include=*.ts apps/web packages
grep -rn "routeTemplateStops:\s*{\|templateStops:\s*{" --include=*.ts apps/web packages
```
For each hit, identify the **parent delegate** (`prisma.trip.findMany({ include: { stops
… } })` → parent `Trip`) by reading enough surrounding lines to name it. Group the
inventory by parent model, not by file.

Also catch raw SQL: `grep -rn "\$queryRaw\|\$executeRaw" --include=*.ts apps/web | grep -Ei
"stops|carrier_documents|route_template_stops"`.

Mark each site: **read | write**, and **request | cron | after()**. Find the deferred and
scheduled contexts explicitly:
```
grep -rn "after(" --include=*.ts apps/web/src | head -50
ls apps/web/src/app/api/cron
grep -rn "emitNotificationAfterResponse\|afterResponse" --include=*.ts apps/web/src
```
A cron route has no request headers, so `getTenantPrisma()` (which reads `x-tenant-id`)
cannot work there — those sites either use `getTenantPrismaForOrg` or set no GUC at all.
Which one, per site, is the finding.

**2f — bare prisma singleton vs getTenantPrisma.** The distinction is the import symbol.
```
grep -rn "import .*getTenantPrisma" --include=*.ts apps/web/src | wc -l
grep -rn "from ['\"].*lib/db/prisma['\"]\|from ['\"]@/lib/db/prisma['\"]" --include=*.ts apps/web/src
grep -rn "import { prisma }\|import prisma from" --include=*.ts apps/web/src
```
Intersect that file set with the access-path inventory from 2e. Every file that touches
one of the three tables **and** imports the bare `prisma` singleton (rather than calling
`getTenantPrisma()` / `getTenantPrismaForOrg()`) sets no GUC, so under a policy it would
see `current_tenant_id()` return NULL and **fail closed** — reads to zero rows, writes to
a policy violation. List these with file and line; they are the rollout's breakage list.

Sanity-check each "zero hits" grep by running a sibling that returns hits, so an empty
result is evidence and not a typo.
  </action>
  <verify>
For each of the three tables the report can state which of {never authored, authored but
never applied, authored and applied then dropped, unknown} the history supports, and cite
the file and ledger row that supports it. Both ledgers were queried in separate calls. The
access-path inventory has at least one entry sourced from a nested `include` and grouped by
its parent model. Every grep reported as returning zero has a sibling grep that returned
non-zero.
  </verify>
  <done>
Findings in hand for: the intended policy SQL verbatim; the history verdict per table with
evidence and stated limitations; both ledger results; the GUC call sites with scopes and
the EXEMPT_MODELS fact; the full access-path inventory per table with read/write and
request/cron/after() marks and nested access grouped by parent; the bare-prisma site list.
  </done>
</task>

<task type="auto">
  <name>Task 3: Draft the policies and write docs/diagnostics/rls-policy-gap-stops.md</name>
  <files>docs/diagnostics/rls-policy-gap-stops.md</files>
  <action>
Write the report. Structure it to the brief's eight steps, in order, so a reader can check
each off:

**§1 Confirmed status.** The connected role and its `rolbypassrls`, then the status matrix:
one row per table, columns `relrowsecurity` / `relforcerowsecurity` / `pg_policy count` /
`pg_policies count`, the three subjects first and the ≥3 controls below. One sentence
stating what FORCE-with-zero-policies means for each role class (owner bypasses;
`app_user` and every other non-BYPASSRLS role gets **nothing**, silently on reads).

**§2 History.** What `20260404100013_carrier_rls_policies` specified, what the ledgers say,
what git history says, and the verdict per table. Note that the control and the missing
tables are specified **in the same migration file** — which is the strongest available
evidence about whether the file ran. If the evidence cannot separate "never applied" from
"applied then dropped outside the repo", **say that in those words** and name what would
settle it (there is no DDL audit trail available read-only; `pg_stat`/logs are not a
policy history).

**§3 Tenant column per table.** A table: table · tenant column (or **none**) · type ·
nullable · the join path to a tenant if there is no column. Make the "none" case
unmissable — it is why these three were exempted from the app-layer injection and why the
policy expression is a subquery rather than a column comparison. For `carrier_documents`,
state whether the parent link is a real FK or a polymorphic `parentType`/`parentId` pair.

**§4 Verbatim control policies.** Fenced blocks, one per control table, showing
`policyname`, `permissive`, `roles`, `cmd`, `qual`, `with_check` exactly as returned. Add
a short paragraph naming the pattern the three missing tables must match: which commands
are covered, which roles, whether `qual` and `with_check` differ, and whether a
`bypass_rls` clause is present.

**§5 GUC mechanism.** The GUC name; `current_tenant_id()`'s definition and whether it
tolerates a missing setting; the `set_config` call sites with their scope arguments and
file:line; the session-vs-transaction split between `getTenantPrisma` and `tenantRawQuery`;
whether the P2028-driven session-scope deviation is still in force; the pool-connect reset.

**§6 Access-path inventory.** Three subsections, one per table. Group by parent model where
access is nested. Columns: file:line · parent model · direct or nested · read/write ·
context (request / cron / after()). Count them and state the counts. Mark cron and after()
rows visibly — those are where no GUC may be set.

**§7 Bare-prisma sites.** The intersection list, file and line, with the failure mode per
site (read → zero rows silently; write → policy violation, loud).

**§8 Drafted policies.** Fenced SQL, headed with a line reading exactly
`-- NOT APPLIED. Draft only. Do not run from this document.`
Base the drafts on the intended SQL recovered in §2, **reconciled against** the control
pattern in §4 and the actual columns and FKs in §3 — where the recovered SQL and the live
schema disagree (a renamed column, a constraint that no longer exists), say which you
followed and why. For `carrier_documents` add the extra consideration the brief asks for:
it is polymorphic and holds documents, so its read scope is not the same shape as `stops`'
— state whether a driver reading their own uploads, or an org reading a document attached
to a client vs a stop, needs separate `SELECT` policies, and whether the polymorphic parent
can be expressed in a policy at all.

**Confidence, stated per table.** If a definition cannot be reconstructed with confidence,
write that it cannot, and name what is missing. Do not invent a definition to fill a gap.
An honest "not reconstructible from available evidence" is the correct output here; a
plausible-looking policy that nobody can trace to a source is worse than none.

**§9 Assessment.** One migration or staged? Argue it from the access-path inventory, not
from taste. Then a closing list: **every access path that breaks the moment a policy
exists** — the bare-prisma sites, the cron/after() sites with no GUC, and any raw-SQL site
— each with its failure mode. Note the class distinction quick-582 established: a read that
fails closed returns zero rows with **no exception**, so no `try/catch` anywhere can detect
it; a write throws.

Include a short **method notes** section (the identifier/oid rule, one-SELECT-per-call,
both-catalogues, both-ledgers, the `@@map` mapping, the nested-include blind spot) so the
next task inherits them.

Finish by verifying the constraints held: `git status` shows nothing under `apps/` or
`packages/`; no `apply_migration` call was made; no policy, RLS setting, grant or role was
created, altered or dropped.
  </action>
  <verify>
`docs/diagnostics/rls-policy-gap-stops.md` exists and contains all nine sections.
`git status --porcelain` lists only the report and `.planning/` files — nothing under
`apps/` or `packages/`. `grep -in "CREATE POLICY" docs/diagnostics/rls-policy-gap-stops.md`
returns hits **only** inside the §8 fenced draft block, under the NOT APPLIED header.
The report contains the strings `app.current_tenant_id`, `carrier_rls_policies`,
`supabase_migrations`, and `_prisma_migrations`.
  </verify>
  <done>
The report is written, is ≥150 lines, states a confidence verdict per table, ends with the
one-migration-vs-staged assessment and the full break list, and no database object and no
source file was changed.
  </done>
</task>

</tasks>

<verification>
- All three subject tables and ≥3 control tables carry two independently-sourced policy
  counts in the report.
- Both `_prisma_migrations` and `supabase_migrations.schema_migrations` are reported
  separately and are not conflated.
- The access-path inventory contains nested-include entries attributed to parent models,
  not only direct-delegate hits.
- Drafted policies are clearly labelled NOT APPLIED and are traceable to either the
  recovered migration SQL or the control pattern; anything not traceable is labelled as
  not confidently reconstructible.
- `git status` clean of `apps/` and `packages/`.
</verification>

<success_criteria>
A reader with no context can, from `docs/diagnostics/rls-policy-gap-stops.md` alone:
1. confirm the gap is real and is not a query artefact,
2. say whether the policies ever existed and on what evidence,
3. see the working pattern verbatim,
4. know how tenant context reaches the database and where it does not,
5. know exactly which code paths break the day a policy lands,
6. and either take the drafted policies to a migration, or read a plain statement of why
   they cannot be reconstructed yet.
</success_criteria>

<output>
After completion, create
`.planning/quick/583-diagnostic-reconstruct-missing-rls-polic/583-SUMMARY.md`.
</output>
</content>
</invoke>
