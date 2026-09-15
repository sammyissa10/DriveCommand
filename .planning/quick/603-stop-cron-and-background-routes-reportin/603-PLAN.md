---
phase: 603-stop-cron-and-background-routes-reportin
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - docs/audits/scheduled-job-failure-reporting.md
  - apps/web/src/app/api/cron/purge-deleted/route.ts
  - apps/web/src/app/api/cron/send-reminders/route.ts
  - apps/web/src/app/api/cron/digest-daily-driver/route.ts
  - apps/web/src/app/api/cron/digest-weekly-owner/route.ts
  - apps/web/src/app/api/cron/digest-compliance-30day/route.ts
  - apps/web/src/lib/** (logger call sites only, list produced by Task 1/5)
  - apps/web/tests/cron/*.test.ts
  - .planning/quick/603-stop-cron-and-background-routes-reportin/evidence/*

must_haves:
  truths:
    - "A cron route that failed N of M items returns a status and a body that say so, and never `success: true`."
    - "A failed batch item is NAMED in the log with its real message — never `Error: [object Object]`."
    - "A batch that fails one item still processes the rest, proven per route by a test that counts the survivors."
    - "The enumeration of scheduled entry points is a union of three sources, and each source's count is asserted."
    - "The status-code choice is justified by a cited Vercel document, not by an assumption."
    - "The write-up states plainly whether the logger-arity defect is wider than these routes."
  artifacts:
    - path: "docs/audits/scheduled-job-failure-reporting.md"
      provides: "Enumeration, per-entry-point classification, platform citation, status policy, finishing checks"
      contains: "## 1. The enumeration"
    - path: ".planning/quick/603-stop-cron-and-background-routes-reportin/evidence/"
      provides: "Per-step measured artefacts incl. the witnessed RED runs and the before/after suite counts"
    - path: "apps/web/tests/cron/"
      provides: "One injection test per fixed route, each asserting response + log + survivor count"
  key_links:
    - from: "apps/web/src/app/api/cron/purge-deleted/route.ts"
      to: "apps/web/src/lib/logger.ts"
      via: "logger.error(message, err, context) — the real arity, error in slot 2"
      pattern: "logger\\.error\\([^,]+, *(err|error)[,)]"
    - from: "apps/web/tests/cron/*.test.ts"
      to: "the route handlers"
      via: "handler called directly with a constructed Request, downstream mocked at the module boundary"
      pattern: "vi\\.mock\\("
---

<objective>
Stop cron and background routes reporting success when they failed.

Five routes are already measured raising `TC001` seven, six and two times and returning HTTP 200
`{"success":true,...}`. One of them — `purge-deleted` — additionally erases the failure from its own
total and logs it as `Error: [object Object]`, so seven database errors produced a green response,
a green log line and a zero count.

Purpose: an operator watching status codes and logs must be able to learn that a scheduled job
failed, and which part of it failed. Today they cannot.

Output:
- `docs/audits/scheduled-job-failure-reporting.md` — enumeration, classification, cited platform
  behaviour, the status policy, and the finishing checks.
- Fixed reporting on every entry point classified as misreporting, with batch resilience preserved
  and proven.
- The `logger.error` arity sweep, classified before it is applied.
- One injection test per fixed route, each proven RED before it is accepted as green.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Read before starting — these are the inputs, not background:
- `docs/audits/unmigrated-path-tripwire.md` §5 — the HTTP pass that produced this task.
- `.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/11-execution-http.md`
- `.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/10-execution-sweep.md`
- `apps/web/src/lib/logger.ts` (55 lines — read the whole file)
- `apps/web/src/app/api/cron/purge-deleted/route.ts` (54 lines — the worked example)
- `apps/web/vercel.json`

House style for the new document: `docs/audits/` — every number cites the evidence file it came
from; disagreements with a prior document's fact table are recorded rather than adopted quietly.
</context>

<already_measured>
These were measured during planning. **Re-confirm them; do not re-derive them from scratch, and do
not treat them as assumptions to be discovered.** Where a re-confirmation DISAGREES, the
disagreement is the finding — record it in the audit doc rather than adopting either number quietly.

**The `[object Object]` mechanism, exactly.**
`logger.ts:51` is `error(message: string, error?: unknown, context?: Record<string, unknown>)` and
line 52 is `const errorObj = error instanceof Error ? error : new Error(String(error ?? message))`.
`purge-deleted/route.ts:45` passes an **object literal in the error slot**:
`logger.error(\`…Failed to purge ${name}\`, { error: String(err) })`. Not an `Error`, so
`String({…})` is `'[object Object]'`, and `errorObj` then reaches
`Sentry.captureException(errorObj, …)` on line 54 — **Sentry receives an exception with no message,
no code and no stack from the real failure.** `logger.ts` already exports `serializeError(err)` for
exactly this, and its own doc comment (lines 5–15) describes a previous instance of the same class.

**The logger defect is far wider than these routes.**
Over 1,690 `.ts`/`.tsx` files under `apps/web/src`, excluding `generated`:
- **621** `logger.error(` calls in total.
- **~75** match an object literal in the error slot (`logger.error(<message>, {`). The brief's figure
  is 76; the planning re-scan with `grep -rnE "logger\.error\(([^,]*(\`[^\`]*\`)?[^,]*), \{"` returned
  **75**. **Publish whichever number your scan produces, with the exact command, and note the
  discrepancy.** ~12% of all `logger.error` calls are wrong.

**The scheduled surface is 15, not 14, and no single source is complete.**
- `apps/web/vercel.json` schedules **14 paths**, one of which is **`/api/warmup`** — not under
  `/api/cron/`, so the tripwire's directory enumeration never saw it.
- `apps/web/src/app/api/cron/` has **14 directories**, one of which — **`cleanup-quarantine`** — is
  **not in `vercel.json` at all**. `git log -S"cleanup-quarantine" -- apps/web/vercel.json` returns
  **empty**: it was never scheduled, not descheduled. Grep finds no inbound caller outside `.next/`
  build artefacts. **Report it; do not fix it** — whether it wants a schedule or a deletion is a
  product decision outside this task's scope.
- Union = **15**.

**Background-handler candidate populations (candidates, not defects):**
**77** `after(` call sites across **28** files; **11** `setTimeout|setInterval`; **66** lines matching
`^\s*void <ident>`. `carrier-auto-dispatch` uses `after()` (two sites, lines 126 and 138).

**Two in-repo `after()` wrappers already report correctly — cite them as precedent, do not "fix"
them.** `lib/document-import/commit-service.ts:264 afterResponse` and
`lib/notifications/emit.ts:87 emitNotificationAfterResponse` both use the real arity plus
`serializeError`, and `afterResponse`'s comment names this exact bug. Their swallow is DELIBERATE and
documented ("neither the notification nor the template step may undo a committed trip").

**The five known swallowers, and they are NOT the same defect:**

| route | measured | what is actually missing |
|---|---|---|
| `purge-deleted` | 7 raises → `200 {"success":true,"totalPurged":0}`, every model `-1` | **Three defects in one file**: (a) wrong logger arity → `[object Object]`; (b) `success: true` unconditional; (c) the `-1` failure sentinel is **erased** by `.filter(n => n > 0)` on line 50, so the failure never reaches the total |
| `send-reminders` | 6 raises → 200 | Logger arity is **already correct** (`logger.error('…:', error)`). Missing: the status, the unconditional `success: true`, and the **tenant-level catch at the bottom of the loop `continue`s with no counter at all** — a whole tenant can be lost and nothing counts it |
| `digest-daily-driver` | 2 raises → `200 {"success":true,...,"failed":2}` | Logger arity **already correct**. The reporting half is **partly present** — `failed` is in the body. Missing: the status, and `success: true` is unconditional beside a non-zero `failed` |
| `digest-weekly-owner` | 2 raises → 200, `failed:2` | same as above — verify |
| `digest-compliance-30day` | 2 raises → 200, `failed:2` | same as above — verify |

`/api/warmup` has no catch at all (`await prisma.$queryRaw\`SELECT 1\`` propagates) — likely CLEAN,
confirm.
</already_measured>

<design_constraints>
Binding on every task below.

1. **Fix the reporting, not the catching, for DELIBERATE cases.** A batch that processes 100 and
   fails 7 must NAME the 7. Every DELIBERATE case must still continue past a single bad record, and
   that must be **proven per route** — a fix that turns a resilient batch into a brittle one is a
   regression, not a fix.
2. **ACCIDENTAL cases:** narrow the catch to what it was meant to handle; let the rest propagate.
3. **Do NOT change what any route does on a fully-successful run.** Grep for consumers of each
   response body before changing its shape; additive keys are safe, renamed or removed keys are not.
4. **Do NOT touch tenant scoping, RLS policies, or migrations. Do NOT install any package.**
5. **Tests force failure by INJECTION, not by breaking the database.** The repo has vitest with
   `environment: 'node'`, and **no jsdom and no @testing-library/react** (quick-565). Prefer exported
   pure helpers and route handlers called directly with a constructed `Request`, mocking at the
   module boundary.
6. **Every guard/test must be proven RED before being accepted as green** (quick-549). Source-scanning
   guards need CRLF normalisation (`.replace(/\r\n/g, '\n')` — quick-546), a "was the slice actually
   found" assertion, and a length floor that is a **parameter**, not a blanket constant (quick-562).
7. **`tsc --noEmit` can lie.** If the only reported errors are syntax errors, or all sit in files you
   did not touch, the gate is BLIND. Delete `apps/web/.next/dev/types/validator.ts` and
   `apps/web/tsconfig.tsbuildinfo`, re-run, and **probe**: inject `const x: number = 'y'` into a file
   you actually edited, confirm tsc reports THAT, then delete the probe.
8. **Commit per task. NEVER `git push`** — the orchestrator pushes once at the end.

Evidence directory for every artefact:
`.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/`
</design_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Enumerate every scheduled and background entry point, and classify every catch</name>
  <files>
docs/audits/scheduled-job-failure-reporting.md
.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/01-enumeration.md
.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/02-classification.md
.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/03-logger-sites.md
  </files>
  <action>
Build the enumeration as a **union of three sources, asserting each source's count separately**.
Building it from any single source is the failure this step exists to prevent — the tripwire built
it from the directory and missed `/api/warmup`; `vercel.json` alone misses `cleanup-quarantine`.

**Source A — `apps/web/vercel.json`.** Parse `.crons[].path` with `node -e`. Assert the count (14 at
planning time). Record each path and its schedule.

**Source B — `apps/web/src/app/api/cron/*/route.ts`.** Enumerate from the filesystem, never a
hardcoded list. Assert the count (14 at planning time).

**Source C — background handlers.** Grep, and report each population's count with the exact command:
- `after(` call sites (77 across 28 files at planning time) — exclude comments and `.after(`.
- `setTimeout(` / `setInterval(` (11).
- fire-and-forget `void <promise>` (66 lines matching `^\s*void [a-zA-Z_]`).
- The two wrapper helpers: `lib/document-import/commit-service.ts:afterResponse` and
  `lib/notifications/emit.ts:emitNotificationAfterResponse`.
These are CANDIDATE populations. Narrow them to the ones that **catch and then report success** —
that is the defect under test. A `void` of work nobody reports on is not in scope unless its own
catch lies about the outcome.

**Report the two A/B asymmetries by name**, with the evidence for each:
- `/api/warmup` — scheduled, not under `/api/cron/`.
- `cleanup-quarantine` — a cron-shaped route that `git log -S"cleanup-quarantine" -- apps/web/vercel.json`
  shows was **never** scheduled (empty result = never added, not descheduled). Determine and state
  which it is; **report, do not fix.**

**Then classify every entry point and every catch inside it** into exactly one of four verdicts.
Per catch, not per file — `purge-deleted` carries three separate defects in 54 lines.

| verdict | meaning |
|---|---|
| `CLEAN` | no catch, or a catch that already reports faithfully (honest status + a real message in the log) |
| `DELIBERATE_REPORTED` | the catch is correct (batch resilience / must-not-undo-committed-work) AND it already names the failure. Leave alone; cite as precedent. `commit-service.ts:afterResponse` and `emit.ts` belong here |
| `DELIBERATE_MISREPORTED` | the catch is correct, the OUTCOME is misreported: `success: true` beside a non-zero failure count, a 200 for a partially-failed batch, an `[object Object]` log, or a failure erased from a total |
| `ACCIDENTAL` | the catch is wider than what it was meant to handle |

For each `DELIBERATE_MISREPORTED` row state **which of the four symptoms** it carries, and the
intended fix in one line. For each `ACCIDENTAL` row state what the catch was meant to handle.

Separately, produce the **logger-arity scope statement** (finishing check 3). Run the total count and
the object-literal-in-error-slot scan; publish **the full by-name list** (file:line) as
`evidence/03-logger-sites.md`; and state plainly in the audit doc whether the defect is wider than
these routes. It is — ~75 of 621 across ~36 files — but state it from your own measurement and note
any discrepancy with the 76 recorded here.

Write `docs/audits/scheduled-job-failure-reporting.md` §0 (the problem in one paragraph), §1 (the
enumeration, three sources + union + the two asymmetries), §2 (the classification table), §3 (the
logger-defect scope statement). Leave §4 and §5 as headed stubs for Tasks 2 and 6.
  </action>
  <verify>
`node -e` prints the vercel.json cron count and it matches the doc; `ls -d apps/web/src/app/api/cron/*/ | wc -l` matches the doc; the union is stated with both asymmetries named; every one of the 15 entry points has exactly one verdict row; `evidence/03-logger-sites.md` line count equals the scan count stated in §3.
  </verify>
  <done>
`docs/audits/scheduled-job-failure-reporting.md` exists with §0–§3 populated, every number cites an
evidence file, all 15 entry points are classified, the `cleanup-quarantine` finding is reported and
NOT fixed, and the "wider than these routes" statement is explicit with a by-name list behind it.
Committed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Establish what Vercel actually does with a non-200 cron response, with a citation, and decide the status policy</name>
  <files>
docs/audits/scheduled-job-failure-reporting.md
.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/04-platform-behaviour.md
  </files>
  <action>
**This gates Tasks 3 and 4 and cannot be moved after them.** The brief makes the status choice depend
on this finding: *"If Vercel retries on non-200, or alerts, or does nothing, that determines whether
a non-200 is actually useful or just a different silence."*

Answer four questions, each with a **cited source — a vercel.com docs URL plus the quoted text**, not
an assumption. Use WebFetch. If a page cannot be fetched, **record the failure** and say the question
is unanswered; do not fill the gap with a guess.

1. Does Vercel Cron **retry** a non-2xx response? Under what conditions, how many times?
2. Does a non-2xx produce anything **visible** — a failure state in the cron log, a dashboard
   indicator, an alert/notification?
3. What exactly counts as failure — `>= 400`, or any non-2xx? (This decides whether a 207 is read as
   success or failure, and therefore whether it is a usable choice.)
4. What is **this project's actual plan**? CLAUDE.md records "Hobby plan permits no finer" than daily
   cron granularity, yet `vercel.json` carries **14 crons**. Check the documented per-plan limits on
   both cron COUNT and granularity, check what plan this project is on, and **note any conflict
   between the documented limit and what is deployed**. Do not change `vercel.json`.

**Then decide, and write the decision down as a decision:**

- The **status code** a partially-failed batch returns, and a total failure. If the honest finding is
  that Vercel does nothing useful with a non-200, **say so, and state what the non-200 is FOR
  anyway** — that it is visible in the deployment/cron log and reaches Sentry is a real but
  **weaker** claim than "it alerts", and it must be stated as the weaker one. Do not let the status
  change be justified by a platform behaviour that was not verified.
- The **response-body contract**, ONE shape implemented identically by every route Task 3 touches.
  It must satisfy three properties, however you spell it:
  (a) every failure is NAMED with a real message (and a code where one exists);
  (b) `success`/`ok` is **never** true while the failure count is non-zero;
  (c) a failure is never erased from a total (`purge-deleted`'s `.filter(n => n > 0)` is the
      worked example of (c)).
  Additive keys only, on top of what each body already returns — see constraint 3.
- Whether a **retry** (if Vercel does retry) makes any route non-idempotent. Check `purge-deleted`
  and `send-reminders` specifically: a retried reminder sweep re-sends. If a retry is a real hazard,
  say so; it is an input to the status choice, not a separate task.

Write all of it into §4 of `docs/audits/scheduled-job-failure-reporting.md`, with URLs and quotes.
  </action>
  <verify>
§4 contains at least one vercel.com URL with quoted text per answered question; every unanswered question is explicitly marked unanswered with the reason; the status code and the body contract are each stated as a decision with the reasoning that produced it.
  </verify>
  <done>
The status policy exists, is cited, and either (a) rests on verified retry/alert behaviour or (b)
states honestly that it does not and names the weaker justification. The `vercel.json` cron-count vs
plan-limit question is answered or explicitly recorded as unanswerable. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix the DELIBERATE_MISREPORTED routes — name the failures, keep the loops resilient</name>
  <files>
apps/web/src/app/api/cron/purge-deleted/route.ts
apps/web/src/app/api/cron/send-reminders/route.ts
apps/web/src/app/api/cron/digest-daily-driver/route.ts
apps/web/src/app/api/cron/digest-weekly-owner/route.ts
apps/web/src/app/api/cron/digest-compliance-30day/route.ts
(plus any further route Task 1 classified DELIBERATE_MISREPORTED)
  </files>
  <action>
Apply Task 2's body contract and status policy to every route Task 1 classified
`DELIBERATE_MISREPORTED`. The five known ones are not the same defect — fix what each one actually
carries, per Task 1's per-symptom table.

**Rules that bind every edit:**
- **The `try` stays and the loop still continues.** Do not convert a per-item catch into a throw.
  The resilience half is proven in Task 6; the code must make it provable.
- **Collect, then report.** Accumulate `{ scope, message, code? }` per failure, where `scope` names
  the thing that failed (the model name, the tenant id, the driver id) and `message` is the REAL
  message (`err instanceof Error ? err.message : String(err)`).
- **Log with the real arity**: `logger.error(msg, err, { ...ctx, err: serializeError(err) })`. The
  error goes in slot 2. `serializeError` in the context is what survives `JSON.stringify` — see the
  in-repo precedent at `commit-service.ts:264`.
- **Never `success: true` beside a non-zero failure count.**
- **Never erase a failure from a total.** In `purge-deleted`, the `-1` sentinel plus
  `.filter(n => n > 0)` is the erasure; separate successes from failures rather than encoding failure
  as a number the total then discards.

**Before changing any body shape, grep for consumers** of each response (tests, scripts, mobile,
monitoring, docs). Record what you found. Additive keys only — do not rename or remove an existing
key another reader depends on. The digests already return `failed` in the body; that key stays.

`send-reminders` needs one thing the others do not: the **tenant-level catch at the bottom of its
loop `continue`s with no counter at all**, so a whole tenant can vanish. Count it, and name the
tenant in the failure list.

Do not touch the success path, tenant scoping, policies, migrations. Install nothing.
  </action>
  <verify>
`npx tsc --noEmit` in apps/web is clean — and PROBE it per constraint 7 before believing the run. `grep -rn "logger.error(" ` on each edited file shows the error in slot 2. `grep -n "filter(n => n > 0)" apps/web/src/app/api/cron/purge-deleted/route.ts` returns nothing. `grep -rn "success: true" ` on each edited file shows no unconditional literal beside a failure counter.
  </verify>
  <done>
Every DELIBERATE_MISREPORTED route returns a status and a body that report the failure, names each
failure with a real message, still continues past a bad record, and is unchanged on a fully
successful run. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 4: Narrow the ACCIDENTAL catches</name>
  <files>
(the files Task 1 classified ACCIDENTAL — enumerated by that task, not guessed here)
docs/audits/scheduled-job-failure-reporting.md
  </files>
  <action>
For each site Task 1 classified `ACCIDENTAL`, narrow the catch to what it was meant to handle and let
the rest propagate. Typical shapes: a bare `catch {}` around a call that has exactly one expected
failure mode; a `.catch(() => null)` that also absorbs programming errors; a `try` wrapped around
more statements than the one that can legitimately fail.

Narrowing means one of:
- move the `try` to wrap only the statement that can legitimately fail;
- test the error and re-throw what the catch was not written for (**by object shape / code, never by
  `instanceof` across the monorepo, and never by matching message prose** — quick-546);
- delete the catch where nothing it absorbs was ever expected.

**If Task 1 found no ACCIDENTAL sites, this task is a one-line finding, not manufactured work.**
Record "zero ACCIDENTAL sites, and here is what was examined to establish that" in the audit doc and
commit that. Do not invent narrowing work to fill the task.

Background/`after()` handlers: a swallow that is documented as must-not-undo-committed-work is
`DELIBERATE_REPORTED` and is left alone. Only a catch wider than its stated purpose is in scope here.
  </action>
  <verify>
`npx tsc --noEmit` clean (probed). For each narrowed catch, the audit doc records what it was meant to handle and what now propagates. If zero sites, the doc says so and names what was examined.
  </verify>
  <done>
Every ACCIDENTAL site is narrowed with its intended scope recorded, or the audit doc states there
were none and shows the examination that established it. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 5: The logger-arity sweep — classify all ~75 sites, then apply mechanically</name>
  <files>
.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/05-logger-classification.md
(the ~75 call sites across ~36 files under apps/web/src)
docs/audits/scheduled-job-failure-reporting.md
  </files>
  <action>
**Classify first, apply second. A blind codemod is the failure mode here** — a rewrite of
`logger.error(m, {ctx})` to `logger.error(m, err, {ctx})` has to know which variable is the error,
and some sites have no error in scope at all.

**Step A — classify** every site from Task 1's `evidence/03-logger-sites.md` into exactly one bucket:

| bucket | condition | fix |
|---|---|---|
| (a) `ERROR_IN_SCOPE` | a caught error variable is in scope and is currently inside the context object (e.g. `{ error: String(err) }`, `{ err }`) | `logger.error(msg, err, { ...ctx, err: serializeError(err) })` |
| (b) `CONTEXT_ONLY` | genuinely no error in scope — an error-level log about a condition, not an exception | `logger.error(msg, undefined, { ...ctx })` — the context moves to slot 3, which is where it belongs. Passing it in slot 2 is wrong even with no error |
| (c) `UNCLASSIFIABLE` | you cannot determine which value is the error, or the right fix is not one of the above | **list BY NAME (file:line) for a human decision. Do not guess.** |

Write the classification with a bucket per site to `evidence/05-logger-classification.md`, with the
bucket counts summing to the scan total.

**Step B — apply** buckets (a) and (b) mechanically. Import `serializeError` from `@/lib/logger`
where bucket (a) needs it. **Anchor any scripted import insertion to the end of the last COMPLETE
import statement** (a line ending `;` while still inside the import block) — quick-541 wedged an
import between `import {` and its first specifier in four files by splicing after the last line
matching `^import `, which is a TS1003 parse error that then blinded the whole tsc gate.

Leave bucket (c) untouched and surface it: the count and the by-name list go into §3 of the audit
doc as follow-up work, not into the diff.

Do not change any `logger.warn` / `logger.info` call — different signature, different question.
  </action>
  <verify>
`npx tsc --noEmit` clean, and **PROBED** — inject `const x: number = 'y'` into one of the files you actually edited, confirm tsc reports THAT error, then delete the probe (quick-541's scan was caught exactly this way). Bucket counts in `evidence/05-logger-classification.md` sum to the scan total. Re-running the object-literal-in-error-slot scan returns only the bucket (c) sites.
  </verify>
  <done>
All (a) and (b) sites carry the real arity, every (c) site is listed by name in the audit doc as a
human decision, the probed tsc gate is clean, and no `logger.warn`/`logger.info` call was touched.
Committed.
  </done>
</task>

<task type="auto">
  <name>Task 6: Injection tests proven RED, then the five finishing checks</name>
  <files>
apps/web/tests/cron/*.test.ts
docs/audits/scheduled-job-failure-reporting.md
.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/06-red-runs.md
.planning/quick/603-stop-cron-and-background-routes-reportin/evidence/07-suite-baseline.md
  </files>
  <action>
**One test per fixed route. Force the failure by INJECTION, never by breaking the database.**

Mock at the module boundary — `vi.mock('@/lib/db/prisma')`, `vi.mock('@/lib/db/admin-prisma')`,
`vi.mock('@/lib/notifications/dispatcher')` — so that **N of M items reject and the rest succeed**.
Call the route handler directly with a constructed `Request`/`NextRequest` carrying a cron secret
that `verifyCronSecret` accepts (either set `CRON_SECRET` and build the Bearer header, or mock
`@/lib/security/cron-auth`; pick one, do it the same way in every test, and record which and why).
Vitest here is `environment: 'node'` with no jsdom and no @testing-library/react — prefer pure
helpers and directly-invoked handlers.

**Each test asserts THREE things, and all three are load-bearing:**
1. **The response says so** — the status matches Task 2's policy, and the body names the failure
   (failure count non-zero, `success`/`ok` not true, the failing scope present in the failure list).
2. **The log carries a real message** — spy on `logger.error`, assert the SECOND argument is the
   injected error (or carries its message), and assert explicitly that the rendered value is **not**
   `'[object Object]'`. Asserting only the first half would pass on the pre-fix code for the routes
   whose arity was already correct.
3. **The batch still continued** — with N of M failing, the other M−N were processed. Assert the
   success counter AND that the mocked downstream was called **M** times, not N+1. This is the
   finishing check that a fix has not turned a resilient batch brittle, and it must be per route.

**Prove every test RED before accepting it green** (quick-549). Restore the pre-fix file
(`git stash` the fix, or `git checkout <pre-fix-rev> -- <file>`), run the test, **capture the failing
output verbatim** into `evidence/06-red-runs.md`, restore, confirm green. A guard asserted without a
witnessed red is not a guard.

If you add any **source-scanning** guard: normalise CRLF (`.replace(/\r\n/g, '\n')` — this repo is
`core.autocrlf=true` with no `.gitattributes`, so a column-zero `\n}\n` end marker does not exist in
the working tree), assert the slice **was actually found** before asserting anything about it, and
make the length floor a **parameter** rather than a blanket constant.

**Then the five finishing checks, each with an artefact, written into §5 of the audit doc:**

1. **Task 1 covered every scheduled entry point**, not only the five known — the three-source union
   with each count asserted, and the two asymmetries named.
2. **Every DELIBERATE case proven to still continue past a single bad record** — cite the survivor
   assertion, per route, by test name.
3. **An explicit statement of whether the logger defect is wider than these routes** — the count, the
   proportion of 621, and the bucket (c) follow-up list.
4. **Task 2 cited platform behaviour rather than assuming it** — the URLs and quotes, or the explicit
   record of what could not be fetched.
5. **`npm run build` succeeds and the suite's failing-file set is unchanged.**
   - `cd apps/web && npm run build`.
   - Suite: measure **before and after with the SAME reporter**. `--reporter=basic` **does not exist
     in vitest 4 and exits 0 having run ZERO tests** — a green run whose output contains no test
     counts is not a green run; read the `Test Files … | Tests …` summary.
   - The repo's recorded baseline is ~64 failing files / ~1,990 tests as of quick-602. **Re-measure;
     do not trust it.** Measure the "before" in the MAIN tree with this task's changes stashed — a
     `git worktree` does **not** carry `apps/web/.env.local`, which skews DB-dependent tests and
     reads as a regression (quick-567).
   - **Stop `next dev` before any stash/checkout**, and delete `apps/web/.next` before restarting —
     swapping files under a running Turbopack poisons its cache and reports correct work as missing.
   - Compare the **set of failing files**, by name, not just the counts. Publish before, after and
     the set difference in `evidence/07-suite-baseline.md`.
  </action>
  <verify>
`evidence/06-red-runs.md` contains a verbatim failing run for every test added. `evidence/07-suite-baseline.md` contains before/after counts from the same reporter plus the failing-file set difference (expected: empty, or only files this task added). `npm run build` in apps/web exits 0. §5 of the audit doc has a subsection per finishing check, each pointing at its artefact.
  </verify>
  <done>
Every fixed route has an injection test asserting response + real log message + survivor count; every
test was witnessed RED before green; the build passes; the failing-file set is unchanged; all five
finishing checks are written up with artefacts behind them. Committed.
  </done>
</task>

</tasks>

<verification>
- `node -e` over `apps/web/vercel.json` and `ls` over `apps/web/src/app/api/cron/` both match the counts in the audit doc.
- Every one of the 15 union entry points has exactly one classification verdict.
- `grep -n "filter(n => n > 0)" apps/web/src/app/api/cron/purge-deleted/route.ts` → no match.
- The object-literal-in-error-slot scan returns only the bucket (c) sites named in the doc.
- `npx tsc --noEmit` in apps/web clean, **and probed** (inject a type error into an edited file, confirm tsc reports it, delete the probe).
- `cd apps/web && npm run build` exits 0.
- `npx vitest run` before/after, same reporter, failing-file set difference empty apart from files this task added.
- Nothing installed: `git diff` shows no change to any `package.json` or lockfile.
- No migration, no schema, no RLS policy touched: `git diff --name-only` contains nothing under `prisma/migrations/` or `prisma/schema.prisma`.
</verification>

<success_criteria>
1. A partially-failed cron run reports its failure in BOTH the status/body and the log, with the real
   message, for every route Task 1 classified as misreporting.
2. No fixed route lost its ability to continue past a single bad record, and each has a test that
   counts the survivors.
3. `docs/audits/scheduled-job-failure-reporting.md` exists in `docs/audits/` house style with §0–§5,
   every number citing an evidence file.
4. The status-code choice is backed by a cited Vercel document, or explicitly marked as resting on the
   weaker "visible in the log and to Sentry" justification.
5. The audit doc states plainly that the logger-arity defect is wider than these routes, with the
   count, the proportion, and the unclassifiable sites named for a human.
6. `cleanup-quarantine` is reported as a never-scheduled cron route and left alone.
7. Build passes, suite's failing-file set unchanged, nothing installed, no DDL.
8. All work committed; **nothing pushed**.
</success_criteria>

<output>
After completion, create
`.planning/quick/603-stop-cron-and-background-routes-reportin/603-SUMMARY.md`.

It must state, in its own words rather than by reference:
- the union count and the two asymmetries;
- what Vercel was verified to do with a non-200, and what could not be verified;
- the per-route before/after (status, body, log) for each fixed route;
- that the logger defect is wider than these routes, with the numbers;
- the before/after suite counts and the failing-file set difference;
- anything reported rather than fixed (`cleanup-quarantine`, bucket (c) logger sites, any
  retry/idempotency hazard found in Task 2, the `vercel.json` cron-count vs plan-limit question).
</output>
