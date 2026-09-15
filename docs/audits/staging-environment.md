# Staging environment — the Phase 0 verification target

**Phase 0, quick-592.** Companion to
[`branch-viability.md`](./branch-viability.md), which ruled out preview
branches, and to `.planning/phase-0-revised.md` §3.6 and §3.7.

- **Date:** 2026-09-11
- **Project:** `drivecommand-staging`, ref `wyixpgunnjmzguhggocz`
- **Region:** `us-west-1` (same as production)
- **Postgres:** 17.6.1.166
- **Pooler host:** `aws-0-us-west-1.pooler.supabase.com` — **not** the
  `aws-1` cluster that serves production. Verified by connecting to both;
  `aws-1` answers `tenant/user postgres.wyixpgunnjmzguhggocz not found`.

> **STATUS: BLOCKED — the migration chain cannot replay from scratch.**
> The project exists and seeding was attempted with the repo's own applier.
> It stopped at migration **38 of 141** on a defect in the chain itself, not a
> staging problem. See §2. Every section marked **PENDING** is blocked behind
> that failure, and nothing here is asserted from expectation.

---

## 1. Why a second project rather than a preview branch

Established in `branch-viability.md` and summarised in §3.6 of the plan: a
preview branch came up with **zero tables in `public`** against production's 98,
because Supabase seeds a branch from its own 36-entry migration ledger, which
has no baseline. This repo's authoritative ledger is `_prisma_migrations` (141
rows), written only by `scripts/migrate.mjs`.

This project is therefore seeded by running that same applier, from
`00000000000000_init` forward. That run is what surfaced §2.

---

## 2. THE FINDING — `Document.driverId` is in no migration

The seed run stopped here:

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

### Root cause, established rather than inferred

| Fact | Evidence |
|---|---|
| `Document` is created **without** a `driverId` column | `20260214000004_add_document_model/migration.sql` — column list is `id, tenantId, truckId, routeId, fileName, s3Key, contentType, sizeBytes, uploadedBy, createdAt, updatedAt` |
| **No migration anywhere adds it** | `grep -rn 'ADD COLUMN[^;]*driverId' prisma/migrations` returns nothing. The only migration mentioning `Document` and `driverId` together is the one that indexes it |
| `schema.prisma` **declares** it | `Document.driverId String? @db.Uuid`, plus `@@index([driverId])` and `@@index([tenantId, driverId])` |
| **Production has it** | `information_schema.columns` → `driverId`, `uuid`, nullable |
| Staging does not | same query on staging → zero rows |

So the column was added to production **out of band**, `schema.prisma` was
updated to match, and no migration file was ever written. The index migration
therefore succeeded on production, where the column already existed, and fails
on any database rebuilt from the repo.

**This is a real defect in the migration chain: the repository cannot rebuild
its own database from scratch.** It is the same family as DEC-17 and as §5's
`app_user` login grant — live database state that no migration records — and it
is exactly what standing up a second project was meant to expose. A preview
branch could never have found it, because a branch never gets far enough to run
this migration.

> **Extended 2026-09-15 (quick-604).** The `Document` drift is **five columns wider** than the
> `driverId` case below. `driverId` has since been added to staging; `expiryDate`, `externalUrl`,
> `loadId`, `notes` and `description` all exist on **production** and in `schema.prisma` and are
> **absent from staging**, with both databases carrying the same **156** ledger rows.
> `expiryDate` and `externalUrl` appear in **zero** migration files at all. The driver documents
> page orders by `expiryDate` and therefore 500s on staging with `P2022 ColumnNotFound`. **No
> migration was written** — quick-604 measures and does not fix. See
> `staging-app-user-end-to-end.md` §7e.

### Scope is not yet known

This is the **first** failure, at position 38 of 141. Whether more gaps sit
behind it cannot be determined without fixing this one and re-running, and the
task's standing instruction is to stop on a failure rather than work around it.
Editing the failing migration, skipping it, hand-inserting a ledger row or
switching appliers were all excluded and none were done.

### State left on staging

| | Value |
|---|---|
| Migrations applied | **37** of 141 |
| Last applied | `20260329000001_add_load_sequence` |
| Ledger rows with `finished_at IS NULL` | **0** — the failed migration rolled back cleanly |
| Tables in `public` | **38** (production: 98) |

`migrate.mjs` wraps each migration in `BEGIN`/`COMMIT`, so the failure left no
partial migration and no unfinished ledger row. The database is a clean
prefix of the chain and re-running will resume at the failing migration.

The applier threw before reaching its post-run step, so
`seed-starter-playbooks.ts` never ran — on staging or anywhere else.

### Suggested fix, not applied

Add a migration that creates the column, sorting **before**
`20260331000000_add_composite_indexes`, with `IF NOT EXISTS` so it is a no-op
against production:

```sql
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "driverId" UUID;
-- plus the FK to "User"(id) that schema.prisma's `driver` relation implies
```

That is a change to the migration chain and therefore a decision for Prompt 1
rather than for this task.

---

## 3. The seed run must set BOTH connection variables

`scripts/migrate.mjs` does not only apply migrations. On success it spawns a
second writer:

```
scripts/migrate.mjs:88          spawnSync('npx', ['tsx', scriptPath], { env: process.env })
scripts/seed-starter-playbooks.ts:1   imports ../src/lib/db/prisma
src/lib/db/prisma.ts:45         connectionString: process.env.DATABASE_URL
```

The applier itself reads `DIRECT_URL`; the playbook seeder it spawns reads
**`DATABASE_URL`**. Repointing only `DIRECT_URL` would apply migrations to
staging and then write starter playbooks into **production**.

Both were therefore set inline on the run, to the same staging session-mode
string. Verified as safe: nothing in that import chain loads a `.env` file, and
no `dotenv` call in `src` or `scripts` uses `override: true`, so inline values
are not replaced by `.env.local`.

**Values used, password masked:**

```
DATABASE_URL = postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres
DIRECT_URL   = postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres
production ref present in either: no
```

Both carry the staging ref `wyixpgunnjmzguhggocz`. Production is
`oqdhberkghtnszrkdvfm` and appears in neither. The runner that builds these
refuses outright if the production ref appears, and the password is read from a
file outside the repo so it never reaches a command line.

---

## 4. Compute tier — staging and production differ, and it affects Prompt 2

Measured by SQL on both projects:

| | Production | Staging |
|---|---|---|
| `max_connections` | 60 | 60 |
| `shared_buffers` | 224MB | 256MB |

Reported from the Supabase dashboard, not verifiable from SQL or any MCP tool:

| | Production | Staging |
|---|---|---|
| Compute tier | Nano | Micro |
| Supavisor pool size | 30 | **15** |
| Max client connections | 200 | 200 |

**Consequence for Prompt 2's capacity measurement.** §3.7 makes connection
capacity the central risk of the cutover, because session mode holds a server
connection for the life of the client connection while Vercel scales lambda
instances independently. That measurement does **not** transfer directly
between these two projects: a saturation point found against a pool of 15 is
not the saturation point of a pool of 30.

The Postgres-side ceiling is the same on both at 60, so what differs is the
Supavisor pool in front of it, and the pool is the smaller of the two numbers
and therefore the binding one. Note the direction is counterintuitive — the
larger compute tier carries the *smaller* pool — so this is a difference to
correct for deliberately rather than one that happens to be conservative.
Any figure Prompt 2 produces must state which pool size it was measured against.

---

## 5. `app_user` — created NOLOGIN, and production's state is not reproducible

The migration chain creates the role without login:

```sql
-- prisma/migrations/20260515000001_db_security_standardization/migration.sql:21
CREATE ROLE app_user NOLOGIN;
```

Production, read live from `pg_roles`:

| role | `rolcanlogin` | `rolsuper` | `rolbypassrls` |
|---|---|---|---|
| `app_user` | **true** | false | false |
| `postgres` | true | false | **true** |

**So production's `app_user` can log in, and nothing in the migration chain
grants that.** The login grant was applied out of band, which means the role's
production state is not reproducible from migrations alone. A fresh project
seeded from this repo produces an `app_user` that **cannot connect at all**.

Two consequences worth separating:

- **For this environment.** Step 5's "set a password" is insufficient on its
  own. Staging needs `ALTER ROLE app_user WITH LOGIN PASSWORD …`, after which
  `pg_roles` is re-read to confirm the login grant did not also widen
  `rolsuper` or `rolbypassrls`. Without `LOGIN` the Supavisor probe in §6 would
  fail for a reason that has nothing to do with Supavisor.
- **For production.** This is the same class as §2: live database state that no
  migration records. Anyone rebuilding production from this repo gets a role
  that cannot be connected to, and would likely conclude the cutover was
  misconfigured rather than that the grant was never in the chain.

**Staging `app_user` status: ABSENT** — `pg_roles` has no such role, because the
migration that creates it (`20260515000001`) sits well past the failure in §2.

---

## 6. Supavisor accepting a non-`postgres` role — PENDING

Supavisor addresses tenants as `<role>.<project_ref>`, so `app_user` would
connect as `app_user.wyixpgunnjmzguhggocz`. Whether Supavisor accepts a
non-`postgres` role is **unverified on any project** and is called out in §3.7
as something that must be confirmed before the production cutover rather than
during it. It remains unverified: the role does not exist on staging yet.

What **is** now established is that Supavisor's tenant format works as
documented for a non-default project: `postgres.wyixpgunnjmzguhggocz`
authenticated successfully on `aws-0-us-west-1.pooler.supabase.com:5432`. That
confirms the address shape and the host, and says nothing about the role.

If the probe is eventually rejected, that is a finding that blocks Prompt 2's
production cutover, to be reported with the exact error and the username
attempted. Two responses are excluded: retrying on the direct
`db.<ref>.supabase.co` host and calling the question answered, because
production's cutover runs through Supavisor and the direct host answers a
different question; and falling back to `postgres`, which abandons the thing
being tested.

---

## 7. Why the password had to come from a human

`create_project` and `get_project` return no database password, and it cannot be
set from SQL. On this project `postgres` has `rolsuper = false`, so:

```
ALTER USER postgres WITH PASSWORD '…';
ERROR: 42501: permission denied to alter role
DETAIL: Only superusers can alter privileged roles.
```

This is the same privilege ceiling quick-591 measured on production, where
`CREATE EVENT TRIGGER` and `CREATE EXTENSION pgaudit` were blocked for the same
reason. It is expected rather than a misconfiguration, and it is why a dashboard
password reset is a required manual step in standing this environment up again.

---

## 8. Environment keys — ~~NOT YET WRITTEN~~ WRITTEN AND COMPLETE

> **Corrected 2026-09-15 (quick-604).** `apps/web/.env.staging` **exists and is complete.** It
> carries `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL`, `STAGING_DATABASE_URL_APP_USER`,
> `STAGING_DATABASE_URL_ADMIN` (quick-600's `app_admin` connection, which the planned table below
> does not anticipate), plus `STAGING_SEED_PASSWORD` and `TENANT_CONTEXT_TRIPWIRE=on` added by
> quick-604. Still gitignored (`git check-ignore -v` → `.gitignore:42`), still the only place these
> values live, so a fresh machine still cannot reproduce a staging run without a human re-minting
> them. **The pooled `:6543` strings are not reachable from a developer machine** — every instrument
> repoints to `:5432` and strips `?pgbouncer=true`. See `staging-app-user-end-to-end.md` §9.

The text below is the state as of the original Phase 0 write-up and is kept for the record.


`apps/web/.env.staging` has **not** been created, because two of its three
values cannot be built yet: `app_user` does not exist, so it has no password and
no login. Writing a file with one real key and two placeholders would be worse
than not writing it.

The `.gitignore` entry is in place ahead of that (`.gitignore:42`), confirmed
with `git check-ignore -v` rather than by reading the file, so the credential
has somewhere safe to land the moment there is one.

Planned contents:

| Key | Role | Port | Mode | Notes |
|---|---|---|---|---|
| `STAGING_DATABASE_URL` | `postgres` | 6543 | transaction | mirrors production's runtime route |
| `STAGING_DIRECT_URL` | `postgres` | 5432 | session | migrations |
| `STAGING_DATABASE_URL_APP_USER` | `app_user` | 5432 | session | `connection_limit=1`, `pool_timeout=20` |

The third is the one Prompt 2 cuts over to. Per §3.7 the cutover changes the
route as well as the role, because session-scoped `set_config` needs session
semantics, so it is deliberately on 5432 rather than 6543.

---

## 9. Test data — ~~PENDING~~ SEEDED, AND THE LOGIN GAP IS CLOSED

> **Corrected 2026-09-15 (quick-604).** The seed has been run against staging: two tenants, 8
> `User` rows, 2 clients, 4 carrier drivers, 2 dispatches, 2 loads (`created=38, skipped=0`).
>
> **The claim below that closing the login gap "needs the staging service-role key" is WRONG.** It
> needs neither the service-role key nor the app's signup flow (which cannot work here —
> `mailer_autoconfirm: false` and the built-in mailer 429s after ~3 sends). Writing `auth.users` +
> `auth.identities` directly as `postgres` and then calling
> `POST /auth/v1/token?grant_type=password` with the **anon** key returns HTTP 200 with an
> `access_token`, and `raw_app_meta_data` flows into the JWT's `app_metadata`. Four real logins
> proven. `apps/web/scripts/seed-staging-auth.ts` is the recipe; the eight-NULL-token GoTrue gotcha
> is written up in `staging-app-user-end-to-end.md` §3.

The text below is the state as of the original Phase 0 write-up and is kept for the record.


The seed script is written and typechecked but **has not been run**, because the
tables it targets do not exist yet.

Planned: two tenants, each with an owner, a dispatcher, two drivers, a client, a
truck, two facilities, a trip, a load with two stops, a route template with two
template stops, and one document row.

Three decisions behind the seed, each checked against the schema rather than
assumed:

- **There is no `DISPATCHER` role.** `UserRole` is `OWNER | MANAGER | DRIVER`.
  The dispatcher is a `MANAGER`, which is what `Trip.dispatcherId` references.
- **A load with stops implies a trip.** `CarrierStop.dispatchId` is NOT NULL,
  so the seed creates a `dispatches` row plus the two `facilities` rows that
  `stops.facility_id` requires.
- **Every enum-ish value came from reading `pg_constraint`**, per DEC-14, not
  from the convention around it.

### Why the existing helper was not reused

`scripts/seed-qa-accounts.ts` exists and seeds two tenants, but it could not be
used, for a reason worse than coverage. It calls
`supabaseAdmin.auth.admin.createUser` against `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, which on this machine resolve to **production** —
so repointing only `DATABASE_URL` would have put rows in staging and auth users
in production. Its coverage is also short and asymmetric: tenant 1 gets an
owner, a manager, one driver, a truck and two facilities; tenant 2 gets an owner
and a client; neither gets a load, stops, a trip, a route template or a
document.

`scripts/seed-staging.ts` is therefore a new, **database-only** script. It makes
no Supabase Auth calls at all, so it cannot reach a project other than the one
`DATABASE_URL` names, and it refuses outright to run against the production ref:

```
Error: DATABASE_URL points at the production project (oqdhberkghtnszrkdvfm). Refusing to run.
```

That guard is tested, and it fires before any connection is opened. `tsc` is
clean on the file, probed with a deliberate type error to confirm the gate was
checking it rather than reporting a blind pass.

### Seeded users will not be able to log in

The seed writes `User` rows with roles but creates no Supabase Auth users, so
nothing seeded here will have a password. That is sufficient for Prompt 3, whose
tests run against the database, and **insufficient for Prompt 2's
click-through**, which needs a real login. Closing that needs the staging
service-role key, which was deliberately left blank, and a separate auth-user
pass.

---

## 10. Deviations from the task as written

- **A third file.** The closing check expects `git status` to show only the
  audit file and a `.gitignore` change. Step 7 authorises writing a seed script
  when the existing helper does not serve, and it does not, so
  `apps/web/scripts/seed-staging.ts` is a legitimate third file. It contains no
  credentials; putting it in a gitignored location would be worse, since the
  next person to stand this environment up needs it.
- **The task did not complete.** Steps 3 through 7 are unmet because the
  migration chain failed at step 2. That failure is the deliverable, per the
  task's own instruction that a migration failure is a real defect rather than a
  staging problem.
