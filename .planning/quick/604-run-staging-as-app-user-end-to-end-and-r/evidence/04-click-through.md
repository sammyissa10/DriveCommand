# quick-604 · 04 — the click-through

Taken 2026-09-15T10:26:46.175Z against http://localhost:3000, with a real session cookie obtained from the real `/api/auth/login`.
**Every row below is its own verdict. There is no summary row anywhere in this table.**

- named surfaces: **26** — the script refuses to run with fewer than 25
- cron routes: **14**, enumerated from `src/app/api/cron/` and asserted `=== 14`
- other scheduled entry points, deliberately NOT folded into the 14: `/api/warmup`
- total entries: **66** — pass 47 · fail 13 · not-reachable 6

## The three sessions

| role | email | tenantId | cookies set by `/api/auth/login` |
|---|---|---|---|
| OWNER_A | `owner@alpha.staging.test` | `b5623cdd-dc19-4900-b75d-0ecfcaf191b8` | `sb-wyixpgunnjmzguhggocz-auth-token` |
| DRIVER_A | `driver1@alpha.staging.test` | `b5623cdd-dc19-4900-b75d-0ecfcaf191b8` | `sb-wyixpgunnjmzguhggocz-auth-token` |
| OWNER_B | `owner@beta.staging.test` | `8c6136c4-eb7b-4a89-a524-d1d0e2c8d045` | `sb-wyixpgunnjmzguhggocz-auth-token` |

No cookie was forged. `@supabase/ssr` set them on the login response and the script replayed them verbatim.

## Guard 2 — `pg_stat_activity` on BOTH databases

| moment | staging total / `app_user` | production total / `app_user` |
|---|---|---|
| server up, before any surface | 13 / **0** | 17 / **0** |
| immediately after the surface walk | 18 / **1** | 16 / **0** |
| after the server was stopped | 16 / **1** | 18 / **0** |
| 90s after the server was stopped | 13 / **0** | 17 / **0** |
| pass 2: before server start | 13 / **0** | 13 / **0** |
| pass 2: immediately after the surface walk | 18 / **1** | 13 / **0** |
| pass 2: 90s after the server was stopped | 13 / **0** | 13 / **0** |
| pass 2 (re-run): immediately after the surface walk | 18 / **1** | 13 / **0** |
| pass 2 (re-run): 95s after the server was stopped | 15 / **0** | 13 / **0** |

**Production showed zero `app_user` connections at every reading.** Production's *total* moved (17 → 16 → 18 → 17);
that is other traffic on a shared Supabase project, which this measurement cannot attribute and does not claim.

The third reading still shows **staging `app_user` = 1** after the server was killed. That backend's
`application_name` is **`Supavisor`**, not the application — the pooler holds its own upstream session and retires it
on its own schedule. A fourth reading 90 s later is 0. Recorded rather than smoothed over, because "it went to zero
eventually" and "it went to zero when the server stopped" are different claims and only the first is true.

## Named surfaces (26)

| kind | surface | role | method | HTTP | verdict | SQLSTATE | reason | log bytes |
|---|---|---|---|---|---|---|---|---|
| surface | `/dashboard` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 942–1028 |
| surface | `/carrier/dashboard` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 1028–1121 |
| surface | `/carrier/trips` | OWNER_A | GET | 500 | **fail** | `TC001` | HTTP 500 | 1121–3092 |
| surface | `/carrier/loads` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3092–3183 |
| surface | `/carrier/clients` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3183–3278 |
| surface | `/carrier/contracts` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3278–3373 |
| surface | `/carrier/facilities` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3373–3469 |
| surface | `/carrier/templates` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3469–3564 |
| surface | `/carrier/imports` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3564–3658 |
| surface | `/carrier/messages` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3658–3752 |
| surface | `/drivers` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3752–3837 |
| surface | `/trucks` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 3837–5984 |
| surface | `/loads` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 5984–6065 |
| surface | `/routes` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6065–6149 |
| surface | `/invoices` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6149–6235 |
| surface | `/payroll` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6235–6318 |
| surface | `/crm` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6318–6397 |
| surface | `/compliance` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6397–6487 |
| surface | `/live-map` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6487–6571 |
| surface | `/settings/operations` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6571–6668 |
| surface | `/support` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 6668–6753 |
| surface | `/home` | DRIVER_A | GET | 200 | **pass** | — | HTTP 200 | 6753–7976 |
| surface | `/my-load` | DRIVER_A | GET | 200 | **pass** | — | HTTP 200 | 7976–9218 |
| surface | `/my-route` | DRIVER_A | GET | 200 | **pass** | — | HTTP 200 | 9218–10445 |
| surface | `/documents` | DRIVER_A | GET | 500 | **fail** | `P2022` | HTTP 500 | 10445–12430 |
| surface | `/hours` | DRIVER_A | GET | 200 | **pass** | — | HTTP 200 | 12430–12514 |

## Cron routes (14, enumerated from the directory)

| kind | surface | role | method | HTTP | verdict | SQLSTATE | reason | log bytes |
|---|---|---|---|---|---|---|---|---|
| cron | `/api/cron/auto-close-tickets` | CRON | GET | 200 | **pass** | — | HTTP 200 | 12514–12616 |
| cron | `/api/cron/automations` | CRON | GET | 200 | **pass** | — | HTTP 200 | 12616–13271 |
| cron | `/api/cron/carrier-auto-dispatch` | CRON | GET | 500 | **fail** | `SQLSTATE_UNRECOVERED` | HTTP 500 | 13271–15448 |
| cron | `/api/cron/carrier-compliance-alerts` | CRON | GET | 500 | **fail** | `P2010` | HTTP 500 | 15448–17543 |
| cron | `/api/cron/cleanup-quarantine` | CRON | GET | 200 | **pass** | — | HTTP 200 | 17543–17868 |
| cron | `/api/cron/digest-compliance-30day` | CRON | GET | 500 | **fail** | `TC001` | HTTP 500 | 17868–26374 |
| cron | `/api/cron/digest-daily-driver` | CRON | GET | 500 | **fail** | `TC001` | HTTP 500 | 26374–34845 |
| cron | `/api/cron/digest-weekly-owner` | CRON | GET | 500 | **fail** | `TC001` | HTTP 500 | 34845–43316 |
| cron | `/api/cron/mark-overdue-invoices` | CRON | GET | 200 | **pass** | — | HTTP 200 | 43316–43609 |
| cron | `/api/cron/purge-deleted` | CRON | GET | 500 | **fail** | `TC001` | HTTP 500 | 43609–68391 |
| cron | `/api/cron/send-reminders` | CRON | GET | 500 | **fail** | `TC001` | HTTP 500 | 68391–79712 |
| cron | `/api/cron/trip-reminders` | CRON | GET | 500 | **fail** | `TC001` | HTTP 500 | 79712–83112 |
| cron | `/api/cron/workflow-digest` | CRON | GET | 200 | **pass** | — | HTTP 200 | 83112–83650 |
| cron | `/api/cron/workflow-notifications` | CRON | GET | 500 | **fail** | `42501` | HTTP 500 | 83650–87037 |

## Other scheduled entry points

| kind | surface | role | method | HTTP | verdict | SQLSTATE | reason | log bytes |
|---|---|---|---|---|---|---|---|---|
| scheduled (not one of the 14) | `/api/warmup` | CRON | GET | 200 | **pass** | — | HTTP 200 | 87037–87185 |

## PASS 2 — the brief-named surfaces pass 1 substituted away (25)

Run 2026-09-15T11:08:36.099Z, same harness, same pass criterion, same evidence shape.

Sysadmin fixture: `sysadmin@staging.test` (`User.isSystemAdmin = true`, `app_metadata.isSystemAdmin = true`).
Tracking token: **none** — no seeded Load carries a trackingToken — the legacy "Load" table holds 0 row(s) on staging (scripts/seed-staging.ts populates the CARRIER "loads" table, not this one).

| kind | surface | role | method | HTTP | verdict | SQLSTATE | reason | log bytes |
|---|---|---|---|---|---|---|---|---|
| surface | `/carrier/driver-pay/settlements` | OWNER_A | GET | 500 | **fail** | `SQLSTATE_UNRECOVERED` | HTTP 500 | 96428–97286 |
| surface | `/carrier/driver-pay/pending` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 97286–97391 |
| surface | `/carrier/driver-pay/reports` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 97391–97498 |
| surface | `/carrier/driver-pay` | OWNER_A | GET | 404 | **not-reachable** | — | HTTP 404 — no index page — `(owner)/carrier/driver-pay/` holds only `pending/`, `reports/` and `settlements/`, all of which ARE exercised above | 97498–97595 |
| surface | `/carrier/reports` | OWNER_A | GET | 404 | **not-reachable** | — | HTTP 404 — no index page — `(owner)/carrier/reports/` holds only `aging/`, `driver-pay/`, `performance/`, `revenue/` and `todays-trips/` | 97595–97687 |
| surface | `/carrier/reports/aging` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 97687–97787 |
| surface | `/carrier/reports/performance` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 97787–97893 |
| surface | `/carrier/reports/revenue` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 97893–97995 |
| surface | `/carrier/reports/todays-trips` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 97995–98101 |
| surface | `/checklists` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 98101–98189 |
| surface | `/checklists/playbooks` | OWNER_A | GET | 404 | **not-reachable** | — | HTTP 404 — no index page — the directory holds only `[id]/`, so the list lives on `/checklists` itself | 98189–98286 |
| surface | `/checklists/instances` | OWNER_A | GET | 404 | **not-reachable** | — | HTTP 404 — no index page — the directory holds only `[id]/`; staging carries ZERO PlaybookInstance rows, so there is no id to substitute either | 98286–98383 |
| surface | `/checklists/analytics` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 98383–98481 |
| surface | `/checklists/automation` | OWNER_A | GET | 500 | **fail** | `SQLSTATE_UNRECOVERED` | HTTP 500 | 98481–99316 |
| surface | `/settings/notifications` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 99316–99419 |
| surface | `/automations` | SYSADMIN | GET | 200 | **pass** | — | HTTP 200 | 99419–99509 |
| surface | `/admin-dashboard` | SYSADMIN | GET | 200 | **pass** | — | HTTP 200 | 99509–99603 |
| surface | `/billing` | SYSADMIN | GET | 200 | **pass** | — | HTTP 200 | 99603–99792 |
| surface | `/plans` | SYSADMIN | GET | 200 | **pass** | — | HTTP 200 | 99792–99875 |
| surface | `/notifications` | SYSADMIN | GET | 200 | **pass** | — | HTTP 200 | 99875–99969 |
| surface | `/admin-support` | SYSADMIN | GET | 200 | **pass** | — | HTTP 200 | 99969–100061 |
| surface | `/track/604-probe-no-seeded-token` | NONE | GET | 404 | **not-reachable** | — | HTTP 404 — no seeded Load carries a trackingToken — the legacy "Load" table holds 0 row(s) on staging (scripts/seed-staging.ts populates the CARRIER "loads" table, not this one) | 100061–100171 |
| surface | `/sign-up` | NONE | GET | 200 | **pass** | — | HTTP 200 — the PAGE renders; the signup FLOW cannot be completed on staging — `mailer_autoconfirm: false` and the built-in mailer 429s after ~3 sends, so no confirmation email can be received | 100171–100256 |
| surface | `/onboarding` | OWNER_A | GET | 307 | **not-reachable** | — | HTTP 307 → /carrier/dashboard — redirects rather than rendering — the seeded tenant is past this gate | 100256–100344 |
| surface | `/onboarding/welcome` | OWNER_A | GET | 200 | **pass** | — | HTTP 200 | 100344–100636 |
## Guard 1 — the resolved `DATABASE_URL` in the server's shell, before start

```
GUARD 1 (run 2): DATABASE_URL ref = wyixpgunnjmzguhggocz  DATABASE_URL_ADMIN ref = wyixpgunnjmzguhggocz
```

The ref only, extracted through `new URL()`. The connection string itself is never echoed. Next does
not override variables already present in the process environment, so `.env.local`'s **production**
`DATABASE_URL` loses to the exported staging one — that precedence is the safety argument, and guard
2 verifies it rather than trusting it.

## Guard 3 — outbound delivery neutralised

```
GUARD 3: RESEND_API_KEY='' GMAIL_USER=''
UPSTASH set? url='<unset>' token='<unset>'
```

Upstash is deliberately left unset: `authLimiter` is `null` without it and `applyRateLimit` becomes a
no-op, so the three logins do not trip the 5-per-15-minutes limit and lock the run out of itself.

## The run that had to be thrown away, and why it is recorded rather than deleted

The first pass (`04-server-run1-no-admin-url.log`, committed alongside) was run with
**`DATABASE_URL_ADMIN` unset**. Six cron routes then failed with `ECONNREFUSED` out of
`prisma.tenant.findMany()` immediately after logging `[admin-db] privileged query` — the admin pool
was building a client with an undefined connection string and dialling localhost. Those six rows
would have entered the failure list as application failures under `app_user`; they were **failures of
the shell**, not of the application.

`DATABASE_URL_ADMIN` was set to the staging `app_admin` string (quick-600's connection, the
production shape) and the whole sweep re-run. Only run 2 is reported.

Also corrected between the runs: the SQLSTATE recogniser matched `[0-9A-Z]{5}` unanchored and
recovered the literal **`ECONN`** out of `ECONNREFUSED` — a five-character truncation that reads
exactly like a SQLSTATE and is not one. The recogniser now captures the whole delimited token.

## Two rows that need reading carefully

- **`/api/cron/carrier-auto-dispatch` — `SQLSTATE_UNRECOVERED`, and that is correct.** The 500 comes
  from `Error: Template has no recurrenceRule — nothing to generate`, a **fixture data** condition in
  the seeded route template, surfaced as a 500 by quick-603's "any failure is a 500" contract. There
  is no SQLSTATE because no statement was refused. **Recorded, never guessed at.**
- **`/documents` — `P2022 ColumnNotFound` on `prisma.document.findMany()`.** A Prisma error code, not
  a SQLSTATE, and not a permission problem: the staging `Document` table is missing a column the
  client expects. Schema drift on staging, recorded as a failure with its real code rather than
  being folded into an RLS bucket it does not belong in.

---

## PASS 2 — what changed, and what did not

Pass 1 shipped 26 named surfaces, but **they were not the 26 the brief named**: `/crm`,
`/compliance`, `/support` and `/routes` were substituted for brief-named surfaces, and **ten
brief-named surfaces had no verdict anywhere** — not even in the unmeasured list. That is an
omission, not a judgement, and pass 2 closes it with **25 more rows**.

Everything else is unchanged: same harness, same server env, same pass criterion (2xx/3xx **and** no
`TC001` in the correlated log window), same evidence shape, same triple guard. Staging was still
armed and still seeded, so the auth work was not repeated.

### The one new fixture

`(admin)/layout.tsx` gates on `isSystemAdmin()`, which reads `app_metadata.isSystemAdmin` off the
JWT. **No seeded OWNER carries it**, so without a sysadmin every `(admin)` route would have been a
redirect to `/sign-in` — a whole portal with no verdict, which is the weakest thing this report could
contain. `seed-staging-auth.ts --seed-sysadmin` creates one. Two non-obvious facts had to line up:

- **`UserRole` in the database has no `SYSTEM_ADMIN` member** (`OWNER | MANAGER | DRIVER`), even
  though `lib/auth/roles.ts` declares one. A sysadmin is a row carrying `isSystemAdmin = true`, a
  separate boolean column, not a role.
- **`User.tenantId` is NOT NULL**, so a sysadmin still belongs to a tenant.
- **`User.updatedAt` is Prisma's `@updatedAt` — application-side**, so the column has no database
  default and a raw `INSERT` that omits it is a `23502`. (It was.)

Get any of them wrong and you get a login that succeeds and a portal that still redirects, which
reads like an application defect and is not one. `--seed-sysadmin` asserts
`app_metadata.isSystemAdmin === true` and `jwt.sub === User.id` and exits 1 otherwise.

### Guard 2, pass 2

| moment | staging total / `app_user` | production total / `app_user` |
|---|---|---|
| pass 2: before server start | 13 / **0** | 13 / **0** |
| pass 2: immediately after the surface walk | 18 / **1** | 13 / **0** |
| pass 2: 90 s after the server was stopped | 13 / **0** | 13 / **0** |
| pass 2 (re-run): immediately after the surface walk | 18 / **1** | 13 / **0** |
| pass 2 (re-run): 95 s after the server was stopped | 15 / **0** | 13 / **0** |

Production: **zero `app_user` connections at every reading**, in both passes.

### The phase is idempotent, deliberately

`--surfaces2` **drops every existing `pass2:` row before appending**. A sweep that silently
duplicates rows inflates every downstream count while every assertion still passes — the quietest
way this report could have become wrong. It was re-run once to prove it: identical 25 rows, merged
total still 66.

### `not-reachable` reasons come from the ROUTE TREE, not from the 404

A 404 cannot tell "no such route" from "no index page", so the reasons are a committed constant on
each `PASS2_SURFACES` entry, each checked with `ls` before the list was written. A note **never**
changes a `fail` — a 500 is a 500 regardless of how the route is shaped.
