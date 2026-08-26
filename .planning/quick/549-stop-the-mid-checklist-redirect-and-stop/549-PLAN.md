---
phase: quick-549
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx
  - apps/web/src/lib/carrier/inspection-handlers.ts
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx
  - apps/web/tests/carrier/inspection-blocked-side-effects.test.ts
autonomous: true

must_haves:
  truths:
    - "A driver whose walkaround has a critical failure reaches `Review & sign` and can submit — the web page no longer pulls them to the blocked screen mid-checklist."
    - "Submitting a critically-failed checklist writes a `carrier_truck_defects` row for every failed item."
    - "The blocked screen no longer claims dispatch has been notified; it says dispatch is alerted automatically and tells the driver to message them."
    - "A real-database test fails if the BLOCKED side-effect branch is skipped."
    - "Mobile is unchanged and verified to have no equivalent defect."
  artifacts:
    - path: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx"
      provides: "Walkaround page with the render-time BLOCKED redirect removed and a comment saying why none exists"
      contains: "quick-549"
    - path: "apps/web/src/lib/carrier/inspection-handlers.ts"
      provides: "`inspectionCopy.dispatchAlerted` replacing `dispatchNotified`"
      contains: "dispatchAlerted"
    - path: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx"
      provides: "Renamed copy call site, corrected section comment, corrected file-header item 2"
      contains: "inspectionCopy.dispatchAlerted"
    - path: "apps/web/tests/carrier/inspection-blocked-side-effects.test.ts"
      provides: "Real-Postgres, disposable-tenant test asserting a defect ROW exists after a blocking failure"
      contains: "carrierTruckDefect"
  key_links:
    - from: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx"
      to: "/inspection/{dispatchId}/blocked"
      via: "onOutcome router.replace AFTER submit — the only surviving route to the blocked screen"
      pattern: "router\\.replace\\(`/inspection/\\$\\{dispatchId\\}/blocked`\\)"
    - from: "apps/web/tests/carrier/inspection-blocked-side-effects.test.ts"
      to: "handleSubmitInspection → applyVerdictSideEffects → recordInspectionDefects"
      via: "real call, real Prisma, row counted afterwards"
      pattern: "handleSubmitInspection"
---

<objective>
quick-548 established that `applyVerdictSideEffects` never runs on the web
walkaround, because `page.tsx` redirects a BLOCKED trip to the blocked screen
**during render**, before the driver can ever reach submit. Production evidence:
`carrier_truck_defects` holds zero rows across every tenant while FAILED steps
and BLOCKED instances exist.

Two fixes and a guard:

1. **Delete the render-time redirect.** The submit path is already correct —
   `SignatureScreen.submit()` → `submitInspectionChecklist` → `handleSubmitInspection`
   → `applyVerdictSideEffects` (`inspection-handlers.ts:479`), called
   unconditionally before the gate view is built. Nothing on the submit path
   needs building. **The redirect is the entire defect.**
2. **Stop the blocked screen asserting a delivery it cannot know about.**
   Replace the copy; rename the constant off the name that invited the claim;
   fix the two comments that assert the failed invariant.
3. **A real-database test** that fails if the BLOCKED branch's side effects are
   skipped — asserting on ROWS, not mocks.

Purpose: a failed brake check must leave a durable defect against the truck, and
the driver must not be told a notification happened that may not have.
Output: three edited files, one new test file, three atomic commits.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx
@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx
@apps/web/src/lib/carrier/inspection-handlers.ts
@apps/web/src/lib/carrier/inspection-service.ts
@apps/web/src/lib/carrier/inspection-gate.ts
@apps/web/src/lib/carrier/inspection-lookup.ts
@apps/web/tests/carrier/document-import-commit-rollback.test.ts
</context>

<already_settled>
The orchestrator investigated. Do NOT re-derive these; they are inputs.

- **Submit reaches the side effects.** `handleSubmitInspection` calls
  `applyVerdictSideEffects` unconditionally (`inspection-handlers.ts:479`),
  before `buildGateView`. All four side effects fire on submit.
  `Review & sign` renders at `InspectionRunner.tsx:858-865` on `isLastSection`,
  gated on nothing else. Today the redirect fires before the driver sees it.
- **Mobile has NO defect — verify only, do not edit.**
  `apps/mobile/components/driver/workflows/TripInspectionScreen.tsx:368-372`
  redirects INSIDE `submit()`, after the server returned the gate; the side
  effects already ran. `apps/mobile/components/carrier/TripStartCard.tsx:~82`
  routes on a 422 from start, which is `handleStartTrip`'s blocked path, and
  that calls `applyVerdictSideEffects` at `inspection-handlers.ts:~532`.
- **Do not carry a durable "notified" count.** Three routes were considered and
  rejected: (a) passing `effects.dispatchNotified` from submit survives only the
  immediate post-submit render — reload, direct URL and the page's own
  `Check again` link all re-render from `handleGetGate`, so it does not fix the
  stated problem; (b) reading `in_app_notifications` is purity-safe but
  `notifyDispatchOfBlock` writes `type: 'dispatch_assigned'`, shared with genuine
  assignment notifications, so distinguishing means matching the title string
  `'Trip blocked — inspection failed'` — asserting a safety fact off a brittle
  string match is worse than not asserting it; (c) a stored flag is DDL, which
  is forbidden.
</already_settled>

<tasks>

<task type="auto">
  <name>Task 1: Remove the render-time BLOCKED redirect from the web walkaround</name>
  <files>apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx</files>
  <action>
Delete this block at `page.tsx:86-90`:

```ts
  // A blocked trip has its own screen. Sending the driver into a checklist they
  // have already failed would be a loop with no exit.
  if (view.outcome === 'BLOCKED') {
    redirect(`/inspection/${dispatchId}/blocked`);
  }
```

Replace it with a comment — no code — stating WHY there is deliberately no
redirect here. It must say all four of these, because each is a reason someone
would otherwise put it back:

  - The BLOCKED side effects (`recordInspectionDefects`, `notifyDispatchOfBlock`,
    the `inspection.failed` catalogue emit) hang off SUBMIT, in
    `applyVerdictSideEffects`, called from `handleSubmitInspection`.
  - A render-time redirect skipped every one of them (quick-548): production
    carried zero `carrier_truck_defects` rows across all tenants while FAILED
    steps and BLOCKED instances existed.
  - The driver must therefore be allowed to reach `Review & sign` and submit.
  - The blocked screen is still reached — from `InspectionClient.onOutcome`,
    AFTER the submit that ran the side effects.

Do NOT touch the `redirect` import: it is still used at line 37 for `/sign-in`.
Verify that by reading the file, and do not "clean up" an import that is live.

Do NOT change `handleGetGate`, `evaluateTripStartGate` or any server action.
This task deletes five lines and writes a comment. Nothing else.

Then VERIFY and report (in the SUMMARY) two facts by reading the code, not by
assuming:

  (a) `InspectionClient.tsx` — `onOutcome` routes a BLOCKED gate to
      `/inspection/${dispatchId}/blocked` via `router.replace`. Quote the lines.
      This is the surviving, correct route to the blocked screen and it runs
      after the side effects.
  (b) `blocked/page.tsx:100-102` redirects back to `/inspection/${dispatchId}`
      only when `view.outcome !== 'BLOCKED'`. Complementary to (a), not circular
      — confirm no redirect loop is created by this change.

Also confirm by reading that with the redirect gone a BLOCKED verdict falls
through `if (view.canStart)` (false for BLOCKED) and renders the checklist with
`view.playbookInstanceId` set — i.e. the driver lands on the walkaround, which
is the intent.
  </action>
  <verify>
`grep -n "outcome === 'BLOCKED'" "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx"` returns nothing.
`grep -n "redirect('/sign-in')" "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx"` still returns a line.
`grep -n "quick-549" "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx"` returns the new comment.
`cd apps/web; npx tsc --noEmit` — PROBED per the verification block below.
  </verify>
  <done>
The walkaround page no longer redirects on BLOCKED; a comment in its place
states the four reasons above; the `redirect` import is intact and still used;
tsc is clean under a probed run. Committed atomically.
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace the false "dispatch has been notified" claim and the two comments that assert it</name>
  <files>apps/web/src/lib/carrier/inspection-handlers.ts, apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx</files>
  <action>
**2a — `inspection-handlers.ts:153`.** Replace

```ts
  dispatchNotified: 'Your dispatcher has been notified and can clear this.',
```

with

```ts
  dispatchAlerted:
    'Dispatch is alerted automatically when a trip is blocked, but do not wait on a call — message them here.',
```

The string is APPROVED verbatim — do not reword it. It is ONE string for ONE
sentence (the quick-517 rule: a sentence with structure must not be reassembled
from JSX children). It is true whether or not any channel succeeded, it keeps
the real information that the system does alert, and it converts "wait" into
"act" — the existing **Contact dispatch** button sits directly beneath it.

The RENAME is load-bearing, not cosmetic: `dispatchNotified` is the name that
invited the false claim. Add a short comment above the key recording that
quick-549 renamed it and why, and that the screen deliberately no longer asserts
delivery.

**Do NOT touch `effects.dispatchNotified`.** That is a different thing — the
count returned by `applyVerdictSideEffects`, read at `inspection-handlers.ts:491`
for a log line and defined in `inspection-service.ts`. It stays exactly as it is.
Only the `inspectionCopy` key is renamed. Grep afterwards to prove exactly one
`inspectionCopy` consumer changed.

**2b — `blocked/page.tsx:145-147`.** Update the call site to
`inspectionCopy.dispatchAlerted`, and replace the section comment
`{/* 2 — Dispatch has been told */}` with one that describes what the block now
says (e.g. `{/* 2 — How dispatch finds out, and what to do meanwhile */}`).

**2c — `blocked/page.tsx` file header, numbered item 2.** It currently reads:

> 2. THAT DISPATCH HAS BEEN TOLD. `notifyDispatchOfBlock` has already run
>    inside `handleSubmitInspection` by the time this page renders, so this
>    is a statement of fact rather than a promise. A driver who thinks nobody
>    knows will sit in the yard waiting.

That invariant is precisely what failed — the page was reachable by a
render-time redirect on a path where `handleSubmitInspection` had never run.
Rewrite item 2 to say what is now true: the page states HOW dispatch is alerted
and points the driver at Contact dispatch, rather than asserting a delivery this
page cannot verify; and record why no notified-count is carried (the three
rejected routes in `<already_settled>`, in one or two sentences).
A comment that lies about an invariant is worse than no comment.

Do not change any other copy on the page, and do not touch
`apps/mobile/lib/inspection-copy.ts` (`blockedDispatchTold`) — mobile is
verify-only this task. Record in the SUMMARY that mobile's identical sentence is
left alone because on mobile the claim is backed: its redirect runs inside
`submit()`, after the server has already applied the side effects.
  </action>
  <verify>
`grep -rn "dispatchNotified" apps/web/src --include=*.ts --include=*.tsx` returns ONLY the `inspection-service.ts` return-type/return-value lines and `inspection-handlers.ts:~491` (`effects.dispatchNotified`) — zero hits in any `.tsx`.
`grep -rn "dispatchAlerted" apps/web/src` returns exactly two: the definition and the blocked page's call site.
`grep -n "has already run" "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx"` returns nothing.
`git diff --stat apps/mobile` is empty.
`cd apps/web; npx tsc --noEmit` — PROBED.
  </verify>
  <done>
The blocked screen renders the approved sentence; the constant is named
`dispatchAlerted`; both the section comment and the file-header item 2 describe
what the page actually does; `effects.dispatchNotified` is untouched; mobile is
byte-identical. Committed atomically.
  </done>
</task>

<task type="auto">
  <name>Task 3: A real-database test that fails if the BLOCKED side effects are skipped</name>
  <files>apps/web/tests/carrier/inspection-blocked-side-effects.test.ts</files>
  <action>
The requirement is explicit and non-negotiable: **assert that a defect ROW
exists after a blocking failure.** A mocked Prisma client does not satisfy it
(CLAUDE.md: "a faked DB in a unit test is not evidence about SQL").

**FIRST, read `apps/web/tests/carrier/document-import-commit-rollback.test.ts`
in full** — its header for the rationale, and its `loadEnvLocal` /
`describeWithDb` / dynamic-import / `PROTECTED_TENANT_ID` / `assertDisposable` /
`bypass` / `beforeAll` / `afterAll` shape. Follow that shape precisely. There is
NO local database (DEC-3): both env files point at the one Supabase project,
which is production. That is exactly why the disposable-tenant convention exists.
See also `tests/security/*` and `tests/isolation/setup.ts`.

Carry over, unchanged in spirit:
  - `loadEnvLocal()` in this file (vitest does not read `.env.local`; without it
    the suite skips silently, which is how a DB test is reported green having
    never run).
  - `const describeWithDb = hasDatabase ? describe : describe.skip`.
  - Dynamic imports AFTER `loadEnvLocal()` — the app's prisma singleton reads
    `DATABASE_URL` at module load, and vitest hoists static imports above
    file-level code. Import the APP's client (`@/lib/db/prisma`), never
    `new PrismaClient()` (Prisma 7 here runs on a driver adapter and a bare
    constructor throws).
  - `PROTECTED_TENANT_ID = '7e9eca25-1f97-46ed-9365-e67be49436d5'` and an
    `assertDisposable()` that refuses it by name AND refuses any id that is not
    this suite's tenant.
  - A `ZZ-THROWAWAY-QUICK549-${STAMP}` tenant name, so a human reading the
    tenants table can tell instantly what it is.
  - `bypass()` (`set_config('app.bypass_rls','on',TRUE)` inside a transaction)
    for every fixture write and every count.

**THE FIXTURE** — the minimum that makes `evaluateTripGate` return `BLOCKED`.
Every field below was read off `prisma/schema.prisma` and the gate source; do
not infer any column name from a sibling (DEC-14), and read `pg_constraint`
before writing any enum-ish carrier column.

  - `Tenant` with `requirePreTripInspection: true` and
    `blockTripStartOnFailedInspection: true` (both rungs of
    `evaluateTripStartGate`'s step 1 and step 5).
  - A driver `User` (role DRIVER) + `CarrierDriver` linked to it, and a
    `CarrierTruck`. Check `pg_constraint` for `carrier_trucks` /
    `carrier_drivers` status/type CHECKs before choosing values — this repo has
    been bitten five times (`project_carrier_check_constraint_drift`).
  - `Trip` (`dispatches`): `orgId`, `primaryDriverId`, `truckId`,
    `scheduledDeparture` (required), `status: 'planned'`,
    `inspectionRequired: null` so the tenant setting governs, and
    `inspectionOverridden*` all null (step 2 must not short-circuit).
    Leave `dispatcherId` null.
  - A `Playbook` with `category: 'VEHICLE_INSPECTION'`, `entityType: 'DISPATCH'`,
    `deletedAt: null` — `findTripInspection` filters on exactly that.
  - A `PlaybookInstance` with `entityType: 'DISPATCH'` (the
    `TRIP_INSPECTION_ENTITY_TYPE` constant — import it, do not restate the
    literal) and `entityId` = **the Trip id, not the truck id**.
  - Two `StepInstance` rows. `stepTemplateId` is nullable, so no StepTemplate is
    needed. `stepSnapshot` must carry `{ stepType: 'INSPECTION_ITEM', name,
    isDispatchBlocker }` — `buildSnapshot` filters on `stepSnapshot.stepType`
    and `toOutcome` reads `isDispatchBlocker` from the SNAPSHOT.
      · one PASSED/`COMPLETE` non-critical item;
      · one FAILED critical item: `status: 'FAILED'`,
        `isDispatchBlocker: true`, `completedAt` set,
        `result: { note: 'brake leak', photoUrls: [] }`.
    `StepStatus` is `COMPLETE`, not `COMPLETED` — read the enum in
    `schema.prisma` and use its exact members. `assigneeRole` is required;
    `tenantId` is required on `StepInstance`.
    `isInspectionComplete` requires `items.length > 0` and no unanswered items,
    so BOTH steps must be in a terminal state or the gate answers
    `INSPECTION_REQUIRED` instead of `BLOCKED` — if the test ever reports
    `INSPECTION_REQUIRED`, the fixture is wrong, not the gate.
  - No `NotificationSubscription` rows and no OWNER/MANAGER users, so the
    Phase 10 `inspection.failed` catalogue emit (`defaultRecipients: []`) has no
    recipients and sends no real email from a test.

**THE ASSERTIONS — on rows, from a fresh query, after the fact:**

  1. Call the REAL `handleSubmitInspection({ orgId, dispatchId, userId })` from
     `@/lib/carrier/inspection-handlers`. Nothing mocked.
  2. `expect(res.ok).toBe(true)` and `expect(res.data.outcome).toBe('BLOCKED')`
     — this pins that the fixture really did reach the branch under test.
  3. `carrierTruckDefect.count({ where: { orgId: tenantId } })` — expect the
     number of failed items (2 verdict `failures`? NO: `verdict.failures` is
     ALL failed items, critical or not — read `evaluateTripStartGate` and assert
     the count it actually implies for your fixture, and say in a comment which
     number and why).
  4. Fetch the critical defect row and assert its real column values:
     `truckId`, `dispatchId`, `stepInstanceId` = the failed StepInstance id,
     `isCritical: true`, `note: 'brake leak'`, `status: 'open'`,
     `reportedByUserId` = the driver user id.
  5. **A second submit** (the re-submit the removed redirect now makes possible)
     leaves the count UNCHANGED — `recordInspectionDefects` upserts on
     `stepInstanceId`. This pins the partial unique index, and it is the
     accepted-cost half of this change made executable.

**IT MUST NOT PASS VACUOUSLY.** Include a case that proves the assertion has
teeth, in the rollback test's own "success case" spirit. Use a SECOND trip in
the same disposable tenant whose critical step PASSED (everything else
identical): `handleSubmitInspection` must return `PASSED`, and
`carrierTruckDefect.count` scoped to THAT trip must be 0. Without it, "a row
exists" could be satisfied by a fixture that writes defects unconditionally, and
"count is N" could be satisfied by a stub.

**TEARDOWN — the trap that has already bitten this repo once (quick-546).**
The BLOCKED branch writes `in_app_notifications` via `notifyDispatchOfBlock`,
and `in_app_notifications.org_id` is a real FK to the tenant. A teardown that
deletes the tenant without first deleting those rows fails with a foreign-key
violation AFTER every assertion has passed. **When a test file fails but its
tests all pass, read the Failed Suites block, not the assertions.**
Delete children first, every delete keyed to this suite's own tenant id:
`carrierTruckDefect` → `inAppNotification` → `stepInstance` →
`playbookInstance` → `playbook` → `trip` → `carrierTruck` → `carrierDriver` →
`user` → `tenant`. Then RE-COUNT and throw if anything survived — a silent
cleanup failure leaves orphans in a production database, which is worse than a
red test. Run the suite and read the whole output; if teardown raises anything,
extend the list rather than loosening it. `notifyDispatchOfBlock` also calls
Next's `after()`, which outside a request scope throws and is swallowed by its
own try/catch — expect `dispatchNotified: 0` and do NOT assert on it.

Do NOT use `cleanupTestData()` from `tests/isolation/setup.ts`: it deletes by
broad name prefix across the whole database, unscoped by tenant.

**THE FILE HEADER must state, in the rollback test's own style, HOW THIS TEST
WOULD FAIL IF SOMEONE REINSTATED THE REDIRECT OR OTHERWISE SKIPPED THE BRANCH.**
Be concrete: if `applyVerdictSideEffects`'s BLOCKED arm were removed, or
`recordInspectionDefects` short-circuited, or the branch were moved onto a path
`handleSubmitInspection` does not take, assertion 3 fails with
"expected 0 to be N". Note honestly that the test exercises the SERVER path and
cannot itself see a page-level redirect — the redirect's absence is pinned by
Task 1's grep and by the fact that no page-render path can now consume the
verdict without the driver reaching submit. Say that plainly rather than
implying more coverage than exists.

Do NOT weaken or delete any existing test.

If, after reading the harness, you judge a real-DB test genuinely infeasible
here, say so EXPLICITLY in the SUMMARY with the reason, and mark this step
PARTIALLY — never silently substitute a mocked test.
  </action>
  <verify>
`cd apps/web; npx vitest run tests/carrier/inspection-blocked-side-effects.test.ts` — all tests pass AND the run reports zero failed suites (read the Failed Suites block explicitly, not just the assertion tally).
Teeth check, performed and reported, then reverted: temporarily neuter the BLOCKED arm of `applyVerdictSideEffects` (e.g. early-return before `recordInspectionDefects`), re-run, and confirm the suite goes RED with "expected 0 to be N". Restore the file and confirm `git diff apps/web/src/lib/carrier/inspection-service.ts` is empty.
Carrier suite AFTER: `cd apps/web; npx vitest run src/lib/carrier/__tests__` — diff file/test counts against the BEFORE run captured in the verification block.
`cd apps/web; npx tsc --noEmit` — PROBED.
  </verify>
  <done>
`tests/carrier/inspection-blocked-side-effects.test.ts` exists, runs against real
Postgres in a disposable tenant, asserts a real `carrier_truck_defects` row and
its column values after a real `handleSubmitInspection`, includes a non-vacuous
PASSED counter-case and a re-submit idempotency case, cleans up verifiably
including `in_app_notifications`, and its header states how it fails if the
branch is skipped. The teeth check was performed and reported. Committed atomically.
  </done>
</task>

</tasks>

<verification>

**Do not skip, do not reorder, do not summarise away.**

**1 — TypeScript, BOTH apps, PROBED.**
```
cd apps/web; npx tsc --noEmit
cd apps/mobile; npx tsc --noEmit
```
An unprobed clean run DOES NOT COUNT. After each app reports clean:
inject `const __probe: number = 'x';` into a file you actually edited in that
app, re-run, confirm tsc reports THAT error, delete it, re-run.
(For `apps/mobile`, which this task does not edit, probe any file you read —
the point is to prove the gate is live, and record that mobile was not modified.)

If all reported errors are syntax errors, or all sit in files you did not touch,
**the gate is BLIND, not green**: delete `apps/web/.next/dev/types/validator.ts`
and `apps/web/tsconfig.tsbuildinfo` and re-run. quick-519 additionally found ten
untracked files carrying literal stray tool-output text from a concurrent
session — a parse error in ANY file in the program suppresses semantic checking
of everything.

Before committing: `grep -rn "__probe" apps/web/src apps/web/tests apps/mobile`
must return nothing, and `git status` must show the probed files back to
unmodified (byte-for-byte restoration, not "looks the same").

**2 — Vitest, BEFORE and AFTER, counts DIFFED, both reported.**
BEFORE (capture first, before any edit):
```
cd apps/web; npx vitest run src/lib/carrier/__tests__
```
Baseline is 11 files / 127 tests / 0 failures. If your BEFORE run disagrees with
that, STOP and report it — the baseline is wrong or the tree is dirty, and
either way you must not proceed on an unknown floor.
AFTER: the same command, plus the new file. Report both numbers and the diff.
The only permitted change is the new tests added by Task 3.

**3 — Purity and scope, grep-proved.**
```
git diff --stat apps/mobile                      # must be empty
git diff apps/web/src/lib/carrier/inspection-gate.ts        # must be empty
git diff apps/web/src/lib/carrier/inspection-service.ts     # must be empty
```
`handleGetGate` must remain a pure read. No side effect may move into it or into
`evaluateTripStartGate`. No server action's behaviour changes.

**4 — No DDL, no data migration.** `git status` must show no new file under
`apps/web/prisma/migrations/`.

**5 — Shell.** PowerShell has no `&&` / `||`. Use `;` or `if ($?) { }`.
If you use a worktree, remove it with `git worktree remove` — never
`Remove-Item`, never a symlink into the real tree.

**6 — Commits.** Three atomic commits, one per task. **Commit only; do NOT push.**
</verification>

<success_criteria>
- `page.tsx` has no `view.outcome === 'BLOCKED'` redirect; a comment in its place
  states the four reasons; the `redirect` import is intact and still used for
  `/sign-in`.
- `InspectionClient.onOutcome` (verified by reading) is the only remaining route
  to the blocked screen, and it runs after submit — reported in the SUMMARY with
  quoted lines.
- No redirect loop: `blocked/page.tsx` only redirects back when
  `outcome !== 'BLOCKED'` — confirmed and reported.
- `inspectionCopy.dispatchAlerted` carries the approved sentence verbatim;
  `inspectionCopy.dispatchNotified` no longer exists; `effects.dispatchNotified`
  is untouched.
- Both the section comment and the file-header item 2 on `blocked/page.tsx`
  describe what the page now does; neither asserts the failed invariant.
- `tests/carrier/inspection-blocked-side-effects.test.ts` passes against real
  Postgres, asserts a real defect row, has a non-vacuous counter-case, and its
  teardown leaves the database clean (verified by re-count).
- tsc clean and PROBED in both apps; no `__probe` survives; `git status` clean of
  probe residue.
- Vitest carrier counts reported BEFORE and AFTER with the diff; no existing test
  weakened or deleted.
- `apps/mobile` byte-identical.
- Three commits, no push.
</success_criteria>

<summary_must_record>
The SUMMARY must state each of these explicitly — they are findings, not
solutions, and they are the point of writing one:

1. **Mobile verdict.** Verify-only outcome for
   `TripInspectionScreen.tsx:368-372` and `TripStartCard.tsx:~82`: both redirect
   AFTER the server applied the side effects, so mobile has no equivalent
   defect. Also note that `apps/mobile/lib/inspection-copy.ts`'s
   `blockedDispatchTold` still carries the old sentence, and why it was left:
   on mobile the claim is backed by the submit path. Flag the resulting
   web/mobile copy divergence as a knowingly-accepted state.

2. **Accepted cost 1 — repeat submits.** With the redirect gone, a driver can
   return to the checklist and re-submit. `recordInspectionDefects` upserts on
   `stepInstanceId`, so defects do NOT duplicate (Task 3 pins this). But
   `notifyDispatchOfBlock`'s `createNotification` has NO dedup window — only the
   Phase 10 catalogue emit has one (5 min, `NOTIFICATION_DEDUP_WINDOW_MS`) — so
   repeated submits mean repeated in-app rows for the dispatcher. RECORD, do not
   solve.

3. **Accepted cost 2 — the screen no longer asserts delivery at all.** That is
   the point of the change, not a regression. Record the three rejected routes
   to a durable notified-count and why each was rejected.

4. **How the test fails** if someone reinstates the redirect or otherwise skips
   the BLOCKED branch — the concrete assertion and the concrete message — plus
   an honest statement of what the server-path test does NOT cover (a
   page-level redirect), and what pins that instead.

5. **The teeth check**: that you neutered the BLOCKED arm, saw the suite go red,
   and restored the file with an empty diff.

6. Vitest BEFORE/AFTER counts with the diff, and the probed-tsc evidence for
   both apps.
</summary_must_record>

<output>
After completion, create
`.planning/quick/549-stop-the-mid-checklist-redirect-and-stop/549-SUMMARY.md`
</output>
