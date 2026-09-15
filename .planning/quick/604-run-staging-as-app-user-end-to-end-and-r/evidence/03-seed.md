# quick-604 · 03 — staging seeded, and a real login proven

## Data — the EXISTING seeder, not a second one

`apps/web/scripts/seed-staging.ts` already produces two fully-populated tenants.
Run pointed at `STAGING_DIRECT_URL` (`:5432`):

```
Done. created=38 skipped=0
```

Row counts read back on the privileged connection:

| table | rows |
|---|---|
| `Tenant` | 2 |
| `User` | 8 |
| `clients` | 2 |
| `carrier_drivers` | 4 |
| `dispatches` | 2 |
| `loads` | 2 |
| `auth.users` | 8 |

Tenants are `staging-alpha` (Staging Alpha Carriers) and `staging-beta` (Staging
Beta Logistics); each carries an OWNER, a MANAGER, two DRIVERs, a client, a
truck, two facilities, a trip, a load with two stops, a route template with two
template stops, and a document.

### One operational trap worth writing down

`dotenv`'s startup banner goes to **stdout**. A one-liner of the shape

```
node -e "require('dotenv').config({path:'.env.staging'}); process.stdout.write(process.env.STAGING_DIRECT_URL)" > url.txt
```

writes the banner **into the file**, and the resulting connection attempt fails
with `P1001 … Can't reach database server at base` — a host parsed out of the
banner text, not out of the URL. `{ quiet: true }` is required.

## Auth — `scripts/seed-staging-auth.ts --seed`

```
  public."User" rows        : 8
  auth.users rows           : 8
  auth.identities rows      : 8
  rows with a NULL token col: 0  (must be 0)
seed-staging-auth --seed: OK
```

`auth.users.id` is the `public."User".id` **read back from the database**, never
minted — `getCurrentUser()` looks the Prisma `User` up by the Supabase Auth user
id, so a mismatch would have made every surface fail on "Account setup
incomplete" and produced a failure list about the fixture rather than about the
application.

All eight GoTrue token columns are `''`, asserted by the seeder itself
(`rows with a NULL token col: 0`). With any of them NULL, GoTrue answers
`500 "Database error querying schema"`.

## Four real logins — `--verify`

`POST https://wyixpgunnjmzguhggocz.supabase.co/auth/v1/token?grant_type=password`
with the **anon** key:

| email | HTTP | `app_metadata.role` | `tenantId` | JWT `sub` = `User.id` |
|---|---|---|---|---|
| `owner@alpha.staging.test` | **200** | OWNER | MATCH | MATCH |
| `driver1@alpha.staging.test` | **200** | DRIVER | MATCH | MATCH |
| `owner@beta.staging.test` | **200** | OWNER | MATCH | MATCH |
| `driver1@beta.staging.test` | **200** | DRIVER | MATCH | MATCH |

Machine record: `evidence/03-seed.json`.

## The correction this closes

`docs/audits/staging-environment.md` §9 records the auth gap as needing the
staging **service-role key**. It does not. The anon key plus direct
`auth.users` / `auth.identities` rows is sufficient, and the app's own signup
flow is the path that genuinely cannot work here (`mailer_autoconfirm: false`,
and the built-in mailer 429s after ~3 sends).

## Credential hygiene

```
$ git check-ignore -v apps/web/.env.staging
.gitignore:42:.env.staging	.env.staging
```

`STAGING_SEED_PASSWORD` is generated with `randomBytes(18).toString('base64url')`
on first `--seed`, appended to that gitignored file, and never printed.
`git status` carries no `.env.staging`.

## Teardown

`--teardown` deletes `auth.identities` then `auth.users` (FK order) and asserts
`SELECT count(*) FROM auth.users` = 0. Written now; Task 7 decides whether it is
run.
