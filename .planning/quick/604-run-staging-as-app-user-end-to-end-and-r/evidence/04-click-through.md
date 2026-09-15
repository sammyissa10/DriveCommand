# quick-604 · 04 — the click-through

Taken 2026-09-15T10:26:46.175Z against http://localhost:3000, with a real session cookie obtained from the real `/api/auth/login`.
**Every row below is its own verdict. There is no summary row anywhere in this table.**

- named surfaces: **26** — the script refuses to run with fewer than 25
- cron routes: **14**, enumerated from `src/app/api/cron/` and asserted `=== 14`
- other scheduled entry points, deliberately NOT folded into the 14: `/api/warmup`
- total entries: **41** — pass 30 · fail 11 · not-reachable 0

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
