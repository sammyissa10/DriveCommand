---
phase: quick-594
plan: 01
subsystem: database / migrations
tags: [schema-drift, migrations, money-precision, referential-integrity, staging]
requires:
  - "quick-592/593 staging project wyixpgunnjmzguhggocz with the full chain replayed"
  - "docs/audits/ledger-integrity.md (sections 2.2, 5.3)"
provides:
  - "20260912120000_driver_pay_records_money_precision — guarded, loss-asserting move of four money columns to numeric(12,2)"
  - "20260912120100_support_ticket_foreign_keys_and_enum — SupportTicketType + two orphan-asserted foreign keys, third deliberately omitted"
  - "schema.prisma: 0 of 110 Decimal fields now unannotated (was 4)"
affects:
  - "apps/web/prisma/schema.prisma (DriverPayRecord)"
  - "staging database wyixpgunnjmzguhggocz (applied)"
  - "production oqdhberkghtnszrkdvfm (NOT applied — these files are the proposal, not the act)"
tech-stack:
  added: []
  patterns:
    - "DO-block loss assertion that RAISE EXCEPTIONs rather than silently rounding money"
    - "pg_constraint guards for FK creation instead of EXCEPTION WHEN duplicate_object, so a different failure is not swallowed as 'already there'"
    - "rolled-back transaction as the proof harness for a migration's CREATION branch on a database that already has the objects"
key-files:
  created:
    - "apps/web/prisma/migrations/20260912120000_driver_pay_records_money_precision/migration.sql"
    - "apps/web/prisma/migrations/20260912120100_support_ticket_foreign_keys_and_enum/migration.sql"
  modified:
    - "apps/web/prisma/schema.prisma"
    - "apps/web/src/generated/prisma/* (regenerated mirror — see Deviations)"
decisions:
  - "numeric(12,2) deliberately supersedes the (8,2) declared by 20260404100012, so a from-zero replay and a repaired production land on the same type"
  - "SupportTicket_submittedBy_fkey is NOT created — including it would abort the whole migration on production and the two safe FKs would never land"
  - "SupportTicketType is created even though no live column references it, so production matches what a from-zero replay produces"
metrics:
  duration: ~35 min
  tasks: 3
  files: 4 (+6 regenerated Prisma client artifacts)
  completed: 2026-09-12
---

# quick-594: Close Two Latent Schema Defects — Driver Pay Money Precision and Support-Ticket Integrity Summary

Two forward migrations that let somebody repair a production database whose shape the migration
chain stopped describing — driver pay money columns that drifted to `numeric(65,30)` because they
were the only 4 of 110 `Decimal` fields without a `@db.Decimal` annotation, and a support-ticket
enum plus two foreign keys that `_prisma_migrations` records as applied and the database never
received. Both applied to staging and only staging; the creation path proven on real PostgreSQL
inside a transaction that was rolled back.

---

## 1. What each migration does

### `20260912120000_driver_pay_records_money_precision`

Moves `driver_pay_records.bonuses`, `.tips`, `.deductions`, `.reimbursements` to `numeric(12,2)`.

- **Section 1 — loss assertion.** One `DO` block counting, across all four columns in one query,
  rows that `numeric(12,2)` could not hold without changing their value. Non-zero →
  `RAISE EXCEPTION` naming the table, the count, and the exact `SELECT` that locates the rows.
  On production this is a **narrowing** cast (65,30 → 12,2) and this block is the only thing
  standing between it and silently rewritten pay records. It never rounds.
- **Section 2 — guarded type change.** A single `FOREACH` over
  `ARRAY['bonuses','tips','deductions','reimbursements']`, reading `information_schema.columns`
  for `numeric_precision = 12 AND numeric_scale = 2` and skipping when already correct. A loop
  rather than four pasted blocks, because four near-identical blocks is how the fourth ends up
  naming the wrong column. No `USING` clause — the implicit numeric→numeric cast is what is
  wanted, and Section 1 is what makes it safe.
- **Section 3 —** a `RAISE NOTICE` reporting the final types of all six money columns.

`(12,2)` matches `grossRevenue` in the same model, the four `driver_settlements` money columns and
`driver_bonuses.amount`. It deliberately supersedes the `(8,2)` that
`20260404100012_driver_pay_records` declares — `(8,2)` caps a line at 999,999.99 and agrees with
nothing else in the ledger. After this migration a from-zero replay lands on `(8,2)` then `(12,2)`,
and a production that never received `(8,2)` lands directly on `(12,2)`. The two agree, which is
the point.

### `20260912120100_support_ticket_foreign_keys_and_enum`

Creates `SupportTicketType`, `SupportTicket_tenantId_fkey` and `TicketMessage_ticketId_fkey`, each
preceded by an orphan assertion where one applies, each guarded on `pg_constraint` / the original
`DO … EXCEPTION WHEN duplicate_object` so a second run is a no-op. `pg_constraint` guards rather
than `EXCEPTION` guards for the FKs specifically, so a *different* failure is not swallowed as
"already there".

Honest position recorded in the file: **no live column references `SupportTicketType` today** —
`20260309000001` dropped `SupportTicket."type"` and the live model uses
`category "SupportTicketCategory"`. It is created solely so a repaired production matches what a
from-zero replay of the chain produces.

Behaviour change named in the header: `ON DELETE RESTRICT` on `tenantId` means deleting a Tenant
that still has support tickets will now fail. That is the original migration's intended semantics,
restored. No Prisma relation fields were added — `schema.prisma` never modelled these FKs, and
adding them would be a schema change with code consequences.

### `schema.prisma`

`bonuses`, `tips`, `deductions`, `reimbursements` each gained `@db.Decimal(12, 2)`, plus one
comment line recording why `(12,2)` supersedes `(8,2)`. Unannotated `Decimal` fields went **4 → 0**:

```
$ grep -cE "\bDecimal\b" prisma/schema.prisma   # 111 lines
$ grep -c "@db.Decimal" prisma/schema.prisma    # 110 lines
$ grep -nE "\bDecimal\b" prisma/schema.prisma | grep -v "@db.Decimal"
2687:  /// Money as Decimal, never float (spec Section 15).
```

The single non-annotated line is a doc comment. All 110 `Decimal` fields carry a `@db.Decimal`.

---

## 2. Gate evidence (Task 1)

```
$ npx prisma validate
The schema at prisma\schema.prisma is valid 🚀

$ npx prisma generate
✔ Generated Prisma Client (v7.6.0) to .\src\generated\prisma in 10.67s

$ npx tsc --noEmit
EXIT=0   (no output)
```

**The tsc gate was probed, not inferred.** Per the standing repo rule, a clean run is only
believable if a deliberate error is shown to be reported:

```
$ printf '\nconst __probe594: number = '"'"'y'"'"';\n' >> src/lib/carrier/inspection-constants.ts
$ npx tsc --noEmit
src/lib/carrier/inspection-constants.ts(113,7): error TS2322: Type 'string' is not assignable to type 'number'.
$ git checkout -- src/lib/carrier/inspection-constants.ts
PROBE REVERTED
```

The gate is live. The probe was reverted immediately and `git status` for that file is clean.

Ordering and content checks:

```
$ ls prisma/migrations | sort | tail -3
20260912120000_driver_pay_records_money_precision
20260912120100_support_ticket_foreign_keys_and_enum
migration_lock.toml
```

(Both new directories sort after `20260909120000_reconcile_rls_policy_drift`; `migration_lock.toml`
is a file, not a migration.)

```
$ grep -c "RAISE EXCEPTION" .../20260912120000_.../migration.sql   → 3
$ grep -c "RAISE EXCEPTION" .../20260912120100_.../migration.sql   → 2
$ grep -n 'ADD CONSTRAINT "SupportTicket_submittedBy_fkey"' .../20260912120100_.../migration.sql
(no match, exit 1)
```

---

## 3. The staging apply (Task 2)

### Masked connection strings used

Both variables were set inline from `.env.staging`'s `STAGING_DIRECT_URL` (port 5432 — quick-593
established this is the one that authenticates), in a single command so they could not leak into a
later invocation:

```
DATABASE_URL = postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres
DIRECT_URL   = postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres
ASSERT OK: staging ref present, production ref absent
```

`.env.staging`'s other key, for the record, masked and **unused**:

```
STAGING_DATABASE_URL = postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Why both variables.** `migrate.mjs` resolves `DIRECT_URL || DATABASE_URL`, so `DIRECT_URL` alone
would have applied the DDL to staging — and then the script spawns
`npx tsx scripts/seed-starter-playbooks.ts`, which imports `src/lib/db/prisma.ts`, which builds its
pool from a **bare `process.env.DATABASE_URL` with no dotenv load**. Verified before running:
`grep -rn "override: *true" --include=*.ts --include=*.tsx --include=*.mjs src scripts` returns
nothing, so nothing in the tree can override an inline value either. Leaving `DATABASE_URL` on
production would have seeded starter playbooks **into production**.

The seeder's own output is the confirmation that it did not: it reported **0 tenants**, which is
staging. Production has many.

### Applier output — first run

```
Running database migrations...
Applying migration: 20260912120000_driver_pay_records_money_precision
  Applied: 20260912120000_driver_pay_records_money_precision
Applying migration: 20260912120100_support_ticket_foreign_keys_and_enum
  Applied: 20260912120100_support_ticket_foreign_keys_and_enum
Migrations complete (2 applied)
Seeding starter playbooks for 0 tenant(s)...
EXIT=0
```

(`migrate.mjs` attaches no `notice` listener, so the migrations' `RAISE NOTICE`/`RAISE WARNING`
output is invisible under it. Section 5 below is the only place that text is ever seen.)

### Applier output — second run (idempotency of the applier)

```
Running database migrations...
Database up to date
Seeding starter playbooks for 0 tenant(s)...
EXIT=0
```

### The four staging columns, read back

```
### driver_pay_records money columns
┌─────────┬──────────────────┬───────────┬───────────────────┬───────────────┐
│ (index) │ column_name      │ data_type │ numeric_precision │ numeric_scale │
├─────────┼──────────────────┼───────────┼───────────────────┼───────────────┤
│ 0       │ 'base_pay'       │ 'numeric' │ 10                │ 2             │
│ 1       │ 'bonuses'        │ 'numeric' │ 12                │ 2             │
│ 2       │ 'deductions'     │ 'numeric' │ 12                │ 2             │
│ 3       │ 'net_pay'        │ 'numeric' │ 10                │ 2             │
│ 4       │ 'reimbursements' │ 'numeric' │ 12                │ 2             │
│ 5       │ 'tips'           │ 'numeric' │ 12                │ 2             │
└─────────┴──────────────────┴───────────┴───────────────────┴───────────────┘
```

All four target columns are `numeric(12,2)`. `base_pay` and `net_pay` are untouched at `(10,2)`.

### `_prisma_migrations`

```
┌─────────┬───────────────────────────────────────────────────────┬─────────────────────┬──────────────────────────┬──────────────────────────┬──────────┐
│ (index) │ migration_name                                        │ applied_steps_count │ started_at               │ finished_at              │ checksum │
├─────────┼───────────────────────────────────────────────────────┼─────────────────────┼──────────────────────────┼──────────────────────────┼──────────┤
│ 0       │ '20260912120000_driver_pay_records_money_precision'   │ 1                   │ 2026-09-12T06:16:44.886Z │ 2026-09-12T06:16:45.057Z │ 'manual' │
│ 1       │ '20260912120100_support_ticket_foreign_keys_and_enum' │ 1                   │ 2026-09-12T06:16:45.208Z │ 2026-09-12T06:16:45.361Z │ 'manual' │
└─────────┴───────────────────────────────────────────────────────┴─────────────────────┴──────────────────────────┴──────────────────────────┴──────────┘
```

`applied_steps_count = 1` with `checksum = 'manual'` is `migrate.mjs`'s signature for a row it
actually executed — as distinct from the resolved-not-run markers (`applied_steps_count = 0`, real
SHA-256) that the audit found. Per DEC-17 the row was read back rather than assumed, and the
newest four rows confirm ordering:

```
20260912120100_support_ticket_foreign_keys_and_enum   1  manual
20260912120000_driver_pay_records_money_precision     1  manual
20260909120000_reconcile_rls_policy_drift             1  manual
20260902120000_seed_notification_email_config         1  manual
```

### Constraint definitions on staging (captured before Task 3 compared against them)

```
'SupportTicket_submittedBy_fkey' │ FOREIGN KEY ("submittedBy") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT
'SupportTicket_tenantId_fkey'    │ FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT
'TicketMessage_ticketId_fkey'    │ FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"(id) ON DELETE CASCADE
'SupportTicketType' oid=18394    │ {BUG,FEATURE_REQUEST,QUESTION,ACCOUNT_ISSUE,OTHER}
```

Staging already carried all three FKs and the enum from its own chain replay, so migration (b) was
a **no-op there** — which is exactly why Task 3 exists.

---

## 4. The orphan assertion queries and their outputs, all three candidate foreign keys

Production numbers are the audit's measurements, inlined in the plan; **production was not
contacted by this task at all**, not even for a `SELECT`.

### (a) `SupportTicket.tenantId` → `Tenant.id` — FK **created**

```sql
SELECT count(*) INTO orphan_count
FROM "SupportTicket" s
WHERE s."tenantId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = s."tenantId");
```

Output on staging, at apply time, from the migration's own `RAISE NOTICE`:

```
[NOTICE] SupportTicket.tenantId orphan check passed (0 rows).
```

Production (audit measurement): **0**. Safe. NULLs are exempt from an FK in any case.

### (b) `TicketMessage.ticketId` → `SupportTicket.id` — FK **created**

```sql
SELECT count(*) INTO orphan_count
FROM "TicketMessage" m
WHERE NOT EXISTS (SELECT 1 FROM "SupportTicket" t WHERE t."id" = m."ticketId");
```

Output on staging:

```
[NOTICE] TicketMessage.ticketId orphan check passed (0 rows).
```

Production (audit measurement): **0** across 4 `TicketMessage` rows. Safe.

### (c) `SupportTicket.submittedBy` → `User.id` — FK **deliberately NOT created**

```sql
SELECT count(*) INTO orphan_count
FROM "SupportTicket" s
WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."submittedBy");
```

Output on staging (staging holds 0 `SupportTicket` rows), verbatim from the migration's
`RAISE WARNING`:

```
[WARNING] SupportTicket_submittedBy_fkey was NOT created by this migration. Live orphan count on
this database: 0 SupportTicket row(s) whose "submittedBy" has no matching User. On production these
are 7 rows referencing the missing user f445daf9-c637-4d6d-b8cf-a0d507225145
(TKT-0001/0036/0037/0038/0044/0061/0067, all "tenantId" NULL). The column is NOT NULL so ON DELETE
SET NULL is unavailable, and NOT VALID would be a constraint nothing validates. A human must
decide: recreate the missing user, reassign those tickets, or make the column nullable. If this
count reads 0, a follow-up migration may add SupportTicket_submittedBy_fkey with
FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE.
```

Production (audit measurement): **7**. Not safe. See section 7.

---

## 5. The rolled-back creation-path proof (Task 3)

Staging already had all three objects before Task 2, so the apply proved only that the guards
**skip** correctly. This proves the branch that will actually run on production: **creation**.

A temporary `apps/web/scripts/_594-proof.mjs` opened one `pg.Client` against staging (asserting the
production ref absent and the staging ref present before connecting), attached a `notice` listener,
read both migration files from disk with `readFileSync` so the SQL executed was byte-identical to
the committed files, and ran the transcript below. **It was deleted afterwards** — see section 8.

```
Target assertion: staging ref present, production ref absent. OK.

=== PART A: support-ticket CREATION path, inside a transaction that is ROLLBACKed ===

1. BEGIN
2. Capture the pre-drop state
   SupportTicket_tenantId_fkey = FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT
   TicketMessage_ticketId_fkey = FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"(id) ON DELETE CASCADE
   SupportTicketType oid=18394 labels={BUG,FEATURE_REQUEST,QUESTION,ACCOUNT_ISSUE,OTHER}
   PASS  tenantId FK present before drop
   PASS  ticketId FK present before drop
   PASS  SupportTicketType present before drop

3. Drop the objects the migration is supposed to create
   dropped both foreign keys
   information_schema columns using the type: 0
   pg_depend non-internal dependents:         0
   ENUM BRANCH: DROP_AND_RECREATE (no dependents — the proof covers all THREE objects)
   PASS  SupportTicketType absent after drop (count 0)

4. Assert the dropped foreign keys are absent
   PASS  both foreign keys absent after drop (count 0)

5. Execute the committed migration file, read from disk, byte-identical
   [NOTICE] SupportTicket.tenantId orphan check passed (0 rows).
   [NOTICE] Created SupportTicket_tenantId_fkey.
   [NOTICE] TicketMessage.ticketId orphan check passed (0 rows).
   [NOTICE] Created TicketMessage_ticketId_fkey.
   [WARNING] SupportTicket_submittedBy_fkey was NOT created by this migration. Live orphan count on
   this database: 0 SupportTicket row(s) whose "submittedBy" has no matching User. On production
   these are 7 rows referencing the missing user f445daf9-c637-4d6d-b8cf-a0d507225145
   (TKT-0001/0036/0037/0038/0044/0061/0067, all "tenantId" NULL). ...

6. Assert the objects exist again with IDENTICAL definitions
   PASS  SupportTicket_tenantId_fkey definition matches EXACTLY: FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT
   PASS  tenantId FK carries ON DELETE RESTRICT ON UPDATE CASCADE
   PASS  TicketMessage_ticketId_fkey definition matches EXACTLY: FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"(id) ON DELETE CASCADE
   PASS  ticketId FK carries ON DELETE CASCADE
   PASS  SupportTicketType recreated by the migration
   PASS  enum labels identical: {BUG,FEATURE_REQUEST,QUESTION,ACCOUNT_ISSUE,OTHER}

7. Assert the RAISE WARNING names the omitted foreign key
   PASS  a notice mentions SupportTicket_submittedBy_fkey
   PASS  it is raised at WARNING severity

8. ROLLBACK

9. Fresh re-read after ROLLBACK — staging must be byte-identical to how it started
   PASS  SupportTicket_tenantId_fkey unchanged: FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT
   PASS  TicketMessage_ticketId_fkey unchanged: FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"(id) ON DELETE CASCADE
   PASS  SupportTicketType present with its ORIGINAL oid 18394
   PASS  enum labels unchanged: {BUG,FEATURE_REQUEST,QUESTION,ACCOUNT_ISSUE,OTHER}
   PASS  _proof_594 does not exist
   (staging still carries SupportTicket_submittedBy_fkey from its own chain replay: FOREIGN KEY ("submittedBy") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT)
   (it was never dropped or created by this proof — the migration does not touch it)
```

### Which enum branch ran

**`DROP_AND_RECREATE`.** Both dependency checks returned 0 — `information_schema.columns` where
`udt_name = 'SupportTicketType'` found no column, and `pg_depend` found no non-internal dependent
outside `pg_type`. That is because `20260309000001` dropped `SupportTicket."type"`, and dropping a
column removes the dependency on its type. So the live type could be dropped and recreated inside
the transaction, and **the proof covers all three objects**, not two. The scratch-schema
(`_proof_594`) fallback was written and was **not** needed; the post-rollback assertion confirms
`_proof_594` does not exist.

The `oid` is the tightest evidence that the rollback restored the original object rather than
leaving the migration's copy behind: 18394 before, 18394 after.

### Part B — the loss-assertion predicate is shown to fire

Staging's columns cannot hold a sub-cent value either before `(8,2)` or after `(12,2)`, and
production is not ours to test on, so the predicate was extracted **verbatim from the committed
migration file** by regex and driven against a `numeric(65,30)` fixture shaped like production,
inside its own `BEGIN … ROLLBACK`.

**State plainly: this exercises the *predicate*, not the migration file.** The migration itself was
not run against the fixture; the bytes of its `WHERE` clause were.

The query, exactly as extracted from `20260912120000_.../migration.sql`:

```sql
SELECT count(*) FROM _594_money_fixture
WHERE (bonuses        IS NOT NULL AND (bonuses        <> round(bonuses,        2) OR abs(bonuses)        >= 10^10))
   OR (tips           IS NOT NULL AND (tips           <> round(tips,           2) OR abs(tips)           >= 10^10))
   OR (deductions     IS NOT NULL AND (deductions     <> round(deductions,     2) OR abs(deductions)     >= 10^10))
   OR (reimbursements IS NOT NULL AND (reimbursements <> round(reimbursements, 2) OR abs(reimbursements) >= 10^10))
```

Fixture: `CREATE TEMP TABLE _594_money_fixture (label text, bonuses/tips/deductions/reimbursements
numeric(65,30)) ON COMMIT DROP`, holding
`('clean', 100.25, 0, 0, 160.00)`, `('sub-cent', 12.005, 0, 0, 0)`, `('overflow', 0, 10000000000.00, 0, 0)`.

Output:

```
   rows the predicate flags across the 3-row fixture: 2
   PASS  the predicate FIRES: it flags the sub-cent row and the overflow row (2)
   rows flagged when the fixture holds only representable values: 0
   PASS  counter-assertion: the predicate does NOT fire on values (12,2) can hold
   PASS  the fixture transaction was rolled back — temp table gone

=== ENUM BRANCH TAKEN: DROP_AND_RECREATE (no dependents — the proof covers all THREE objects) ===
=== ALL ASSERTIONS PASSED. Staging is byte-identical to how it started. ===
EXIT=0
```

The counter-assertion is there because a guard that only proves it fires is satisfied by a
predicate that always fires — which would abort the migration on the very production it exists to
repair.

---

## 6. Does the chain still replay from zero?

**Stated as truth rather than as a claim: a from-zero replay was NOT tested.**

What *is* established:

- Both directories sort after `20260909120000_reconcile_rls_policy_drift`
  (`20260912120000…` then `20260912120100…`), so `migrate.mjs`'s `readdirSync().sort()` ordering is
  intact and neither file can run before the tables it touches exist.
- Every statement in both files is individually guarded — `information_schema` for the four column
  types, `pg_constraint` for the two FKs, `DO … EXCEPTION WHEN duplicate_object` for the enum — so
  a replay that reaches them with the objects already present is a no-op, and `migrate.mjs`'s
  second run confirmed the applier skips them by name.
- No existing migration file was edited, so no previously-replayed step changed.

On that basis a replay is **expected** to succeed. It was not demonstrated, because there is no
local database (DEC-3) and the one staging project already carries the full chain — replaying from
zero would mean dropping and rebuilding it, which is outside this task's remit.

---

## 7. OUTSTANDING BLOCKER — needs a human data decision

> **`SupportTicket_submittedBy_fkey` is deliberately NOT created, and it is the single outstanding
> item this task could not close.**

Production holds **7** `SupportTicket` rows whose `submittedBy` points at a `User` id that does not
exist:

| | |
|---|---|
| Missing user id | `f445daf9-c637-4d6d-b8cf-a0d507225145` |
| Tickets | TKT-0001, TKT-0036, TKT-0037, TKT-0038, TKT-0044, TKT-0061, TKT-0067 |
| Span | 2026-03-28 → 2026-07-17 |
| `tenantId` on all 7 | NULL |
| Column nullability | `NOT NULL` |

Why it is not in the migration:

- `ON DELETE SET NULL` is not available — the column is `NOT NULL`.
- `NOT VALID` is not the answer — a constraint nothing ever validates is a comment that looks like
  a control.
- Including it would make the **whole** migration abort on production, and the two safe foreign
  keys would never land. The repair would fail closed on the 87 tickets it can actually protect.

The three options, any of which is a human call, not an executor's:

1. **Recreate the missing user** — if the id can be identified from Supabase Auth or a backup,
   restore the `User` row and the FK becomes addable unchanged.
2. **Reassign the 7 tickets** to a real `User` (a sysadmin placeholder, say), accepting that the
   original submitter is lost from the record.
3. **Make `submittedBy` nullable** and null the 7, then add the FK with `ON DELETE SET NULL` — a
   `schema.prisma` change with code consequences at every read site, so the largest of the three.

The follow-up migration it would need, once the orphan count reads 0:

**`20260912120200_support_ticket_submitted_by_fkey`** — a single guarded
`ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
preceded by the same orphan assertion. The already-shipped migration's closing `RAISE WARNING`
recomputes the live count on every apply and says so, so whoever runs the repair on production will
see the real number at that moment rather than trusting this document's.

---

## 8. Safety — what was and was not touched

- **Production `oqdhberkghtnszrkdvfm` was never written, and was never even read.** Every
  production number in this summary comes from `docs/audits/ledger-integrity.md` via the plan. No
  command in this session opened a connection to it.
- **No forbidden command was issued.** No `prisma migrate deploy`, `migrate dev`, `migrate resolve`,
  `db push`, Supabase `apply_migration`, or DDL-bearing `execute_sql`. The only Prisma commands run
  were `validate` and `generate`, neither of which connects.
- **No existing migration file was edited**, including `20260303000001`.
- **No package was installed.** `pg` already resolves from `apps/web/node_modules`.
- **The temporary proof script was deleted.** `apps/web/scripts/_594-proof.mjs` no longer exists
  (`ls` → "No such file or directory"), and `git status --porcelain apps/web` shows no untracked
  file under `apps/web` other than the two intended new migration directories. Its full output is
  pasted in section 5 instead.

---

## 9. Deviations from plan

**1. [Rule 3 — repo convention] The commit includes the regenerated Prisma client artifacts.**

- **Found during:** Task 3, staging the commit.
- **Issue:** `npx prisma generate` (required by Task 1's verify) rewrites `apps/web/src/generated/prisma/`,
  which **is tracked in this repo** — prior schema commits (`quick-534`, `phase-9`, `phase-10`)
  include it. The plan's verify asks for "exactly the four intended files".
- **Decision:** Include them. Leaving them modified-but-uncommitted would (a) leave the tracked
  generated mirror disagreeing with `schema.prisma`, and (b) leave a dirty working tree, which is
  the standing `vercel --prod` ships-the-working-directory hazard. The diff is mechanical: the
  inlined schema string and its content hash, plus CRLF-only churn on two files.
- **Files:** `apps/web/src/generated/prisma/{edge.js,index.js,index-browser.js,index.d.ts,package.json,schema.prisma}`

**2. [Plan instruction over generic protocol] One commit, not three.**

The plan's Task 3 specifies a single commit carrying both migrations, `schema.prisma` and this
summary, and its verify asserts `git log -1 --stat` shows them together. Tasks 1 and 2 produced no
independently committable state in between (Task 2 modifies no repo file), so the per-task commit
protocol was superseded by the plan's own instruction.

**3. [Rule 2 — added safety, not in the plan] `PG_CONNECT_TIMEOUT_MS=30000` on the applier runs.**

`src/lib/db/prisma.ts` defaults `connectionTimeoutMillis` to 5000 and documents that this is
marginal from a developer machine on port 5432. The variable exists precisely so scripts can raise
it without changing what production uses; no deployed code sets it. It affects only the spawned
seeder's connection timeout, nothing else.

**4. [Repo convention] The commit also carries `594-PLAN.md`.**

The plan file was untracked at execute time. 590 quick-task `PLAN.md` files are tracked in this
repo, so leaving it out would have lost it from history. It is committed alongside its summary.

Nothing else deviated. No architectural decision was needed.

---

## Self-Check: PASSED

- `apps/web/prisma/migrations/20260912120000_driver_pay_records_money_precision/migration.sql` — FOUND
- `apps/web/prisma/migrations/20260912120100_support_ticket_foreign_keys_and_enum/migration.sql` — FOUND
- `apps/web/prisma/schema.prisma` — FOUND, 4 fields annotated
- `.planning/quick/594-close-two-latent-schema-defects-driver-p/594-SUMMARY.md` — FOUND
- `git status --porcelain apps/web/prisma/migrations` lists only the two new directories as additions — no existing migration modified
- `grep -rn 'ADD CONSTRAINT "SupportTicket_submittedBy_fkey"'` on the new ticket migration returns nothing
