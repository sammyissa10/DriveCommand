---
phase: quick-614
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - docs/audits/policy-or-shortcircuit.md
  - .planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/*

must_haves:
  truths:
    - "Every cell of the probe matrix is MEASURED on staging as `app_user` with the tripwire armed, and the raw error text or the raw scalar is QUOTED verbatim in the evidence and in the audit — nothing about Postgres evaluation order is reasoned about."
    - "RAISES and RETURNS-ZERO-ROWS are distinguished explicitly per cell, and a `count(*)` cell reports the SCALAR, never `rowCount`."
    - "The headline is the EFFECTIVE OR population: `bypass_rls_policy` is a second PERMISSIVE policy on 86 tables and PostgreSQL ORs permissive policies together, so the OR shape is 86 tables spelled as two policies, not the 1 literal-OR policy the brief expected — and that OR is re-measured in THIS task's run rather than cited from quick-602."
    - "Finding F is settled by measurement: whether an `EXISTS`/`IN` subquery evaluates `current_tenant_id()` when the inner scan is empty — reported as MEASURED, or as PARTIALLY MEASURED with the part that could not be constructed read-only named plainly, never as an inference."
    - "Every subquery cell reports the OUTER table's row count beside its verdict, because an empty outer table produces 'no raise' for a completely different reason than short-circuiting and the two are indistinguishable without it."
    - "The matrix contains at least one control cell that does NOT raise, so a connection that raises on everything cannot render as a wall of confirmations."
    - "Every table whose policy raises is traced to the files that read it with NO tenant context — sysadmin, cron, public, login — with real file paths, each classified CUTOVER BLOCKER or LATENT, and the grep method stated."
    - "The audit records the state correction: production is no longer 'awaiting deploy'; both migrations are applied and both databases are at 186 policies / 86 `bypass_rls_policy`."
    - "Step 5 — is the tripwire the right instrument — is answered committally with a named recommendation, its cost, and the argument against the obvious alternative (returning NULL inside policies converts every raise into a SILENT ZERO-ROW UNDER-READ, the exact failure the tripwire was built to end)."
    - "Nothing is written to either database, no repo file outside `docs/audits/policy-or-shortcircuit.md` and the GSD task artefacts is created or modified, the tripwire is not disarmed, no package is installed, and nothing is pushed."
  artifacts:
    - path: "docs/audits/policy-or-shortcircuit.md"
      provides: "The seven required sections: state correction, counts, per-policy measured table, finding F, steps 3+4 with files named, step 5 answered, what remains before cutover"
      min_lines: 200
    - path: ".planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/"
      provides: "Raw probe output (JSON + verbatim error text), the production/staging enumeration, EXPLAIN plans, the source-search transcript"
  key_links:
    - from: "docs/audits/policy-or-shortcircuit.md"
      to: ".planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/"
      via: "every quoted measurement cites the evidence file it came from"
      pattern: "evidence/"
    - from: "docs/audits/policy-or-shortcircuit.md"
      to: "docs/audits/admin-connection.md"
      via: "step 3 reconciles against section 9's existing unrouted list and reports divergences as corrections"
      pattern: "admin-connection.md"
---

<objective>
Answer, by measurement, which RLS policies cannot be saved from the `TC001` tripwire by their
tenant-independent branch — and whether the tripwire is the right instrument at all.

Purpose: the `app_user` cutover is gated on knowing which no-tenant paths will hard-fail. A policy
that raises on a table nothing reads without a tenant is latent; one on a live sysadmin surface is a
blocker. Nobody has measured whether a subquery branch short-circuits, and that answer decides
whether four tables fail loudly or under-read silently.

Output: ONE audit file, `docs/audits/policy-or-shortcircuit.md`, plus this task's evidence.

**INVESTIGATION ONLY. No code changes. No migrations. No writes to production or staging.**
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/613-route-the-automationrule-admin-paths-to-/613-SUMMARY.md
@docs/audits/admin-connection.md
@docs/audits/unmigrated-path-tripwire.md
@apps/web/prisma/migrations/20260914180000_tenant_context_tripwire/migration.sql
@apps/web/src/lib/db/tripwire-arm.ts
@apps/web/scripts/audit/613-routing-verify.ts
@apps/web/tests/security/admin-connection-allowlist.test.ts
</context>

<hard_limits>
Repeat these in the SUMMARY's self-check. Every one of them is a task failure if broken.

1. **No code changes.** Nothing under `apps/`, `scripts/`, `prisma/`, `packages/` may be created,
   modified or deleted. Not even a comment. Not even a test.
2. **The ONLY repo file that may be created or modified is `docs/audits/policy-or-shortcircuit.md`.**
   The GSD artefacts — `614-PLAN.md`, `614-SUMMARY.md`, `.planning/STATE.md`, and
   `.planning/quick/614-*/evidence/*` — are task metadata, not codebase changes, and are expected.
3. **The probe script lives in the SCRATCHPAD, never in the repo.** Write it to
   `C:/Users/sammy/AppData/Local/Temp/claude/c--Users-sammy-Projects-DriveCommand/ac486f86-668f-49ca-95b5-54f9c27dd11c/scratchpad/614-policy-probe.cjs`
   as plain CommonJS and run it with `node` from `apps/web`. `require('pg')` and `require('dotenv')`
   resolve out of the repo-root `node_modules` from that cwd — VERIFIED this session:
   `node -e "require.resolve('pg')"` run from `apps/web` returns
   `C:\Users\sammy\Projects\DriveCommand\node_modules\pg\lib\index.js`. No `tsx`. No new file under
   `scripts/audit/`.
4. **No writes to either database.** Read-only, both. Every probe runs inside `BEGIN ... ROLLBACK` as
   belt and braces so that even an accident is discarded. No `DELETE`, no `INSERT`, no `UPDATE`, no
   DDL, no fixture creation — not even inside a transaction that will be rolled back.
5. **Do not disarm the tripwire on staging.** Read `TENANT_CONTEXT_TRIPWIRE` and report its value;
   do not change it. The probe arms its OWN session with a session-local `set_config` — that is a
   session GUC, **NOT a database write**, and the audit must state the distinction so a reader does
   not mistake it for one.
6. **Do not install any package.** `pg` and `dotenv` already exist.
7. **Do not `git push`.** Commit only (`feedback_git_push.md`).
8. **Do not fix anything found.** This task reports. A blocker found is a blocker named, not closed.
9. **NEVER import `scripts/_bootstrap-env`** (quick-607) — it repoints `DATABASE_URL` at
   `DIRECT_URL`, and every env file in this repo points `DIRECT_URL` at PRODUCTION.
</hard_limits>

<tasks>

<task type="auto">
  <name>Task 1: Enumerate on production, then MEASURE the matrix on staging as app_user with the tripwire armed</name>
  <files>
C:/Users/sammy/AppData/Local/Temp/claude/c--Users-sammy-Projects-DriveCommand/ac486f86-668f-49ca-95b5-54f9c27dd11c/scratchpad/614-policy-probe.cjs
.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/01-enumeration.md
.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/02-matrix.json
.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/03-matrix-verbatim.md
.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/04-explain.md
  </files>
  <action>
**PART A — re-run the enumeration in THIS task's run. Do not inherit the counts.**

Read-only `SELECT` over the catalogs on BOTH databases. Use the Supabase MCP `execute_sql` for
PRODUCTION (`oqdhberkghtnszrkdvfm`) — catalog SELECTs only, and remember it returns ONLY the last
statement's result, so issue one query per call (`feedback_execute_sql_last_statement.md`). Use the
scratchpad pg client on the privileged staging URL for STAGING.

Capture, per database, into `evidence/01-enumeration.md`:
- total policy count, and the count named `bypass_rls_policy`;
- every policy whose `qual` or `with_check` contains `current_tenant_id`, with
  `schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check` — **the FULL
  expression, never elided**;
- classification of each into: literal **OR** / **CASE** / **COALESCE** / **subquery**
  (`EXISTS` / `IN` / `ANY` / `SELECT`) / **bare equality**. Classify by parsing the expression text,
  and state the rule used. Report the count per class for each database.
- whether each such table ALSO carries a `bypass_rls_policy` (the finding-D question — three of the
  four subquery tables are expected to carry none, and the audit must say so if that holds in this
  run);
- the `_prisma_migrations` head rows for `20260915140000_automation_rule_per_command_policy_split`
  and `20260915150000_grant_automation_rule_to_app_admin` on PRODUCTION, with
  `applied_steps_count` and `checksum`, which is the evidence for the state correction. Per DEC-17,
  confirm a known-good sentinel row is visible before treating any empty result as absence.

If production and staging disagree on any count, that is a finding and goes in the audit — do not
average them, do not pick one.

**PART B — the probe script.** Plain CommonJS at the scratchpad path above. Mechanics, all of which
have in-repo precedent in `apps/web/scripts/audit/613-routing-verify.ts` (read it; do not import it,
do not modify it):

- `require('dotenv').config({ path: <repoRoot>/apps/web/.env.staging, quiet: true })`.
- Connection strings from `STAGING_DATABASE_URL_APP_USER` and `STAGING_DIRECT_URL`. Rewrite
  `:6543/` to `:5432/` and strip `?pgbouncer=true` — session mode is required, because the GUCs this
  measures are session scope. 613 does exactly this rewrite.
- **Positive refusal:** the string must contain `wyixpgunnjmzguhggocz`; containing
  `oqdhberkghtnszrkdvfm` is an immediate hard stop with a non-zero exit. Refuse if unset.
- Print a `[db-target]` banner to **STDERR** naming the resolved project ref, host and role, password
  masked (quick-607). STDERR, never stdout, so a JSON payload stays pipeable.
- Arm the probe's own `app_user` session with
  `select set_config('app.tenant_context_tripwire','on',false)`, then READ IT BACK with
  `current_setting(...)` and record the value. Also record the value of the `TENANT_CONTEXT_TRIPWIRE`
  env var. Report both. Do not change either on disk.
- **SQLSTATE off the CAUSE CHAIN** (quick-610): walk `err.cause`, accepting the first 5-character
  `code`. Recognise `TC001` by **CODE, never by message prose** (quick-602). Record the code, the
  first line of the message, and the `DETAIL` / `HINT` when present, verbatim.
- **Every probe inside its own `BEGIN ... ROLLBACK`.** One transaction per cell, because a `TC001`
  aborts the transaction and the next statement on it is `25P02` — which would silently misreport
  every subsequent cell as a different failure (quick-611's class).
- The EMPTY lane sets `set_config('app.current_tenant_id','',true)` explicitly inside the transaction,
  so the state is deterministic and is the state a pooled request actually carries — quick-602
  measured that a pooled backend essentially never reaches the UNSET branch.
- The REAL lane discovers a live tenant id from the privileged connection
  (`select id from "Tenant" order by "createdAt"`), as 613 does. Never hardcode one.
- **Report the SCALAR for every `count(*)`, never `rowCount`** — `rowCount` is 1 for every count
  query, so a refused read renders identically to a successful one (quick-612's `Probe.value` note).
- Emit machine-readable JSON to `evidence/02-matrix.json` and a human table with the VERBATIM error
  text per cell to `evidence/03-matrix-verbatim.md`.

**PART C — the cells. Every one measured in BOTH the EMPTY and the REAL lane unless noted.**

1. **The one literal-OR policy** — `AutomationRule.tenant_isolation_policy` (SELECT,
   `(scope = 'SYSTEM') OR ("tenantId" = current_tenant_id())`). Probe a **SYSTEM-scoped** row — the
   row the tenant-independent branch would have to save — AND a tenant-scoped row.

2. **The four subquery policies** — `carrier_documents`, `stops`, `route_template_stops`,
   `TicketMessage`. For each:
   - the plain read, EMPTY and REAL lane;
   - **the OUTER table's row count, read on the PRIVILEGED connection, reported beside every
     verdict.** This is not decoration. A correlated `EXISTS` qual is evaluated per outer row, so an
     **empty outer table cannot raise** — and that produces "no raise" for a completely different
     reason than short-circuiting. Without the count the two are indistinguishable and the whole
     finding-F answer is vacuous. Note this is quick-610's rule biting in the direction that matters
     here: an empty table still raises for a scan-setup predicate, and CANNOT raise for a per-row one.
   - **Finding F — the inner-empty case.** The question: does an `EXISTS` / `IN` evaluate
     `current_tenant_id()` when the inner scan yields no rows? Measure it, in this order, and report
     which variant was actually available:
     - (a) **Real-table variant.** Using the privileged connection, look for a state that already
       exists read-only — an outer row whose correlated inner set is empty, or an inner table that is
       empty. If found, probe it as `app_user`.
     - (b) **Expression-isolation variant.** Reproduce the shape against a relation with no
       `current_tenant_id()` policy of its own, so the planner answers the same question without a
       second policy raising first — e.g. an `EXISTS` over a subquery whose relation is provably
       empty, with `current_tenant_id()` in its `WHERE`. This measures the PLANNER's behaviour for
       the shape, not the policy in situ. **Say so in the audit rather than blurring the two.**
     - (c) If neither can be constructed **without writing a row**, say so plainly and mark finding F
       **PARTIALLY MEASURED**, quoting what was measured. **Do not create an orphan row to make the
       probe possible** — hard limit 4 is absolute. A partially-measured finding honestly labelled is
       worth more than a complete one obtained by a write.
   - `EXPLAIN (VERBOSE)` for each subquery probe in the REAL lane, into `evidence/04-explain.md`,
     showing where the function landed in the plan. Corroborating, cheap, read-only — the quick-602
     precedent.

3. **A representative sample of the ~91 bare-equality policies.** At least six tables, chosen to be
   non-vacuous and to cover every column spelling, since a policy is per-table and the column name
   differs: `Tenant.tenant_self_read` (`id = current_tenant_id()`) **mandatory**, plus at least one
   `org_id`, one `tenant_id` and one `"tenantId"`. Report each table's row count beside its verdict.

4. **The top-level permissive OR — finding C, the headline.** On a table carrying
   `bypass_rls_policy`, two cells:
   - `app.bypass_rls = 'on'` (session-local `SET`) with the tenant GUC EMPTY — expected NO raise, per
     the tripwire function's own bypass arm. **Measure it; do not cite quick-602.**
   - the same table, same empty tenant GUC, bypass OFF — expected raise.

   The audit must state that PostgreSQL **ORs permissive policies at the top level**, so on these 86
   tables the effective expression is
   `(bypass) OR (<predicate calling current_tenant_id()>)` — **the OR shape, 86 times over, spelled
   as two policies rather than one** — and that this OR does not save the statement when bypass is
   off. Also state that setting `app.bypass_rls` on the probe's own session is a session GUC, **not a
   database write**.

5. **Controls — without these the matrix is satisfied by a connection that raises on everything**
   (quick-546's "the failure mode of a bad slice is GREEN", inverted):
   - `SELECT 1` on the armed `app_user` session — must NOT raise;
   - a table with RLS enabled and NO `current_tenant_id()` policy (pick one from the Part A
     enumeration — the Section 4.12 allowlist tables are candidates) — must NOT raise, and should
     return rows;
   - at least one cell in the matrix that **returns rows**, quoted, so the report is not a wall of
     confirmations.

Every cell's verdict is exactly one of three: **RAISES `<sqlstate>`** / **RETURNS `<scalar>` ROWS** /
**NOT MEASURABLE (`<reason>`)**. No fourth category and no prose verdicts.
  </action>
  <verify>
`evidence/02-matrix.json` and `evidence/03-matrix-verbatim.md` exist and are non-empty; every cell
carries a verdict from the three-value set; at least one cell reads RAISES and at least one reads
RETURNS; the `[db-target]` banner in the transcript names `wyixpgunnjmzguhggocz` and not
`oqdhberkghtnszrkdvfm`; `git status --porcelain` shows ZERO changes under `apps/`, `scripts/`,
`prisma/`, `packages/`; the probe `.cjs` is under the scratchpad path and NOT under the repo.
  </verify>
  <done>
Production and staging enumerations captured with full expressions and per-class counts. The
literal-OR policy, the four subquery policies, a six-table bare-equality sample, both bypass cells
and all three controls are measured on staging as `app_user` with the tripwire armed and read back —
each with verbatim output, each distinguishing RAISES from RETURNS-ZERO, each subquery cell carrying
its outer row count. Finding F is answered MEASURED or PARTIALLY MEASURED with the reason named.
Nothing was written to either database.
  </done>
</task>

<task type="auto">
  <name>Task 2: Trace every raising table to the no-tenant paths that read it — NAME FILES, classify blocker vs latent</name>
  <files>
.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/05-source-search.md
  </files>
  <action>
For **every table whose policy raised in Task 1**, find what reads it on a path with **no tenant
context**. This is the step the brief will be checked on: **it must NAME FILES**, with real paths.

Search these categories, and say for each which method found it:

- **Sysadmin** — `apps/web/src/app/(admin)/**`. For each hit, determine whether it is ALREADY routed
  to `getAdminDb` (quick-600 / 606 / 613) and therefore NOT a blocker, or still on the bare client.
  The authoritative routed list is `ADMIN_ALLOWLIST` in
  `apps/web/tests/security/admin-connection-allowlist.test.ts`. **Read the real numbers off that file
  and report them** — the orchestrator's brief says "24 entries after 613"; the file's own integrity
  assertion at planning time reads `expect(Object.keys(ADMIN_ALLOWLIST).length).toBe(23)` with
  `TOTAL_EXPECTED_CALLS` 48. **Report the actual figure as a correction if it diverges; do not
  silently adopt either number.**
- **Cron** — `apps/web/src/app/api/cron/**`. Several are already routed; name the remainder. Apply
  quick-602's rule: a file-level marker is not a verdict — a route can carry `getAdminDb` for one
  statement and the tenant client for another, and `auto-close-tickets` is the recorded example that
  still raised. Where it matters, say which STATEMENT uses which client, not which file contains what.
- **Public / pre-auth** — `apps/web/src/app/track/[token]/`, `apps/web/src/app/api/track/[token]/`,
  `apps/web/src/app/api/auth/accept-invitation/`, and the sign-in and provisioning paths.
- **Login** — `apps/web/src/lib/auth/supabase.ts`'s `getCurrentUser` sysadmin branch, item **B8** in
  `docs/audits/admin-connection.md` section 9, which records it as still unrouted.

**Reconcile against `docs/audits/admin-connection.md` section 9** — "What still has no route after
this lands" is the existing list of known-unrouted no-tenant paths. Start from it rather than from
scratch, and **report any divergence as a correction** (section 9 already carries one struck-through
entry closed by quick-601; expect more to have moved). Check at minimum: both `generateTicketNumber`
copies (B7), `getCurrentUser`'s sysadmin branch (B8), `api/track/[token]`'s GPS lookup,
`api/cron/automations/route.ts`'s four `candidateQuery()` reads, and the five decorative loop-body
statements in `workflow-digest` and `lib/automations/evaluator.ts`.

**Step 4 — the inverse shape.** A policy whose ONLY branch is `current_tenant_id()`, on a table a
no-tenant path MUST read. Same consequence, different cause. `Tenant` is the most important case —
`tenant_self_read` and `tenant_self_update` are bare equality, and login, provisioning and bootstrap
read that table with no tenant. Enumerate these deliberately: they will never surface from an
OR-shaped search, because they have no second branch to look for.

**Grep discipline (quick-607).** A name appearing in a file is NOT an import and NOT a usage. That
rule has already cost this repo a six-fold overstatement (`_bootstrap-env` named in 27 files,
imported by 4) and a 3-to-0 miscount (`withTenantContext`, all three matches in comments). Filter to
real import/usage lines, exclude comment-only matches, and **state the method used beside every
count**. Say plainly where a count is "files mentioning" versus "files actually calling".

**Classify every finding as exactly one of:**
- **CUTOVER BLOCKER** — a live no-tenant path, still on the tenant connection, on a table whose
  policy raises. Name the file, the statement, and the surface a user would see break.
- **LATENT** — the policy raises, but nothing reads that table without a tenant today. Say what would
  make it live.
- **ROUTED / NOT AFFECTED** — already on `getAdminDb`, with the allowlist entry cited.

Write it all to `evidence/05-source-search.md`, with the raw grep transcripts.
  </action>
  <verify>
`evidence/05-source-search.md` exists, contains real file paths (not category names), every finding
carries one of the three classifications, every count states its method, and the `ADMIN_ALLOWLIST`
entry-count and call-count are quoted off the file with any divergence from the brief flagged as a
correction. `git status --porcelain` still shows zero changes under `apps/`.
  </verify>
  <done>
Every raising table is traced to named files across sysadmin, cron, public and login paths; each is
classified BLOCKER / LATENT / ROUTED; the inverse-shape (step 4) tables including `Tenant` are
enumerated separately; the section 9 reconciliation is done with divergences reported as corrections;
the grep method is stated beside every count.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write docs/audits/policy-or-shortcircuit.md, answer the instrument question committally, and commit</name>
  <files>
docs/audits/policy-or-shortcircuit.md
  </files>
  <action>
Write the audit. **These seven sections, in this order.** Follow the house style of
`docs/audits/admin-connection.md`: numbered sections, a one-sentence statement of each finding before
its evidence, and every claim either quoted from a measurement or explicitly labelled as an inference.

**1. The state correction.** Production is no longer "awaiting deploy". Both
`20260915140000_automation_rule_per_command_policy_split` and
`20260915150000_grant_automation_rule_to_app_admin` are applied, carrying the
`applied_steps_count = 1, checksum = 'manual'` signature of `migrate.mjs` having actually executed
them — exactly as quick-612 section 4 predicted. Both databases are at 186 policies / 86
`bypass_rls_policy`. **quick-612 section 9 item 1 and quick-613 section 12 items 1 and 7 are now
stale, and this audit supersedes them.** Quote the ledger rows.

**2. The counts, stated unambiguously.** A table with one row per shape:

| shape | policies | of which measured to RAISE |
|---|---|---|
| literal `OR` | | |
| **effective OR** (permissive-policy ORing with `bypass_rls_policy`) | | |
| `CASE` | | |
| `COALESCE` | | |
| subquery (`EXISTS` / `IN`) | | |
| bare equality | | |

**Lead with the effective-OR number, not the literal one.** The brief expected a literal-OR
population, and it is ONE — the already-known, already-routed `AutomationRule` SELECT policy. The
real answer to "every policy whose OR branch cannot save it from the tripwire" is the 86 tables
carrying a separate permissive `bypass_rls_policy`, because PostgreSQL ORs permissive policies at the
top level. **Say that in the first paragraph of the audit, not in section 4.**

**3. The per-policy measurement table.** Every cell from Task 1, **quoting the raw error text**, with
RAISES vs RETURNS-ROWS distinguished per row, the lane (EMPTY / REAL / bypass-on) named, and the
outer row count beside every subquery cell. Include the controls and say what they rule out. State
that SQLSTATE was walked off the cause chain and recognised by code, never by prose.

**4. Finding F — the subquery short-circuit answer.** State the verdict first, then the evidence,
then what it means: if the four subquery policies short-circuit on an empty inner scan they return
**zero rows silently** instead of raising, which is the *under-read* failure mode — strictly worse to
diagnose than a raise, and **invisible to the tripwire**. If they raise, they join the blocker list.
If the measurement is partial, label it PARTIALLY MEASURED and say exactly which half is missing and
why it could not be obtained read-only. Include finding D: three of the four subquery tables carry no
`bypass_rls_policy` at all, so they have no escape hatch of any kind.

**5. Steps 3 and 4 — the files.** Reproduce Task 2's classification. **CUTOVER BLOCKERS in their own
list, at the top**, each with file, statement and the surface that breaks. Then the latent set. Then
the inverse-shape tables (`Tenant` first). Then the section 9 reconciliation, with divergences called
out as corrections.

**6. Is the tripwire the right instrument? ANSWER IT. Do not hedge.** The brief's own check is that
this section answers directly. Evaluate at minimum these four, each with its cost:

- (a) **Leave as-is.** The tripwire raises on correct sysadmin paths as well as on unmigrated ones.
  Cost: every no-tenant surface must be routed before the cutover, and the tripwire cannot tell
  "unmigrated" from "legitimately tenant-independent".
- (b) **Make `current_tenant_id()` return NULL inside policy expressions and raise only in application
  code.** **Argue this; do not assume it is the improvement it looks like.** Every tenant predicate
  becomes `x = NULL` -> NULL -> row filtered, so **every raise becomes a SILENT ZERO-ROW UNDER-READ
  — the exact failure mode the tripwire was built to end** (quick-599's D3 rule: an RLS-refused read
  is a silent zero, not an error; `admin-connection.md` section 9's B7 is the worked example,
  `generateTicketNumber` issuing `TKT-0001` forever). It also cannot be done "inside policies only"
  without a second function, because the same function is called from both.
- (c) **A `SECURITY DEFINER` no-tenant escape** for genuinely tenant-independent branches — the
  quick-601 precedent, where narrow definer functions returning one scalar replaced a bypass on the
  highest-traffic unauthenticated surface. Cost: one function per branch, each a reviewable privilege
  grant.
- (d) **Route no-tenant paths to `getAdminDb`** — the existing, already-working answer for the files
  on the allowlist today. Cost: allowlist growth, and B8-shaped restructuring work for the paths that
  cannot simply swap a client.

**State which one, why, and what it costs.** A recommendation with a named cost, not a menu.

**7. What remains before the cutover**, reconciled with quick-613 section 12's table — same columns,
updated status per row, this task's new rows appended, and items 1 and 7 struck through per section 1.

Then commit:

```
node C:/Users/sammy/.claude/get-shit-done/bin/gsd-tools.js commit "docs(614): enumerate the policies whose OR branch cannot save them from the tripwire" --files docs/audits/policy-or-shortcircuit.md .planning/quick/614-enumerate-policies-whose-or-branch-canno
```

**Do not push.**
  </action>
  <verify>
`docs/audits/policy-or-shortcircuit.md` exists with all seven sections present, in order; section 2's
table has a number in every cell; section 3 quotes raw error text; section 6 names exactly one
recommendation; `git status --porcelain` shows changes ONLY to `docs/audits/policy-or-shortcircuit.md`
and `.planning/`; `git log -1` shows the commit; the branch is ahead of `origin/master`, confirming
nothing was pushed.
  </verify>
  <done>
The audit is on disk with the counts, the measured per-policy table, the finding-F verdict, the named
blockers and the instrument question answered with a single recommendation and its cost. Committed,
not pushed. No file outside the audit and the GSD artefacts changed.
  </done>
</task>

</tasks>

<verification>
- `git status --porcelain` lists nothing under `apps/`, `scripts/`, `prisma/`, `packages/`.
- The probe script exists under the scratchpad path and nowhere in the repo —
  `git status --porcelain | grep -c "614-policy-probe"` is 0.
- No package was installed: `git diff --stat package-lock.json package.json` is empty.
- The tripwire is still armed and unchanged: `TENANT_CONTEXT_TRIPWIRE` in `apps/web/.env.staging`
  still reads `on`, and the file is unmodified.
- Every measurement claim in the audit traces to a file under
  `.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/`.
- Nothing was pushed.
</verification>

<success_criteria>
1. A count of policies in the OR shape — stated BOTH ways, literal (1) and effective (86 tables via
   permissive-policy ORing) — with the effective number leading.
2. A count that actually raise, measured, per shape class.
3. Cutover blockers named, with files.
4. Step 2 measured per policy and **QUOTED**, never reasoned.
5. Step 3 **NAMES FILES**.
6. Step 5 answers the instrument question **directly**, with one recommendation and its cost.
7. Zero code changes, zero database writes, zero installs, zero pushes.
</success_criteria>

<output>
After completion, create
`.planning/quick/614-enumerate-policies-whose-or-branch-canno/614-SUMMARY.md`.

Its self-check must assert, individually: no file outside `docs/audits/policy-or-shortcircuit.md` and
the GSD artefacts was created or modified; no write reached either database; the tripwire was not
disarmed; no package was installed; nothing was pushed; and the probe script lives in the scratchpad.
</output>
