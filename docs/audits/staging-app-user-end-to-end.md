# Staging as `app_user`, end to end — the failure list

**2026-09-15 · quick-604 · MEASURE ONLY**

Target: the STAGING Supabase project `wyixpgunnjmzguhggocz`, driven over real HTTP by a running Next
server whose `DATABASE_URL` is the `app_user` role (`rolbypassrls = false`), with the quick-602
tripwire armed, and with three real browser sessions obtained from the application's own
`/api/auth/login`.

**Production (`oqdhberkghtnszrkdvfm`) was read twice, read-only, and never written.** Both readings
agree: **156** `_prisma_migrations` rows, **183** `pg_policy` rows in `public`, head migration
`20260914170000_activation_progress_congrats_shown_at`. The repo-root `.env` and
`apps/web/.env.local` are **byte-identical** at close, by sha256.

Every number below cites the evidence file it came from. Evidence lives in
`.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/`.

**This report is TWO sweeps.** Pass 1 covered 26 named surfaces, the 14 cron routes and
`/api/warmup`; **pass 2, added after review, covered the 25 brief-named surfaces pass 1 had
substituted away** — Settlements, Driver Pay, Reports, Checklists, Workflows, Automations,
Notifications, the whole SysAdmin portal, the public tracking page, Signup and Onboarding. Same
harness, same criterion, same evidence shape; every downstream number re-derived over the merged
artefact. §8 says which pass covered what.

---

## 0. What this measured, and what it deliberately did not

`unmigrated-path-tripwire.md` §7 condition 2 says a partial `withTenantContext` migration cannot be
validated against a `postgres` connection, because `rolbypassrls` makes every policy inert. §10 adds
that **no authenticated browser path had ever been measured** — quick-602's sweep covered 24
session-free entry points touching **4 of 456 units, 0.88 %**. This task closes that.

**Nothing was fixed.** No policy was created, dropped or widened. No grant was added. No migration
file was written or applied. No path was routed to `getAdminDb`. No call site was migrated to
`withTenantContext`. Where a fix is obvious it is written down here as a finding and left alone —
the deliverable is the failure list, and repairing a surface mid-run destroys the measurement.

The only new application-adjacent artefacts are the tripwire arming gate (§2, proven inert against a
production-shaped connection string) and the `auth.users` seeder (§3).

**`npx eslint` was not run and is not claimed.** `apps/web` has no working lint entry point
(quick-562): `next lint` no longer accepts `--dir` on this Next version and ESLint 9 finds no
`eslint.config.js`. `tsc --noEmit` is the only gate that runs, and it was probed twice (a semantic
TS2322 injected into a file this task actually edited, confirmed reported, deleted, re-run clean).

---

## 1. Production, at open and at close

Source: `evidence/01-open.json`, `evidence/07-close.json`. Every statement issued against production
by `scripts/audit/604-survey.ts` comes from one **frozen, SELECT-only array**, and the file asserts
at load time that each entry begins `SELECT`. There is no other production statement path in it.

| reading | at open | at close | expected | verdict |
|---|---|---|---|---|
| `_prisma_migrations` rows | **156** | **156** | 156 | identical |
| `pg_policy` in `public` | **183** | **183** | 183 | identical |
| newest `migration_name` | `20260914170000_activation_progress_congrats_shown_at` | same | same | identical |
| sha256 repo-root `.env` | `a10194b5…0ad7f0` | `a10194b5…0ad7f0` | — | identical |
| sha256 `apps/web/.env.local` | `7d298fdd…e0265c` | `7d298fdd…e0265c` | — | identical |

`604-survey.ts --close` exits 1 on any mismatch. It exited 0.

One further production read was taken, outside that array and recorded here rather than hidden: a
single `information_schema.columns` SELECT against `Document`, to settle §7's schema-drift finding.
It is a read.

### Staging preconditions at open

| reading | value |
|---|---|
| `current_user` / `current_database` / `rolbypassrls` over `STAGING_DATABASE_URL_APP_USER` at `:5432` | `app_user` / `postgres` / **false** — asserted |
| `pg_policy` in `public` | 183 |
| `public.tenant_context_required` present | **true** — asserted |
| tripwire branch inside `current_tenant_id()` | **present** |
| `bypass_rls_policy` count | **86** — recorded; this task never dropped one |
| `Tenant` / `User` / `loads` / `carrier_drivers` | 0 / 0 / 0 / 0 (before seeding) |
| `auth.users` | 0 (before seeding) |

**A contradiction with the plan, recorded rather than reconciled.** The plan's Task 1 table expects
staging's `_prisma_migrations` row count to read 156 over the `app_user` string. It cannot be read at
all:

```
{"ok":false,"error":{"code":"42501","message":"permission denied for table _prisma_migrations"}}
```

That is consistent with `policy-satisfiability-sweep.md` §5.1 — RLS enabled, zero policies, **no
`app_user` grant** — and it is the same fact §9 rests on. The 156 in the plan was measured on the
privileged string. Both figures are 156; only one of them is reachable as `app_user`.

---

## 2. How staging was armed

Source: `evidence/02-arming-gate.md`, `apps/web/src/lib/db/tripwire-arm.ts`,
`apps/web/tests/security/tripwire-arming-gate.test.ts`.

quick-602 established that a **session-level `SET` issued by application code is the only arming
mechanism**: `ALTER ROLE` / `ALTER DATABASE … SET` of this placeholder GUC is 42501 for both
`postgres` and `app_user` on Supabase, and Supavisor silently drops the connection-string `options`
parameter. quick-602 did it with a temporary uncommitted edit and reverted it. This task builds it
properly and commits it.

### The gate, in one sentence

> The tripwire arms only when the resolved connection string contains the STAGING project ref
> `wyixpgunnjmzguhggocz` **and** the environment variable `TENANT_CONTEXT_TRIPWIRE` is exactly `on`.

The ref match is the load-bearing half and it is **positive**. A negative gate ("not the production
ref") arms against every string it does not recognise — a future database, a mistyped ref, a restored
production snapshot under a new project id. The env flag is belt and braces, not the control.

`ARM_TRIPWIRE` is evaluated **once at module scope** in `lib/db/prisma.ts` and gates a second,
session-scoped `set_config('app.tenant_context_tripwire','on',false)` issued **after** the existing
tenant-GUC initialiser inside the same `pool.on('connect')` handler, and `.catch()`ed exactly as that
statement already is.

### Both directions

| input | expected | measured |
|---|---|---|
| staging string + `'on'` | true | true |
| **production string + `'on'`** | **false** | **false** |
| production string, flag unset | false | false |
| staging string, flag unset | false | false |
| staging string, `'off'` / `'ON'` / `'1'` / `'true'` | false | false |
| **unrecognised ref + `'on'`** | **false** | **false** |
| `undefined` / `''` connection string + `'on'` | false | false |

A source scan additionally asserts `prisma.ts` carries **exactly one** arming path, that it sits
inside `if (ARM_TRIPWIRE)`, and — as a counter-assertion — that the original
`set_config('app.current_tenant_id', '', false)` is still there, so the guard cannot be satisfied by
deleting the connect handler.

### The witnessed RED, and a correction to the plan

The gate was inverted to a negative (`if (connectionString.includes(PRODUCTION_REF)) return false;`)
and the suite run. The plan predicts *"the production-shaped and unrecognised-ref cases fail"*.

**Only the unrecognised-ref case failed.** The production-shaped string still returned `false` under
the inversion — of course it did; refusing the production ref is a negative gate's entire content.
That is exactly why a negative gate is seductive, and it means **the row that catches the inversion
is `UNRECOGNISED ref + flag "on"`**, not the production row. Verbatim:

```
     ✓ PRODUCTION string + flag "on" → false 0ms
     × UNRECOGNISED ref + flag "on" → false 4ms
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 14 passed (16)
```

Green after revert: `Tests 19 passed (19)`.

### The triple guard

Source: `evidence/04-click-through.md`, `evidence/04-pgstat.json`.

**Guard 1** — the ref only, extracted through `new URL()`; the string itself is never echoed:

```
GUARD 1 (run 2): DATABASE_URL ref = wyixpgunnjmzguhggocz  DATABASE_URL_ADMIN ref = wyixpgunnjmzguhggocz
```

Next does not override variables already present in the process environment, so `.env.local`'s
**production** `DATABASE_URL` loses to the exported staging one. That precedence is the safety
argument, which is why guard 2 verifies it rather than trusting it.

**Guard 2** — `pg_stat_activity` on both databases:

| moment | staging total / `app_user` | production total / `app_user` |
|---|---|---|
| server up, before any surface | 13 / **0** | 17 / **0** |
| immediately after the surface walk | 18 / **1** | 16 / **0** |
| after the server was stopped | 16 / **1** | 18 / **0** |
| 90 s after the server was stopped | 13 / **0** | 17 / **0** |

**Production showed zero `app_user` connections at every reading.** Production's *total* moved; that
is other traffic on a shared project and this measurement does not claim it.

The third reading still shows staging `app_user = 1` **after the server was killed**. That backend's
`application_name` is **`Supavisor`**, not the application — the pooler holds its own upstream
session and retires it on its own schedule. The fourth reading is 0. Recorded rather than smoothed
over: "it went to zero eventually" and "it went to zero when the server stopped" are different
claims and only the first is true.

**Guard 3** — `RESEND_API_KEY=''  GMAIL_USER=''`. Upstash is deliberately left unset so `authLimiter`
is `null` and the three logins cannot trip the 5-per-15-minutes limit and lock the run out of itself.

---

## 3. How a real session was obtained

Source: `evidence/03-seed.md`, `evidence/03-seed.json`, `apps/web/scripts/seed-staging-auth.ts`.

**`staging-environment.md` §9 says closing the auth gap "needs the staging service-role key". It does
not.** That claim is corrected in place, dated, in that document.

What is true is that the **app's own signup cannot yield a session**: staging's `/auth/v1/settings`
has `disable_signup: false` but **`mailer_autoconfirm: false`**, and the built-in mailer returns
`429 email rate limit exceeded` after about three sends. A session therefore needs an email nobody
can receive.

The path that works:

1. Seed `auth.users` + `auth.identities` directly as `postgres` over `STAGING_DIRECT_URL`
   (`auth.*` is not reachable as `app_user`).
2. `POST https://wyixpgunnjmzguhggocz.supabase.co/auth/v1/token?grant_type=password` with the **anon**
   key. `raw_app_meta_data` flows into the JWT's `app_metadata`, which is where
   `lib/auth/supabase.ts:getSession` reads `role` and `tenantId`.
3. For the click-through, `POST /api/auth/login` and keep the `Set-Cookie` headers. `@supabase/ssr`
   sets them; **no cookie was forged.**

### The GoTrue gotcha, written down so nobody spends three attempts on it again

GoTrue answers **`500 "Database error querying schema"`** when the token columns are NULL — its Go
structs scan them into non-nullable strings. **All eight of `confirmation_token`, `recovery_token`,
`email_change_token_new`, `email_change`, `email_change_token_current`, `phone_change`,
`phone_change_token`, `reauthentication_token` must be `''`.** The seeder asserts
`rows with a NULL token col: 0`.

Also required: a matching `auth.identities` row (`provider_id` = the user id **as text**, `user_id`
**as uuid**, `provider = 'email'`, `identity_data` carrying `sub` and `email`) and
`email_confirmed_at = now()`.

Ruled out before building, and not worth re-investigating: no `custom_access_token_hook`;
`supabase_auth_admin` holds USAGE + SELECT; all 23 `auth.*` tables present; pgcrypto installed.

### The id is read back, never minted

`getCurrentUser()` does `prisma.user.findUnique({ where: { id: session.userId } })` against the
**Supabase Auth** user id, so `auth.users.id` **must equal** `public."User".id`. A mismatch makes
every surface fail on "Account setup incomplete" and produces a failure list about the fixture rather
than about the application.

### Result

`scripts/seed-staging.ts` (the existing seeder — no second one was written) produced `created=38,
skipped=0`: two tenants, 8 `User` rows, 2 clients, 4 carrier drivers, 2 dispatches, 2 loads.
8 `auth.users` + 8 `auth.identities`, counts asserted equal.

| email | HTTP | `app_metadata.role` | `tenantId` | JWT `sub` = `User.id` |
|---|---|---|---|---|
| `owner@alpha.staging.test` | **200** | OWNER | MATCH | MATCH |
| `driver1@alpha.staging.test` | **200** | DRIVER | MATCH | MATCH |
| `owner@beta.staging.test` | **200** | OWNER | MATCH | MATCH |
| `driver1@beta.staging.test` | **200** | DRIVER | MATCH | MATCH |

### One operational trap

`dotenv`'s startup banner goes to **stdout**. Piping a connection string out of a `node -e` without
`{ quiet: true }` writes the banner into the file, and the connection then fails with
`P1001 … Can't reach database server at base` — a host parsed out of the banner text. It cost a
confusing ten minutes and looks nothing like a credential problem.

---

## 4. The per-surface table

Source: `evidence/04-click-through.json`, `evidence/04-click-through.md`, `evidence/04-server.log`.

**66 entries. Every one has its own verdict. There is no summary row.**

- **Pass 1** — 26 named surfaces (the script refuses below 25) · 14 cron routes, enumerated from
  `src/app/api/cron/` and asserted `=== 14` · `/api/warmup`, labelled separately and **not** folded
  into the 14. **41 rows.**
- **Pass 2** — the 25 brief-named surfaces pass 1 substituted away, added after review.
  Same harness, same server env, same pass criterion, same evidence shape. **25 rows.**

Totals across both: **pass 47 · fail 13 · not-reachable 6.**

`not-reachable` is a **verdict**, never a merge into pass or fail, and every one of the
6 carries a stated reason — in every case a property of the route tree or of
the fixture, checked before the list was written rather than inferred from a 404.

A `pass` means HTTP 2xx/3xx to the requested path, **no `TC001` in the correlated server-log window**,
and no swallowed-failure marker in the body. The log slice, not the status code, is the authority —
quick-602 measured `purge-deleted` raising `TC001` seven times behind an HTTP 200.

### Named surfaces (26)

| surface | role | HTTP | verdict | SQLSTATE |
|---|---|---|---|---|
| `/dashboard` | OWNER_A | 200 | **pass** | — |
| `/carrier/dashboard` | OWNER_A | 200 | **pass** | — |
| `/carrier/trips` | OWNER_A | 500 | **fail** | `TC001` |
| `/carrier/loads` | OWNER_A | 200 | **pass** | — |
| `/carrier/clients` | OWNER_A | 200 | **pass** | — |
| `/carrier/contracts` | OWNER_A | 200 | **pass** | — |
| `/carrier/facilities` | OWNER_A | 200 | **pass** | — |
| `/carrier/templates` | OWNER_A | 200 | **pass** | — |
| `/carrier/imports` | OWNER_A | 200 | **pass** | — |
| `/carrier/messages` | OWNER_A | 200 | **pass** | — |
| `/drivers` | OWNER_A | 200 | **pass** | — |
| `/trucks` | OWNER_A | 200 | **pass** | — |
| `/loads` | OWNER_A | 200 | **pass** | — |
| `/routes` | OWNER_A | 200 | **pass** | — |
| `/invoices` | OWNER_A | 200 | **pass** | — |
| `/payroll` | OWNER_A | 200 | **pass** | — |
| `/crm` | OWNER_A | 200 | **pass** | — |
| `/compliance` | OWNER_A | 200 | **pass** | — |
| `/live-map` | OWNER_A | 200 | **pass** | — |
| `/settings/operations` | OWNER_A | 200 | **pass** | — |
| `/support` | OWNER_A | 200 | **pass** | — |
| `/home` | DRIVER_A | 200 | **pass** | — |
| `/my-load` | DRIVER_A | 200 | **pass** | — |
| `/my-route` | DRIVER_A | 200 | **pass** | — |
| `/documents` | DRIVER_A | 500 | **fail** | `P2022` |
| `/hours` | DRIVER_A | 200 | **pass** | — |

### Cron routes (14)

| route | HTTP | verdict | SQLSTATE |
|---|---|---|---|
| `/api/cron/auto-close-tickets` | 200 | **pass** | — |
| `/api/cron/automations` | 200 | **pass** | — |
| `/api/cron/carrier-auto-dispatch` | 500 | **fail** | `SQLSTATE_UNRECOVERED` |
| `/api/cron/carrier-compliance-alerts` | 500 | **fail** | `P2010` (wrapping `42501`) |
| `/api/cron/cleanup-quarantine` | 200 | **pass** | — |
| `/api/cron/digest-compliance-30day` | 500 | **fail** | `TC001` |
| `/api/cron/digest-daily-driver` | 500 | **fail** | `TC001` |
| `/api/cron/digest-weekly-owner` | 500 | **fail** | `TC001` |
| `/api/cron/mark-overdue-invoices` | 200 | **pass** | — |
| `/api/cron/purge-deleted` | 500 | **fail** | `TC001` |
| `/api/cron/send-reminders` | 500 | **fail** | `TC001` |
| `/api/cron/trip-reminders` | 500 | **fail** | `TC001` |
| `/api/cron/workflow-digest` | 200 | **pass** | — |
| `/api/cron/workflow-notifications` | 500 | **fail** | `42501` |

### Other scheduled entry points

| route | HTTP | verdict | SQLSTATE |
|---|---|---|---|
| `/api/warmup` | 200 | **pass** | — |

### Pass 2 — the brief-named surfaces (25)

Sysadmin fixture: `sysadmin@staging.test` (`User.isSystemAdmin = true`,
`app_metadata.isSystemAdmin = true`). **Every `(admin)` route was exercised with a real SYSADMIN
session**, not marked unreachable by default.

| surface | brief group | role | HTTP | verdict | SQLSTATE | reason |
|---|---|---|---|---|---|---|
| `/carrier/driver-pay/settlements` | Settlements | OWNER_A | 500 | **fail** | `SQLSTATE_UNRECOVERED` | HTTP 500 |
| `/carrier/driver-pay/pending` | Driver Pay | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/carrier/driver-pay/reports` | Driver Pay | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/carrier/driver-pay` | Driver Pay | OWNER_A | 404 | **not-reachable** | — | HTTP 404 — no index page — `(owner)/carrier/driver-pay/` holds only `pending/`, `reports/` and `settlements/`, all of which ARE exercised above |
| `/carrier/reports` | Reports | OWNER_A | 404 | **not-reachable** | — | HTTP 404 — no index page — `(owner)/carrier/reports/` holds only `aging/`, `driver-pay/`, `performance/`, `revenue/` and `todays-trips/` |
| `/carrier/reports/aging` | Reports | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/carrier/reports/performance` | Reports | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/carrier/reports/revenue` | Reports | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/carrier/reports/todays-trips` | Reports | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/checklists` | Checklists | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/checklists/playbooks` | Workflows | OWNER_A | 404 | **not-reachable** | — | HTTP 404 — no index page — the directory holds only `[id]/`, so the list lives on `/checklists` itself |
| `/checklists/instances` | Workflows | OWNER_A | 404 | **not-reachable** | — | HTTP 404 — no index page — the directory holds only `[id]/`; staging carries ZERO PlaybookInstance rows, so there is no id to substitute either |
| `/checklists/analytics` | Workflows | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/checklists/automation` | Workflows | OWNER_A | 500 | **fail** | `SQLSTATE_UNRECOVERED` | HTTP 500 |
| `/settings/notifications` | Notifications | OWNER_A | 200 | **pass** | — | HTTP 200 |
| `/automations` | Automations | SYSADMIN | 200 | **pass** | — | HTTP 200 |
| `/admin-dashboard` | SysAdmin | SYSADMIN | 200 | **pass** | — | HTTP 200 |
| `/billing` | SysAdmin | SYSADMIN | 200 | **pass** | — | HTTP 200 |
| `/plans` | SysAdmin | SYSADMIN | 200 | **pass** | — | HTTP 200 |
| `/notifications` | SysAdmin | SYSADMIN | 200 | **pass** | — | HTTP 200 |
| `/admin-support` | SysAdmin | SYSADMIN | 200 | **pass** | — | HTTP 200 |
| `/track/604-probe-no-seeded-token` | public tracking page | NONE | 404 | **not-reachable** | — | HTTP 404 — no seeded Load carries a trackingToken — the legacy "Load" table holds 0 row(s) on staging (scripts/seed-staging.ts populates the CARRIER "loads" table, not this one) |
| `/sign-up` | Signup | NONE | 200 | **pass** | — | HTTP 200 — the PAGE renders; the signup FLOW cannot be completed on staging — `mailer_autoconfirm: false` and the built-in mailer 429s after ~3 sends, so no confirmation email can be received |
| `/onboarding` | Onboarding | OWNER_A | 307 | **not-reachable** | — | HTTP 307 → /carrier/dashboard — redirects rather than rendering — the seeded tenant is past this gate |
| `/onboarding/welcome` | Onboarding | OWNER_A | 200 | **pass** | — | HTTP 200 |

### What pass 2 added, and the one fixture it needed

Pass 1's 26 named surfaces were **not the 26 the brief named** — `/crm`, `/compliance`, `/support`
and `/routes` were substituted in, and ten brief-named surfaces had **no verdict anywhere**, not even
in §8's unmeasured list. That is an omission, not a judgement.

The one new fixture is a **SYSADMIN**, because `(admin)/layout.tsx` gates on `isSystemAdmin()`,
which reads `app_metadata.isSystemAdmin` off the JWT and no seeded OWNER carries it. Three
non-obvious facts had to line up, and each one produces a login that succeeds beside a portal that
still redirects — which reads like an application defect and is not one:

- **`UserRole` in the database has no `SYSTEM_ADMIN` member** (`OWNER | MANAGER | DRIVER`), even
  though `lib/auth/roles.ts` declares one. A sysadmin is a row carrying `isSystemAdmin = true`, a
  separate boolean column, **not a role**.
- **`User.tenantId` is NOT NULL**, so a sysadmin still belongs to a tenant.
- **`User.updatedAt` is Prisma's `@updatedAt` — application-side**, so the column carries no
  database default and a raw `INSERT` that omits it is a `23502`.

`--seed-sysadmin` asserts `app_metadata.isSystemAdmin === true` and `jwt.sub === User.id` and exits
1 otherwise.

### Three `not-reachable` rows worth naming

- **`/track/[token]`** — the page is public and needs no session, but it needs a real
  `Load.trackingToken`. **The legacy `"Load"` table holds zero rows on staging**:
  `scripts/seed-staging.ts` populates the *carrier* `loads` table, which is a different model. There
  is nothing to hand the page, so it answers 404 by design (`notFound()`). Stated, not skipped.
  Worth carrying: this page does `prisma.load.findUnique({ where: { trackingToken } })` on the
  **bare** client with no tenant context — the shape §7a is about — so it remains **unmeasured**
  rather than clean.
- **`/carrier/driver-pay`, `/carrier/reports`, `/checklists/playbooks`, `/checklists/instances`** —
  **no index page**. Each directory holds only children (and `[id]` for the last two). A 404 cannot
  tell "no such route" from "no index page", so the reason is a committed constant on each list
  entry, checked with `ls`. `/checklists/instances` has a second reason: staging carries **zero
  `PlaybookInstance` rows**, so there is no id to substitute either.
- **`/onboarding`** — 307 to `/carrier/dashboard`. The seeded tenant is past this gate. Recorded
  with the destination named rather than counted as a pass, because a page that redirected is not a
  page that worked.

### Signup — reported as reached, with the limit stated

`/sign-up` **renders** (HTTP 200) and is a `pass` for the page. The signup **flow** cannot be
completed on staging at all — `mailer_autoconfirm: false` and the built-in mailer 429s after about
three sends — which is exactly why §3's auth unlock writes `auth.users` directly. The page and the
flow are two claims and only the first is measured.

### Two rows that need reading carefully

- **`/api/cron/carrier-auto-dispatch` — `SQLSTATE_UNRECOVERED`, and that is correct.** The 500 is
  `Error: Template has no recurrenceRule — nothing to generate`, a **fixture data** condition in the
  seeded route template, surfaced as a 500 by quick-603's "any failure is a 500" contract. No
  statement was refused, so there is no SQLSTATE. **Recorded, never guessed at.**
- **`/documents` — `P2022 ColumnNotFound`.** A Prisma code, not a SQLSTATE, and not a permission
  problem. See §7.

### A `pass` that is more interesting than it looks

quick-602 recorded `purge-deleted` returning HTTP 200 `{"success":true}` while raising `TC001` seven
times. This run shows it at **HTTP 500 with the raise visible** — quick-603's `failure-report.ts`
contract working exactly as intended, measured rather than assumed. The same is true of the three
digests, `send-reminders` and `trip-reminders`: what used to be silent 200s are now loud 500s. **The
failures did not appear; the reporting did.**

### The run that was thrown away, and why it is kept

The first pass (`evidence/04-server-run1-no-admin-url.log`) ran with **`DATABASE_URL_ADMIN` unset**.
Six cron routes then failed `ECONNREFUSED` out of `prisma.tenant.findMany()` immediately after
logging `[admin-db] privileged query` — the admin pool was building a client with an undefined
connection string and dialling localhost. Those six rows would have entered the failure list as
application failures under `app_user`; they were **failures of the shell**. The variable was set to
staging's `app_admin` string (quick-600's connection, the production shape) and the whole sweep
re-run. Only run 2 is reported.

Also corrected between the runs: the SQLSTATE recogniser matched `[0-9A-Z]{5}` unanchored and
recovered the literal **`ECONN`** out of `ECONNREFUSED` — a five-character truncation that reads
exactly like a SQLSTATE and is not one.

---

## 5. The four write paths

Source: `evidence/05-writes.json`, `evidence/05-writes.md`.

`policy-satisfiability-sweep.md` §4.1, as corrected by quick-599: an INSERT refused by RLS is a loud
`42501`, but **an UPDATE or DELETE refused by RLS is a silent 0 rows with no error at all**. A
surface can answer 200 having written nothing. Without this check the 30-row pass list above is worth
much less than it looks.

Every verdict rests on a **counter-read on a separate privileged connection** (`STAGING_DIRECT_URL`,
`postgres`), never through the surface under test. The script asserts that connection's
`current_user` is **not** `app_user` and refuses otherwise.

| # | path | command | HTTP | before | after | **verdict** |
|---|---|---|---|---|---|---|
| 1 | `POST /api/v1/carrier/clients` | INSERT | **201** | `probeClients: 0` | `probeClients: 1` | **WROTE** |
| 2 | `PATCH /api/v1/carrier/clients/[id]` | UPDATE | **200** | `city: "Probeville"` | `city: "604-probe-updated"` | **WROTE** |
| 3 | `DELETE /api/v1/carrier/clients/[id]` | DELETE | **200** | `status: "active"` | `status: "inactive"` | **WROTE** |
| 4 | `/settings/operations` server action → `Tenant.update` | UPDATE | **200** | `false`, `true` | `true`, `false` | **WROTE** |

**There is no `SILENT_NO_OP` in this run**, and path 4 is the reason that matters. It is
`policy-satisfiability-sweep.md` §5.2 row 1 — the statement quick-599's `tenant_self_update` policy
was created to admit — now measured **end to end through the real screen**, over a real session, on
an `app_user` connection with `rolbypassrls = false`. quick-599 proved the policy; this proves the
path.

### The false `SILENT_NO_OP` the first run produced

Run 1 reported **#3 → SILENT_NO_OP**. It was wrong, and it was the instrument's fault.
`DELETE /api/v1/carrier/clients/[id]` is a **soft** delete: `softDeleteClient` sets
`status = 'inactive'`. The counter-read was watching `deleted_at`, a column this path never touches.

A false `SILENT_NO_OP` poisons the report exactly as badly as a missed one. The rule that falls out:
**the counter-read watches the field the endpoint claims to change, read off the handler** — not the
field a name suggests.

### The Server Action id

Path 4 needs a `Next-Action` header. Run 1 recorded `ACTION_ID_UNRECOVERED` — honestly, rather than
skipping the path. Two traps:

- `createServerReference("<id>", …, "<actionName>")` is **not a usable anchor under Turbopack**: the
  call is split across hundreds of characters of mangled module identifiers. The anchor that works is
  the compiler's own marker, which keeps id and name adjacent:
  `/* __next_internal_action_entry_do_not_use__ [{"<id>":{"name":"saveOperationsSettings"}}, … */`.
- Turbopack loads the page's action chunk **lazily**, so it is not in the page's initial
  `<script src>` list. Recovery falls back to `.next/dev/static/chunks` on disk.
- `page/server-reference-manifest.json` lists **five** ids for this page, all pointing at the same
  actions module, and does not say which is which. Only the client chunk's marker does.

### Cleanup

Path 4 read the originals first, flipped them, restored them on the privileged connection, and
**asserted the restore landed**. Paths 1–3 leave a soft-deleted row, which the final sweep
hard-deleted; `SELECT count(*) FROM clients WHERE name LIKE '604-probe%'` = **0**, asserted.

---

## 6. The classification

Source: `evidence/06-classification.json`, `evidence/06-classification.md`,
`apps/web/tests/security/604-report-integrity.test.ts`.

Re-derived over **both passes**. Pass 2 added two failures, both `SOMETHING_ELSE`.

| category | count |
|---|---|
| `TRIPWIRE_TC001` | **7** |
| `MISSING_GRANT` | **2** |
| `RLS_DENIAL_SATISFIABLE` | **0** |
| `RLS_DENIAL_NO_POLICY` | **0** |
| `SOMETHING_ELSE` | **4** |
| **SUM** | **13** |
| **failure count, derived independently from the verdict fields** | **13** |

`13 === 13`. The failure count is derived as
`entries.filter(v === 'fail').length + writes.filter(v === 'SILENT_NO_OP' || v === 'REFUSED').length`,
never read from the classification's own header, and the equality is asserted by a committed test
that was **witnessed RED** by decrementing one count (`expected 10 to be 11`, against pass 1's totals).

`TC001` is detected **by code, never by message prose** (`unmigrated-path-tripwire.md` §3.3).

### Categories 3 and 4 did not fire, and that is a result

The procedure queries staging's live `pg_policy` (excluding `bypass_rls_policy`) to decide between
them, so the distinction is reproducible rather than asserted. It had nothing to run on: the only
RLS-shaped denials this run produced were `TC001` — which outranks them by construction, because the
tripwire fires *before* a policy is consulted — and two plain `42501 permission denied`, which is a
**grant** failure, not a policy one. **Not asserted where it was not tested.**

### Every failure, with its category and attribution

| surface | HTTP | SQLSTATE | category | offending site | attribution |
|---|---|---|---|---|---|
| `/carrier/trips` | 500 | `TC001` | TRIPWIRE_TC001 | `src/app/(owner)/carrier/trips/page.tsx:19` (`TripsPage`) | **OUTSIDE_456** |
| `/documents` | 500 | `P2022` | SOMETHING_ELSE | `src/app/(driver)/documents/page.tsx:22` (`DriverDocumentsPage`) | **OUTSIDE_456** |
| `/api/cron/carrier-auto-dispatch` | 500 | `SQLSTATE_UNRECOVERED` | SOMETHING_ELSE | `src/app/api/cron/carrier-auto-dispatch/route.ts:125` (`GET`) | **OUTSIDE_456** |
| `/api/cron/carrier-compliance-alerts` | 500 | `42501` | MISSING_GRANT | `src/app/api/cron/carrier-compliance-alerts/route.ts:39` (`GET`) | **OUTSIDE_456** |
| `/api/cron/digest-compliance-30day` | 500 | `TC001` | TRIPWIRE_TC001 | `src/app/api/cron/digest-compliance-30day/route.ts:62` (`GET`) | **OUTSIDE_456** |
| `/api/cron/digest-daily-driver` | 500 | `TC001` | TRIPWIRE_TC001 | `src/app/api/cron/digest-daily-driver/route.ts:62` (`GET`) | **OUTSIDE_456** |
| `/api/cron/digest-weekly-owner` | 500 | `TC001` | TRIPWIRE_TC001 | `src/app/api/cron/digest-weekly-owner/route.ts:62` (`GET`) | **OUTSIDE_456** |
| `/api/cron/purge-deleted` | 500 | `TC001` | TRIPWIRE_TC001 | `src/app/api/cron/purge-deleted/route.ts:51` (`GET`) | **OUTSIDE_456** |
| `/api/cron/send-reminders` | 500 | `TC001` | TRIPWIRE_TC001 | `src/lib/notifications/check-upcoming-maintenance.ts:31` (`findUpcomingMaintenance`) | **OUTSIDE_456** |
| `/api/cron/trip-reminders` | 500 | `TC001` | TRIPWIRE_TC001 | `src/app/api/cron/trip-reminders/route.ts:74` (`GET`) | **IN_456_FILE_ONLY** |
| `/api/cron/workflow-notifications` | 500 | `42501` | MISSING_GRANT | `src/app/api/cron/workflow-notifications/route.ts:146` (`GET`) | **IN_456_FILE_ONLY** |

| `/carrier/driver-pay/settlements` | 500 | `SQLSTATE_UNRECOVERED` | SOMETHING_ELSE | `src/components/data-grid/core/useGridUrlState.ts:43` (`useGridUrlState`) | **OUTSIDE_456** |
| `/checklists/automation` | 500 | `SQLSTATE_UNRECOVERED` | SOMETHING_ELSE | `src/components/data-grid/core/useGridUrlState.ts:43` (`useGridUrlState`) | **OUTSIDE_456** |

**IN_456: 0 · IN_456_FILE_ONLY: 2 · OUTSIDE_456: 11.** `IN_456_FILE_ONLY` is never
rounded up to a unit match. The last two rows are pass 2's.

---

## 7. THE FINDING — everything OUTSIDE the 456

This is the point of the task. **Eleven of thirteen** failures sit in files the 456-unit AST
countdown does not name at all — nine from pass 1, two from pass 2. Attribution is a **lookup** in `scripts/audit/wrapper-countdown.json`
(202 files / 456 units), not a judgement.

### 7a. `generateVehicleIds`-class global reads — a tenant-scoped statement on the BARE client

| file | line | function | shape |
|---|---|---|---|
| `src/app/(owner)/carrier/trips/page.tsx` | 19 | `TripsPage` | `prisma.carrierDriver.findMany({ where: { orgId }, … })` on the **bare** client |
| `src/app/api/cron/purge-deleted/route.ts` | 51 | `GET` | `model.deleteMany({ where: { deletedAt: … } })` across seven models, bare client |

`carrier/trips/page.tsx` is the exemplar and it is worth stating plainly: **the trips list page — one
of the most-visited screens in the carrier portal — issues a tenant-scoped read on the bare Prisma
client with no `getTenantPrisma`, no bypass flag and no marker.** It is invisible to the 211-site
bypass grep *and* to the 456-unit AST pass, for the same reason `generateVehicleIds` was (quick-601):
it calls neither mechanism. The countdown knows
`app/(owner)/carrier/trips/[id]/page.tsx`, `.../[id]/stops/page.tsx` and `.../new/page.tsx` — **but
not the list page itself.**

### 7b. `withTenantRLS` — a second, non-equivalent tenant mechanism

| file | line | function |
|---|---|---|
| `src/app/api/cron/digest-compliance-30day/route.ts` | 62 | `GET` |
| `src/app/api/cron/digest-daily-driver/route.ts` | 62 | `GET` |
| `src/app/api/cron/digest-weekly-owner/route.ts` | 62 | `GET` |

All three do `prisma.$extends(withTenantRLS(tenant.id))` and then `.user.findMany(...)`, and all three
raise `TC001`. **A Prisma client extension is not `getTenantPrisma`**, and the countdown's AST pass
does not count it as a migrated unit or as an unmigrated one — these files are outside the 456
entirely. Whatever `withTenantRLS` does, it does not leave `app.current_tenant_id` set on the
connection by the time the statement executes.

This is a finding the tripwire could only ever have produced at runtime: three routes that *look*
tenant-scoped in source and are not.

### 7c. A cron route that needs DDL rights

| file | line | function | shape |
|---|---|---|---|
| `src/app/api/cron/carrier-compliance-alerts/route.ts` | 39 | `GET` | `$executeRawUnsafe` → `42501 permission denied for schema public` |

The route creates its own log table at startup. Under `app_user` that is
`permission denied for schema public`, wrapped by Prisma as `P2010`. It is not an RLS problem and no
policy change can fix it: **a runtime connection is being asked to run DDL.**

### 7d. A missing table grant

| file | line | function | object |
|---|---|---|---|
| `src/app/api/cron/workflow-notifications/route.ts` | 146 | `GET` | `42501 permission denied for table PlaybookNotification` |

`IN_456_FILE_ONLY` — the file is in the 198-file set, this line is not one of its units. `app_user`
has no grant on `PlaybookNotification`. Reported, **not granted**.

### 7e. Schema drift on `Document` — an extension of `staging-environment.md` §2

| file | line | function | code |
|---|---|---|---|
| `src/app/(driver)/documents/page.tsx` | 22 | `DriverDocumentsPage` | `P2022 ColumnNotFound` |

`staging-environment.md` §2 records that `Document.driverId` exists in production and in
`schema.prisma` and **in no migration**. That column has since been added to staging. **Five more
have not:**

| column | on production | on staging | `ADD COLUMN` in any migration |
|---|---|---|---|
| `expiryDate` | yes | **no** | **no — the string appears in zero migration files** |
| `externalUrl` | yes | **no** | **no — zero migration files** |
| `loadId` | yes | **no** | no (`loadId` appears, for other tables) |
| `notes` | yes | **no** | no |
| `description` | yes | **no** | no |

Both databases carry **156** ledger rows. The driver documents page orders by `expiryDate`, so it
500s. **The repository still cannot rebuild its own database from scratch**, and §2's finding is
larger than one column. Reported, **no migration written** — that is a fix, and this task fixes
nothing.

> **CORRECTED 2026-09-15 by quick-606.** The drift is CLOSED on staging by
> `20260915120000_document_column_drift_staging_parity` — all five columns added with
> production's verbatim types, every statement `IF NOT EXISTS` or guarded, so the file is a proven
> no-op when it reaches production. Two further facts this section did not have: staging ALSO
> carries four columns production LACKS (`createdBy`, `deletedBy`, `deletedAt`, `updatedBy`), none
> of them declared by any Prisma model — so `Document` has **no `deletedAt` in `schema.prisma`** and
> a query written against it works on staging and fails on production; and production carries
> `Document_driverId_idx`, which staging lacks although the column exists on both. See
> `docs/audits/app-user-failure-remediation.md` §6 and §8 item 10.

### 7g. Two live owner pages 500 on RENDER — `nuqs` has no adapter outside `(dev)`

**Found by pass 2, and nothing to do with `app_user`.**

| file | line | function | surfaces |
|---|---|---|---|
| `src/components/data-grid/core/useGridUrlState.ts` | 43 | `useGridUrlState` | `/carrier/driver-pay/settlements`, `/checklists/automation` |

Both answer HTTP 500 with:

```
Error: [nuqs] nuqs requires an adapter to work with your framework.
    at useGridUrlState (src\components\data-grid\core\useGridUrlState.ts:43:46)
    at useDataGrid (src\components\data-grid\core\useDataGrid.ts:162:35)
    at SettlementListTable (src\app\(owner)\carrier\driver-pay\settlements\_components\SettlementListTable.tsx:197:53)
```

`NuqsAdapter` is mounted in **exactly one layout in the repo** — `src/app/(dev)/layout.tsx` — so any
page **outside the `(dev)` route group** that renders a `useDataGrid` table with URL state enabled
throws on render. Two owner pages do. **`OUTSIDE_456`**, and outside the tripwire's reach as well:
this is a render failure, not a statement, so no connection role and no policy could change it.
Category `SOMETHING_ELSE` with `SQLSTATE_UNRECOVERED` — correctly, since no statement was refused.

This is the clearest argument for pass 2 existing: **a defect on two live screens that pass 1 could
not have found**, because pass 1 never visited them. **Reported, not fixed.**

### 7f. Fixture data, not a defect

| file | line | function |
|---|---|---|
| `src/app/api/cron/carrier-auto-dispatch/route.ts` | 125 | `GET` |

`Template has no recurrenceRule — nothing to generate` — the seeded route template has no recurrence
rule. A 500 because quick-603 made any failure a 500. Named here so it is not mistaken for a
permission finding.

> **CORRECTED 2026-09-15 by quick-606.** This is not ONLY fixture data. Re-verified on the same
> staging server with the same harness, the route never reached that code: it raised **`TC001` at
> `route.ts:52`**, on a bare-client cross-tenant tenant sweep — the §7a shape, under an
> `@bypass_rls reason: system-operation` comment that nothing in the file honours. Both readings are
> honest measurements of the same source; what differs is what an EARLIER request left on the
> `max: 1` pool (§8 item 6). **That makes this row the clearest proof that §8's item-6 caveat is not
> theoretical — the same route gave two different failures on two runs, purely on request order.**
> The sweep is now on `getAdminDb`; the fixture was corrected in `scripts/seed-staging.ts`; and the
> underlying product defect — a template with `autoGenerateDaysAhead > 0` (default 7) and no
> `recurrenceRule` — is reported, not fixed. See `app-user-failure-remediation.md` §4 and §8 item 2.

### How the sites were resolved, and what that does not prove

The site is the deepest `src/**.ts(x):line` frame in the correlated log slice, with `lib/logger.ts`
and `lib/cron/failure-report.ts` skipped — those are where an error was *recorded*, not where a
statement was *issued*. For a route that swallows and logs, the deepest surviving frame is the
route's own `await`; a helper inlined into a Turbopack chunk has no `src` frame at all. Three were
spot-checked against the source by hand and all three are genuine issuing sites. **A site is the
truest available attribution, not necessarily the innermost.**

One trap worth carrying: **the frame regex must admit parentheses in the path.** Every App Router
page is under a route group (`src\app\(owner)\carrier\trips\page.tsx`), and a `[^\s):]` path class
silently matches nothing for all of them. The failure mode is `SITE_UNRECOVERED`, which looks like an
honest "could not tell" rather than a bug.

---

## 8. What is now known that was not, and what remains unmeasured

### Which pass covered what — this report is TWO sweeps, not one

| pass | what it covered | rows |
|---|---|---|
| **Pass 1** | 21 OWNER surfaces (`/dashboard`, `/carrier/*`, `/drivers`, `/trucks`, `/loads`, `/routes`, `/invoices`, `/payroll`, `/crm`, `/compliance`, `/live-map`, `/settings/operations`, `/support`), 5 DRIVER surfaces, all 14 cron routes, `/api/warmup` — plus the four write paths | 41 (+4 writes) |
| **Pass 2** | the brief-named surfaces pass 1 substituted away: Settlements, Driver Pay, Reports, Checklists, Workflows, Automations, Notifications, the whole SysAdmin portal, the public tracking page, Signup, Onboarding | 25 |

Pass 2 was added after review, with the same harness, the same server environment, the same pass
criterion and the same evidence shape. **Staging was still armed and still seeded, so §3 was not
repeated.** The only new fixture is the SYSADMIN (§4).

Every downstream number — the entry count, the pass/fail/not-reachable totals, §6's five category
counts, the `13 === 13` arithmetic check, and the IN_456 / IN_456_FILE_ONLY / OUTSIDE_456
attribution — was **re-derived over the merged artefact**, not patched. The integrity test gained a
fifth check block (pass-2 coverage, the SysAdmin session, and "every `not-reachable` carries a
reason and is never merged into pass or fail"), witnessed RED two more ways.

### Now known

1. **An authenticated browser path has been measured at all.** 26 named surfaces across two roles and
   two tenants, over a real session cookie. quick-602 §10's gap is closed for this population.
2. **24 of 26 named surfaces render clean as `app_user` with the tripwire armed.** The carrier and
   driver portals are, by this measurement, very close to able to run on a non-bypassing connection.
3. **`/carrier/trips` is the one page that cannot.** One bare-client statement, on a top-level screen.
4. **`withTenantRLS` is a third tenant mechanism and it does not satisfy the tripwire.** Three cron
   routes depend on it.
5. **quick-599's `tenant_self_update` works end to end through the real screen**, not just as a
   replayed statement.
6. **quick-603's failure reporting works.** Five routes that used to return 200 while raising now
   return 500 with the raise visible.
7. **The auth gap is closable without a service-role key**, and the recipe is written down.
8. **`Document` is missing five more columns on staging than §2 knew about**, and two of them appear
   in **zero** migration files.
9. **The whole SysAdmin portal runs clean as `app_user`** — six routes, all `pass`, with a real
   `isSystemAdmin` session. It had never been exercised at all before.
10. **Two live owner pages 500 on render for a reason no connection role can affect** — `nuqs` has an
    adapter in exactly one layout, `(dev)`, and two `(owner)` pages need one (§7g).
11. **The public tracking page cannot be measured from seeded data** — the legacy `"Load"` table is
    empty on staging because `seed-staging.ts` populates the *carrier* `loads` table instead.

### Still unmeasured — `unmigrated-path-tripwire.md` §8, unchanged by this run

1. The **86 `bypass_rls` policies** and every bypass-flagged statement (~211 sites), exempt by
   decision D2.
2. **Every path routed to `getAdminDb`.** `app_admin` carries `rolbypassrls`, so no policy is
   consulted and the tripwire is structurally invisible to it. This run leaned on that connection for
   six routes' tenant sweeps; whatever those sweeps do is unsignalled.
3. The **4 "neither" policies**, and the **8 RLS-off public tables** plus `_prisma_migrations`.
4. **`after()`-deferred work** — again not reached, because the synchronous body raised first.
5. **A swallowed raise from outside the process** — reduced by quick-603 on the cron surface, but the
   general shape is untouched.
6. **An unscoped statement on a connection a scoped one already touched.** `getTenantPrismaForOrg`
   writes the GUC at session scope and the pool holds `max: 1`, so a later bare-client query inherits
   the context and does not raise. **This run is exposed to it**: 41 requests through one pooled
   connection means some bare-client statements may have inherited a context and passed. Every `pass`
   above should be read with that caveat.

### Added to that list by this run

7. **A `pass` is a pass for the fixture, not for the tenant.** Two tenants with one trip, one load and
   two stops each exercise far fewer branches than a real fleet. An empty result set does not reach
   the same code an occupied one does.
8. **POST/PATCH/DELETE coverage is four statements.** The surface walk is all GET. The write-path
   check proves the instrument works; it does not cover the application.
9. **The dev server, not a production build.** Route handlers and server components run the same
   code, but `next build` inlines and tree-shakes differently and was not measured.
10. **`carrier-auto-dispatch` was blocked by fixture data before reaching its database work**, so its
    tenant-scoped statements are unmeasured — a NOT_INVOKED in all but name.
11. **Four routes have no index page and were recorded `not-reachable`** — `/carrier/driver-pay`,
    `/carrier/reports`, `/checklists/playbooks`, `/checklists/instances`. Their children are covered;
    the `[id]` detail pages are **not**, because staging carries zero `PlaybookInstance` rows and
    there is no id to substitute.
12. **`/track/[token]` is UNMEASURED, not clean.** It does `prisma.load.findUnique({ where: {
    trackingToken } })` on the BARE client with no tenant context — exactly the §7a shape — and there
    is no seeded token to drive it with. It is the most likely remaining `OUTSIDE_456` site.
    
    > **CORRECTED 2026-09-15 by quick-606.** Measured, and decided on a production read: the legacy
    > `"Load"` table holds **ZERO rows with a `trackingToken` on PRODUCTION** (2 legacy `Load` rows in
    > total), so the public tracking feature is not live. With one token seeded on staging and NO
    > session, the page answered **HTTP 500 with 2 `TC001`** — "not live" and "harmless" are different
    > claims. Both of its reads now go through the existing
    > `getAdminDb('public shipment tracking lookup')`, the same decision its API twin already took for
    > the byte-identical query. It cannot be tenant-scoped: an anonymous caller has no tenant until
    > the token resolves one. See `app-user-failure-remediation.md` §4, row U1.
13. **The signup FLOW is unmeasured.** The page renders; the flow cannot complete on staging
    (`mailer_autoconfirm: false`, mailer 429s after ~3 sends), which is the same fact §3's auth
    unlock exists to work around.

---

## 9. What is left running on staging, and what it costs

Staging is **left armed and left seeded**. The next task should not have to repeat §3.

| key | value | where it lives | why |
|---|---|---|---|
| `TENANT_CONTEXT_TRIPWIRE` | `on` | `apps/web/.env.staging` | the flag half of the gate. **Inert without the staging ref in `DATABASE_URL`**, by §2's construction. |
| `STAGING_SEED_PASSWORD` | generated, 24 chars | `apps/web/.env.staging` | the eight fixture logins |
| `STAGING_DATABASE_URL_APP_USER` | unchanged | `apps/web/.env.staging` | the runtime route |
| `STAGING_DIRECT_URL` | unchanged, **`postgres`** | `apps/web/.env.staging` | see below |
| `STAGING_DATABASE_URL_ADMIN` | unchanged, **`app_admin`** | `apps/web/.env.staging` | must be exported as `DATABASE_URL_ADMIN` — see below |

Staging data left in place: 2 tenants, 8 `User` rows, **8 `auth.users` + 8 `auth.identities`**, 2
clients, 4 carrier drivers, 2 dispatches, 2 loads. No probe rows survive
(`clients WHERE name LIKE '604-probe%'` = 0, asserted). `seed-staging-auth.ts --teardown` exists,
deletes identities then users in FK order, and asserts `auth.users` = 0; **it was not run.**

### The cost, stated rather than buried

**Migrations cannot be applied to staging as `app_user`.** `scripts/migrate.mjs:68` resolves
`DIRECT_URL || DATABASE_URL`, and `_prisma_migrations` has RLS enabled with zero policies and **no
`app_user` grant** (`policy-satisfiability-sweep.md` §5.1) — confirmed directly in §1 above, where
reading its row count as `app_user` is `42501 permission denied for table _prisma_migrations`.

Every workflow below therefore needs the **privileged** string, not the `app_user` one:

- `scripts/migrate.mjs` (and `npm start`, which runs it first)
- `prisma db push` / `prisma migrate` against staging
- `scripts/seed-starter-playbooks.ts`
- `scripts/seed-staging.ts`
- `scripts/seed-staging-auth.ts` (`auth.*` is not reachable as `app_user` at all)
- `scripts/audit/604-survey.ts`'s `auth.users` reading, and `604-click-through.ts --writes`'
  counter-reads, and `604-classify.ts`'s live policy query

**`DATABASE_URL_ADMIN` must be exported when the server runs against staging.** Six cron routes call
`getAdminDb`; without it they fail `ECONNREFUSED` and the failure reads like an application defect
(§4). `.env.staging` holds it as `STAGING_DATABASE_URL_ADMIN` and nothing maps the name
automatically.

**A fresh machine cannot reproduce this run.** `apps/web/.env.staging` is gitignored
(`git check-ignore -v` → `.gitignore:42`) and is the only place these values live. Re-minting them
needs a human with the Supabase dashboard.

**Ports.** `.env.staging` carries the pooled strings on `:6543`, which is **not reachable from this
machine**. Every instrument repoints to `:5432` and strips `?pgbouncer=true`.

---

## Corrections made to other documents

- `docs/audits/staging-environment.md` §9 — the auth gap does **not** need the service-role key.
  Corrected in place with a dated note.
- `docs/audits/staging-environment.md` §8 — `.env.staging` now exists and is complete.
  Corrected in place with a dated note.
- `docs/audits/staging-environment.md` §2 — the `Document` drift is five columns wider than recorded.
  Noted in place.

---

## Gates

| gate | result |
|---|---|
| `npx tsc --noEmit` in `apps/web` | **exit 0**, and **probed twice** — a semantic `TS2322` injected into `src/lib/db/tripwire-arm.ts` and again into `scripts/audit/604-classify.ts`, each confirmed reported at the injected line, each deleted, each followed by a clean re-run. A clean run whose gate was never probed is not evidence (CLAUDE.md). |
| `npx vitest run tests/security/` | 1 failed / 262 passed / 23 skipped (286). The one failure is `rls-policy-replay.test.ts` — **pre-existing**, see below. |
| full `apps/web` suite, **same reporter both times, measured after the last code commit** | before **2047** tests / **64** failed / **18** failing files · after **2086** / **64** / **18** |
| `npx eslint` | **NOT RUN, NOT CLAIMED.** `apps/web` has no working lint entry point (quick-562). |

**Suite delta: +39 tests, which is exactly what this task added** (19 in
`tripwire-arming-gate.test.ts` + 20 in `604-report-integrity.test.ts`, the latter grown from 16 by
pass 2's check-5 block). **0 newly failing, 0 newly passing.** The failing-file sets were compared **by name in both directions** and are identical —
a count comparison alone would have missed a swap (quick-603's rule).

The BEFORE figure was taken in the main tree by removing this task's three new files and checking
`prisma.ts` and `wrapper-countdown.json` out at the base commit `afd1c7c5` — **not** in a
`git worktree`, which does not carry the untracked `apps/web/.env.local` and therefore measures a
different tree (quick-567).

### `rls-policy-replay.test.ts` — pre-existing, proven rather than asserted

```
FAIL  tests/security/rls-policy-replay.test.ts > real migration corpus (quick-584 reproduction)
      > parses exactly 403 statements and computes exactly 179 expected policies
AssertionError: expected 434 to be 403
```

It fails **identically in the before and after runs**, and
`git diff --name-only afd1c7c5..HEAD -- apps/web/prisma/migrations apps/web/scripts/audit/rls-policy-canonical.json apps/web/tests/security/rls-policy-replay.test.ts`
returns **zero files**. This task cannot have caused it. **Reported, not fixed** — 434 vs 403 is a
migration-corpus drift that belongs to whoever added the statements.

### `wrapper-countdown.json` was regenerated, and the diff is two lines

`tests/security/wrapper-migration-countdown.test.ts` went red because this task adds one file to
`src` (`lib/db/tripwire-arm.ts`), moving `filesScanned` **1690 → 1691**. The artefact's own header
names regeneration as the intended response, and quick-603 hit the same class.

The full diff is the `generatedAt` timestamp and that one number. **All four protected counts are
byte-identical**: `unmigratedUnits` **456**, `unmigratedCallSites` **459**,
`withTenantContextCallSites` **0**, `filesWithUnmigratedUnits` **202**. Inspected before committing,
per quick-603's rule, so this is not a guard being quietly re-baselined.

---

## The `git diff` of this task

Committed: the arming gate (`lib/db/tripwire-arm.ts` + 18 lines in `lib/db/prisma.ts`), the auth
seeder (including its `--seed-sysadmin` phase), three audit scripts, two tests, this report, the doc
corrections to `staging-environment.md`, the regenerated `wrapper-countdown.json`, and the evidence
directory.

**No policy. No grant. No migration. No `getAdminDb` routing. No migrated call site.** Every fix this
report names is named and not applied.
