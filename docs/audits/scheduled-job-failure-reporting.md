# Scheduled-job failure reporting

**Date:** 2026-09-15
**Task:** quick-603.
**Predecessor:** `docs/audits/unmigrated-path-tripwire.md` §5 — the HTTP pass that produced this
task. That pass is the evidence that the failures below are not hypothetical: it made seven database
errors happen inside `purge-deleted` and watched the route return `200 {"success":true}`.
**Target:** source only. **No database was written by this task, staging or production.** No
migration, no schema change, no RLS policy, nothing installed.

Every number below cites the evidence file it came from:
`.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/`.

---

## 0. The problem, in one paragraph

A scheduled job in this repo can fail and say it succeeded. quick-602 armed a tripwire that made
every unscoped statement raise `TC001`, then invoked the cron surface over HTTP: `purge-deleted`
raised seven times, `send-reminders` six, and each of the three digests twice — and every one of
those runs returned **HTTP 200** with `success: true` in the body
(`evidence/11-execution-http.md` of quick-602). `purge-deleted` went further: it wrote a `-1`
sentinel per failed model and then **erased it** with `.filter(n => n > 0)` before summing, so the
body read `totalPurged: 0` — the same number a clean run with nothing to purge produces — and it
logged each of the seven failures as `Error: [object Object]`, which is also what Sentry received. An
operator watching status codes, response bodies and logs would have learned nothing from any of the
three. This document enumerates the scheduled surface, classifies every catch on it, fixes the
reporting without touching the catching, and states how wide the logging half of the defect actually
is.

---

## 1. The enumeration

Built as a **union of three sources, each asserted separately**. Building it from any single source
is the failure this section exists to prevent — quick-602 built it from the directory and missed
`/api/warmup`; a `vercel.json`-only enumeration misses `cleanup-quarantine`.

Full commands and outputs: `evidence/01-enumeration.md`.

| source | count | asserted how |
|---|---|---|
| **A** — `apps/web/vercel.json` `.crons[].path` | **14** | `node -e` parse of the real file |
| **B** — `apps/web/src/app/api/cron/*/route.ts` | **14** | `ls -d … \| wc -l`, never a hardcoded list |
| **union A ∪ B** | **15** | `A ∩ B = 13` |
| **C** — background handlers | candidate populations, see §1.3 | grep, each command published |

Both A and B match the planning figures exactly. The union is 15 and **neither source is complete**.

### 1.1 Asymmetry 1 — `/api/warmup` is scheduled and is not under `/api/cron/`

`apps/web/src/app/api/warmup/route.ts` (20 lines), scheduled `0 8 * * *`. It carries the same
`verifyCronSecret` guard every cron route carries, which is what makes it a scheduled entry point
rather than an ordinary route that happens to be pinged. It was invisible to quick-602 purely because
that sweep globbed `src/app/api/cron/*/`.

**Verdict: CLEAN.** It has no catch at all — `await prisma.$queryRaw\`SELECT 1\`` propagates and Next
returns a 500. The planning hypothesis ("likely CLEAN, confirm") is confirmed.

### 1.2 Asymmetry 2 — `cleanup-quarantine` was NEVER scheduled

```
$ cd apps/web && git log -S"cleanup-quarantine" --oneline -- vercel.json | wc -l
0
```

**Zero commits means never added, not descheduled.** `git log -S` reports every commit in which the
string's occurrence count changed; a route scheduled and later removed would produce two. No code
anywhere calls it either — the only inbound references outside `.next/` are three lines of prose.

**A third finding, not anticipated by the plan.** `docs/security/input-hardening.md:86` asserts as
fact that `vercel.json` carries a `0 * * * *` entry for this route, and the route's own header
comment (line 15) repeats it. Neither is true and by `git log -S` neither has ever been true.
quick-349 shipped the route, wrote the schedule into two documents and a code comment, and never
wrote it into `vercel.json`. Stale R2 quarantine objects have been accumulating since.

**Reported, not fixed.** Whether that route wants a schedule or a deletion is a product decision;
adding a cron entry is not a defect repair. Its *reporting* is fixed in §5 along with the others,
because it is in the union and it does misreport — that is a separate question from whether it runs.

### 1.3 Source C — background handlers

Candidate populations, with the exact commands in `evidence/01-enumeration.md`:

| population | measured | planning figure | reconciliation |
|---|---|---|---|
| `after(` matches | **77** across **28** files | 77 / 28 | identical |
| …of which real call sites (comment lines removed) | **43** | not stated | 34 of the 77 are prose inside comments |
| `setTimeout(`/`setInterval(` in `.ts` | **11** | 11 | identical |
| …same in `.tsx` | **65** | not stated | client components — browser timers, not server handlers |
| `^\s*void <ident>` | **66** | 66 | identical |

**The `setTimeout`/`setInterval` figure of 11 is the `.ts`-only count** and is the one relevant here;
the combined figure is 76 and is published so nobody re-derives it later and reads it as drift.

Narrowed to the defect under test — *catches, and then reports success* — **none of the 43 `after()`
call sites qualifies.** `after()` work runs after the response is already written, so it has no
status to lie about; a rejection inside one is reported by the runtime, not swallowed into a 200.
The two `after()` **wrappers** do catch, and they report correctly:

- `src/lib/document-import/commit-service.ts:264` — `afterResponse`
- `src/lib/notifications/emit.ts:87` — `emitNotificationAfterResponse`

Both use the real `logger.error(message, error, context)` arity with `serializeError(err)` in the
context, and `afterResponse`'s comment names this exact bug. Both swallow **deliberately** and say
why. Classified `DELIBERATE_REPORTED`, **cited as the precedent §5 copies, and left untouched.**

---

## 2. The classification

Per catch, not per file. Full inventory of all 37 catches with per-site reasoning:
`evidence/02-classification.md`.

```
$ cd apps/web && grep -rnE "\}\s*catch|\.catch\(" src/app/api/cron/*/route.ts src/app/api/warmup/route.ts | wc -l
37
```

The four symptoms:

| id | symptom |
|---|---|
| **S1** | the log renders `Error: [object Object]` — an object literal in `logger.error`'s slot 2 |
| **S2** | `success`/`ok` is `true` beside a non-zero failure count, and/or 200 for a partially-failed batch |
| **S3** | a failure is counted **nowhere at all** |
| **S4** | a failure is **erased** from a total that already had it |

| # | entry point | verdict | symptoms | intended fix |
|---|---|---|---|---|
| 1 | `/api/warmup` | **CLEAN** | — | no catch; propagates. Leave alone |
| 2 | `auto-close-tickets` | **CLEAN** | — | honest 500, real arity. Leave alone |
| 3 | `mark-overdue-invoices` | **CLEAN** | — | same shape. Leave alone |
| 4 | `automations` | `DELIBERATE_MISREPORTED` | S3 | count + name per-tenant scheduling failures; stop `ok:true` beside them |
| 5 | `carrier-auto-dispatch` | `DELIBERATE_MISREPORTED` | S2 | `success` and status must follow `total_errors` |
| 6 | `carrier-compliance-alerts` | `DELIBERATE_MISREPORTED` | S1 S2 S3 | real arity at `:99`; count the lost tenant and the failed email; honest `success` + status |
| 7 | `cleanup-quarantine` | `DELIBERATE_MISREPORTED` | S1 S2 | real arity at `:85`/`:97`; honest `success` + status. **Schedule NOT added** |
| 8 | `digest-compliance-30day` | `DELIBERATE_MISREPORTED` | S2 | honest `success` + status beside the `failed` it already returns |
| 9 | `digest-daily-driver` | `DELIBERATE_MISREPORTED` | S2 | as above |
| 10 | `digest-weekly-owner` | `DELIBERATE_MISREPORTED` | S2 | as above |
| 11 | `purge-deleted` | `DELIBERATE_MISREPORTED` | S1 S2 S4 | real arity; delete the `-1` sentinel and the `.filter(n>0)`; separate `purged` from `failures` |
| 12 | `send-reminders` | `DELIBERATE_MISREPORTED` | S2 S3 | count and NAME the lost tenant; honest `success` + status |
| 13 | `trip-reminders` | `DELIBERATE_MISREPORTED` | S2 | honest `ok` + status beside the `tenantsFailed` it already returns |
| 14 | `workflow-digest` | `DELIBERATE_MISREPORTED` | S1 S2 S3 | real arity ×3; count the failed emails; honest `ok` + status |
| 15 | `workflow-notifications` | `DELIBERATE_MISREPORTED` | S1 S2 S3 | real arity ×4; count a failed SWEEP separately from a failed item; honest `ok` + status |

**CLEAN 3 · DELIBERATE_MISREPORTED 12 · ACCIDENTAL 0 · DELIBERATE_REPORTED 0 among the 15**
(the two `after()` wrappers hold that verdict, and are not scheduled entry points).

The plan's fact table listed five known swallowers. **The re-confirmation found twelve.** The five
are all confirmed, symptom for symptom — including `purge-deleted`'s three-defects-in-54-lines and
`send-reminders`'s uncounted tenant-level `continue`. The additional seven were not in that table and
are the finding of this section, not a disagreement with it: the planning table was explicitly the
*known* swallowers, and the enumeration existed to find the rest.

Two of the seven are worth naming separately, because their symptom is S3 at sweep scale rather than
at item scale:

- **`workflow-notifications:109` and `:162`** — a catch around each entire sweep, counted nowhere. If
  the STEP_OVERDUE query fails, the response is `{ok:true, stats:{overdueSent:0, overdueErrors:0}}`,
  which is **byte-identical to a clean run with nothing due**. There is no reading of that body that
  distinguishes "nothing to do" from "the sweep never ran".
- **`carrier-compliance-alerts:113`** — a failed tenant simply does not increment `orgs_processed`,
  so a tenant that blew up is indistinguishable from a tenant that does not exist.

### 2.1 ACCIDENTAL: there were none, and this is how that was established

All 37 catches were read in full. The three shapes the plan names as typical were searched for
explicitly:

```
$ grep -rnE "catch\s*\{" src/app/api/cron src/app/api/warmup | wc -l
0                                     # no bare `catch {}`
$ grep -rnE "\.catch\(\(\s*\)\s*=>" src/app/api/cron src/app/api/warmup
(no output)                           # no `.catch(() => null)`
```

Every one of the 37 binds an error variable and logs it. For the third shape — a `try` wider than the
statement that can legitimately fail — each block's extent was read: the four sweep-level catches
that wrap a query *and* a loop all sit outside a loop whose body **already carries its own inner
catch**, so only a query failure can reach them. Wide in line count, narrow in what can arrive.

**Zero ACCIDENTAL sites.** The defect is uniformly in the reporting, never in the catching. That
makes the plan's design constraint 1 a description of the entire population rather than most of it,
and makes Task 4 a one-line finding **by measurement, not by omission**.

---

## 3. How wide the logging defect is — it is far wider than these routes

### 3.1 The measurement

Two instruments were run, and they disagree by one. Both are published.

```
$ cd apps/web && find src -name "*.ts" -o -name "*.tsx" | grep -v "^src/generated/" | wc -l
1690
$ grep -rn "logger\.error(" src --include="*.ts" --include="*.tsx" | grep -v "^src/generated/" | wc -l
621
$ grep -rnE 'logger\.error\(([^,]*(`[^`]*`)?[^,]*), \{' src --include="*.ts" --include="*.tsx" \
    | grep -v "^src/generated/" | wc -l
75
$ node evidence/scripts/scan-logger-arity.mjs      # balanced-delimiter argument walk
files scanned: 1690
TOTAL logger.error calls: 621
OBJECT LITERAL in slot 2 (the defect): 76
message only (1 arg): 13
identifier/expression in slot 2: 532
sum check: true
```

**The published figure is 76**, from the balanced scan, which is also the brief's figure. The
planner's 75 came from the line-oriented grep, and the discrepancy was resolved by diffing the two
site lists rather than by preferring a number:

```
IN BALANCED, NOT IN GREP: 1
  src/app/api/cron/workflow-notifications/route.ts:156 ::
    logger.error( `[CRON] workflow-notifications: INSTANCE_BLOCKED email failed for
    instance ${instance.id}`, { err } )
IN GREP, NOT IN BALANCED: 0
```

The grep's blind spot is a call whose second argument sits on a different line from `logger.error(`.
Exactly one such call exists, and — with a certain symmetry — it is inside one of the routes this
task fixes. `evidence/scripts/scan-logger-arity.mjs` is committed so the number is reproducible, and
it CRLF-normalises before scanning (quick-546).

### 3.2 The statement

**Yes — the logger-arity defect is far wider than these routes.**

- **76 of 610 `logger.error` calls — 12.5% — across 36 files** pass an object literal where the
  function's second parameter is the error. (**Corrected during Task 3**: the grep-based denominator
  of 621 counted 11 occurrences of the string `logger.error(` inside COMMENTS. The scanner gained a
  comment stripper, and the numerator was re-measured against the pre-fix tree with it — still
  **76**, so the headline is unaffected and only the denominator moved. `evidence/05a`.)
- The scheduled surface accounts for **11** of those 76 (`carrier-compliance-alerts` ×1,
  `cleanup-quarantine` ×2, `purge-deleted` ×1, `workflow-digest` ×3, `workflow-notifications` ×4).
  The other **65 are elsewhere in the application**: server actions, API routes, `lib/`, and React
  `error.tsx` boundaries.
- The consequence is identical at every one of them. `logger.ts:52` is
  `const errorObj = error instanceof Error ? error : new Error(String(error ?? message))`, so an
  object literal becomes `new Error('[object Object]')`, and **that** is what reaches
  `Sentry.captureException` on line 54 — no message, no code, no stack from the real failure. The
  context object that carried the real error never gets there at all, because it was consumed as
  slot 2.
- `logger.ts`'s own doc comment (lines 5–15) describes a previous instance of the same class, and
  `commit-service.ts:264`'s comment describes another. This is the third.

The full by-name list of all 76 is `evidence/03-logger-sites.md`. The per-site classification and
what was done about each is §6 below.

---

## 4. What Vercel does with a non-200, and the status policy

Full transcript, every URL with its HTTP status and byte count, every quote verbatim:
`evidence/04-platform-behaviour.md`. **No `WebFetch` tool exists in this executor**; the pages were
fetched with `curl` against `vercel.com/docs`, which serves a `text/markdown` representation at
`<url>.md`. One fetch 404'd (`/docs/cron-jobs/manage.md` — wrong slug) and is recorded as such rather
than dropped.

### 4.1 Retry — **no, never**

https://vercel.com/docs/cron-jobs/manage-cron-jobs § "Cron job error handling":

> **"Vercel will not retry an invocation if a cron job fails. You can check for error logs through
> the View Log button in the Cron Jobs section in the sidebar."**

Two sentences, and the second is the whole of what a non-2xx buys.

Not to be conflated with it, from § "Cron job delivery and idempotency" on the same page:

> "Cron job delivery is best effort … **Cron delivery can also occasionally invoke the same scheduled
> run more than once.** Because of this, cron jobs should be resilient to both missed runs and
> duplicate runs."

Duplicate invocation is a documented hazard **independent of the response status** — not caused by a
non-200, not prevented by a 200. See §4.5.

### 4.2 Visibility — **yes in the log, and no alert**

https://vercel.com/docs/logs/runtime § "Level":

> **"- Requests with a status code of `4xx` are marked with Warning amber
>  - Requests with a status code of `5xx` are marked with Error red"**

and https://vercel.com/docs/cron-jobs/manage-cron-jobs § "Cron jobs logs":

> "Cron jobs are logged as function invocations from the Logs section … This will take you to the
> runtime logs view with a `requestPath` filter to your cron job such as
> `requestPath:/api/my-cron-job`."

**No page found says a non-2xx cron response notifies anybody.** That absence is recorded as an
absence: it is not proof no such feature exists, only that none is documented, and §4.6 rests on the
documented half alone.

### 4.3 What counts as failure — **no documented threshold, and the answer rules 207 out**

Vercel's cron docs never define a status threshold for "failure". The word "fails" appears once, in
the retry sentence, undefined — and with no retry and no alert there is nothing for a threshold to
gate. The nearest documented classification is the log **Level**, and it is a *three*-way split:

| status | log level |
|---|---|
| `2xx` | none |
| `3xx` | **not shown in the logs at all** |
| `4xx` | Warning amber |
| `5xx` | Error red |

**This is what rules out `207 Multi-Status`.** A 207 carries no level marking, so in the one surface
an operator scans — the Warning/Error colouring and the `level` filter — **a 207 is indistinguishable
from a 200**. It is findable only by someone who already suspects the job. That is the brief's
"different silence", precisely.

3xx is worse: *"Cron jobs do not follow redirects … Redirect responses are treated as final"*, and
redirect responses *"will not be shown in the logs"*.

**Explicitly unanswered:** whether Vercel records a per-invocation success/failure state distinct
from the HTTP log. No fetched page mentions one, and it is not guessed at.

### 4.4 The plan — **Pro, and CLAUDE.md is stale**

https://vercel.com/docs/cron-jobs/usage-and-pricing:

> | | Number of cron jobs per project | Minimum interval | Scheduling precision |
> |---|---|---|---|
> | Hobby | 100 cron jobs | Once per day | Per-hour (±59 min) |
> | Pro | 100 cron jobs | Once per minute | Per-minute |
> | Enterprise | 100 cron jobs | Once per minute | Per-minute |

**The suspected `vercel.json`-count-vs-plan-limit conflict does not exist.** The limit is **100 per
project on every plan, including Hobby**; 14 ≪ 100. Hobby restricts **frequency and precision, never
count** — so "CLAUDE.md says Hobby, yet vercel.json carries 14 crons" was never a contradiction.

The actual plan, read live from the Vercel API with the already-authenticated CLI credential (a
read-only `GET` — nothing written, deployed or changed):

```
GET /v2/teams/sammyissa10s-projects          -> billing.plan = "pro"
GET /v9/projects/prj_Xmoayi3nYc5ZxVvS3khXO34BtOU3?teamId=team_6G6wnzQoMQXYRg7xc08k5scO
     -> project.name = drive-command, accountId = team_6G6wnzQoMQXYRg7xc08k5scO   (same team)
     -> crons.definitions = 14 entries
```

**The project is on Pro.** CLAUDE.md, `trip-reminders/route.ts`'s header (lines 11–23) and the
Phase 52 STATE.md note all assert **Hobby**, and all three use it to justify a schedule coarser than
the feature wants:

- `trip-reminders`: *"the ideal is 'a couple of hours before scheduled departure', which needs hourly
  at minimum"* — deferred on a plan limit that does not apply.
- `workflow-notifications` (lines 4–6): *"Schedule: Hourly. Recommended vercel.json entry (add on
  deploy): `0 * * * *`"* — the live schedule is `0 7 * * *`, daily.
- `cleanup-quarantine`: documents `0 * * * *`, which on Hobby *"will fail deployment"* — very
  plausibly why it was never added at all (§1.2).

All three are available on Pro. **Reported, not fixed** — changing a schedule is a product decision
and `vercel.json` is not touched by this task.

**The live cron definitions confirm §1 independently:** 14, identical to `vercel.json`, and
`cleanup-quarantine` is absent from the **deployed project** too, not merely from the config file.

### 4.5 Idempotency — the retry half is moot, the duplicate half is real and pre-existing

Because Vercel does not retry, **this task's status change introduces no retry hazard at all**: a
route that starts returning 500 is not called again for it, so `send-reminders` returning 500 does
not re-send anything. That is a benefit of the choice, not a cost of it.

Duplicate *delivery* is live and documented. Measured against the code (per-route table in
`evidence/04-platform-behaviour.md` §Q5): `purge-deleted`, `mark-overdue-invoices`,
`auto-close-tickets`, `carrier-auto-dispatch`, `automations`, `workflow-digest`,
`workflow-notifications` and `trip-reminders` are all safe, each by a real state check.
**`send-reminders` and the three digests are NOT.** The mechanism:
`buildIdempotencyKey` has an event scope pinned to the **ISO second** and a digest scope pinned to
**YYYY-MM-DD**, and the digest scope is **unreachable** — all three `dispatcher.ts` call sites
(`:229`, `:320`, `:450`) pass `isDigest` as the hardcoded literal `false`. Two deliveries more than
one second apart therefore produce two keys and two sends. `trip-reminders` escapes only because it
goes through `emitNotification`, which passes `dedupWindowMs: NOTIFICATION_DEDUP_WINDOW_MS`.

**Pre-existing, reported, NOT fixed.** Closing it changes the notification module's idempotency, not
any route's reporting.

### 4.6 DECISION — the status code

**A partially-failed batch returns `500`. A total failure returns `500`. A fully-successful run is
unchanged at `200`.**

1. **207 rejected** on §4.3: no log Level, therefore invisible where an operator looks.
2. **4xx rejected**: it claims the request was at fault. Vercel's request was correct.
3. **500 chosen**: marked Error red, reachable by `level=error` and by status filter, visible on the
   cron job's own `requestPath` log view.
4. **It costs nothing**, because there is no retry to provoke.

**The justification is the WEAKER one and is stated as weaker.** A non-200 here does **not** retry
and does **not** alert anybody; no fetched page says otherwise. It buys exactly two things: the
invocation is coloured red and filterable as an error in the runtime log, and `logger.error` already
routes to `Sentry.captureException`, so once §6's arity fix lands the named failure reaches Sentry
with a real message. **"Visible in the log and to Sentry" is the whole claim.**

### 4.7 DECISION — the response-body contract

One shape, implemented identically by every route §5 touches, **additive only**. Every existing key
keeps its name and its meaning; two are added, and a third appears only when it must:

```jsonc
{
  // … every key the route already returned, unchanged …
  "failureCount": 0,            // NEW — total failures, NEVER capped
  "failures": [],               // NEW — { scope, message, code? }, capped at 50
  // "failuresTruncated": true  // NEW — present ONLY when the cap bit
}
```

- **(a) every failure is NAMED** — `scope` is the model name / tenant id / driver id / object key;
  `message` is the real message; `code` is carried when the error carries one.
- **(b) `success`/`ok` is never true beside a non-zero count** — it is *computed* as
  `failureCount === 0`. The literal is deleted, so no edit can reintroduce the pairing by accident.
- **(c) a failure is never erased from a total** — `purge-deleted`'s `-1` sentinel and its
  `.filter(n => n > 0)` are **deleted**, not patched: successes and failures become two separate
  structures, so there is no total left for a failure to be erased from.

**The list is capped at 50 and `failureCount` is not.** A sweep that fails for 5,000 tenants must not
return a 5,000-element array, and a *silent* cap is the failure mode `trip-reminders:108` already
refuses by name ("No silent caps. If a tenant is truncated, say so").

**A fully-successful run is observably unchanged**: `success: true`, HTTP 200, every original key
present and identical, plus `failureCount: 0` and `failures: []`.

---

## 5. The fixes

Per-route before/after table, the consumer grep, and every verification command with its output:
`evidence/05a-task3-consumers-and-verification.md`.

### 5.1 One contract, one file

`apps/web/src/lib/cron/failure-report.ts` is the whole of §4.7, implemented once and imported by all
twelve fixed routes:

- `CronFailures.record(logMessage, scope, err, context?)` — the ONLY way to add a failure. It
  records **and** logs, with `logger.error(msg, err, { …ctx, scope, err: serializeError(err) })`.
  Folding the log into the recorder makes the right arity **the only reachable one** from a cron
  route, rather than a convention twelve files have to remember. Same reasoning as
  `commit-service.ts:264`'s `afterResponse`, which documents this exact bug.
- `CronFailures.ok` is a **getter** over the count. There is no boolean field an edit can set, so
  property (b) — `success` never `true` beside a non-zero count — is structural rather than a check
  someone can drop. Same idiom as the T3/T4 verdict union.
- `cronStatus(failures)` → 200 / 500.
- `CRON_FAILURE_LIST_CAP = 50` lives there and nowhere else; the tests import the constant.

### 5.2 Consumers: there are none

```
$ grep -rn "totalPurged|markedOverdue|orgs_processed|blockedEmailsSent|tenantsSent|
            processedTenants|total_dispatches_created|remindersSent" --include="*.{ts,tsx,js,mjs}"
```

**Every match is inside the route that produces the key.** No test, script, mobile client, e2e spec
or monitoring integration reads any cron response body. The only thing that ever touched one is
`scripts/audit/602-execution-sweep.ts`, which stores `(await res.text()).slice(0, 300)` as opaque
text and asserts on nothing. Additive keys are unconditionally safe; the pre-existing keys were kept
regardless.

### 5.3 The one non-purely-additive change, declared

`send-reminders`' `processedTenants` was the literal `tenants.length` — the number of tenants
**found**, published under a key that says **processed**. A tenant that threw was `continue`d and
still counted. It now counts completions, and `tenantsFound` carries the original number.
**Identical on a fully-successful run.** Declared rather than folded in silently.

### 5.4 What each route gained

Full table in `evidence/05a` §3. The shape of it:

- **All twelve** now return 500 once anything has failed, and `success`/`ok` is computed from the
  count.
- **`purge-deleted`** — the `-1` sentinel and the positives-only filter are **deleted**, not patched.
  `results` holds successes only; failures live in a separate structure, so there is no shared total
  left for a failure to be erased from.
- **`send-reminders`** — the tenant-level `continue` now counts **and names** the lost tenant.
- **`carrier-compliance-alerts`**, **`workflow-digest`**, **`automations`** — three catches that had
  **no counter of any kind** now have one.
- **`workflow-notifications`** — the sharpest case. Its two sweep-level catches swallowed a query
  failure with no counter, so a failed STEP_OVERDUE sweep returned
  `{ok:true, stats:{overdueSent:0, overdueErrors:0, …}}` — **byte-identical to a clean run with
  nothing due**. A failed SWEEP and a failed ITEM are different facts and now have different
  counters (`stats.sweepsFailed`, new).
- **Counts the routes already had but never let reach `success`** are now recorded too: the
  dispatcher's `result.failed`, `generateDispatches`' `string[]` errors (previously only
  `logger.warn`ed, so never a Sentry exception), and `runEvaluator`'s `failed`.
- **`trip-reminders`** needed only the body and the status — its logging was already correct and is
  cited as the in-repo precedent alongside the two `after()` wrappers.

### 5.5 Resilience is untouched

No `try` became a `throw`; no `continue` was removed. Every per-item catch carries a comment saying
the loop still continues. **The proof is §7.2's per-route survivor assertion, not this sentence.**

### 5.6 ACCIDENTAL: there were none — Task 4 in one line

§2.1 established by reading all 37 catches, and by grepping for the three shapes the plan names, that
**zero catches on the scheduled surface are wider than what they were written for.** There was
therefore no narrowing to do. Nothing was invented to fill the task; the examination is recorded in
§2.1 and `evidence/02-classification.md`.

---

## 6. The `logger.error` arity sweep

*(Task 5 — populated below.)*

---

## 7. The five finishing checks

*(Task 6 — populated below.)*
