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

- **76 of 621 `logger.error` calls — 12.2% — across 36 files** pass an object literal where the
  function's second parameter is the error.
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

*(Task 2 — populated below.)*

---

## 5. The fixes

*(Tasks 3–4 — populated below.)*

---

## 6. The `logger.error` arity sweep

*(Task 5 — populated below.)*

---

## 7. The five finishing checks

*(Task 6 — populated below.)*
