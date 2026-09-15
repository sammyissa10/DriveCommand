# quick-602 — step 4e: the same 14 cron routes over REAL HTTP

**It ran.** An in-process call is not an HTTP request through middleware, and a route handler
invoked directly skips the Next request lifecycle (`after()`, `headers()`, `cookies()`). This pass
closes that gap for the one population that needs no session.

## The triple guard — all three satisfied, all three recorded

**GUARD 1 — the resolved `DATABASE_URL` in the server's shell, printed before the server started.**

```
GUARD 1: DATABASE_URL project ref in this shell = wyixpgunnjmzguhggocz
```

(The ref only. The connection string itself is never printed — the first draft of the guard
accidentally echoed the whole URL, which is why it extracts the ref through `new URL()` now.)
Next does not override variables already present in the process environment, so `.env.local`'s
**production** `DATABASE_URL` loses to the exported staging one. That precedence is the entire
safety argument, which is why guard 2 verifies it rather than trusting it.

**GUARD 2 — `pg_stat_activity` on BOTH databases, production read-only.**

| moment | staging total / `app_user` | production total / `app_user` |
|---|---|---|
| server up, before any route was hit | 8 / **0** | 7 / **0** |
| after all 14 routes | 12 / **1** | 9 / **0** |
| after the server was stopped | 8 / **0** | 9 / **0** |

A new `app_user` backend appeared on **staging** and none ever appeared on **production**.
`app_user` is the decisive column: the only credentials this shell carried were the staging
`app_user` ones, so a connection from this host to production would have to show up there.
Production's *total* moved 7 → 9 and did not come back down; that is platform and other-client
traffic on a shared Supabase project, which this measurement cannot attribute and does not claim to.
`/api/health` was deliberately not used as an identity probe — it does no DB work.

**GUARD 3 — outbound delivery neutralised in the server's shell too.**

```
GUARD 3: RESEND_API_KEY='' GMAIL_USER=''
```

## How the tripwire was armed for this pass, and why that needed a temporary edit

`ALTER ROLE`/`ALTER DATABASE … SET` is refused for this placeholder GUC (`06-tripwire-matrix.md`),
and a further attempt measured here shows the **connection-string `options` parameter is silently
dropped by Supavisor** — three spellings, all connecting successfully, all reading the flag back as
`''`:

```
?options=-c%20app.tenant_context_tripwire%3Don  -> {"f":"","pid":569546}
?options=-capp.tenant_context_tripwire%3Don     -> {"f":"","pid":569546}
pg Client({ options: '-c app.tenant_context_tripwire=on' }) -> {"f":"","pid":569546}
```

So a server process can only be armed by issuing a session `SET` from inside it. For this pass,
`lib/db/prisma.ts` carried a **temporary, uncommitted** `pool.on('connect')` guarded by
`TRIPWIRE_ARM=1` — inert without the variable — and it was reverted immediately afterwards
(`git checkout`; `grep -c TRIPWIRE_ARM src/lib/db/prisma.ts` = **0**). No call site was migrated and
nothing was committed.

## Per-route: HTTP verdict vs in-process verdict

Detection over HTTP can only use what leaves the process: the response body, and the server log.
Both are labelled per row.

| route | HTTP status | HTTP verdict | detected via | in-process verdict | agree? |
|---|---|---|---|---|---|
| `auto-close-tickets` | 500 | **RAISED_TC001** | response body carries `Code: \`TC001\``; 3 log mentions | RAISED_TC001 | yes |
| `automations` | 500 | **RAISED_TC001** | response body carries the TC001 MESSAGE | RAISED_TC001 | yes |
| `carrier-auto-dispatch` | 500 | **RAISED_TC001** | 2 log mentions (`originalCode: 'TC001'`) | RAISED_TC001 | yes |
| `carrier-compliance-alerts` | 500 | COMPLETED (no TC001) | 0 log mentions | COMPLETED | yes |
| `cleanup-quarantine` | 200 | COMPLETED, `scanned:0` | — | **OTHER_FAILURE** (`S3_BUCKET` missing) | **NO** |
| `digest-compliance-30day` | 200 | **RAISED_TC001** ×2, swallowed | 4 log mentions, `failed:2` in the body | RAISED_TC001 ×2 | yes |
| `digest-daily-driver` | 200 | **RAISED_TC001** ×2, swallowed | 4 log mentions, `failed:2` | RAISED_TC001 ×2 | yes |
| `digest-weekly-owner` | 200 | **RAISED_TC001** ×2, swallowed | 4 log mentions, `failed:2` | RAISED_TC001 ×2 | yes |
| `mark-overdue-invoices` | 200 | COMPLETED | — | COMPLETED | yes |
| `purge-deleted` | 200 | **COMPLETED — the raise is UNDETECTABLE from outside** | body says `totalPurged:0` with every model `-1`; log says `Error: [object Object]` | **RAISED_TC001 ×7** | **NO** |
| `send-reminders` | 200 | **RAISED_TC001** ×2, swallowed | 4 log mentions | RAISED_TC001 ×2 | yes |
| `trip-reminders` | 500 | **RAISED_TC001** | 3 log mentions | RAISED_TC001 | yes |
| `workflow-digest` | 200 | COMPLETED | — | COMPLETED | yes |
| `workflow-notifications` | 200 | COMPLETED | — | COMPLETED | yes |

## The two disagreements, which are the most interesting result here

**1. `purge-deleted` — the raise happened and NOTHING outside the process could see it.**
In-process, the driver-level instrument observed **seven** TC001 rejections, one per model. Over
HTTP the route returned `200 {"success":true,"totalPurged":0,...}` with every model's count `-1`,
and the server log recorded each failure as

```
[CRON] purge-deleted: Failed to purge CarrierLoad Error: [object Object]
```

That is the `logger.error(message, error, context)` arity bug CLAUDE.md already records — the
context object is passed where the error belongs, collapsing it to `new Error('[object Object]')`.
**The tripwire fired seven times and an operator watching logs and status codes would have learned
nothing.** It is not a tripwire defect; it is the exact failure-swallowing `guc-binding.md` inventoried,
now demonstrated with a signal that was definitely present. The in-process pass saw it only because
it observes the driver's own promise rejections rather than what the route does with them.

**2. `cleanup-quarantine` — an environment difference, not a lifecycle difference.**
The in-process harness carries only `.env.staging`, so the route threw on a missing `S3_BUCKET` and
was recorded as `OTHER_FAILURE` (evidence about nothing). The dev server loads `.env.local`, which
supplies it, so the route ran and returned `200 scanned:0`. Both verdicts are correct for their
environment, and the route touches no tenant-scoped table either way — which is what `dbTouched`
exists to say.

**No disagreement was caused by the request lifecycle itself.** Middleware passes `/api/cron/*`
through (`isWebhookOrCron`), and nothing in this population depends on `headers()`/`cookies()`.

## What this pass still did not measure

- `carrier-auto-dispatch`'s `after()`-deferred work. It ran under a real request this time, but the
  route's synchronous body raised first, so whatever it defers was not reached — the same
  NOT_INVOKED entry as the in-process pass, for a different reason.
- Any route requiring a browser session. The cron population was chosen precisely because it does not.
