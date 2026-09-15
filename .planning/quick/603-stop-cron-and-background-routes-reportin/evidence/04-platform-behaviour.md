# 04 — What Vercel actually does with a non-200 cron response

**Task:** quick-603 Task 2. **This gates Tasks 3 and 4** — the status choice is not made until this
file exists.

**Method.** No `WebFetch` tool is available in this executor. The pages were fetched with `curl`
against `vercel.com/docs`, which serves a `text/markdown` representation at `<url>.md` — the same
content the HTML page renders, without the navigation chrome. Every quote below is verbatim from a
`200 text/markdown` response, and the fetch transcript (`HTTP status`, byte count) is recorded per
URL. **Nothing was fetched that could not be quoted.**

```
$ curl -sS -L --max-time 25 -o cron-jobs.md -w "HTTP %{http_code} bytes=%{size_download} type=%{content_type}\n" \
    https://vercel.com/docs/cron-jobs.md
HTTP 200 bytes=7624 type=text/markdown; charset=utf-8
$ ... https://vercel.com/docs/cron-jobs/manage-cron-jobs.md
HTTP 200 bytes=17496
$ ... https://vercel.com/docs/cron-jobs/usage-and-pricing.md
HTTP 200 bytes=5813
$ ... https://vercel.com/docs/logs/runtime.md
HTTP 200
$ ... https://vercel.com/docs/cron-jobs/manage.md
HTTP 404 bytes=1125     <- wrong slug, corrected to manage-cron-jobs; recorded rather than hidden
```

`cron-jobs.md` and `manage-cron-jobs.md` both carry `last_updated: 2026-08-11`;
`usage-and-pricing.md` carries `last_updated: 2026-07-15`.

---

## Q1 — Does Vercel Cron retry a non-2xx response? **ANSWERED: No. Never.**

**Source:** https://vercel.com/docs/cron-jobs/manage-cron-jobs § "Cron job error handling"

> **"Vercel will not retry an invocation if a cron job fails. You can check for error logs through
> the **View Log** button in the **Cron Jobs** section in the sidebar."**

Two sentences, and the second is the whole of what a non-2xx buys.

**A second, separate fact from the same page** (§ "Cron job delivery and idempotency"), which is
*not* a retry and must not be conflated with one:

> "Cron job delivery is best effort. Most invocations run as scheduled, but occasional transient
> network errors can prevent a request from reaching your function. In those cases, your function
> does not execute, and no runtime log is created for that scheduled run.
>
> **Cron delivery can also occasionally invoke the same scheduled run more than once.** Because of
> this, cron jobs should be resilient to both missed runs and duplicate runs."

So duplicate invocation is a documented hazard **independent of the response status**. It is not
caused by returning a non-200 and is not avoided by returning a 200. See Q5 below.

## Q2 — Does a non-2xx produce anything visible? **ANSWERED: Yes, in the log. No alert.**

**Source:** https://vercel.com/docs/logs/runtime § "Level"

> **"- Requests with a status code of `4xx` are marked with **Warning** amber
>  - Requests with a status code of `5xx` are marked with **Error** red"**

and, from the same page's filter list:

> "### Status Code
> You can filter your logs based on HTTP status codes. This is useful for finding requests that
> resulted in specific errors (like `404` or `500`) or successful responses (`200`)."

and

> "You can filter your logs based on framework-defined mechanism or rendering strategy used such as
> API routes, Incremental Static Regeneration (ISR), and **cron jobs**."

**Source:** https://vercel.com/docs/cron-jobs/manage-cron-jobs § "Cron jobs logs"

> "Cron jobs are logged as function invocations from the **Logs** section in your project dashboard
> sidebar. You can view the logs for a cron job from the list on the Cron jobs settings page … This
> will take you to the runtime logs view with a `requestPath` filter to your cron job such as
> `requestPath:/api/my-cron-job`."
>
> "Note that when cron jobs respond with a **redirect or a cached response, they will not be shown
> in the logs.**"

**What this establishes:** a 5xx is marked **Error red**, is reachable with a `level=error` filter
and a `status` filter, and is visible on the cron job's own log view. **What it does NOT establish:**
any alert, notification, email, or dashboard failure badge. **No page found says a non-2xx cron
response notifies anybody.** That absence is recorded as an absence — it is not evidence that no
such feature exists, only that none is documented, and the status decision below rests on the
documented half only.

## Q3 — What counts as "failure"? **PARTIALLY ANSWERED — and the answer rules 207 out.**

**Vercel's cron documentation never defines a status threshold for "failure".** The word "fails"
appears once, in the retry sentence, undefined — and since there is no retry and no alert, there is
nothing for a threshold to gate. The closest thing to a documented classification is the log
**Level** scheme quoted in Q2, which is a three-way split and not a two-way one:

| status | log level |
|---|---|
| `2xx` | none |
| `3xx` | **not shown in the logs at all** (quoted above) |
| `4xx` | Warning (amber) |
| `5xx` | Error (red) |

**Therefore a `207 Multi-Status` is a bad choice here, and this is the finding that decides §4's
status policy.** A 207 carries *no* level marking, so in the one surface an operator actually scans
— the runtime log's Warning/Error colouring and its `level` filter — **a 207 is indistinguishable
from a 200**. It is findable only by someone who already suspects the job and types `207` into the
status filter, which is precisely the operator this task exists to stop needing. A 207 would be a
different silence, exactly as the brief warned.

3xx is worse still: *"Cron jobs do not follow redirects. When a cron-triggered endpoint returns a
3xx redirect status code, the job completes without further requests"* and such responses are not
logged at all.

**Unanswered, explicitly:** whether Vercel's internal cron machinery records a per-invocation
success/failure state distinct from the HTTP log. No fetched page mentions one. Not guessed.

## Q4 — What plan is this project on? **ANSWERED: Pro. CLAUDE.md is stale.**

**Documented limits** — https://vercel.com/docs/cron-jobs/usage-and-pricing:

> |                | **Number of cron jobs per project** | **Minimum interval** | **Scheduling precision** |
> | -------------- | ----------------------------------- | -------------------- | ------------------------ |
> | **Hobby**      | 100 cron jobs                       | Once per day         | Per-hour (±59 min)       |
> | **Pro**        | 100 cron jobs                       | Once per minute      | Per-minute               |
> | **Enterprise** | 100 cron jobs                       | Once per minute      | Per-minute               |

> "**Daily execution limit**: Cron jobs can only run once per day. Expressions like `0 * * * *`
> (per-hour) or `*/30 * * * *` (every 30 minutes) will fail deployment with the error: *Hobby
> accounts are limited to daily cron jobs. This cron expression would run more than once per day.*"

**The plan's suspected conflict does not exist.** The limit that `vercel.json`'s 14 crons could have
breached is **100 per project, on every plan including Hobby**. 14 ≪ 100. The Hobby restriction is on
**frequency and precision, never on count** — so "CLAUDE.md says Hobby, yet vercel.json carries 14
crons" was never a contradiction. Recording that plainly because the question was posed as if it
might be one.

**The project's actual plan**, read live from the Vercel API with the already-authenticated CLI
credential (a read-only `GET`; nothing was written, deployed, or changed):

```
$ vercel whoami
sammyissa10
$ curl -H "Authorization: Bearer $TOKEN" https://api.vercel.com/v2/teams/sammyissa10s-projects
billing.plan = "pro"
name = sammyissa10's projects | slug = sammyissa10s-projects

$ cat .vercel/project.json
projectId = prj_Xmoayi3nYc5ZxVvS3khXO34BtOU3
orgId     = team_6G6wnzQoMQXYRg7xc08k5scO
$ curl -H "Authorization: Bearer $TOKEN" \
    "https://api.vercel.com/v9/projects/prj_Xmoayi3nYc5ZxVvS3khXO34BtOU3?teamId=team_6G6wnzQoMQXYRg7xc08k5scO"
project.name = drive-command
accountId    = team_6G6wnzQoMQXYRg7xc08k5scO      <- same team, so the "pro" plan is this project's
crons.definitions = 14 entries
```

**`billing.plan` is `"pro"`, and the project's `accountId` is that same team.** The project is on
**Pro**, not Hobby.

**CLAUDE.md, `trip-reminders/route.ts`'s header comment (lines 11–23), and the Phase 52 note in
STATE.md all assert Hobby**, and all three use it to justify a coarser schedule than the feature
wants:

- `trip-reminders`: *"This account is on the Vercel Hobby plan, which permits only once-daily cron
  schedules … A reminder that fires once a day at 13:00 UTC is genuinely coarser than the feature
  wants: the ideal is 'a couple of hours before scheduled departure', which needs hourly at
  minimum."*
- `workflow-notifications` header, lines 4–6: *"Schedule: Hourly … Recommended vercel.json entry
  (add on deploy): `{ "path": "/api/cron/workflow-notifications", "schedule": "0 * * * *" }`"* — the
  live schedule is `0 7 * * *`, daily.
- `cleanup-quarantine` documents `0 * * * *`, hourly — which on Hobby *"will fail deployment"*, and
  which is very plausibly why it was never added at all.

On Pro, all three of those are now available. **Reported, not fixed.** Changing a schedule is a
product decision, and `vercel.json` is not touched by this task.

**The live cron definitions from the API confirm the enumeration independently**: 14 definitions,
identical to `vercel.json`, and **`cleanup-quarantine` is absent from the deployed project too** —
not merely from the config file.

## Q5 — Does a retry make any route non-idempotent?

**The retry half is moot: Vercel does not retry** (Q1). **So this task's status change introduces no
retry hazard whatsoever** — a route that starts returning 500 instead of 200 will not be called
again for it. That is worth stating as a benefit: `send-reminders` returning 500 does not re-send
anything.

The **duplicate-delivery** half is live, documented, and independent of status. Measured against the
code:

| route | duplicate-delivery safe? | why |
|---|---|---|
| `purge-deleted` | **yes** | `deleteMany({ deletedAt: { lt: cutoff } })` — a second run finds nothing |
| `mark-overdue-invoices` | **yes** | set-status-to-OVERDUE; the docs' own "Good" example |
| `auto-close-tickets` | **yes** | set-status-to-CLOSED |
| `carrier-auto-dispatch` | **yes** | `generateDispatches` returns `skippedExisting` — it dedups |
| `automations` | **yes** | lifetime / 20h-window dedup before each `automationRun.create` |
| `trip-reminders` | **yes** | goes through `emitNotification`, which passes `dedupWindowMs: NOTIFICATION_DEDUP_WINDOW_MS` (5 min rolling) |
| `send-reminders` | **NO** | calls `dispatchNotification` **without** `dedupWindowMs` |
| `digest-daily-driver` / `-weekly-owner` / `-compliance-30day` | **NO** | same |
| `workflow-notifications` | partly | the `isOverdue=true` write dedups sweep 1; sweep 2's `notifications: { none: … }` dedups the email — both are real state checks |
| `workflow-digest` | **yes** | writes a `DAILY_DIGEST` `PlaybookNotification` dedup row and checks it first |

**The mechanism behind the four NOs, stated exactly.** `buildIdempotencyKey`
(`src/lib/notifications/idempotency.ts:23`) has two scopes: an event scope pinned to the **ISO
second**, and a digest scope pinned to **YYYY-MM-DD**. The digest scope is **unreachable** — all
three call sites in `dispatcher.ts` (`:229`, `:320`, `:450`) pass `isDigest` as the hardcoded literal
`false`. So every key in the system is event-scope, and two deliveries more than one second apart
produce two different keys and two sends. The digest routes' `relatedEntity.id` does carry the date
(`${tenant}:${user}:${dateIso}`), which narrows the key but does not close it, because the ISO second
is appended regardless.

**Pre-existing, reported, NOT fixed.** Closing it is a change to the notification module's
idempotency — passing `dedupWindowMs` at four call sites, or making `isDigest` reachable — which is
a different task with a different blast radius. It is recorded here because Q5 asked and because the
answer is "yes, four routes are non-idempotent, and it has nothing to do with the status code".

---

## The decisions

### Decision 1 — the status code

**A partially-failed batch returns `500`. A total failure returns `500`. A fully-successful run is
unchanged: `200`.**

Reasoning, in the order it was decided:

1. **207 is rejected** on Q3's finding: it carries no log Level, so it is invisible in the exact
   surface an operator scans. A status nobody's eye lands on is a different silence.
2. **4xx is rejected** because it claims the *request* was at fault. Vercel's cron request was
   correct; the server failed to do the work.
3. **500 is chosen.** It is marked **Error red**, it is reachable with `level=error` and a status
   filter, and it appears on the cron job's own `requestPath`-filtered log view — all three quoted
   above.
4. **Returning 500 costs nothing**, because Vercel does not retry (Q1). The partial work that did
   succeed is not undone and is not repeated.

**The justification is explicitly the WEAKER one, and it is stated as weaker.** A non-200 here does
**not** trigger a retry and does **not** alert anybody, and no fetched page says otherwise. What it
buys is exactly two things: (a) the invocation is coloured red and is filterable as an error in the
runtime log, and (b) `logger.error` already routes to `Sentry.captureException`, so the named failure
reaches Sentry with a real message once §6's arity fix lands. **"Visible in the log and to Sentry" is
the whole claim. It is not "it alerts".**

### Decision 2 — the response-body contract

**One shape, implemented identically by every route Task 3 touches, ADDITIVE ONLY.** Every existing
key keeps its name and its meaning. Two keys are added, plus one that appears only when it must:

```jsonc
{
  // … every key the route already returned, unchanged …

  "failureCount": 0,          // NEW — total failures, NEVER capped
  "failures": [],             // NEW — the named failures
  // "failuresTruncated": true  // NEW, present ONLY when the list was capped
}
```

with each entry

```jsonc
{ "scope": "CarrierLoad", "message": "relation does not exist", "code": "TC001" }
```

`scope` names the thing that failed — the model, the tenant id, the driver id, the object key.
`message` is the real message (`err instanceof Error ? err.message : String(err)`). `code` is
carried when the error object has one (Prisma's `code`, Postgres' `code`) and omitted otherwise.

The three properties the plan requires, and where each is discharged:

- **(a) every failure is NAMED with a real message** — the `failures[]` entries, and the log line,
  which uses the real `logger.error(msg, err, { …ctx, err: serializeError(err) })` arity.
- **(b) `success`/`ok` is never true while the failure count is non-zero** — `success`/`ok` is
  *computed* as `failureCount === 0`, not written as a literal. There is no code path that can set
  it to `true` beside a non-zero count, because the literal is gone.
- **(c) a failure is never erased from a total** — `failureCount` is incremented at the point of
  failure and is never filtered, and `purge-deleted`'s `-1` sentinel + `.filter(n => n > 0)` is
  deleted rather than patched: successes and failures become two separate structures, so there is no
  total for a failure to be erased *from*.

**The list is capped at 50 entries and `failureCount` is not.** A tenant sweep that fails for 5,000
tenants must not return a 5,000-element array, and a silent cap is the failure mode
`trip-reminders:108` already refuses by name ("No silent caps. If a tenant is truncated, say so").
`failuresTruncated: true` is emitted whenever the cap bites.

**On a fully-successful run nothing observable changes**: `success: true`, HTTP 200, every original
key present and identical, plus `failureCount: 0` and `failures: []`. Consumers are grepped for in
Task 3 before a line is written.
