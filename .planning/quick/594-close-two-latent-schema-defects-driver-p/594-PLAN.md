---
phase: quick-594
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260912120000_driver_pay_records_money_precision/migration.sql
  - apps/web/prisma/migrations/20260912120100_support_ticket_foreign_keys_and_enum/migration.sql
  - .planning/quick/594-close-two-latent-schema-defects-driver-p/594-SUMMARY.md
autonomous: true

must_haves:
  truths:
    - "Two new migration directories exist, both sorting after 20260909120000_reconcile_rls_policy_drift, so the chain still replays from zero in order."
    - "Every DDL statement in both files is individually guarded, so a second run against a database that already has the object is a no-op rather than an error."
    - "The money migration refuses to run — RAISE EXCEPTION, not a silent round — if any driver_pay_records row holds a sub-cent value or a value too large for numeric(12,2)."
    - "The support-ticket migration creates SupportTicketType, SupportTicket_tenantId_fkey and TicketMessage_ticketId_fkey, and does NOT create SupportTicket_submittedBy_fkey."
    - "The four schema.prisma Decimal fields carry @db.Decimal(12, 2); prisma validate and prisma generate both succeed."
    - "Staging's four driver_pay_records columns read back as numeric(12,2) after the applier runs."
    - "The support-ticket creation path is exercised on staging inside a transaction that is ROLLBACKed, and staging's constraint definitions are byte-identical before and after."
    - "Production (oqdhberkghtnszrkdvfm) is never written by any command in this plan."
  artifacts:
    - path: "apps/web/prisma/migrations/20260912120000_driver_pay_records_money_precision/migration.sql"
      provides: "Guarded move of bonuses, tips, deductions, reimbursements to numeric(12,2), preceded by a loss assertion"
      contains: "RAISE EXCEPTION"
    - path: "apps/web/prisma/migrations/20260912120100_support_ticket_foreign_keys_and_enum/migration.sql"
      provides: "SupportTicketType enum plus two orphan-asserted foreign keys, with the third deliberately omitted and explained"
      contains: "SupportTicket_submittedBy_fkey"
    - path: "apps/web/prisma/schema.prisma"
      provides: "@db.Decimal(12, 2) on the four previously unannotated DriverPayRecord Decimal fields"
      contains: "@db.Decimal(12, 2)"
    - path: ".planning/quick/594-close-two-latent-schema-defects-driver-p/594-SUMMARY.md"
      provides: "Applied evidence, the rolled-back proof transcript, and the submittedBy blocker stated as the single outstanding item"
  key_links:
    - from: "the executor's shell"
      to: "staging wyixpgunnjmzguhggocz"
      via: "node scripts/migrate.mjs with BOTH DATABASE_URL and DIRECT_URL set inline from .env.staging's STAGING_DIRECT_URL"
      pattern: "DATABASE_URL=.*DIRECT_URL=.*migrate\\.mjs"
    - from: "20260912120100 migration.sql"
      to: "20260303000001_add_support_ticket/migration.sql"
      via: "FK clauses copied verbatim (ON DELETE RESTRICT ON UPDATE CASCADE)"
      pattern: "ON DELETE RESTRICT ON UPDATE CASCADE"
---

<objective>
Close two latent schema defects that the audit at `docs/audits/ledger-integrity.md` proved
production never received, by writing two forward migrations and applying them only to staging.

**Defect A — money precision.** `driver_pay_records.bonuses` / `.tips` / `.deductions` /
`.reimbursements` are `numeric(65,30)` in production and `numeric(8,2)` in staging. They are the
only 4 of 110 `Decimal` fields in `schema.prisma` that lack a `@db.Decimal` annotation, which is
exactly why they drifted. Target `numeric(12,2)`, matching `grossRevenue` in the same model, the
four `driver_settlements` money columns, and `driver_bonuses.amount`.

**Defect B — support-ticket integrity.** `20260303000001_add_support_ticket` sits in
`_prisma_migrations` as applied, and production has none of its enum type `SupportTicketType`, its
`SupportTicket_tenantId_fkey`, or (via the follow-up migration) `TicketMessage_ticketId_fkey`.
87 tickets and 4 messages are held together by nothing.

Purpose: make the repository able to repair a production whose shape the chain no longer
describes, with the repair itself proven safe before anybody proposes running it.
Output: two migration files, four schema annotations, a staging apply, a rolled-back creation
proof, and a summary naming the one thing a human still has to decide.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/audits/ledger-integrity.md
@apps/web/scripts/migrate.mjs
@apps/web/prisma/migrations/20260303000001_add_support_ticket/migration.sql
</context>

<non_negotiables>

These are the constraints the task was issued under. They are not suggestions, and a task that
violates one has failed even if every verification below passes.

1. **PRODUCTION `oqdhberkghtnszrkdvfm` IS NOT WRITTEN, AND DOES NOT NEED TO BE READ EITHER.**
   Every number this plan needs was already measured and is inlined in `<measured_evidence>`.
   No `prisma migrate deploy`, no Supabase `apply_migration`, no `execute_sql` carrying DDL, no
   `prisma db push`, against any database.
2. **Do not edit ANY existing migration file**, `20260303000001` above all. The repair is
   forward-only.
3. **The only write target is staging `wyixpgunnjmzguhggocz`**, and the only applier is
   `node scripts/migrate.mjs`, run from `apps/web`, with **BOTH** `DATABASE_URL` and `DIRECT_URL`
   set inline. See `<why_both_urls>` — this is the single highest-consequence step in the plan.
4. **Do not install any package.** `pg` is already a dependency of `apps/web` (`migrate.mjs`
   imports it).
5. **Do not touch any other divergence from the audit** — not the 28 `varchar -> text` columns,
   not `route_templates.scheduled_departure_time`, not `audit_log.ip_address`, not
   `grid_preference`.
6. **Commit; do not push.** The user pushes.

</non_negotiables>

<why_both_urls>

`scripts/migrate.mjs` resolves its own connection as `DIRECT_URL || DATABASE_URL` (line 8) — so
setting only `DIRECT_URL` is enough for the migration half, and **that is the trap**. After the
migrations finish, the same script spawns a seeder:

```js
spawnSync('npx', ['tsx', scriptPath], { stdio: 'inherit', shell: true, env: process.env });
```

with `scriptPath = scripts/seed-starter-playbooks.ts`. That file's first line is
`import { prisma } from '../src/lib/db/prisma'`. It does **not** import `_bootstrap-env`, and
`src/lib/db/prisma.ts` builds its pool from a bare `process.env.DATABASE_URL` with no dotenv load
of its own. So the seeder uses `DATABASE_URL` verbatim as inherited.

**If `DATABASE_URL` is left pointing at production, `migrate.mjs` will apply the DDL to staging and
then write starter playbooks into production.** Set both. Print both masked before running.

Related hazard, stated so it is not stumbled into: `prisma.config.ts` opens with
`import "dotenv/config"` and resolves `DIRECT_URL || DATABASE_URL` from the repo-root `.env`. Any
`prisma migrate ...` command therefore reaches **production** by default. `prisma validate` and
`prisma generate` do not connect and are safe; nothing else in the `prisma migrate` family is.

</why_both_urls>

<measured_evidence>

Use these numbers. Do not re-measure production.

**Sub-cent scan, production `driver_pay_records` (5 rows):** `bonuses` 0, `deductions` 0,
`reimbursements` 0, `tips` 0 rows with a sub-cent component. Overflow (abs >= 10^10) 0 on all
four. Largest absolute value anywhere in the four columns: `reimbursements` = 160.
So narrowing `numeric(65,30)` to `numeric(12,2)` is provably lossless in production **today**.

**Column types now:** production `numeric(65,30)`, staging `numeric(8,2)`, `net_pay`
`numeric(10,2)` on both. The migration must therefore work as a **narrowing** on production and a
**widening** on staging. Only staging is written by this plan.

**Column names:** none of the four has an `@map`, so the DB columns are literally `bonuses`,
`tips`, `deductions`, `reimbursements` — not snake_case variants.

**Support-ticket objects in production:** `SupportTicketType` absent ·
`SupportTicket_tenantId_fkey` absent · `SupportTicket_submittedBy_fkey` absent ·
`TicketMessage_ticketId_fkey` absent · 87 `SupportTicket` rows · 4 `TicketMessage` rows.

**Orphan counts in production:** `TicketMessage.ticketId` -> **0**, safe.
`SupportTicket.tenantId` -> **0**, safe (column is NULLABLE; NULLs are exempt from an FK anyway).
`SupportTicket.submittedBy` -> **7**, not safe.

**Staging:** already carries all three FKs and the enum (it replayed the full chain in quick-593),
and holds 0 `SupportTicket`, 0 `TicketMessage`, 0 `driver_pay_records` rows. Migration (b) is
therefore a **no-op on staging**, which is precisely why Task 3 exists.

</measured_evidence>

<the_excluded_foreign_key>

`SupportTicket_submittedBy_fkey` is **deliberately not in the migration.**

Production has 7 `SupportTicket` rows whose `submittedBy` points at a `User` id that does not
exist — `f445daf9-c637-4d6d-b8cf-a0d507225145` — tickets TKT-0001, 0036, 0037, 0038, 0044, 0061,
0067, spanning 2026-03-28 to 2026-07-17, all with `tenantId` NULL. The column is `NOT NULL`, so
`ON DELETE SET NULL` is not available as an escape, and `NOT VALID` is not the answer either: a
constraint nothing ever validates is a comment that looks like a control.

Including it would make the whole migration abort on production, and **the two safe foreign keys
would never land** — the repair would fail closed on the 87 tickets it can actually protect.

Two things follow, and both are requirements, not notes:

- The migration file must carry a prominent header comment and a runtime `RAISE WARNING`
  explaining the omission and reporting the **live** orphan count at apply time.
- The summary must report it as **the single outstanding blocker**, requiring a human data
  decision (identify or recreate the missing user, reassign the tickets, or make the column
  nullable).

</the_excluded_foreign_key>

<tasks>

<task type="auto">
  <name>Task 1: Write both migrations and annotate the four Decimal fields</name>
  <files>
apps/web/prisma/migrations/20260912120000_driver_pay_records_money_precision/migration.sql
apps/web/prisma/migrations/20260912120100_support_ticket_foreign_keys_and_enum/migration.sql
apps/web/prisma/schema.prisma
  </files>
  <action>
No database is touched in this task.

**1a — `schema.prisma`.** In `model DriverPayRecord` (around lines 2931-2934, immediately after
`basePay`, which is already `@db.Decimal(10, 2)`), add `@db.Decimal(12, 2)` to exactly four
fields: `bonuses`, `tips`, `deductions`, `reimbursements`. Keep `@default(0)`. Change nothing else
in the model and nothing else in the file — these are the only 4 of 110 `Decimal` fields lacking
the annotation, so a diff touching a fifth line is a mistake.

Record in a comment (on the model, or in the migration header) that `(12,2)` deliberately
supersedes the `(8,2)` that `20260404100012_driver_pay_records` declares: `(8,2)` caps a line at
999,999.99 and disagrees with every sibling money column. After this migration a from-zero replay
lands on `(8,2)` then `(12,2)`, and production lands on `(12,2)` — the two agree, which is the
point.

**1b — `20260912120000_driver_pay_records_money_precision/migration.sql`.** Structure:

- Header comment: what drifted, the production vs staging types, why `(12,2)`, and
  `NOTE: Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each migration in its own transaction.`
  (copy that convention from `20260303000001`'s header).
- **Loss assertion, before any ALTER.** One `DO $$ ... $$` block that counts, across all four
  columns in one query, rows where the value would not survive the cast:
  `col IS NOT NULL AND (col <> round(col, 2) OR abs(col) >= 10^10)`.
  If the count is non-zero, `RAISE EXCEPTION` with an actionable message naming the table, the
  count, and the instruction to resolve the values by hand. **Never round live money to make a
  migration pass.** On a database where the columns are already `(8,2)` this is trivially true; it
  exists for the production shape, where it is the only thing standing between a narrowing cast
  and silently rewritten pay records.
- **Guarded ALTERs.** One `DO $$ ... $$` block looping over
  `ARRAY['bonuses','tips','deductions','reimbursements']`, and for each column checking
  `information_schema.columns` for `numeric_precision = 12 AND numeric_scale = 2`; if it already
  matches, skip; otherwise
  `EXECUTE format('ALTER TABLE public.driver_pay_records ALTER COLUMN %I TYPE numeric(12,2)', col)`.
  A loop rather than four pasted blocks — four near-identical blocks is how one ends up with the
  wrong column name in the fourth.
- A closing `RAISE NOTICE` stating the final types.

Do **not** add a `USING` clause: the implicit numeric-to-numeric cast is what we want, and the
assertion above is what makes it safe.

**1c — `20260912120100_support_ticket_foreign_keys_and_enum/migration.sql`.** Structure:

- Header comment: `20260303000001` is recorded as applied and production received none of these
  objects; cite `docs/audits/ledger-integrity.md` sections 2.2 and 5.3. **Then the omission
  notice** — the 7 orphaned `submittedBy` rows, the missing user id, and that adding that FK is a
  separate decision. At the top, where a reviewer cannot miss it.
- **Enum**, copied verbatim from `20260303000001` including its guard:
  `DO $$ BEGIN CREATE TYPE "SupportTicketType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'QUESTION', 'ACCOUNT_ISSUE', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
  Add a one-line comment recording the honest position: **no live column references this type
  today** — the live `SupportTicket` uses `category "SupportTicketCategory"` — so it is created
  solely so production matches what a from-zero replay of the chain produces.
- **`SupportTicket_tenantId_fkey`:** first a `DO` block counting
  `SupportTicket s WHERE s."tenantId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = s."tenantId")`,
  with `RAISE EXCEPTION` naming the count if non-zero. Then the add, guarded on `pg_constraint`
  (`conname = 'SupportTicket_tenantId_fkey' AND conrelid = '"SupportTicket"'::regclass`), with the
  clause copied verbatim:
  `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE`.
- **`TicketMessage_ticketId_fkey`:** same shape — orphan count over
  `TicketMessage m WHERE NOT EXISTS (SELECT 1 FROM "SupportTicket" t WHERE t.id = m."ticketId")`,
  then the guarded add with
  `FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE`, taken verbatim
  from `20260309000001_extend_support_ticket_add_messages`.
- **Closing `RAISE WARNING`** that recomputes the live `submittedBy` orphan count and prints it,
  the missing-user id, and the sentence that the FK was omitted for that reason — plus "if this
  count reads 0, a follow-up migration may add `SupportTicket_submittedBy_fkey`".

Use `pg_constraint` / `pg_type` / `information_schema` guards rather than
`EXCEPTION WHEN duplicate_object` for the FKs, so a *different* failure is not swallowed as
"already there".

Behaviour change worth naming in the header: `ON DELETE RESTRICT` on `tenantId` means deleting a
Tenant that has support tickets will now fail. That is the intended semantics of the original
migration. `schema.prisma` models neither of these FKs as a Prisma relation (it never did) — so do
**not** add relation fields to `SupportTicket` or `TicketMessage`; that would be a schema change
with code consequences and is out of scope.
  </action>
  <verify>
From `apps/web`, with no database env overrides:

- `npx prisma validate` succeeds.
- `npx prisma generate` succeeds.
- `npx tsc --noEmit` reports 0 errors. **If errors appear, apply the standing blind-gate rule**:
  if they are all syntax errors, or all in files this task did not touch, the gate is blind —
  delete `.next/dev/types/validator.ts` and `tsconfig.tsbuildinfo`, re-run, and probe with a
  deliberate `const x: number = 'y'` in a file this task edited before believing a clean run.
  Delete the probe.
- `ls apps/web/prisma/migrations | sort | tail -3` shows the two new directories last, after
  `20260909120000_reconcile_rls_policy_drift`.
- `grep -c "RAISE EXCEPTION"` is >= 1 on the money file and >= 2 on the ticket file.
- `grep "submittedBy_fkey"` on the ticket migration finds it only inside comments and the
  `RAISE WARNING` text; **no `ADD CONSTRAINT "SupportTicket_submittedBy_fkey"` anywhere.**
- `git diff --stat apps/web/prisma/schema.prisma` shows 4 changed lines, plus at most a comment.
  </verify>
  <done>Both migration files exist with guarded, self-asserting DDL; the four Decimal fields carry `@db.Decimal(12, 2)`; prisma validate, generate and tsc are clean; no existing migration was modified.</done>
</task>

<task type="auto">
  <name>Task 2: Apply both migrations to staging and read the column types back</name>
  <files>
(no repo files modified — this task runs commands and records their output)
  </files>
  <action>
Read `apps/web/.env.staging`. It holds two keys with **different passwords**; quick-593 established
that `STAGING_DIRECT_URL` (port 5432) authenticates and `STAGING_DATABASE_URL` (port 6543) is
untested. **Use `STAGING_DIRECT_URL`'s value for both variables.**

Before running anything, print both values **masked** — host, port, database and role visible,
password replaced — and assert out loud that the host does not contain `oqdhberkghtnszrkdvfm`.
If it does, stop.

From `apps/web`, in a single command so the variables cannot leak into a later invocation:

```
DATABASE_URL="$STAGING" DIRECT_URL="$STAGING" node scripts/migrate.mjs
```

Expect `Applying migration: 20260912120000_...`, then `20260912120100_...`, then
`Migrations complete (2 applied)`, then the starter-playbook seeder running against **staging**
(it will iterate staging's tenants — expected and harmless; record how many it touched).

Then, over the same staging connection (a read-only `SELECT` through any client already wired to
staging is fine), capture:

1. `information_schema.columns` for `driver_pay_records` — the four columns plus `net_pay` and
   `base_pay`: `column_name, data_type, numeric_precision, numeric_scale`.
2. The two `_prisma_migrations` rows for the new names:
   `migration_name, applied_steps_count, started_at, finished_at, checksum`. Expect
   `applied_steps_count = 1` and `checksum = 'manual'` — that is `migrate.mjs`'s signature for a
   row it actually executed, as distinct from the 20 resolved-not-run markers the audit found.
3. `pg_get_constraintdef` for `SupportTicket_tenantId_fkey` and `TicketMessage_ticketId_fkey`.
   They pre-exist on staging — capture them now, because Task 3 compares against these strings.

Finally re-run the exact same `migrate.mjs` command a second time and confirm it prints
`Database up to date` and applies nothing. That is the idempotency evidence for the *applier*; the
per-statement guards get their evidence in Task 3.

Record every number verbatim for the summary. Do not paraphrase counts.
  </action>
  <verify>
- `migrate.mjs` first run: 2 applied, exit 0.
- The four staging columns read `numeric` with `numeric_precision = 12` and `numeric_scale = 2`.
  `net_pay` and `base_pay` unchanged at `(10,2)`.
- Both `_prisma_migrations` rows present, `applied_steps_count = 1`, `finished_at` non-null.
- `migrate.mjs` second run: `Database up to date`, 0 applied, exit 0.
- The masked URLs printed for the run contain the staging ref `wyixpgunnjmzguhggocz` and not
  `oqdhberkghtnszrkdvfm`.
  </verify>
  <done>Both migrations are applied to staging and only staging; the four money columns are `numeric(12,2)` there; a repeat run is a no-op.</done>
</task>

<task type="auto">
  <name>Task 3: Prove the creation path in a rolled-back transaction, then write the summary</name>
  <files>
apps/web/scripts/_594-proof.mjs   (temporary — deleted before the commit)
.planning/quick/594-close-two-latent-schema-defects-driver-p/594-SUMMARY.md
  </files>
  <action>
Staging already had the enum and both FKs before Task 2, so Task 2 proved only that the guards
**skip** correctly. This task proves the branch that will actually run on production: **creation**.

Write `apps/web/scripts/_594-proof.mjs` — a single-session `pg.Client` script (`pg` resolves from
`apps/web/node_modules`; `migrate.mjs` is the precedent). It must live inside `apps/web/scripts`
with a `.mjs` extension — **not** in a temp directory (module resolution walks up from the
script's own directory, so `pg` would not resolve) and **not** as `.ts` (`tsconfig.json` includes
`**/*.ts`, and an untracked half-written `.ts` inside the program is the blind-tsc-gate trap that
has cost this repo three investigations). Attach `client.on('notice', ...)` and print every notice:
`migrate.mjs` attaches no notice listener, so the migration's `RAISE WARNING` is invisible under
it, and this script is the only place its text is ever seen.

The script connects to **staging only** (assert the connection string does not contain the
production ref and exit non-zero if it does), reads the migration file from disk with `readFileSync`
so the SQL executed is byte-identical to the committed file, and then:

1. `BEGIN`.
2. Record `pg_get_constraintdef(oid)` for both FKs and the `oid` of type `SupportTicketType`.
3. Drop the two FKs. For the enum, **first check whether any column depends on it**
   (`information_schema.columns WHERE udt_name = 'SupportTicketType'`, plus `pg_depend`):
   - **No dependents** -> `DROP TYPE "SupportTicketType"`, and the proof covers all three objects.
   - **Dependents exist** (staging replayed the original chain, which created `SupportTicket."type"`
     with this enum, so this is the likely branch) -> do **not** drop it and do **not** reach for
     `CASCADE`. Instead prove the `CREATE TYPE` branch by creating a scratch schema in the same
     transaction and putting it first on the search path
     (`CREATE SCHEMA _proof_594; SET LOCAL search_path = _proof_594, public;`), so the migration's
     unqualified `CREATE TYPE` resolves into the scratch schema and its validity is demonstrated
     without touching the live type. **Record which branch was taken** — a proof that quietly
     covered two objects instead of three, unreported, is worse than a smaller proof honestly
     described.
4. Assert the dropped objects are absent (count = 0).
5. Execute the full migration SQL read from disk.
6. Assert the objects exist again and that `pg_get_constraintdef` matches the strings captured in
   step 2 **exactly** — including `ON DELETE RESTRICT ON UPDATE CASCADE` on `tenantId` and
   `ON DELETE CASCADE` on `ticketId`. The matching definition is the assertion; a bare "it exists"
   would pass on an FK with the wrong delete rule.
7. Capture the `RAISE WARNING` text from the notice listener and assert it mentions
   `SupportTicket_submittedBy_fkey`.
8. `ROLLBACK`.
9. In a **fresh** query after the rollback, re-read both constraint definitions and the live enum
   and assert they are identical to step 2, and that `_proof_594` does not exist. Staging must be
   byte-identical to how it started.

Run it once. If step 5 fails, that is a real defect in the migration — fix Task 1's file and
re-run; do not weaken the assertions.

Also run, in the same script or a second pass, the **loss-assertion predicate** from the money
migration against a temp table shaped `numeric(65,30)` holding one deliberately sub-cent row,
inside its own `BEGIN ... ROLLBACK`, and confirm the predicate returns a non-zero count. Staging's
columns cannot hold a sub-cent value either before `(8,2)` or after `(12,2)`, so this is the only
way to show the guard actually fires — and production, where it matters, is not ours to test on.
State plainly in the summary that this exercises the *predicate*, not the migration file.

**Delete `_594-proof.mjs` afterwards** and confirm `git status` shows no untracked file under
`apps/web`. Paste its full output into the summary instead.

Then write `594-SUMMARY.md` covering: what each migration does; the applied-to-staging evidence
from Task 2 verbatim; the rolled-back proof transcript and which enum branch it took; the
predicate demonstration; the statement that production was never contacted; and — as its own
clearly headed section — **the outstanding blocker**: `SupportTicket_submittedBy_fkey` is not
created, 7 production rows reference missing user `f445daf9-c637-4d6d-b8cf-a0d507225145`
(TKT-0001/0036/0037/0038/0044/0061/0067, all `tenantId` NULL, 2026-03-28 to 2026-07-17), the
column is `NOT NULL` so `SET NULL` is unavailable, and a human must decide whether to recreate the
user, reassign the tickets, or make the column nullable. Name the follow-up migration it would
need.

**Replay-from-zero:** state the truth rather than a claim. Both files sort after
`20260909120000_reconcile_rls_policy_drift` and every statement is guarded, so the chain's
ordering is intact and a replay is expected to succeed — but a genuine from-zero replay was
**not** tested, because there is no local database (DEC-3) and the one staging project already
carries the full chain; replaying from zero would mean dropping and rebuilding it, which is
outside this task's remit. Say exactly that.

Commit both migrations, `schema.prisma`, and the summary in one commit:
`fix(quick-594): repair driver pay money precision and support-ticket integrity`.
**Do not push.**
  </action>
  <verify>
- The proof script exits 0 with every assertion passing, and its output names the enum branch taken.
- Post-`ROLLBACK` re-read: both `pg_get_constraintdef` strings identical to the pre-drop capture;
  `SupportTicketType` present with its original `oid`; `_proof_594` absent.
- The captured notice text contains `SupportTicket_submittedBy_fkey`.
- The sub-cent predicate returns a non-zero count against the temp fixture, and that transaction is
  rolled back.
- `git status --porcelain apps/web` shows no `_594-proof.mjs` and no other untracked file.
- `594-SUMMARY.md` contains a section headed as the outstanding blocker, naming the 7 rows and the
  missing user id, and an explicit statement that from-zero replay was not tested and why.
- `git log -1 --stat` shows exactly the four intended files.
  </verify>
  <done>The creation path is demonstrated on staging and rolled back leaving no trace; the loss guard is shown to fire; the summary records the applied evidence and the single human decision that remains; everything is committed and nothing is pushed.</done>
</task>

</tasks>

<verification>

Whole-plan checks, in the order a reviewer would run them:

1. `git diff` touches only the two new migration directories, `schema.prisma` (4 lines), and the
   summary. **No existing `migration.sql` is modified** — confirm with
   `git status --porcelain apps/web/prisma/migrations` showing only the two new paths as additions.
2. `npx prisma validate` and `npx prisma generate` succeed from `apps/web`.
3. `npx tsc --noEmit` reports 0 errors, and the gate was probed if anything looked odd.
4. Staging's `driver_pay_records` reports `numeric(12,2)` on all four columns.
5. `migrate.mjs` run twice: 2 applied, then 0 applied.
6. The rolled-back proof transcript shows drop -> absent -> recreate -> definitions match ->
   rollback -> unchanged.
7. `grep -rn 'ADD CONSTRAINT "SupportTicket_submittedBy_fkey"' apps/web/prisma/migrations/20260912120100_*`
   returns **nothing**.
8. No command in the session log wrote to `oqdhberkghtnszrkdvfm`, and no `prisma migrate deploy`,
   `apply_migration`, DDL-bearing `execute_sql`, or `db push` was issued anywhere.

</verification>

<success_criteria>

- Two forward migrations exist that can be applied to production later by someone else, each
  independently reviewable and revertible, each guarded statement by statement, each refusing to
  run rather than damaging data if the database is not in the state it expects.
- `schema.prisma` no longer has any unannotated `Decimal` field — the count goes from 4 to 0.
- Staging carries `numeric(12,2)` on the four money columns and is otherwise unchanged.
- The support-ticket creation path has been executed against a real PostgreSQL, verified, and left
  no state behind.
- The one thing that cannot be fixed without a human data decision is written down where it will
  be found, with the exact rows named.

</success_criteria>

<output>
Create `.planning/quick/594-close-two-latent-schema-defects-driver-p/594-SUMMARY.md` as specified
in Task 3.
</output>
