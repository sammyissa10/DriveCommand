# Migration chain repair log

**Phase 0, quick-593.** Making the chain replay from zero against
`drivecommand-staging` (`wyixpgunnjmzguhggocz`). Companion to
[`staging-environment.md`](./staging-environment.md), which found the first
failure.

- **Date:** 2026-09-12
- **Baseline confirmed before starting:** staging held **37** applied
  migrations, **0** unfinished ledger rows and **38** tables in `public`, last
  applied `20260329000001_add_load_sequence`. No drift from quick-592.
- **Repair budget:** 10 cycles. **7 used.**
- **Outcome: THE CHAIN NOW REPLAYS FROM ZERO.** `Migrations complete`, exit 0.
- **Production is read-only in this task.** Every definition below was read
  from `information_schema` / `pg_constraint` / `pg_indexes` / `pg_type` /
  `_prisma_migrations` on `oqdhberkghtnszrkdvfm` and is quoted verbatim.
  Nothing was inferred from `schema.prisma`.

> **The count of rows in the table below is the finding: SEVEN defects, of
> FOUR distinct kinds, stood between this repository and its own database.**

---

## Repairs

| # | Failing migration | Kind | What was wrong | Production's definition | Fix |
|---|---|---|---|---|---|
| 1 | `20260331000000_add_composite_indexes` | missing column | `"Document"."driverId"` created by no migration | `uuid`, nullable, no default; FK to `"User"(id)` `ON UPDATE CASCADE ON DELETE SET NULL` | `20260330000001_repair_document_driver_id` |
| 2 | `20260417100001_add_vehicle_id_display_name` | **invalid SQL** | `ROW_NUMBER() OVER (…)` inside `UPDATE … SET`; never executable anywhere | `carrier_trucks.vehicle_id varchar(50) NOT NULL`; `display_name varchar(200)` nullable | **file edited** (exemption, see below) |
| 3 | `20260419100001_add_dispatch_id_read_at_to_fleet_message` | missing column | `"FleetMessage"."recipientId"` created by no migration | `uuid`, nullable, no default; **no FK** | `20260419000001_repair_fleet_message_recipient_id` |
| 4 | `20260515000001_db_security_standardization` | missing table | `carrier_compliance_alert_log` created by no migration | 7 columns, PK on `id`, no FK, plus 2 indexes no migration creates | `20260515000000_repair_carrier_compliance_alert_log` |
| 5 | `20260516100001_restricted_documents` | missing enum type | type `"DocumentType"` created by no migration | 12 labels, of which the chain adds 8 | `20260516100000_repair_document_type_enum` |
| 6 | `20260516100002_restricted_documents_column` | missing column | `"Document"."documentType"` created by no migration | `DocumentType`, nullable, no default | `20260516100001a_repair_document_document_type_column` |
| 7 | `20260602000001_phase1_grant_app_user_dml` | missing grant | self-check failed: `TicketMessage` granted by no migration | `app_user` holds `DELETE, INSERT, SELECT, UPDATE` | `20260602000000_repair_ticketmessage_app_user_grant` |

**Four kinds, not one.** A missing column (1, 3, 6), a missing table (4), a
missing type (5), a missing grant (7) — and one migration that was never valid
SQL (2). Only the first three kinds are what "repair the chain" usually means.

**Every repair is a no-op against production**, and each was proved so by
reading the object back from production *before* writing the migration. Per
repair:

| Repair | Guard | Why it is provably a no-op |
|---|---|---|
| 1 | `ADD COLUMN IF NOT EXISTS` + `DO` block over `pg_constraint` | `information_schema` returned the column; `pg_get_constraintdef` returned the FK. `ADD CONSTRAINT` has no `IF NOT EXISTS`, hence the block |
| 3 | `ADD COLUMN IF NOT EXISTS` | `information_schema` returned the column. `pg_constraint` returned **zero** rows, so no FK is created — unlike repair 1 |
| 4 | `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` ×2 | table and both indexes already present in `pg_tables` / `pg_indexes` |
| 5 | `DO` block over `pg_type` | type present in `pg_type`. `CREATE TYPE` has no `IF NOT EXISTS`, hence the block |
| 6 | `ADD COLUMN IF NOT EXISTS` | `information_schema` returned the column |
| 7 | plain `GRANT` | `GRANT` is idempotent in PostgreSQL; re-granting a held privilege changes nothing. `role_table_grants` shows all four already held |

---

## The one edited file (exemption granted for it alone)

`20260417100001_add_vehicle_id_display_name` contained:

```sql
SET "vehicle_id" = 'VH-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
      LPAD((ROW_NUMBER() OVER (ORDER BY "created_at"))::TEXT, 5, '0')
```

PostgreSQL rejects a window function in `UPDATE … SET` at parse-analysis,
independent of data or schema, so **no forward migration could repair it**: the
error is raised before any data is touched.

**Production's ledger row, quoted in full, read read-only on 2026-09-12 — this
is what justified the exemption:**

```
id                  : 386d3de8-8366-4d8b-9220-718b9f95c2f2
migration_name      : 20260417100001_add_vehicle_id_display_name
checksum            : e533292ebf01dff720f70892f4780cc96eb01867b9224b2c22e173c76838ccee
applied_steps_count : 0
logs                : ''            (empty string)
rolled_back_at      : NULL
started_at          : 2026-04-19 18:14:30.170903+00
finished_at         : 2026-04-19 18:14:30.170903+00
duration            : 00:00:00
```

`applied_steps_count = 0`, empty logs and zero duration are the signature of a
hand-mirrored **resolved-not-run** row (DEC-17). Rows `migrate.mjs` actually
executed carry `applied_steps_count = 1` and the literal checksum `manual`;
this one carries a real SHA-256, the mirrored form. The equivalent change
reached production by another route entirely — the Supabase ledger holds
`20260418184001_add_vehicle_id_display_name_to_carrier_trucks`.

So the file has never executed against anything, and editing it cannot change
production or rewrite history that happened.

**The change was the minimum that makes it valid**: the window function became
a correlated subquery. The two guarded `ADD COLUMN` lines, the second `UPDATE`,
the `SET NOT NULL` and the unique index are untouched and unreformatted. The
subquery orders on `("created_at", "id")` rather than `"created_at"` alone
because `COUNT(*)` assigns *equal* ranks to ties, which would produce duplicate
`vehicle_id` values and fail the unique index created at the end of the same
file; `ROW_NUMBER()` broke such ties arbitrarily. `id` is the uuid primary key,
so the pair is a strict total order. The full justification is in the file's
header comment, including the ledger row above.

**This exemption covers one file. If a later cycle presents the same kind, it
stops and asks again** — that is written into the file header too.

---

## Final state

| | Production | Rebuilt staging |
|---|---|---|
| `_prisma_migrations` rows | 141 | **147** |
| Migration directories in repo | — | **147** |
| Unfinished ledger rows | — | **0** |
| Tables in `public` | 98 | **98** |
| `app_user` exists | yes | yes |
| `app_user` `rolcanlogin` | **true** | **false** |
| `app_user` `rolsuper` / `rolbypassrls` | false / false | false / false |

147 = the original 141 plus the 6 repair migrations. The repo's migration
directory count matches the staging ledger exactly, so nothing was skipped and
no ledger row was hand-inserted.

The `rolcanlogin` difference is not new: it is the finding already recorded in
`staging-environment.md` §5. The chain creates `app_user` `NOLOGIN`; production's
login grant was applied out of band and is still not in the chain.

`migrate.mjs` also ran its post-step, `seed-starter-playbooks.ts`, which
reported `Seeding starter playbooks for 0 tenant(s)` — correct for an unseeded
database, and it ran against staging, not production, because both
`DATABASE_URL` and `DIRECT_URL` were set inline to the staging string.

---

## Schema diff: rebuilt staging against production

Compared by query on both sides, never by eye. Per-table column-set signatures
were computed in SQL (`md5(string_agg(column_name …))`) and the sets differenced
programmatically.

### Tables

| | |
|---|---|
| Tables compared | 99 (union) |
| In production, **missing from the rebuild** | **`grid_preference`** |
| In the rebuild, not in production | `policy_drop_audit` |

- **`grid_preference` is an eighth out-of-band object.** No migration creates
  it; it appears in the repository only inside the allowlist of
  `20260602000001_phase1_grant_app_user_dml`, which is a list of *names* and so
  never required the table to exist. That is exactly why it never caused a
  failure, and why only a diff could find it. It carries 11 columns.
- **`policy_drop_audit` is expected.** It is created by
  `20260909120000_reconcile_rls_policy_drift`, quick-591's migration, which
  production's ledger does not contain. Its absence from production is correct.

### Columns

With the audit columns of both casings excluded (`createdBy`, `updatedBy`,
`deletedBy`, `deletedAt`, `created_by`, `updated_by`, `deleted_by`,
`created_by_id`, `updated_by_id`, `deleted_by_id`, `deleted_at`), **91 of 97
shared tables match exactly**. Six do not, and in every case it is production
holding a column the rebuild lacks:

| Table | Columns production has that the rebuild lacks |
|---|---|
| `ActivationProgress` | `congratsShownAt` |
| `Document` | `description`, `expiryDate`, `externalUrl`, `loadId`, `notes` |
| `DriverInvitation` | `address`, `dateOfBirth`, `fullName`, `licenseExpirationDate`, `middleName`, `phoneNumber` |
| `FleetMessage` | `isBroadcast`, `loadId` |
| `PayrollRecord` | `archivedAt`, `createdById`, `updatedById` |
| `SupportTicket` | `attachmentKey`, `attachmentUrl`, `platform`, `screenshotKey` |

**21 columns across 6 tables, plus one whole table.** None of them broke the
chain, because nothing in the chain references them — they are out-of-band
additions that only a schema comparison reveals. `FleetMessage.isBroadcast` is
worth singling out: `CLAUDE.md` documents it as part of the owner-to-driver
messaging model, and no migration creates it.

### The opposite direction

Staging carries the four camelCase audit columns (`createdBy`, `updatedBy`,
`deletedAt`, `deletedBy`) on many tables where production does not. Production
holds only 30 such columns in total, across 6 tables. These come from the
TKT-0015 audit-column migrations, which the chain applies and whose effect is
largely absent from production.

`carrier_compliance_alert_log` is the clearest instance and was predicted in
repair 4's header before the diff confirmed it: `20260515000001` adds
`created_by`, `updated_by`, `deleted_at`, `deleted_by` to that table and its
production ledger row shows `applied_steps_count = 1`, yet production has only
the 7 original columns. The most likely explanation is that the table was
dropped and recreated out of band after the migration ran. Repair 4
deliberately creates the 7 columns production actually has rather than the 11
the chain implies, because the instruction was to match production's real
definition; the chain then adds the other four to staging.

---

## What this means

The headline is not that seven defects were fixed. It is that **production and
this repository describe different databases, and neither is a superset of the
other.**

- The repository could not build production: 7 defects blocked it outright, and
  a further 21 columns and 1 table are still missing after all of them are
  fixed.
- Production is missing things the repository would have given it: the audit
  columns from the TKT-0015 migrations, most visibly on
  `carrier_compliance_alert_log`.
- At least two migrations in the chain have **never executed anywhere** and are
  recorded in production as resolved-not-run markers, one of which was not even
  valid SQL.

The 21 columns and `grid_preference` are **reported, not fixed**. Closing them
means writing eight more repair migrations against production definitions, and
that was beyond this task's remit of making the chain replay. They are listed
above in the form a follow-up would need.

---

## Notes carried forward

### `.env.staging`

`apps/web/.env.staging` is gitignored and holds both `postgres` keys. Staging is
on `aws-0-us-west-1.pooler.supabase.com`, **not** production's `aws-1`;
connecting to `aws-1` with the staging tenant returns
`tenant/user postgres.wyixpgunnjmzguhggocz not found`, which reads like a
credential fault and is not one.

**One defect left for the owner, deliberately not touched:** the two keys carry
**different** passwords. `STAGING_DIRECT_URL` authenticates successfully on both
5432 and 6543 and is what every step of this task used.
`STAGING_DATABASE_URL` holds a different value and was not tested. It should be
reconciled before Prompt 2 uses the transaction-mode key.

### Correction to a standing note

Project memory records a hook that fires on every `migration.sql` write and
runs `prisma migrate deploy`. **No such hook is configured** — only a GSD
session-start update check, in the user-level settings. This was verified
deliberately before writing the first migration file, because such a hook would
have applied all six repairs straight to production. The note is stale and
should be deleted.
