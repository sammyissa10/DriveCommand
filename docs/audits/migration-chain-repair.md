# Migration chain repair log

**Phase 0, quick-593.** Making the chain replay from zero against
`drivecommand-staging` (`wyixpgunnjmzguhggocz`). Companion to
[`staging-environment.md`](./staging-environment.md), which found the first
failure.

- **Started:** 2026-09-12
- **Baseline confirmed before starting:** staging held **37** applied
  migrations, **0** unfinished ledger rows and **38** tables in `public`, last
  applied `20260329000001_add_load_sequence`. No drift from what quick-592
  recorded.
- **Repair budget:** 10 cycles, then stop and report regardless.
- **Production is read-only in this task.** Every column definition below was
  read from `information_schema` / `pg_constraint` on `oqdhberkghtnszrkdvfm`
  and is quoted verbatim. Nothing was inferred from `schema.prisma`.

> **The count of rows in the table below is the finding.** Each row is one
> object that exists in production and in `schema.prisma` but that no migration
> in this repository creates.

---

## Repairs

| # | Failing migration | Object missing | Production's definition | Repair file |
|---|---|---|---|---|
| 1 | `20260331000000_add_composite_indexes` | `"Document"."driverId"` | `uuid`, `is_nullable=YES`, `column_default=NULL`, `is_identity=NO`, `is_generated=NEVER`; FK `Document_driverId_fkey FOREIGN KEY ("driverId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL` | `20260330000001_repair_document_driver_id` |

---

## Cycle log

### Cycle 1 — `Document.driverId`

**Failure**

```
Applying migration: 20260331000000_add_composite_indexes
  Failed: 20260331000000_add_composite_indexes: column "driverId" does not exist
Migration error: column "driverId" does not exist
```

The offending statement is the third in that file:

```sql
CREATE INDEX IF NOT EXISTS "Document_tenantId_driverId_idx"
  ON "Document" ("tenantId", "driverId");
```

**Why the object was missing**

`Document` is created by `20260214000004_add_document_model` with the columns
`id, tenantId, truckId, routeId, fileName, s3Key, contentType, sizeBytes,
uploadedBy, createdAt, updatedAt` and no `driverId`. A repository-wide search
for a migration adding it returns nothing:

```
grep -rn 'ADD COLUMN[^;]*driverId' prisma/migrations   ->   no matches
```

`schema.prisma` declares it regardless, with two indexes on it, and production
has the column. It was added to production out of band with no migration file
written.

**Production's definition, read 2026-09-12, read-only**

`information_schema.columns`:

| column_name | data_type | udt_name | is_nullable | column_default | char_max_len | is_identity | is_generated |
|---|---|---|---|---|---|---|---|
| `driverId` | `uuid` | `uuid` | `YES` | `NULL` | `NULL` | `NO` | `NEVER` |

`pg_get_constraintdef`:

```
Document_driverId_fkey
  FOREIGN KEY ("driverId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL
```

**Repair written:** `20260330000001_repair_document_driver_id`

Sorts between the last applied migration (`20260329000001`) and the failing one
(`20260331000000`) under the lexicographic `readdirSync().sort()` that
`migrate.mjs` uses.

**Why it is a no-op against production**

- The column already exists there, so `ADD COLUMN IF NOT EXISTS` does nothing.
  Established by the `information_schema` read above returning a row.
- The constraint already exists there, so the guarded `ADD CONSTRAINT` does
  nothing. Established by the `pg_constraint` read above returning a row.
  `ADD CONSTRAINT` has no `IF NOT EXISTS` in PostgreSQL, so the guard is a
  `DO` block testing `pg_constraint` rather than a bare statement.

**Result:** not yet run. See the status note below.

---

## Status

**BLOCKED before cycle 1 could run — zero cycles executed.** The repair budget
of 10 is untouched, so the count of rows above is not yet the finding it is
meant to be; it is one known failure, not a measured total.

Two separate causes, both credential-related and neither a chain problem:

1. **The password was lost with the scratchpad.** It lived only in a temporary
   file outside the repository, which was deleted between sessions.
2. **The replacement value was placeholder text.** The next attempt received
   the literal string `PASTE_PASSWORD_HERE`, which failed authentication on
   both 5432 and 6543. Diagnosed without printing the secret: the value was 19
   characters drawn only from `[A-Z_]`, which is not the shape of a
   Supabase-generated password, and it then matched a known placeholder
   exactly. A field-based connection, bypassing URL encoding entirely, failed
   identically, which ruled out an encoding fault in the connection string.

### What changed so this cannot recur

`apps/web/.env.staging` now exists and is gitignored, holding both `postgres`
keys with the correct host, ports and pooler conventions:

| Key | Role | Port | Mode |
|---|---|---|---|
| `STAGING_DATABASE_URL` | `postgres` | 6543 | transaction, `?pgbouncer=true` |
| `STAGING_DIRECT_URL` | `postgres` | 5432 | session |

The password segment of both is the literal token `PASSWORD_NOT_SET`. That is
deliberate: the file persists everything that is knowable, and the one unknown
is named rather than faked, so the strings fail loudly instead of looking
usable and failing for a reason that is hard to place.

`STAGING_DATABASE_URL_APP_USER` is absent rather than tokenised, because the
role genuinely does not exist yet; its migration sits past the chain failure.

Note the host: staging is on `aws-0-us-west-1.pooler.supabase.com`, **not** the
`aws-1` cluster that serves production. Connecting to `aws-1` with the staging
tenant returns `tenant/user postgres.wyixpgunnjmzguhggocz not found`, which is
easy to misread as a credential problem.

### Correction to a standing note

Project memory records a hook that fires on every `migration.sql` write and
runs `prisma migrate deploy`. **No such hook is configured.** The only hook
present is a GSD session-start update check, in the user-level settings. This
was checked deliberately before writing any migration file, because such a hook
would have applied repair migrations to production, which this task forbids.
The note is stale.
