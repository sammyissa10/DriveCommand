---
task: quick-603
title: Stop cron and background routes reporting success when they failed
date: 2026-09-15
status: COMPLETE
branch: master
commits:
  - 07b40c58 docs(603-01) enumerate the scheduled surface, classify all 37 catches
  - 55e0c022 docs(603-02) cite what Vercel does with a non-200, decide the status policy
  - 2a33ccf2 fix(603-03) twelve cron routes stop reporting success when they failed
  - 82c87ef8 docs(603-04) zero ACCIDENTAL catches, with the examination that establishes it
  - 424aa667 fix(603-05) the logger.error arity sweep — 65 sites classified, then applied
  - af50e18a test(603-06) injection tests proven RED, then the five finishing checks
artefacts:
  - docs/audits/scheduled-job-failure-reporting.md
  - apps/web/src/lib/cron/failure-report.ts
  - apps/web/tests/cron/ (11 files, 57 tests)
  - .planning/quick/603-stop-cron-and-background-routes-reportin/evidence/
database: NONE WRITTEN — no migration, no schema change, no RLS policy, staging or production
installed: NOTHING
---

# quick-603 — Stop cron and background routes reporting success when they failed

## What was wrong

quick-602 armed a tripwire and invoked the cron surface over HTTP. `purge-deleted` raised `TC001`
seven times and returned **HTTP 200 `{"success":true,"totalPurged":0}`** — the same body a clean run
with nothing to purge produces — while logging each of the seven failures as `Error: [object
Object]`, which is also exactly what Sentry received. `send-reminders` raised six times and the three
digests twice each; every one of them returned 200 with `success: true`. An operator watching status
codes, bodies and logs would have learned nothing from any of it.

---

## 1. The enumeration: 15 entry points, and the two asymmetries

The scheduled surface is a **union of three sources, and no single source is complete**.
`apps/web/vercel.json` schedules **14** paths; `apps/web/src/app/api/cron/` holds **14**
directories; their intersection is **13**, so the union is **15**. Each count was asserted
separately from the real file, never inferred from another.

**Asymmetry 1 — `/api/warmup` is scheduled and does not live under `/api/cron/`.** It carries the
same `verifyCronSecret` guard every cron route carries, which is what makes it a scheduled entry
point rather than an ordinary route that happens to be pinged. quick-602's sweep globbed the cron
directory and so never saw it. Verdict **CLEAN** — confirmed: it has no catch at all, so a failure
propagates and Next returns a 500.

**Asymmetry 2 — `cleanup-quarantine` is a cron-shaped route that was NEVER scheduled.**
`git log -S"cleanup-quarantine" -- vercel.json` returns **zero** commits, and zero means never added
rather than added-then-removed (which would produce two). The live Vercel project's 14 cron
definitions confirm it independently — it is absent from the deployed project, not merely from the
config file. No code anywhere calls it.

**A third finding the plan did not anticipate:** `docs/security/input-hardening.md:86` and the
route's own header both assert as fact that `vercel.json` carries a `0 * * * *` entry for it. Neither
is true and by `git log -S` neither has ever been true. quick-349 shipped the route, wrote the
schedule into two documents and a code comment, and never wrote it into `vercel.json`. Stale R2
quarantine objects have been accumulating since. **Both claims were corrected; the schedule itself
was reported, not added** — that is a product decision, not a defect repair.

**The plan's fact table named five swallowers. The enumeration found twelve.** All five are confirmed
symptom for symptom; the other seven are the finding. Classification was per *catch*, not per file —
37 catches across the 15 entry points: **CLEAN 3, DELIBERATE_MISREPORTED 12, ACCIDENTAL 0.**

---

## 2. What Vercel actually does with a non-200 — and what could not be verified

**Verified, quoted from `vercel.com/docs/cron-jobs/manage-cron-jobs`:**

> *"Vercel will not retry an invocation if a cron job fails."*

**There is no retry, ever.** So the status change provably cannot cause `send-reminders` to re-send
anything — that is a benefit of returning 500, not a cost of it.

**Verified, from `vercel.com/docs/logs/runtime`:** a `5xx` is marked **Error red** in the runtime log
and is reachable with a `level=error` filter; a `4xx` is Warning amber; a `3xx` is **not shown in the
logs at all**.

**NOT verified, and recorded as unverified: nothing anywhere says a non-2xx cron response alerts,
emails or notifies anybody.** That is recorded as an absence of documentation, not as proof no such
feature exists — and **the status decision rests only on the documented half.** Also explicitly
unanswered: whether Vercel keeps a per-invocation success/failure state distinct from the HTTP log.

**The decision, and it is stated as the WEAKER claim.** A partial or total failure returns **500**;
a fully-successful run is unchanged at 200. **207 was rejected on the evidence**: it carries no log
level marking at all, so in the one surface an operator actually scans it is indistinguishable from
a 200 — the brief's "different silence", precisely. 4xx was rejected because it claims the *request*
was at fault. What a 500 buys is exactly two things: the invocation is coloured red and filterable as
an error in the runtime log, and `logger.error` routes to `Sentry.captureException`, so the named
failure now reaches Sentry with a real message. **"Visible in the log and to Sentry" is the whole
claim. It is not "it alerts."**

---

## 3. Per-route before → after

Every route: 200-always → **500 once anything failed**, and `success`/`ok` **computed** from the
failure count instead of written as a literal. All keys are additive; a fully-successful run is
observably unchanged.

| route | status | body | log |
|---|---|---|---|
| `purge-deleted` | 200 → **500** | `-1` sentinel + positives-only filter **deleted**; `results` holds successes only, failures in `failures[]` | `{error:String(err)}` → real arity + `serializeError` |
| `send-reminders` | 200 → **500** | tenant-level `continue` now **counts and NAMES** the lost tenant; `processedTenants` means processed | already correct, routed through `record` |
| `digest-daily-driver` | 200 → **500** | `+failureCount/failures[]`; dispatcher's own `result.failed` recorded | already correct |
| `digest-weekly-owner` | 200 → **500** | as above | already correct |
| `digest-compliance-30day` | 200 → **500** | as above | already correct |
| `cleanup-quarantine` | 200 → **500** | `+failureCount/failures[]` beside its existing `errors` | two `[object Object]` sites **fixed** |
| `carrier-auto-dispatch` | 200 → **500** | `generateDispatches`' own `string[]` errors now NAMED (previously `logger.warn`-only, so never a Sentry exception) | already correct |
| `carrier-compliance-alerts` | 200 → **500** | tenant catch **had no counter**; a blown-up tenant was indistinguishable from one that does not exist | `{tenantId, error: err}` **fixed** |
| `trip-reminders` | 200 → **500** | `+failureCount/failures[]` beside its existing `tenantsFailed` | **already correct — cited as the in-repo precedent** |
| `workflow-digest` | 200 → **500** | per-recipient email failure **had no counter** | three `{error: …}` sites **fixed** |
| `workflow-notifications` | 200 → **500** | new `stats.sweepsFailed` | four `{err}` sites **fixed** |
| `automations` | 200 → **500** | per-tenant scheduling catch **had no counter**; `runEvaluator`'s `failed` recorded | `console.error` (never reached Sentry) → `logger.error` |

**The sharpest case.** `workflow-notifications`' two sweep-level catches swallowed a query failure
with no counter of any kind. If the STEP_OVERDUE query failed, the response was
`{ok:true, stats:{overdueSent:0, overdueErrors:0, …}}` — **byte-identical to a clean run with nothing
due**. No reading of that body could distinguish "nothing to do" from "the sweep never ran". A failed
SWEEP and a failed ITEM are different facts and now have different counters.

**One contract, one file.** `src/lib/cron/failure-report.ts`. `CronFailures.record()` is the only way
to add a failure and it **records and logs together**, so the correct `logger.error(msg, err, ctx)`
arity is the only one reachable from a cron route rather than a convention twelve files must
remember. `.ok` is a **getter** over the count, so "success true beside a non-zero failure count" is
structurally unrepresentable rather than a check an edit could drop. The list caps at 50 with
`failuresTruncated: true`; **the count is never capped** — a silent cap is the failure mode
`trip-reminders:108` already refuses by name.

**Resilience is untouched and proven.** No `try` became a `throw`; no `continue` was removed.

**Zero consumers.** Grepped before a line changed: every occurrence of every cron body key is inside
the route that produces it. Nothing reads a cron response body. The one non-purely-additive change is
declared: `send-reminders`' `processedTenants` was `tenants.length` — the tenants **found**, under a
key that says **processed** — and now counts completions, with `tenantsFound` carrying the old
number. Identical on a successful run.

---

## 4. The logger defect is far wider than these routes

**76 of 610 `logger.error` calls — 12.5% — across 36 files** passed an object literal where the
second parameter is the error. `logger.ts:52` turns that into `new Error('[object Object]')` and
hands it to `Sentry.captureException`: no message, no code, no stack from the real failure.

Only **11** of the 76 were on the scheduled surface. The other **65 were elsewhere** — server
actions, API routes, `lib/`, two React error boundaries. All 76 are now fixed and the closing scan
returns **zero repo-wide**.

Classified before applying, because a blind codemod has to know which variable is the error:

| bucket | n |
|---|---|
| (a) `ERROR_IN_SCOPE`, mechanical | 61 |
| (a) `ERROR_IN_SCOPE`, hand-edited (the two React `error.tsx` boundaries) | 2 |
| (b) `CONTEXT_ONLY` | 2 |
| **(c) `UNCLASSIFIABLE`** | **0** |

**Bucket (c) is empty, so there is NO follow-up list for a human to carry.** Stated explicitly
because an empty list and a list nobody produced look identical in a summary. The mechanical pass
proposed 8 for (c); all 8 resolved on reading, in two clean groups and with no guessing — C1 flattens
the error into a `message` const before logging, C2 is a Supabase error destructured from a call
result and never thrown, so no `catch` binding exists for the walk-back to find.

**The quick-541 import trap was sidestepped, not navigated.** No import line was inserted anywhere:
every affected file already imports `logger` from `@/lib/logger`, so `serializeError` was appended to
that existing specifier list, and the applier **refuses to write a file** where no such import was
found.

**Two published numbers were corrected rather than quietly adopted.** The scan total is **76**, not
the planner's 75 — the grep is line-oriented and missed one multi-line call
(`workflow-notifications/route.ts:156`), identified by diffing the two site lists rather than by
preferring a number. And the denominator is **610**, not 621: the grep counted 11 occurrences of
`logger.error(` inside comments. The scanner gained a comment stripper mid-task and the numerator was
re-measured against the pre-fix tree with it — still 76, so only the denominator moved.

---

## 5. ACCIDENTAL catches: there were none

**Zero**, and it is a measurement rather than a skipped step. All 37 catches were read; both
greppable shapes (`catch {}`, `.catch(() => …)`) return zero occurrences; the third shape — a `try`
wider than the statement that can legitimately fail — was checked by comparing each block's extent
against what can actually reach it. Seven catches are wide in line count and narrow in reachable
throws, because the loop they enclose carries its own inner catch; counting lines would have produced
seven false classifications and seven pointless refactors.

The zero is the interesting result: design constraint 1 turns out to describe the **entire**
population. Every author understood that a batch must survive a bad record. Nobody told the operator
afterwards. One uniform defect, one shared fix. **No narrowing work was invented to fill the task.**

---

## 6. Tests: 57 added, every one witnessed RED first

Eleven files in `apps/web/tests/cron/`. Each asserts three things and all three are load-bearing:

1. **the response says so** — 500, `success`/`ok` not true, the failing scope **named** in
   `failures[]` with the real message;
2. **the log carries a real error in slot 2** — asserted to be the injected object **and** asserted
   not to render as `'[object Object]'`; asserting only the first half would pass on the pre-fix code
   for the routes whose arity was already right;
3. **the batch still continued** — the mocked downstream called **M** times, not 1 and not 2.
   M = 7 / 4 / 5 / 5 / 5 / 4 / 4 / 4 / 4 / 5 / 4 / 16 across the twelve routes (`send-reminders`
   twice, because its tenant-level catch is a second resilience boundary). **This is the check that
   proves the fix did not turn a resilient batch brittle, and a test that only asserted the response
   reports a failure would not discharge it.**

**Witnessed red, not merely asserted.** The twelve route files were reverted to the plan commit and
the directory re-run: **11 of 11 files red, 48 of 56 tests red.** The 8 that stayed green are the
ones that should have — the pure contract unit tests, the directory enumeration, the CLEAN-routes
counter-assertion, and the 401 test (authentication was never broken).

**One methodological finding worth keeping:** the `[object Object]` assertion needed its own isolated
test to be witnessed red at all. In the combined test the status assertion fails first on pre-fix
code, so the log assertion is asserted but never *exercised* in a red run. Isolated, it prints the
defect verbatim: `Calls were: [["…Failed to purge CarrierContract","object","[object Object]"]]`.

**Every failure is injected at a module boundary. Nothing in `tests/cron/` opens a database
connection**, and the cron secret uses the **real** `verifyCronSecret` with `CRON_SECRET` set rather
than a mock, so a route whose authentication had broken could not pass these tests.

A source-scanning guard sits beside them (quick-549 — row assertions and source scans catch different
classes): it CRLF-normalises, asserts the slice was actually found, uses per-file length floors as
**parameters**, and carries a counter-assertion that the two CLEAN routes still contain their
legitimate `success: true`, so the guard cannot be satisfied by deleting them.

---

## 7. Before/after suite, and the two regressions the by-name comparison caught

Same reporter both sides (`--reporter=json`), measured in the **main tree** with the source checked
out to the plan commit and restored — never a `git worktree`, which does not carry the untracked
`apps/web/.env.local` (quick-567). No `next dev` was running.

| | BEFORE | AFTER | delta |
|---|---|---|---|
| total tests | 1990 | **2047** | **+57** — exactly what this task added |
| passed | 1871 | **1928** | +57 |
| **failed** | **64** | **64** | **0** |
| pending | 52 | 52 | 0 |
| **failing FILES** | **18** | **18** | **0** |

**Failing-file set difference: EMPTY in both directions**, compared by name. At test granularity:
**newly failing 0, newly passing 0, brand-new tests failing 0.**

*(A note on the recorded baseline: the plan quotes "~64 failing files / ~1,990 tests". 1,990 is
right; **64 is the failing TEST count** — the file count is 18.)*

**The by-name comparison earned its keep — it caught two regressions a count would have missed, and
both were fixed rather than swept up:**

1. **A new failing file this task did not add.** quick-602's countdown guard pins
   `scripts/audit/wrapper-countdown.json` to the tree; quick-603 added one file and shifted three
   line numbers. The artefact was **regenerated** — its own header calls that the intended path
   ("forces the number down in a reviewable diff, in the same commit as the work") — and the diff was
   inspected before acceptance: `unmigratedUnits` 456, `unmigratedCallSites` 459,
   `withTenantContextCallSites` 0 and `filesWithUnmigratedUnits` 202 are all **byte-identical**.
   Only `generatedAt`, `filesScanned` 1689 → 1690 and three line numbers moved. No guard weakened.
2. **One test flipped INSIDE an already-failing file** — invisible to a file-set comparison, which is
   exactly the case the check exists for. The logger sweep added `serializeError` to `fireEvent.ts`'s
   import, and twelve test files mocked `@/lib/logger` with a factory returning only `{ logger }`,
   which *replaces* the module. **The fix was to the mocks, not the code, and it suppresses nothing:**
   each now spreads `importOriginal()` — the pattern `in-app-failure-visibility.test.ts` already used
   — so the mock stops hiding a real export and the next export added will not break them either. No
   assertion was touched.

**Gates on the exact committed tree:** `npm run build` **EXIT 0**. `tsc --noEmit` clean and
**PROBED four times**, each probe injected into a file the corresponding task had actually edited,
each reporting a **semantic** TS2322 (not a syntax error — the positive signal that semantic checking
is running), each deleted afterwards.

**Lint could not be run and is reported rather than claimed:** `apps/web` has no working lint entry
point (quick-562) — `next lint` no longer accepts `--dir` on this Next version and ESLint 9 finds no
`eslint.config.js`. tsc is the only gate that actually runs.

**Nothing installed, no DDL, no database written** —
`git diff --name-only bf3b921c..HEAD | grep -E "package(-lock)?\.json|prisma/(migrations|schema)"`
returns nothing.

---

## 8. Reported, NOT fixed

1. **`cleanup-quarantine` has no schedule and never has had one.** Its *reporting* was fixed because
   it is on the enumerated surface and did misreport; **no cron entry was added** — that is a product
   decision. Note for whoever schedules it: the `0 * * * *` its docs claim would have **failed
   deployment on a Hobby account**, which is the most likely reason it was never added.
2. **The project is on Vercel PRO, not Hobby — CLAUDE.md is stale.** Read live from the API
   (`billing.plan = "pro"`, and the project's `accountId` is that same team). CLAUDE.md,
   `trip-reminders`' header (lines 11–23) and the Phase 52 STATE.md note all assert Hobby and all
   three use it to justify a coarser schedule than the feature wants — `trip-reminders`' "needs
   hourly at minimum", `workflow-notifications`' recommended-but-never-added `0 * * * *`, and
   `cleanup-quarantine`'s. **All three are available on Pro.** `vercel.json` untouched.
3. **The suspected cron-count-vs-plan-limit conflict does not exist.** The limit is **100 cron jobs
   per project on every plan, including Hobby**; 14 ≪ 100. Hobby restricts frequency and precision,
   never count. Recorded because the question was posed as if it might be a contradiction.
4. **Four routes are NOT idempotent across a duplicate cron delivery**, which Vercel documents as a
   real hazard independent of status (*"Cron delivery can also occasionally invoke the same scheduled
   run more than once"*). `send-reminders` and the three digests call `dispatchNotification` without
   `dedupWindowMs`, and `buildIdempotencyKey`'s digest scope (`YYYY-MM-DD`) is **unreachable** —
   `isDigest` is the hardcoded literal `false` at all three `dispatcher.ts` call sites — so every key
   is event-scope, pinned to the ISO second, and two deliveries a second apart send twice.
   **Pre-existing and nothing to do with the status change** (there is no retry). Closing it is a
   change to the notification module's idempotency, a different task with a different blast radius.
5. **Bucket (c) logger sites: there are none.** No follow-up list to carry.
6. **The committed search indexes are stale relative to the feature registry.**
   `src/lib/docs/search-index.json` and `.docs-data/admin-docs-search-index.json` are regenerated by
   `npm run build`, and their diffs are **entirely unrelated to quick-603** — three Phase 12 Document
   Import registry entries and a nav route correction (`/carrier/route-templates` →
   `/carrier/templates`); the string `scheduled-job-failure-reporting` appears zero times in either.
   **Both were deliberately REVERTED** rather than committed, because committing them would smuggle
   an unrelated nav correction and three new help-centre entries into a cron-reporting commit.
   Someone else's commit to make.
7. **`docs/security/input-hardening.md` and `cleanup-quarantine`'s header** asserted a schedule that
   has never existed. Both corrected in place (that *is* fixed) — recorded here because the class of
   defect (a document asserting a fact nobody ever verified) is the same one this task exists to end.
