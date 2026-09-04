---
phase: quick-589
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/app-user-harness-targets.ts
  - apps/web/scripts/audit/app-user-connection-harness.ts
  - apps/web/package.json
  - apps/web/.env.example
  - docs/diagnostics/app-user-connection-harness.md
autonomous: true

must_haves:
  truths:
    - "Running `npm run audit:app-user-harness` with no DATABASE_URL_APP_USER exits non-zero and names exactly what value is needed and which file it goes in — it never prints results."
    - "With a credential present, the harness connects as app_user, sets app.current_tenant_id with session scope (false) exactly as getTenantPrisma does, and prints which host/port it actually connected through."
    - "Every table's behaviour is DISCOVERED at runtime from pg_class/pg_policy/has_table_privilege; quick-582's findings appear only as a clearly-labelled 'predicted' comparison column."
    - "Steps 3-5 emit a report of actual observed behaviour (rows / zero rows / error text) and never assert pass/fail; only step 6 (cross-tenant leak) is pass/fail."
    - "No INSERT or UPDATE can ever commit: all DML runs through one helper that opens BEGIN, verifies it is genuinely inside a transaction block, and ROLLBACKs in a finally."
    - "A permission error is printed in full and carried into the report — never swallowed into a null, an empty array, or a caught-and-ignored branch."
  artifacts:
    - path: "apps/web/scripts/audit/app-user-harness-targets.ts"
      provides: "Predicted-behaviour tables from quick-582 (comparison data only) + resolved physical table names for the six quick-588 transaction roots"
    - path: "apps/web/scripts/audit/app-user-connection-harness.ts"
      provides: "The harness: credential gate, GUC mirror, runtime discovery, six probe suites, reconciliation report"
      min_lines: 300
    - path: "apps/web/package.json"
      provides: "audit:app-user-harness entry point"
      contains: "audit:app-user-harness"
    - path: "apps/web/.env.example"
      provides: "DATABASE_URL_APP_USER documented with the pooler username-format gotcha"
      contains: "DATABASE_URL_APP_USER"
  key_links:
    - from: "apps/web/scripts/audit/app-user-connection-harness.ts"
      to: "apps/web/scripts/_bootstrap-env.ts"
      via: "import as the first statement"
      pattern: "import '\\.\\./_bootstrap-env'"
    - from: "apps/web/scripts/audit/app-user-connection-harness.ts"
      to: "app.current_tenant_id GUC"
      via: "set_config with session scope false, mirroring tenant-context.ts"
      pattern: "set_config\\('app\\.current_tenant_id'"
---

<objective>
Build a read-only diagnostic harness that connects to the database as the `app_user`
role and MEASURES what that role can actually see and do — turning quick-582's and
quick-588's cutover predictions into observations.

Purpose: the app connects as `postgres.<ref>` with BYPASSRLS, so every grant gap and
every missing policy is invisible today. quick-588 reports zero fail-closed access
paths, but nothing has ever exercised those paths as `app_user`. This harness is the
instrument that will settle it on cutover day.

Output: `apps/web/scripts/audit/app-user-connection-harness.ts` + its targets module +
an `audit:app-user-harness` npm entry point + a documented `.env.example` slot. The
harness is delivered READY TO RUN; it is expected to exit "not configured" today.

This task performs NO cutover. It does not change `DATABASE_URL`, `getTenantPrisma`,
`tenant-rls.ts`, `EXEMPT_MODELS`, any RLS policy, any grant, any migration,
`prisma/schema.prisma`, or any application source file.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Read before writing code:
@apps/web/scripts/audit/verify-app-user-role.ts
@apps/web/scripts/audit/app-user-grant-audit.ts
@apps/web/scripts/_bootstrap-env.ts
@apps/web/src/lib/context/tenant-context.ts
@docs/diagnostics/app-user-grant-coverage.md
</context>

<facts_verified_during_planning>
These were checked against the tree and the live catalogue during planning. Two
correct a mistake in the brief. Re-verify anything you depend on, but do not
re-derive from scratch.

1. **CREDENTIAL: none exists.** `DATABASE_URL_APP_USER` is in zero env files. Every
   `DATABASE_URL`/`DIRECT_URL` in the project authenticates as
   `postgres.oqdhberkghtnszrkdvfm`, which has `rolbypassrls = true`. The `app_user`
   ROLE exists and is correctly postured (`rolcanlogin=true`, `rolbypassrls=false`,
   `rolsuper=false`, no memberships) — only the password is missing.
   **Do not create a credential.** The expected outcome of this task is a harness
   that exits "not configured".

2. **PATH CORRECTION — the brief's file list is wrong for two of the six roots.**
   `apps/web/src/lib/carrier/driver-routes.ts` and
   `apps/web/src/lib/carrier/driver-load.ts` DO NOT EXIST. The real paths are:
   - `apps/web/src/app/(driver)/actions/driver-routes.ts` (`getMyActiveDispatch`,
     `getMyDispatchHistory`)
   - `apps/web/src/app/(driver)/actions/driver-load.ts` (`getMyLoads`)
   The other four paths in the brief were confirmed present:
   `src/app/api/mobile/carrier/driver/dispatches/route.ts`,
   `src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts`,
   `src/app/(owner)/carrier/stops/[id]/page.tsx`.

3. **GUC mechanism to mirror EXACTLY** (`src/lib/context/tenant-context.ts`, verified
   verbatim in both `getTenantPrisma` and `getTenantPrismaForOrg`):
   `SELECT set_config('app.current_tenant_id', $1, false)` — **session scope
   (`false`)**, fired as a single autocommit statement on the bare client, NOT inside
   a `$transaction`. The `TRUE` (transaction-scope) variant in `tenantRawQuery` is for
   raw queries only and is NOT what the app's model queries use. Mirror the `false`
   variant or the harness tests something the app does not do.

4. **`apps/web/package.json` already has `pg ^8.18.0`, `@types/pg ^8.16.0`,
   `tsx ^4.21.0`, `dotenv ^17.3.1`.** Nothing needs installing. Existing script
   naming to follow: `audit:raw-prisma`, `audit:rls-policy-drift`.

5. **`_bootstrap-env.ts` repoints `DATABASE_URL` to `DIRECT_URL` (6543 to 5432)** because
   6543 is not reachable from a developer machine. It deliberately does NOT touch
   `DATABASE_URL_APP_USER`. Consequence the harness must PRINT: a local run will
   likely reach 5432 direct, while the app runs on the 6543 Session Pooler — and the
   session-scope GUC deviation exists *because of* the pooler. That is a fidelity
   caveat, not a footnote.

6. **Pooler username format:** Supavisor requires `<role>.<project_ref>`, i.e.
   `app_user.oqdhberkghtnszrkdvfm`, NOT bare `app_user`. quick-410's suggested string
   omitted the project ref and would fail authentication. A DIRECT connection
   (port 5432, `db.<ref>.supabase.co`) uses bare `app_user`. Both forms go in the
   `.env.example` comment.

7. **Session Pooler does NOT run `DISCARD ALL` between client sessions**
   (documented in `verify-app-user-role.ts`'s header), so a fresh `new Client()` can
   INHERIT a stale GUC. The "no GUC set" probe must therefore explicitly
   `set_config('app.current_tenant_id', '', false)` rather than assume a clean
   connection — and must say so in a comment.

8. **quick-582's classes (predictions ONLY — never assertions):**
   - class (a), zero grants, 9 tables: `_prisma_migrations`, `"NotificationEmailConfig"`,
     `"NotificationTemplate"`, `"Plan"`, `"Promo"`, `carrier_catalog_meta`,
     `grid_preference`, `grid_view`, `route_matrix_cache`
   - class (b), FORCE RLS + zero policies + full CRUD grants, 3 tables:
     `stops`, `route_template_stops`, `carrier_documents`
   - class (c): `_prisma_migrations` (also in (a)). 12 distinct tables.
   - CONTROL: `facilities` — same carrier family, correctly has 2 policies.
   Mixed quoting is real (PascalCase Prisma models vs snake_case carrier models).
   **Resolve identifiers by `pg_class.oid`, never by casting a string to `regclass`.**
</facts_verified_during_planning>

<tasks>

<task type="auto">
  <name>Task 1: Targets module + harness core (credential gate, GUC mirror, runtime discovery, rollback-safe write helper)</name>
  <files>
apps/web/scripts/audit/app-user-harness-targets.ts
apps/web/scripts/audit/app-user-connection-harness.ts
  </files>
  <action>
**First, re-verify the six transaction roots.** Confirm the two corrected paths in
fact 2 exist and still contain `getMyActiveDispatch` / `getMyDispatchHistory` /
`getMyLoads`, and confirm the other four. Then resolve the PHYSICAL table names for
the models those roots touch — `CarrierDriver`, `Trip`, `CarrierLoad`, `CarrierStop`,
`CarrierDocument`, `CarrierExpense` — by reading the `@@map` directives in
`apps/web/prisma/schema.prisma`. Do NOT guess a snake_case name from a model name;
read the map. Record what you find in the targets module with a comment naming the
schema line each came from.

**Create `app-user-harness-targets.ts`** — pure data, no I/O, no queries:
  - `PREDICTED_CLASS_A: readonly string[]` — the 9 zero-grant tables from fact 8.
  - `PREDICTED_CLASS_B: readonly string[]` — the 3 FORCE-RLS-zero-policy tables.
  - `PREDICTED_CLASS_C: readonly string[]` — `_prisma_migrations`.
  - `CONTROL_TABLE = 'facilities'`.
  - `TRANSACTION_ROOTS` — one entry per quick-588 root (A-F) with `{ id, file, fn,
    tables: string[] }` using the resolved physical names.
  - A file-header comment stating, in these words or clearer: **"Every list in this
    file is quick-582's PREDICTION, carried here as a comparison column only. The
    harness discovers live state at runtime and reports divergence. Nothing here is an
    expected value and nothing here is asserted."**

**Create `app-user-connection-harness.ts`.** First statement must be
`import '../_bootstrap-env';` (before any other import — see that file's header on
source-order execution). Then `import { Client } from 'pg';`.

Header comment must state the four ground rules: (1) READ-ONLY against production;
(2) DML runs only inside BEGIN/ROLLBACK and **nothing in this file ever commits**;
(3) permission errors are reported in full, never swallowed; (4) this is a REPORT for
steps 3-5, and a pass/fail only for step 6.

Core pieces, in this file:

  a. **Credential gate.** Read `process.env.DATABASE_URL_APP_USER`. If absent, print a
     multi-line message naming EXACTLY the variable, the file it goes in
     (`apps/web/.env.local`), both connection-string shapes from fact 6, and the fact
     that the role already exists so only a password is needed. Then
     `process.exit(1)`. **Print no results and write no report file.**
     Also require `DATABASE_URL` (the privileged connection) for the discovery and
     tenant-id lookup side; exit 1 with its own message if missing.

  b. **Two connections, both `new Client()`, never a `Pool`** — mirroring
     `verify-app-user-role.ts`'s reasoning (a pool lets a session GUC bleed). One
     `appClient` on `DATABASE_URL_APP_USER`, one `adminClient` on `DATABASE_URL`.

  c. **Connection fidelity report.** From `appClient`, print `current_user`,
     `inet_server_addr()`, `inet_server_port()`, and the host/port parsed out of the
     URL. If the port is not 6543, print the fidelity caveat from fact 5 verbatim in
     substance: the app runs on the Session Pooler and the session-scope GUC deviation
     exists because of it, so a 5432 run does not reproduce pooler connection reuse.
     Also assert-and-print `rolbypassrls` for `current_user` — if it is `true` the
     harness is not testing what it claims, so print a loud banner and `process.exit(1)`.

  d. **`setTenantGuc(client, tenantId: string | null)`** — issues, verbatim shape,
     `SELECT set_config('app.current_tenant_id', $1, false)` with `''` when
     `tenantId` is null. Comment must state: session scope `false` mirrors
     `getTenantPrisma`; the explicit empty-string clear exists because the Session
     Pooler does not run `DISCARD ALL` between client sessions (fact 7), so a fresh
     connection may inherit a stale GUC.

  e. **Runtime discovery** (on `adminClient`, which can see the catalogue): for every
     table in the union of the predicted lists plus the control plus every table named
     by `TRANSACTION_ROOTS`, resolve by `pg_class.oid` (fact 8) and collect
     `relrowsecurity`, `relforcerowsecurity`, policy count from `pg_policy`, and
     `has_table_privilege('app_user', c.oid, 'SELECT'|'INSERT'|'UPDATE'|'DELETE')`.
     Reuse `app-user-grant-audit.ts`'s method; do NOT use
     `information_schema.role_table_grants`.
     Also discover, per table, its tenant column by looking in
     `information_schema.columns` for the first of `tenantId`, `tenant_id`, `orgId`,
     `org_id` that exists. Tables with none are recorded as
     `NOT_ISOLATION_TESTABLE` and reported as such — never silently skipped.

  f. **`probeRead(client, table, label)`** — runs a `SELECT count(*)` (and where useful
     a `SELECT ... LIMIT 1`) against the oid-resolved, properly quoted identifier and
     returns a discriminated result:
     `{ kind: 'rows', count } | { kind: 'empty' } | { kind: 'error', code, message }`.
     Catch is used ONLY to CLASSIFY and RECORD the error — the code and full message
     go into the report and into stdout. Never return null, never `catch {}`,
     never fall back to a default.

  g. **`withRollback(client, fn)`** — the ONLY place in this file that issues DML.
     - Comment, stated explicitly: **"Nothing here commits. There is no COMMIT
       statement anywhere in this file. Every write is discarded."**
     - Issues `BEGIN`, then a no-op `SELECT 1`, then the in-transaction guard:
       `SELECT now() < statement_timestamp() AS in_tx`. In autocommit those two are
       equal; inside a multi-statement transaction block `now()`
       (transaction_timestamp) is pinned while `statement_timestamp()` advances. If
       `in_tx` is not true, **do not run the write** — `ROLLBACK`, record the probe as
       `{ kind: 'skipped', reason: 'could not confirm transaction block' }`, and print
       it. This is the guard the brief requires against a write reaching autocommit.
     - Runs `fn` inside a try; `ROLLBACK` in a `finally` so it happens on both the
       success and the error path.
     - Grep the finished file for `COMMIT` and confirm zero occurrences before
       moving on.

Use the resolved-oid identifier everywhere. Build quoted identifiers from
`quote_ident`/`format('%I')` server-side or from `pg_class.relname` via a parameterised
`format`, so PascalCase tables like `"NotificationTemplate"` work alongside snake_case
ones without a hand-written quoting rule.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` is clean (full probe procedure is Task 3).
`grep -c COMMIT apps/web/scripts/audit/app-user-connection-harness.ts` returns 0.
`cd apps/web && npm run audit:app-user-harness` (after Task 2 adds the script) exits 1
with the "not configured" message and prints no probe results.
  </verify>
  <done>
Both files exist. The targets module contains only clearly-labelled predictions and the
schema-resolved physical table names. The harness has a credential gate that exits 1,
two independent Clients, a GUC setter mirroring `false` session scope, oid-based runtime
discovery of RLS/policies/grants, a classifying read probe that never swallows an error,
and a `withRollback` helper containing no COMMIT and refusing to write when it cannot
confirm it is inside a transaction block.
  </done>
</task>

<task type="auto">
  <name>Task 2: The six probe suites, the reconciliation report, and the entry point</name>
  <files>
apps/web/scripts/audit/app-user-connection-harness.ts
apps/web/package.json
apps/web/.env.example
  </files>
  <action>
Add the probe suites to the harness, in this order, each printing a titled section.

**Suite 2 — tenant fixtures.** From `adminClient`, select two distinct tenant ids
(`SELECT id FROM "Tenant" ... LIMIT 2`; confirm the real column names against
`schema.prisma` first). Prefer two tenants that both have rows in `stops` if that is
cheap to determine; otherwise take any two and say so. If fewer than two tenants exist,
record every cross-tenant probe as `{ kind: 'skipped', reason: 'fewer than two tenants' }`
and continue — do not fabricate a second id.

**Suite 3 — class (b) targets + control.** For each of `stops`, `route_template_stops`,
`carrier_documents` and the control `facilities`, run five probes and record the ACTUAL
result of each. NO pass/fail:
  1. read with GUC = tenant A
  2. read with GUC = tenant B
  3. read with GUC explicitly cleared (`''`) — see fact 7 on why the clear is explicit
  4. an INSERT, inside `withRollback`
  5. an UPDATE, inside `withRollback`
For (4) and (5), build the minimal legal row/predicate. **NOT-NULL and CHECK constraints
on the carrier tables are real and non-obvious** (see CLAUDE.md on `stops.stop_type`,
`stops."bolRequired"`, and DEC-14): read `pg_constraint` and
`information_schema.columns` from `adminClient` to construct them. If a legal row cannot
be constructed without guessing, **do not run the write** — record
`{ kind: 'skipped', reason: '...' }` and report it in the "could not be tested" list, as
the brief requires. An UPDATE that matches zero rows is a perfectly good probe: what is
being measured is whether the statement is permitted, not whether it changed anything.

**Suite 4 — all 12 defect-class tables.** For each table in classes (a), (b) and (c),
read with GUC = tenant A and record exactly one of: permission error (with SQLSTATE and
message), zero rows, or a row count. Print alongside it the runtime-discovered
grant/RLS/policy facts from Task 1(e).

**Suite 5 — the six quick-588 transaction roots.** For each root in `TRANSACTION_ROOTS`,
with GUC = tenant A, issue the equivalent read as SQL over that root's tables: a count on
the top-level table, then a count on each nested table joined through its real foreign
key (resolve the FK columns from `pg_constraint` / `information_schema`, do not guess).
Report per-table counts. State in the section header what is being measured: these are
the paths quick-588 PREDICTED not to fail closed, and every model they touch is in
`EXEMPT_MODELS`, so the tenant-RLS extension injects nothing and isolation rests entirely
on DB policies plus the GUC. A nested `stops` / `carrier_documents` count of zero beside a
non-zero parent count is the class-(b) prediction coming true, and it must be reported as
an observation, not asserted.

**Suite 6 — cross-tenant isolation. THIS ONE IS PASS/FAIL.** For every table discovered
to HAVE at least one policy AND a resolvable tenant column, set GUC = tenant A and run:
  - `leaked` = count of visible rows whose tenant column `IS DISTINCT FROM` tenant A
  - `own` = count of visible rows whose tenant column = tenant A (a sanity reading, so a
    zero-leak result on an empty table is not mistaken for isolation working)
Any `leaked > 0` is a **LIVE SECURITY FINDING**, not a cutover-readiness finding. Print it
with a loud banner naming the table and the count, and make it the sole determinant of a
non-zero exit code on an otherwise successful run. Counting against "not tenant A" rather
than "equals tenant B" is deliberate: it catches a leak from any tenant, not only the one
fixture.

**Suite 7 — reconciliation report.** Emit a markdown table with one row per table and
these columns: table · predicted class (quick-582) · predicted behaviour · **observed**
behaviour · grants (S/I/U/D) · rowsecurity · force · policy count · **DIVERGENCE**.
The divergence column is computed by comparing observed against the predicted lists — and
every divergence must be named in a following "Divergences from quick-582" list with a
sentence each. Also emit: a "Could not be tested" list (every `skipped` probe with its
reason), and the connection-fidelity caveat from Task 1(c).
Print the whole report to stdout AND write it to
`docs/diagnostics/app-user-connection-harness.md` with a run timestamp, the connected
host/port, and the two tenant ids used. **Write that file ONLY on a real run** — the
credential gate exits before any of this, so a not-configured run must leave no artifact.

**Entry point.** Add to `apps/web/package.json` scripts, next to the existing `audit:*`
entries:
`"audit:app-user-harness": "tsx scripts/audit/app-user-connection-harness.ts"`
No `--env-file` flag: the harness imports `_bootstrap-env`, which loads all three env
files itself.

**`.env.example`.** Add a commented `DATABASE_URL_APP_USER` block below the existing
`DIRECT_URL` line. It must carry a placeholder ONLY — never a real credential — and must
document: what the variable is for (local/test diagnostics only; it is NOT read by the
app and must NOT be set in Vercel), the pooler form
`postgresql://app_user.[ref]:[pass]@aws-1-[region].pooler.supabase.com:6543/postgres`,
the direct form `postgresql://app_user:[pass]@db.[ref].supabase.co:5432/postgres`, the
fact that the pooler REQUIRES the `.[ref]` suffix and a bare `app_user` fails
authentication there, and the fact that the role already exists so only a password needs
issuing.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` clean (full probe procedure in Task 3).
`grep -c COMMIT scripts/audit/app-user-connection-harness.ts` still 0.
`cd apps/web && npm run audit:app-user-harness` exits 1 with the "not configured"
message, prints no probe output, and leaves
`docs/diagnostics/app-user-connection-harness.md` non-existent.
`grep -n DATABASE_URL_APP_USER apps/web/.env.example` shows a placeholder, not a secret.
  </verify>
  <done>
All six suites plus the reconciliation report are implemented; suite 6 is the only
pass/fail and the only thing that can set a non-zero exit on a completed run; the npm
entry point runs; the `.env.example` block documents both connection-string forms and the
pooler `.[ref]` requirement; no credential value appears anywhere in the repo.
  </done>
</task>

<task type="auto">
  <name>Task 3: Probe-verified tsc gate, run-or-report, and the outcome write-up</name>
  <files>
apps/web/scripts/audit/app-user-connection-harness.ts
  </files>
  <action>
**1. Probe-verify the type gate (CLAUDE.md — a parse error anywhere blinds tsc).**
  - `rm -f apps/web/tsconfig.tsbuildinfo apps/web/.next/dev/types/validator.ts` if present.
  - Insert `const __probe: number = 'y';` into
    `apps/web/scripts/audit/app-user-connection-harness.ts` — the file you actually edited.
  - `cd apps/web && npx tsc --noEmit`. **Confirm the output names THAT line.** If the only
    errors are syntax errors, or are all in files you did not touch, the gate is blind:
    clear the artifacts above and re-run before believing anything.
  - Delete the probe. Re-run `npx tsc --noEmit` and confirm clean.
  - Also confirm no stray `__probe.ts` from an earlier run is sitting in
    `apps/web/scripts/` or `apps/web/src/lib/document-import/`.

**2. Run the harness IF AND ONLY IF a credential is present.**
  - `grep -l DATABASE_URL_APP_USER apps/web/.env.local .env .env.local 2>/dev/null`
    (key-only — do NOT print any env file's values).
  - If a value IS present: run `npm run audit:app-user-harness`, capture the full output,
    and report the reconciliation table, every divergence from quick-582, everything that
    could not be tested, and — separately and prominently — the suite-6 result.
  - If NO value is present (the expected outcome per fact 1): run it anyway to prove the
    gate, capture the "not configured" message, and **report exactly that.** Do NOT
    fabricate results, do not describe what the harness "would" find as if observed, and
    do not create a credential.

**3. Write the SUMMARY.** It must state, unambiguously and near the top, whether the
harness was RUN against a real `app_user` connection or only gate-tested. If only
gate-tested, the summary must say that quick-582's and quick-588's findings remain
PREDICTIONS and name the single blocking input: an `app_user` password, placed in
`apps/web/.env.local` as `DATABASE_URL_APP_USER`, in one of the two documented forms.
Also record the two corrected file paths from fact 2 so the next task does not re-inherit
the brief's wrong ones.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` reports 0 errors AND the probe run demonstrably reported
the injected error first (paste both outputs into the summary).
The harness's exit code and message are captured verbatim.
`git status` shows only the five files in `files_modified` (and the report artifact only
if a real run happened).
  </verify>
  <done>
tsc is proven-not-blind and clean; the harness has been executed; its actual outcome —
results or "not configured" — is reported without embellishment; the summary distinguishes
measurement from prediction.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` → 0 errors, with a probe run proving the gate is live.
- `grep -c COMMIT apps/web/scripts/audit/app-user-connection-harness.ts` → 0.
- `npm run audit:app-user-harness` behaves correctly for the credential state that exists.
- `git diff --stat` touches ONLY: the two new scripts, `apps/web/package.json`,
  `apps/web/.env.example`. No application source, no migration, no `schema.prisma`, no
  policy or grant SQL, no `.env*` file carrying a real value.
- No secret is committed: `git diff` contains no password.
</verification>

<success_criteria>
- The harness exists, typechecks, and runs.
- With no credential it exits non-zero naming exactly what is needed and where — and
  produces no report artifact and no fabricated findings.
- With a credential it connects as `app_user`, refuses to proceed if that role turns out
  to have BYPASSRLS, mirrors the app's session-scope GUC exactly, discovers live
  grant/RLS/policy state rather than trusting quick-582, reports observed behaviour for
  all 12 defect-class tables, the 3 class-(b) targets against the `facilities` control,
  and the six quick-588 transaction roots, and treats only cross-tenant leakage as
  pass/fail.
- Nothing commits. Every write is inside `BEGIN`/`ROLLBACK` behind a guard that refuses
  to run when it cannot confirm a transaction block, and anything that could not be made
  rollback-safe is reported as untested rather than run.
- No permission error is swallowed anywhere.
</success_criteria>

<output>
After completion, create
`.planning/quick/589-build-the-app-user-connection-test-harne/589-SUMMARY.md`
</output>
