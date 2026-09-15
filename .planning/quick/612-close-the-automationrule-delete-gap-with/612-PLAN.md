---
phase: quick-612
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/prisma/migrations/20260915140000_automation_rule_command_split/migration.sql
  - apps/web/scripts/audit/612-policy-verify.ts
  - apps/web/scripts/audit/rls-policy-canonical.json
  - docs/audits/tenant-audit-automation-policy-closure.md
  - .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/*

must_haves:
  truths:
    - "A tenant-scoped `app_user` connection cannot DELETE a SYSTEM AutomationRule row, and a counter-read inside the same transaction proves all 6 rows are still present."
    - "A tenant-scoped `app_user` connection cannot CAPTURE the 6 SYSTEM rows via `UPDATE ... SET \"tenantId\" = <own> WHERE scope='SYSTEM'`."
    - "A tenant-scoped connection still SELECTs the 6 SYSTEM rows plus its own rules — read visibility is byte-identical to before."
    - "A tenant-scoped connection can still INSERT, UPDATE and DELETE its OWN (scope=TENANT, tenantId=own) rules."
    - "`bypass_rls_policy` is untouched: 86 rows before, 86 after, identical sorted table LIST."
    - "The body-level drift detector reports CLEAN against a database it names in its own banner."
    - "The vitest failing-FILE set is unchanged and `npm run build` exits 0."
  artifacts:
    - path: "apps/web/prisma/migrations/20260915140000_automation_rule_command_split/migration.sql"
      provides: "Four per-command policies replacing the single FOR ALL; all DDL at column zero, no DO block"
      contains: "CREATE POLICY tenant_isolation_policy ON \"AutomationRule\""
    - path: "apps/web/scripts/audit/612-policy-verify.ts"
      provides: "before/after/diff verification matrix as app_user against staging"
      contains: "ROLLBACK"
    - path: "apps/web/scripts/audit/rls-policy-canonical.json"
      provides: "regenerated body-layer expectation covering the four new bodies"
    - path: ".planning/quick/612-close-the-automationrule-delete-gap-with/evidence/"
      provides: "design statement, before/after/diff matrices, policy counts, bypass list, drift run, ledger read-back, gates"
    - path: "docs/audits/tenant-audit-automation-policy-closure.md"
      provides: "closure verdict for AutomationRule — FULLY CLOSED or PARTIAL with what remains"
  key_links:
    - from: "migration.sql"
      to: "live pg_policy on staging"
      via: "node scripts/migrate.mjs with BOTH DIRECT_URL and DATABASE_URL pinned to staging"
      pattern: "migrate\\.mjs"
    - from: "migration.sql policy bodies"
      to: "scripts/audit/rls-policy-canonical.json"
      via: "npm run audit:rls-canonicalise — a body change makes the artefact stale (exit 3)"
      pattern: "audit:rls-canonicalise"
    - from: "tests-db/rls-isolation/coverage.test.ts"
      to: "the SELECT half of the split"
      via: "polname = 'tenant_isolation_policy' name-keyed enumeration"
      pattern: "tenant_isolation_policy"
---

<objective>
Close the two live holes on `"AutomationRule"` with a per-command policy split: the documented
**DELETE** gap (quick-599 D2 — `WITH CHECK` never applies to DELETE, so a tenant-scoped connection
can still delete all 6 platform rules) and the **CAPTURE** hole this task's orchestrator measured and
no prior audit records (`UPDATE "AutomationRule" SET "tenantId" = <own> WHERE scope='SYSTEM'` returns
6 rows, because `USING` admits the row via its SYSTEM branch and `WITH CHECK` only inspects the NEW
row, which now carries a passing tenant id).

Purpose: `AutomationRule` is cutover blocker 4 of the policy satisfiability sweep and the last
policy-shaped item on the `app_user` cutover list besides the `app_admin` production LOGIN and the
bypass-policy drop. The capture is arguably worse than the delete — the rules keep working, now
owned by one tenant, and nothing looks broken.

Output: one migration, one staging verification script, a before/after/diff evidence matrix proving
all four commands in both directions, a regenerated canonical artefact, and a closure verdict.

**Never write to production.** The deliverable is a migration a human applies later. Every staging
write probe runs inside `BEGIN … ROLLBACK`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Read before writing anything — these are the binding precedents, not background:

@apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql
@apps/web/scripts/audit/599-policy-verify.ts
@docs/audits/tenant-audit-automation-policy-closure.md
@apps/web/scripts/audit/rls-policy-drift.ts
@apps/web/scripts/audit/598-canonicalise-policies.ts
@apps/web/scripts/_db-target.ts
@apps/web/scripts/migrate.mjs
@apps/web/src/app/(admin)/actions/automations.ts
@apps/web/src/app/api/cron/automations/route.ts
</context>

<established_do_not_re_derive>

These were read live from `pg_policies` on both databases at plan open. **Carry them forward; do not
re-measure them as a first step.**

```
STAGING (wyixpgunnjmzguhggocz)    pg_policy total = 183   bypass_rls_policy = 86
PRODUCTION (oqdhberkghtnszrkdvfm) pg_policy total = 183   bypass_rls_policy = 86
```

Production was read inside `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` +
`BEGIN READ ONLY … ROLLBACK`.

`"AutomationRule"`: `relrowsecurity = true`, `relforcerowsecurity = true`, 6 rows, all
`scope = 'SYSTEM'` with **`tenantId = NULL`**. Two policies, byte-identical on both databases:

```
[ALL] bypass_rls_policy  (PERMISSIVE)
    USING      : (current_setting('app.bypass_rls'::text, true) = 'on'::text)
    WITH CHECK : (none)
[ALL] tenant_isolation_policy  (PERMISSIVE)
    USING      : ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
    WITH CHECK : ("tenantId" = current_tenant_id())
```

Measured on staging as `app_user`, GUC set to a real tenant:

```
SELECT system                                  -> 6 row(s)
UPDATE system (touch name only)                -> ERROR [42501] new row violates RLS policy
UPDATE system SET "tenantId" = MINE  <- CAPTURE -> 6 row(s)      <- NEW, IN NO PRIOR AUDIT
DELETE system                                  -> 6 row(s)      <- the known D2 gap
```

quick-599 tested only `update-system` touching a non-`tenantId` column (42501, because `tenantId`
stays NULL) and therefore missed the capture.

Confirmed from the repo at plan time — do not re-grep:

- The canonical artefact currently holds **183** policies, with
  `AutomationRule.tenant_isolation_policy` recorded as `cmd: ALL`,
  `using: ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))`,
  `withCheck: ("tenantId" = current_tenant_id())`.
- `tests-db/rls-isolation/coverage.test.ts:87` enumerates by the literal
  `p.polname = 'tenant_isolation_policy'`, and line 190 fails a target that leaves that enumeration
  with *"these behaviour targets carry no `tenant_isolation_policy` at all - renamed or dropped"*.
- `scripts/migrate.mjs:167` writes the `_prisma_migrations` row **itself**, with
  `checksum = 'manual'` and `applied_steps_count = 1`.
- The `AutomationRule` call sites are `(admin)/actions/automations.ts` lines 21, 43, 71, 98 and
  `api/cron/automations/route.ts:170`. All five use the **bare `prisma` client** from
  `@/lib/db/prisma`. `getAdminDb` is imported in `automations.ts` but is used only for
  `automationRun.create`, never for `automationRule`.

</established_do_not_re_derive>

<the_design>

**Decided by the orchestrator. Task 1 states and justifies it and MAY challenge it in writing, but
must not silently change it.** Four per-command policies replace the one `FOR ALL`:

| policy name | command | USING | WITH CHECK |
|---|---|---|---|
| `tenant_isolation_policy` (**name retained**) | SELECT | `((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))` | — |
| `automation_rule_insert_policy` | INSERT | — | `("tenantId" = current_tenant_id())` |
| `automation_rule_update_policy` | UPDATE | `("tenantId" = current_tenant_id())` | `("tenantId" = current_tenant_id())` |
| `automation_rule_delete_policy` | DELETE | `("tenantId" = current_tenant_id())` | — |

Net policy count **183 → 186** (one becomes four on this table). `bypass_rls_policy` untouched at 86.

**Hard constraints:**

- **`AS RESTRICTIVE` is FORBIDDEN** (quick-597 §8). A restrictive policy ANDs with *every* permissive
  policy including `bypass_rls_policy`, silently neutering the bypass on this table. Every statement
  is `AS PERMISSIVE`.
- **No policy DDL inside a `DO` block.** `rls-policy-replay.ts`'s `POLICY_STATEMENT_RE` is
  line-anchored and structurally cannot see inside one; a policy hidden that way goes live and is
  then reported UNEXPECTED by the drift gate. All policy DDL at **column zero**.
- There is no `CREATE POLICY IF NOT EXISTS`. Every `CREATE` is preceded by a
  `DROP POLICY IF EXISTS` on the same name — that pairing **is** the idempotency mechanism and is
  what lets the file replay from zero.
- **Do not touch `bypass_rls_policy`.**
- **No application code changes.**

</the_design>

<the_d3_rule>

**An RLS-refused UPDATE or DELETE is a SILENT 0 ROWS, not a `42501`.** Only a failed `WITH CHECK`
raises. When a table has no policy admitting a row for a command, `USING` filters every candidate
away and the statement reports 0 rows with no error.

**Therefore every zero-row probe in this task needs a counter-read proving the row is still there**,
or "refused" and "already gone" are the same observation. This is not optional for the DELETE proof.

</the_d3_rule>

<tasks>

<task type="auto">
  <name>Task 1: State the design, and verify the admin path from the code</name>
  <files>.planning/quick/612-close-the-automationrule-delete-gap-with/evidence/01-design.md</files>
  <action>
Write the design statement BEFORE any SQL exists. This is the step most likely to be hand-waved;
it is graded on precision, not length. Reproduce `<the_design>`'s table verbatim, then:

**(a) Per-command admitted-set table — today vs after.** One row per command
(SELECT / INSERT / UPDATE / DELETE), three columns: the predicate that governs it today, the
predicate that governs it after, and the verdict (`identical` / `strictly narrower` / `wider`).

Expected — but derive it and say so rather than copying:
  - SELECT — governed today by the `FOR ALL` `USING`; after, by the SELECT policy's `USING`. Byte
    identical. **The SYSTEM branch is retained deliberately: tenants must keep reading the 6
    platform rules.** That is precisely why quick-599 could not simply narrow `USING`.
  - INSERT — governed today by the `FOR ALL` `WITH CHECK`; after, by the INSERT policy's
    `WITH CHECK`. Byte identical.
  - UPDATE — `USING` drops the SYSTEM branch. Strictly narrower. `WITH CHECK` unchanged.
  - DELETE — `USING` drops the SYSTEM branch. Strictly narrower.

**(b) What the split PERMITS that the current policy does not.** The honest answer is very likely
**"nothing"** — every command's admitted set is a subset-or-equal of today's, SELECT and INSERT are
the same predicate, UPDATE and DELETE strictly narrow. **If that is what you find, say it plainly.
Do not invent a permit to make the section look balanced.** Then discharge the two ways a split
could accidentally widen, in writing:
  1. **No command is left uncovered.** All four commands carry exactly one policy (plus `bypass`).
     A command with *no* policy would be refused by absence — a silent 0 (D3) — not widened, but it
     would still be a behaviour change, so name that it does not happen. Note TRUNCATE is
     grant-governed, not policy-governed, and is out of scope.
  2. **Permissive policies OR.** Adding policies can only widen. Confirm the four new ones are
     mutually exclusive by command, so no two ever OR together on the same statement.
  3. **The SELECT policy also applies to UPDATE/DELETE that read columns** (a `WHERE` on the row, or
     `RETURNING`). Show the effective set is the **AND** of the SELECT `USING` and the command's
     `USING` — here `(SYSTEM OR own) AND (own)` = `own` — so the wider SELECT half cannot widen
     UPDATE or DELETE. State that Prisma's `update` emits `UPDATE … WHERE id = $1 RETURNING *` and
     therefore takes this path.

**(c) What the split FORBIDS that the current one allows.** Exactly two, both measured above:
  1. `DELETE … WHERE scope='SYSTEM'` — 6 rows today, 0 after.
  2. `UPDATE … SET "tenantId" = <own> WHERE scope='SYSTEM'` — the **capture** — 6 rows today, 0
     after.

**(d) The stated cost, not hidden.** `UPDATE … SET name` on a SYSTEM row changes from a loud
`42501` to a **silent 0 rows**. That is a real regression in observability, accepted deliberately:
D3 says an RLS-refused UPDATE is a silent zero and only `WITH CHECK` raises, and a silent refusal
beats an open capture. Record it as an accepted cost with that reasoning attached.

**(e) Why the SELECT half keeps the name `tenant_isolation_policy`** — quick-599 §D1. Cite
`tests-db/rls-isolation/coverage.test.ts:87` (the literal `polname` query) and line 190 (the
rename-or-dropped failure), plus the drift detector's body layer keying on
`(table, policy_name)`. Renaming it would make `AutomationRule` leave the enumeration entirely —
not "NOT COVERED", simply absent — and a filter over an absent key passes **vacuously**. The rule:
the half closest to the table's original read shape keeps the original name.

**(f) Why not `AS RESTRICTIVE`, and why not a `DO` block.** One paragraph each, per
`<the_design>`'s hard constraints.

**(g) THE ADMIN PATH, VERIFIED FROM THE CODE.** For each of the five call sites — open the file,
do not infer:

| site | operation | which client | which guard in front |
|---|---|---|---|
| `(admin)/actions/automations.ts:21` `getAutomationRules` | | | |
| `(admin)/actions/automations.ts:43` `getRuleWithRuns` | | | |
| `(admin)/actions/automations.ts:71` `toggleRuleActive` | | | |
| `(admin)/actions/automations.ts:98` `manualTriggerRule` | | | |
| `api/cron/automations/route.ts:170` `scheduleCronDrivenRule` | | | |

Then state, with the line numbers:
  - Which sites are **reads** and are therefore served by the unchanged SELECT policy and
    **unaffected** by this split.
  - Which site is the **only write**. (`toggleRuleActive` — quick-599's header already names it as
    the only `AutomationRule` write in the repository; re-verify with a grep over `src scripts
    prisma` for `automationRule.(update|create|delete|upsert|updateMany|deleteMany)` and record the
    grep and its output.)
  - **What breaks if a SYSTEM rule ever needs writing through a TENANT client.** Under this split
    that write is refused and **there is no in-policy escape hatch** short of `app.bypass_rls = 'on'`
    or the `app_admin` connection (`getAdminDb`, `rolbypassrls = true`). Note the failure MODE
    changes: post-599 it is a loud `42501`; post-split it is a silent 0 rows at the SQL layer — but
    Prisma's `update` (as distinct from `updateMany`) throws **P2025** on 0 affected rows, so it
    remains loud at the ORM layer. **Verify that claim rather than asserting it** — either from the
    Prisma client's documented behaviour for `update` on a non-matching `where`, or by noting it as
    a prediction Task 4's probe does not measure (the probe runs raw SQL, not Prisma) and marking it
    as such. Do not let a prediction read as a measurement.
  - The route to a fix is **B5** — move `toggleRuleActive` to `getAdminDb`. **Named, not built** —
    this task changes no application code.

**Challenge section (optional but welcomed).** If any part of the design is wrong, say so here with
the reasoning. Do not change the design silently.
  </action>
  <verify>
`evidence/01-design.md` exists and contains: the four-policy table; the per-command
today-vs-after table with an explicit verdict per command; a "PERMITS" section that either names
something concrete or states "nothing" and discharges all three widening routes; a "FORBIDS" section
naming the DELETE gap AND the capture; the stated observability cost; the name-retention argument
citing `coverage.test.ts` by line; and the five-row admin call-site table with the client and guard
filled in from the files.
  </verify>
  <done>
A reader who has never seen this task can say, from this file alone, exactly which statements change
behaviour and in which direction, and can name the one application site that is already broken at
the `app_user` cutover and why this split does not break it further.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build the staging verification probe and capture the BEFORE matrix</name>
  <files>apps/web/scripts/audit/612-policy-verify.ts</files>
  <action>
Model closely on `apps/web/scripts/audit/599-policy-verify.ts` — same environment discipline, same
four ground rules, same evidence shape. Read it first.

```
npx tsx scripts/audit/612-policy-verify.ts --phase before
npx tsx scripts/audit/612-policy-verify.ts --phase after
npx tsx scripts/audit/612-policy-verify.ts --diff
```

Writes `evidence/02-before.{json,md}`, `evidence/04-after.{json,md}`, `evidence/05-diff.md`.

**ENVIRONMENT — non-negotiable (quick-607).**
  - **MUST NOT import `scripts/_bootstrap-env`.** Load `apps/web/.env.staging` explicitly with
    dotenv.
  - Refuse **POSITIVELY**: every URL must contain `wyixpgunnjmzguhggocz` AND must not contain
    `oqdhberkghtnszrkdvfm`. A missing-var or production-ref match is `process.exit(1)` before any
    connection.
  - Print the resolved project ref to **stderr**, password masked.
  - Uses `STAGING_DIRECT_URL` (privileged, for fixtures and integrity re-reads) and
    `STAGING_DATABASE_URL_APP_USER` (the role under test).

**FOUR GROUND RULES.**
  1. Nothing swallowed. Every probe records `{rows: n}` or `{error: {code, message}}` with the
     SQLSTATE and the full server message.
  2. **Every write probe runs inside `BEGIN … ROLLBACK`. There is no `COMMIT` anywhere in this
     file.** Prove it with `grep -nE "query\(\s*'COMMIT" scripts/audit/612-policy-verify.ts`
     returning nothing, and record that command and its empty output in the evidence — a bare
     `grep -c COMMIT` is the wrong check (it matches prose).
  3. One **fresh** `pg.Client` per GUC case, all of that case's work inside ONE transaction
     (Supavisor is transaction-mode; outside a transaction consecutive statements may land on
     different backends and a session-scope `set_config` would not be observed). Each individual
     probe fenced with a `SAVEPOINT` so an expected raise aborts only itself.
  4. This is a REPORT, not a gate. Only a failure to connect, to read fixture ids, or the post-run
     integrity re-read exits 1.

**FIXTURES.** Reuse `apps/web/.rls-fixture-ids.json`, the gitignored runtime handshake written by
`npx tsx scripts/audit/597-staging-fixtures.ts --seed` (never quick-597's committed evidence copy —
re-seeding mints fresh ids). Refuse with that instruction if it is absent. Tenants A and B come from
it. **The fixtures seed no `AutomationRule` rows** — verified at plan time — so every own-tenant row
this probe needs it creates itself, inside the transaction, and discards by ROLLBACK.

**GUC CASES.** `guc-A` (tenant A's id) and `guc-empty`. **The tripwire interaction must be recorded,
not discovered:** `20260914180000_tenant_context_tripwire` makes `current_tenant_id()` raise
SQLSTATE **`TC001`** through the null branch of its COALESCE when the GUC is unset/empty and
`TENANT_CONTEXT_TRIPWIRE` is armed. So a `guc-empty` probe may raise `TC001` rather than return 0 or
6. Read `TENANT_CONTEXT_TRIPWIRE` out of `.env.staging`, record its value at the top of the evidence
file, and **classify `TC001` as a refusal — a loud one — not as an error in the probe.** Detect it by
`err.code === 'TC001'`, never by message prose.

**THE MATRIX — all four commands, both directions, per GUC case.** Give every probe a stable key so
before and after diff cleanly.

| key | statement | expected BEFORE | expected AFTER |
|---|---|---|---|
| `select-system@guc-A` | `SELECT count(*) … WHERE scope='SYSTEM'` | 6 | **6 (unchanged)** |
| `select-own@guc-A` | `SELECT count(*) … WHERE "tenantId" = A` (after inserting one) | 1 | 1 |
| `select-cross@guc-A` | `SELECT count(*) … WHERE "tenantId" = B` (B's row inserted privileged, or asserted absent) | 0 | 0 |
| `insert-own@guc-A` | `INSERT … (scope='TENANT', "tenantId"=A)` | accepted | accepted |
| `insert-cross@guc-A` | `INSERT … (scope='TENANT', "tenantId"=B)` | 42501 | 42501 |
| `insert-system@guc-A` | `INSERT … (scope='SYSTEM', "tenantId"=NULL)` | 42501 | 42501 |
| `update-own@guc-A` | `UPDATE … SET name WHERE "tenantId"=A` | 1 row | 1 row |
| `update-system@guc-A` | `UPDATE … SET name WHERE scope='SYSTEM'` | 42501 | **0 rows (silent — the stated cost)** |
| `update-capture@guc-A` | `UPDATE … SET "tenantId"=A WHERE scope='SYSTEM'` | **6 rows** | **0 rows** |
| `delete-own@guc-A` | `DELETE … WHERE "tenantId"=A` | 1 row | 1 row |
| `delete-system@guc-A` | `DELETE … WHERE scope='SYSTEM'` | **6 rows** | **0 rows** |
| the same at `guc-empty` for `select-system`, `update-capture`, `delete-system` | | (may be `TC001`) | (may be `TC001`) |

`update-capture` is **not in the task brief** — the brief did not know the hole existed. It is
mandatory here and it is the single most important row in the table.

**THE COUNTER-READ (D3) — mandatory, and it is what makes the DELETE proof a proof.**
Immediately after `delete-system` (and after `update-capture`), **inside the same transaction and
the same SAVEPOINT scope**, run:

```
SELECT count(*) FROM "AutomationRule" WHERE scope = 'SYSTEM';                       -- systemRemaining
SELECT count(*) FROM "AutomationRule" WHERE scope = 'SYSTEM' AND "tenantId" IS NULL; -- stillUnowned
```

Record both alongside the affected-row count. In the BEFORE phase the delete affects 6 and the
counter-read sees **0** — that is the proof the delete was real. In the AFTER phase it affects 0 and
the counter-read sees **6** — that is the proof it was *refused* rather than *already gone*. Without
this the two are the same observation. The `ROLLBACK` restores staging in both phases.

**HOW A `DELETE … WHERE scope='SYSTEM'` PROBE IS MADE SAFE.** Three layers, all required:
  1. `BEGIN … ROLLBACK` around every probe; no `COMMIT` in the file (ground rule 2, grep-proven).
  2. The counter-read runs **inside** that same transaction, so it is read from the transaction's own
     snapshot and needs no commit to be meaningful.
  3. **A post-run integrity re-read on a FRESH privileged connection**, after every transaction has
     rolled back, asserting exactly 6 rows with `scope='SYSTEM'` and `tenantId IS NULL`. This is a
     **hard `process.exit(1)`** on failure (quick-599's D4) — a loss here is unrecoverable staging
     data. Write its result into the evidence as `integrityReread`.
  The probe must never delete a real SYSTEM row, and must never insert a row that survives the run.

**POLICY CENSUS, captured in the same run** and written into both `before.json` and `after.json`:
  - `SELECT count(*) FROM pg_policy` — total.
  - The full **sorted LIST of table names** carrying `bypass_rls_policy` (a list, not a count —
    quick-599 `evidence/diff.md` precedent), plus its length.
  - Every policy on `"AutomationRule"`: `polname`, `polcmd`, `polpermissive`, `polroles`, and both
    expressions via `pg_get_expr`.

**`--diff` mode** reads `02-before.json` and `04-after.json` and writes `evidence/05-diff.md`: one
row per probe key with `before → after` and a `CHANGED` / `unchanged` verdict, plus the policy-count
delta and a bypass-list set-difference (must be empty).

Then run it: `npx tsx scripts/audit/612-policy-verify.ts --phase before`.
  </action>
  <verify>
`evidence/02-before.json` and `02-before.md` exist. They contain `delete-system@guc-A` = 6 rows with
`systemRemaining: 0`, and `update-capture@guc-A` = 6 rows — reproducing the orchestrator's
measurement independently. `integrityReread` reports 6. Total policies 183, `bypass_rls_policy` list
length 86. `grep -nE "query\(\s*'COMMIT" scripts/audit/612-policy-verify.ts` returns nothing.
  </verify>
  <done>
The BEFORE matrix independently reproduces both holes with a counter-read, staging is provably
unchanged (integrity re-read = 6, zero surviving probe rows), and the file is grep-proven to contain
no COMMIT.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write the migration</name>
  <files>apps/web/prisma/migrations/20260915140000_automation_rule_command_split/migration.sql</files>
  <action>
Four `DROP POLICY IF EXISTS` + `CREATE POLICY` pairs, exactly as `<the_design>` specifies. The
existing `tenant_isolation_policy` on `"AutomationRule"` is dropped and recreated as the SELECT half
under the **same name**.

**Structure — every rule below is load-bearing:**
  - Every `CREATE POLICY` and `DROP POLICY` starts at **column zero**, plain static SQL. **No `DO`
    block anywhere** — `rls-policy-replay.ts`'s `POLICY_STATEMENT_RE` is line-anchored and cannot see
    inside one. (Unlike quick-599 this migration needs no `DO` block at all: there is no GRANT or
    REVOKE, so there is nothing to guard on `pg_roles`.)
  - Every `CREATE` preceded by `DROP POLICY IF EXISTS` on the same name — the idempotency mechanism,
    and what lets the chain replay from zero.
  - Every policy `AS PERMISSIVE`. **No `AS RESTRICTIVE`.**
  - `TO public`, matching every sibling.
  - Cast the enum literal exactly as the live definition renders it:
    `(scope = 'SYSTEM'::"AutomationScope")`. Matching the deparsed form keeps the canonicalisation
    round-trip byte-identical.
  - `bypass_rls_policy` is **not named** by any statement in this file.

**Header comment — carry the argument, not just the statements.** Following quick-599's precedent:
  - The prior definition **verbatim**, quoted from `evidence/02-before.json`, with the date and the
    project ref it was read from.
  - **Both** holes, with the measured numbers: the D2 DELETE residue quick-599 named and could not
    close, and the CAPTURE hole no prior audit records — including *why* quick-599 missed it (it
    tested `update-system` touching a non-`tenantId` column, which gets 42501 because `tenantId`
    stays NULL).
  - Why SELECT keeps the SYSTEM branch, and why it keeps the NAME (cite
    `tests-db/rls-isolation/coverage.test.ts:87` and `:190`).
  - The accepted cost: `update-system` 42501 → silent 0 rows, with the D3 reasoning.
  - "No `AS RESTRICTIVE`, and why" — it would AND with `bypass_rls_policy`.
  - **"THIS MIGRATION CHANGES NOTHING AT RUNTIME TODAY"** — the application connects as `postgres`
    (`rolbypassrls = true`), so every policy here is decorative until `DATABASE_URL` moves to
    `app_user`. **A green deploy of this file is not evidence that any of it works.** Point at
    `evidence/02-before.*`, `04-after.*`, `05-diff.md` as the evidence that is.
  - What breaks at the `app_user` cutover, by file and line: `(admin)/actions/automations.ts:71`
    `toggleRuleActive`, already refused post-599 and still refused here, routed to **B5**. Carry
    Task 1's findings.
  - The apply command actually used (Task 4's), spelled out.
  - A **commented-out** ROLLBACK block restoring the single `FOR ALL` policy verbatim from
    `02-before.json`. Comment lines begin with `-`, not whitespace, so the line-anchored replay
    regex cannot match them. Say in the comment that it must be copied into psql, never uncommented
    in place — `migrate.mjs` skips by `migration_name` and would never re-run the file, while the
    drift replay WOULD see uncommented statements.

Timestamp `20260915140000` — after `20260915130000_grant_playbook_notification_to_app_admin`, the
current newest. Confirm nothing newer landed before naming the directory.
  </action>
  <verify>
`grep -n '^CREATE POLICY\|^DROP POLICY' migration.sql` shows 4 CREATEs and 4 DROPs, all at column
zero. `grep -c 'DO \$\$' migration.sql` returns 0. `grep -ci 'AS RESTRICTIVE' migration.sql` returns
0. `grep -c 'bypass_rls_policy' migration.sql` returns 0 outside comment lines. The four policy names
and the four command keywords match `<the_design>`'s table exactly.
  </verify>
  <done>
The migration is replayable from zero, parseable by the line-anchored replay regex, contains no
restrictive policy and no DO block, and its header carries both holes with their measured numbers and
the accepted cost.
  </done>
</task>

<task type="auto">
  <name>Task 4: Apply to staging, capture AFTER, diff, and re-clean the drift gate</name>
  <files>apps/web/scripts/audit/rls-policy-canonical.json, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/03-apply.txt, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/04-after.json, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/04-after.md, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/05-diff.md, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/06-drift.txt, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/07-ledger.txt</files>
  <action>
**STAGING ONLY. NEVER PRODUCTION.**

**(a) Apply.** From `apps/web/`, with **BOTH** variables pinned to the SAME staging string:

```
DIRECT_URL=<staging> DATABASE_URL=<staging> node scripts/migrate.mjs
```

Both are required. `migrate.mjs` applies with `DIRECT_URL` and then spawns
`seed-starter-playbooks.ts`, which resolves a **bare** `DATABASE_URL`; pinning only one makes
`migrate.mjs` refuse to seed (or, worse, point the seeder elsewhere). Never `prisma migrate deploy`,
never `db push`. The Supabase MCP server is **currently 503** and is not to be used anyway — per
DEC-17 neither MCP tool writes the Prisma ledger row.

Capture the full stdout+stderr to `evidence/03-apply.txt`, including the `[db-target]`-style banner
and `migrate.mjs`'s own project-ref comparison lines.

**(b) Ledger read-back — DEC-17's procedural half.** `migrate.mjs:167` writes the
`_prisma_migrations` row **itself**, with `checksum = 'manual'` and `applied_steps_count = 1`. That
is the signature of a row `migrate.mjs` actually executed, and it is **correct here** — do **not**
hand-write a second, mirrored `applied_steps_count = 0` row. The hand-written convention exists only
for DDL applied by some other means (MCP / raw psql). Do **not** skip the read-back on that account:

```sql
SELECT migration_name, checksum, applied_steps_count, started_at, finished_at
FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5;
```

Assert the newest row is `20260915140000_automation_rule_command_split`. **Before treating any empty
or short result as absence, confirm a known-good sentinel row is visible** — `_prisma_migrations` has
RLS enabled with zero policies and no `app_user` grant, so a read from a non-owner role returns zero
rows **with no error**, indistinguishable from "never written". Read it back as
`STAGING_DIRECT_URL` and quote at least 3 pre-existing rows as the sentinel. Write to
`evidence/07-ledger.txt`.

**(c) AFTER matrix.** `npx tsx scripts/audit/612-policy-verify.ts --phase after`, then
`--diff`. Then confirm, quoting each:
  - `select-system@guc-A` = **6** (unchanged — the tenant still reads the platform rules).
  - `select-own@guc-A` = 1; `select-cross@guc-A` = 0.
  - `insert-own@guc-A` accepted; `insert-cross@guc-A` and `insert-system@guc-A` = 42501.
  - `update-own@guc-A` = 1 row; `update-system@guc-A` = **0 rows** (the accepted cost, now observed);
    **`update-capture@guc-A` = 0 rows** — the capture closed.
  - `delete-own@guc-A` = 1 row; `delete-system@guc-A` = **0 rows**, **with the counter-read
    `systemRemaining = 6` inside the same transaction** proving refusal, not prior absence.
  - `integrityReread` = 6.
  **If any AFTER result contradicts Task 1's prediction, record the measurement and say the
  prediction was wrong. Never adjust a probe to make a run agree with the design.**

**(d) Policy counts and the bypass list.** From `05-diff.md`: total `183 → 186`, and the
`bypass_rls_policy` table LIST **set-identical** before and after, length 86 both times. Compare as
a sorted list and state that you did — a count alone would pass if one table lost the policy and
another gained it.

**(e) Re-clean the drift gate — BODY layer.** The migration changes a policy body, so
`rls-policy-canonical.json` is now **stale** and `audit:rls-policy-drift` will exit **3**
(`EXIT_DEFINITIONS_NOT_CHECKED`, "DEFINITION LAYER DID NOT RUN") rather than reporting drift.
Regenerate it — quick-599 did exactly this, for exactly this reason:

```
npm run audit:rls-canonicalise      # staging-only by construction; loads .env.staging itself
```

Then run the gate **pinned to staging** so it cannot resolve `DIRECT_URL` (which every env file
points at production — quick-607 rung 3: an explicitly pinned `DATABASE_URL` is used verbatim):

```
DATABASE_URL=<staging> npm run audit:rls-policy-drift
```

**Quote the `[db-target] project : <ref>` banner into `evidence/06-drift.txt` verbatim**, so the
report says which database was measured. Require **exit 0 / `RESULT: CLEAN`**, missing 0, unexpected
0, definition drift 0. Confirm the regenerated artefact holds **186** policies and that
`AutomationRule.tenant_isolation_policy` is now `cmd: SELECT` with `withCheck: null`, alongside the
three new entries. `AutomationRule.bypass_rls_policy` must be byte-identical to its previous entry.

**Do not run the drift gate against production in this task.** It is read-only and safe there, but
the deliverable is a migration applied to staging only, and a production run would report the
expected drift of an unapplied migration and muddy the evidence.
  </action>
  <verify>
`evidence/03-apply.txt` shows the migration applied to `wyixpgunnjmzguhggocz`.
`evidence/07-ledger.txt` shows the new row newest, with ≥3 sentinel rows visible.
`evidence/05-diff.md` shows `delete-system@guc-A` 6 → 0 with `systemRemaining` 0 → 6, and
`update-capture@guc-A` 6 → 0, and `select-system@guc-A` 6 → 6, and total policies 183 → 186, and an
empty bypass-list set-difference at length 86.
`evidence/06-drift.txt` contains the `[db-target]` banner naming staging and `RESULT: CLEAN`.
  </verify>
  <done>
Both holes are measured closed on staging with a counter-read, read visibility is provably unchanged,
the bypass policy set is provably untouched, and the drift gate is green against a database it names.
  </done>
</task>

<task type="auto">
  <name>Task 5: Record the closure verdict and what remains before the cutover</name>
  <files>docs/audits/tenant-audit-automation-policy-closure.md, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/08-closure.md</files>
  <action>
**(a) Update `docs/audits/tenant-audit-automation-policy-closure.md`.** §2.4 ("The `AutomationRule`
residue — D2, measured and unchanged") and §5's closure table currently record the DELETE gap as
open. Update in place, in quick-599's own style: strike through or mark the superseded lines rather
than deleting them, and cite quick-612 with the new measured numbers. Add the **capture** hole as a
finding quick-599 did not have — state plainly that quick-599's probe tested only `update-system`
touching a non-`tenantId` column and therefore could not have seen it. Do not rewrite quick-599's
history to look as though it knew.

**(b) State the verdict — FULLY CLOSED or PARTIAL — in `evidence/08-closure.md`.** This is a
question to answer with evidence, not a box to tick. Work through at least:
  - All four commands now carry a policy; SELECT deliberately keeps the SYSTEM branch.
  - `update-system` is refused **silently** rather than loudly. Does that make it PARTIAL? Argue it
    either way and commit to one. (The defensible reading: the *isolation* is closed — the row
    cannot be written — while *observability* is degraded, which is a stated accepted cost and not
    an open hole. Say which you chose and why.)
  - Is anything about `AutomationRule` still open? Check at minimum: `app_user`'s GRANTs on the
    table (a grant the policies no longer honour is the quick-599 `audit_log` shape — measure it,
    do not assume, and if UPDATE/DELETE grants remain, state whether the two layers now disagree
    and whether a REVOKE is warranted **as a recommendation, not as scope creep in this task**);
    the `AutomationRun` child table's own policies; and whether `toggleRuleActive` at
    `(admin)/actions/automations.ts:71` leaves a *product* gap (a sysadmin cannot toggle a platform
    rule after the cutover) even though the *isolation* gap is closed.
  - **PRODUCTION IS STILL PENDING** for this migration *and* for quick-599's, which was also applied
    to staging only. Say so explicitly — the closure is staging-proven, production-unapplied.

**(c) What remains before the `app_user` cutover.** Reproduce quick-611 §8's four-row table with
this task's updates, and re-verify each status rather than copying:

| # | item | status after 612 |
|---|---|---|
| 1 | `AutomationRule` DELETE split | ← this task |
| 2 | the 17 `25P02` sites | CLOSED by quick-611 |
| 3 | `app_admin` LOGIN on production | OPEN — role created NOLOGIN; LOGIN+password minted for staging only; **never verified live on production** |
| 4 | the bypass policy drop | OPEN and not begun — 86 `bypass_rls_policy` rows on staging, none dropped |

Add any row this task newly discovered (the `toggleRuleActive` product gap belongs here if it is not
already covered by B5).
  </action>
  <verify>
`docs/audits/tenant-audit-automation-policy-closure.md` §2.4 and §5 no longer describe the DELETE
residue as open, and name the capture hole. `evidence/08-closure.md` states FULLY CLOSED or PARTIAL
in one unambiguous sentence, with reasoning, and carries the four-row remaining table with
production-pending called out.
  </verify>
  <done>
A reader can tell, without running anything, whether `AutomationRule` is closed, on which database,
and what the next person must do before the cutover.
  </done>
</task>

<task type="auto">
  <name>Task 6: Gates — tsc probed, build, suite failing-FILE set unchanged</name>
  <files>.planning/quick/612-close-the-automationrule-delete-gap-with/evidence/09-gates.txt, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/00-suite-before.json, .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/10-suite-after.json</files>
  <action>
**(a) Suite baseline — capture it FIRST, before Task 2's file exists**, or at minimum re-measure a
clean tree with `git stash`. Three consecutive prior tasks published a baseline measuring something
other than the tree they thought (quick-561 stale, quick-565 contaminated, quick-567 env-skewed).
  - **Same reporter both directions.** `--reporter=basic` **does not exist in vitest 4** — it exits 0
    having executed ZERO tests. Use `--reporter=json` (quick-611's convention) both times.
  - **A green run whose output contains no test counts is not a green run.** Read the
    `Test Files … | Tests …` summary.
  - Do **not** start a run and then edit files while it is running.
  - Do **not** use a `git worktree` baseline — it does not carry `apps/web/.env.local` (untracked,
    gitignored), and DB-dependent tests then skew by ~25 tests, which reads exactly like a
    regression (quick-607). Stop `next dev` first.
  - Compare the **failing-FILE set**, not just the count. `diff` the two sorted lists; it must be
    empty. Test counts may rise only by tests this task added.

**(b) `npx tsc --noEmit` in `apps/web` — and PROBE it, do not believe it.** Inject
`const x: number = 'y';` into a file this task actually edited, confirm tsc reports **that** error,
then delete the probe. If the only errors are syntax errors, or are all in files you did not touch,
or are inside `.next/`, the gate is **blind, not green**: delete `apps/web/.next/dev/types/validator.ts`
and `apps/web/tsconfig.tsbuildinfo` and re-run. Check no stray `__probe.ts` survives (a previous run
left one in `src/lib/document-import/`).

**(c) `npm run build` — exit 0.** Note that `apps/web` currently has **no working lint entry point**
(`next lint` no longer accepts `--dir` on this Next version; ESLint 9 finds no `eslint.config.js`).
Report that rather than claiming lint passed.

**(d) Staging at close.** Re-read and quote, as `app_user` is not needed for this:

```
Tenant = ?   pg_policy total = 186   bypass_rls_policy = 86
AutomationRule SYSTEM rows = 6, all tenantId IS NULL
```

Zero surviving probe rows: assert no `AutomationRule` row exists whose name carries the probe marker.

Write everything to `evidence/09-gates.txt`.
  </action>
  <verify>
`evidence/09-gates.txt` contains: both suite summaries with explicit test counts and an empty
failing-file `diff`; the tsc probe's `TS2322` output followed by a clean run and confirmation the
probe was deleted; `npm run build` exit 0; the lint situation stated; and the staging close-out
showing 186 policies, 86 bypass, 6 SYSTEM rows all `tenantId IS NULL`, zero probe rows.
  </verify>
  <done>
Every gate is recorded with the evidence that makes it believable, and staging is provably in the
intended post-migration state with nothing this task created left behind.
  </done>
</task>

</tasks>

<verification>

1. `evidence/01-design.md` names, per command, what changes and in which direction, and answers the
   "what does the split PERMIT" question honestly — including plainly saying "nothing" if that is
   the finding.
2. `evidence/05-diff.md` quotes all four commands in both directions, including
   `update-capture@guc-A` (the hole the brief did not know about) and `delete-system@guc-A` with its
   **same-transaction counter-read**.
3. `evidence/06-drift.txt` shows the body-level drift detector CLEAN **and** quotes the
   `[db-target] project : <ref>` banner, so the report states which database it measured.
4. Policy counts before and after on staging: **183 → 186**. `bypass_rls_policy` table LIST
   set-identical, length 86 both times.
5. `evidence/08-closure.md` states FULLY CLOSED or PARTIAL unambiguously, and if PARTIAL, what
   remains.
6. `npm run build` exits 0; vitest failing-FILE set unchanged, same reporter both directions.
7. What remains before the `app_user` cutover is stated, with `app_admin` production LOGIN and the
   bypass policy drop both still OPEN, and production still PENDING for this migration.

**Disqualifying outcomes:**
- Any write to the production database.
- A `COMMIT` in `612-policy-verify.ts`.
- A real SYSTEM `AutomationRule` row deleted or re-owned on staging.
- A DELETE refusal reported without its counter-read.
- `AS RESTRICTIVE` anywhere, or policy DDL inside a `DO` block.
- The SELECT half renamed.
- A probe adjusted to make a run agree with the design.
- Any application code changed.

</verification>

<success_criteria>
- Both holes — DELETE and CAPTURE — measured 6 rows before and 0 rows after on staging as `app_user`,
  the DELETE with a same-transaction counter-read showing `systemRemaining` 0 → 6.
- Read visibility unchanged: `select-system@guc-A` = 6 in both phases.
- Own-tenant INSERT/UPDATE/DELETE all still accepted.
- 183 → 186 policies; `bypass_rls_policy` list identical at 86.
- Drift gate CLEAN against a named database, canonical artefact regenerated to 186.
- Closure verdict recorded in `docs/audits/tenant-audit-automation-policy-closure.md`.
- Gates green, tsc probed, staging clean at close.
</success_criteria>

<output>
After completion, create
`.planning/quick/612-close-the-automationrule-delete-gap-with/612-SUMMARY.md`.

It must state, at minimum: the four-policy design and what it permits/forbids; the capture hole as a
finding no prior audit recorded; the before/after matrix for all four commands; the accepted
observability cost; the closure verdict; and what remains before the `app_user` cutover.
</output>
</content>
</invoke>
