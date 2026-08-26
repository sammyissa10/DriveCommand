---
phase: quick-549
plan: 01
subsystem: carrier/inspection
tags: [inspection, dispatch, notifications, defects, real-db-test]
requires:
  - quick-548 (the finding: zero carrier_truck_defects rows in production)
  - Phase 9 (the gate, applyVerdictSideEffects, the blocked screen)
provides:
  - "A driver whose walkaround fails critically now reaches Review & sign and submits"
  - "carrier_truck_defects rows actually get written on the web surface"
  - "A real-Postgres regression test on the BLOCKED side-effect branch"
affects:
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx
  - apps/web/src/lib/carrier/inspection-handlers.ts
tech-stack:
  added: []
  patterns:
    - "Disposable-tenant real-DB test (document-import-commit-rollback convention)"
key-files:
  created:
    - apps/web/tests/carrier/inspection-blocked-side-effects.test.ts
  modified:
    - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx
    - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx
    - apps/web/src/lib/carrier/inspection-handlers.ts
decisions:
  - "The render-time redirect was the entire defect; nothing on the submit path needed building"
  - "No durable notified-count is carried; the screen stops asserting delivery instead"
  - "inspectionCopy.dispatchNotified renamed to dispatchAlerted — the name invited the false claim"
  - "Mobile left untouched: its redirect runs after the server applied the side effects"
metrics:
  duration: ~50m
  tasks: 3
  files: 4
  completed: 2026-08-26
---

# quick-549: Stop the Mid-Checklist Redirect, and Stop the Screen Claiming Delivery Summary

A render-time `BLOCKED` redirect on the web walkaround meant `applyVerdictSideEffects` never ran, so a failed brake check left no defect against the truck; deleting it, correcting the blocked screen's false delivery claim, and pinning the branch with a real-Postgres test.

## What Changed

**Task 1 — the redirect (commit `d15bf8cf`).** Deleted the five-line
`if (view.outcome === 'BLOCKED') redirect(...)` at `page.tsx:86-90` and replaced
it with a comment stating the four reasons it must not come back. The `redirect`
import is intact and still used at line 37 for `/sign-in`.

**Task 2 — the copy (commit `70f96eed`).** `inspectionCopy.dispatchNotified` →
`dispatchAlerted`, carrying the approved sentence verbatim. Call site, section
comment and the file-header's numbered item 2 all updated.

**Task 3 — the test (commit `2b6cb266`).**
`tests/carrier/inspection-blocked-side-effects.test.ts`, 5 tests, real Postgres,
disposable tenant.

## Findings the Plan Asked Me to Report

### 1. Where the driver lands after submit when BLOCKED — verified by reading

`InspectionClient.tsx:74-85`, quoted:

```tsx
onOutcome={(gate) => {
  if (gate.outcome === 'BLOCKED') {
    router.replace(`/inspection/${dispatchId}/blocked`);
    return;
  }
  setOutcome(gate);
}}
```

This is now the **only** surviving route to the blocked screen, and it runs
inside `InspectionRunner`'s outcome callback — i.e. after `submitInspectionChecklist`
→ `handleSubmitInspection` → `applyVerdictSideEffects` has already returned. The
side effects have run before the driver ever sees that URL.

**No redirect loop.** `blocked/page.tsx:100-102` redirects back to
`/inspection/${dispatchId}` **only** when `view.outcome !== 'BLOCKED'`. The two
are complementary, not circular: the client sends BLOCKED *to* the blocked page,
and the blocked page sends NOT-BLOCKED *away*. There is no longer any condition
under which the walkaround page bounces a BLOCKED trip, so the pair cannot
oscillate.

**And a BLOCKED verdict does land on the walkaround**, which is the intent.
Confirmed at `inspection-handlers.ts:212-215`: the BLOCKED branch of
`buildGateView` sets `canStart: false` and `playbookInstanceId: verdict.playbookInstanceId`
(non-null). So it falls straight through `if (view.canStart)` and into the
checklist fetch.

### 2. Mobile verdict — verify-only, no equivalent defect

- **`TripInspectionScreen.tsx:368-372`** — the redirect sits INSIDE `submit()`,
  on the line after `const gate = await carrierDriverApi.submitInspection(token, dispatchId)`.
  The server has already run `applyVerdictSideEffects` by the time the client
  navigates. No defect.
- **`TripStartCard.tsx:~82`** — routes to the blocked screen on a
  `TripStartBlockedError` (HTTP 422) thrown by `startTrip`. That 422 is
  `handleStartTrip`'s blocked path, which calls `applyVerdictSideEffects` at
  `inspection-handlers.ts:552` *before* returning (verified by reading — the
  comment there says "the moment the defects are written against the truck").
  No defect.
- `apps/mobile` is **byte-identical**: `git diff --stat apps/mobile` empty.

**Knowingly-accepted copy divergence.** `apps/mobile/lib/inspection-copy.ts:56`
still reads `blockedDispatchTold: 'Your dispatcher has been notified and can clear this.'`
It was left alone because on mobile the claim is **backed** — both routes to that
screen run after the server applied the side effects, so the notification really
has been attempted. Web and mobile now say different things on the same screen.
That is a deliberate state, not an oversight: aligning them would mean either
weakening a true sentence on mobile or restoring a false one on web. Flagging it
so a future reader does not "fix" the inconsistency by reverting the web copy.

### 3. Accepted cost 1 — repeat submits

With the redirect gone a driver can return to a blocked checklist and submit
again. Two different behaviours result:

- **Defects do NOT duplicate.** `recordInspectionDefects` matches on
  `stepInstanceId` and updates, backed by the partial unique index. Task 3's
  third test pins this: the count stays at 2 across two submits.
- **In-app notifications DO repeat.** `notifyDispatchOfBlock`'s
  `createNotification` has **no dedup window** — only the Phase 10 catalogue
  emit has one (`NOTIFICATION_DEDUP_WINDOW_MS`, 5 min), and it is passed only by
  the ten Phase 10 emits. So repeated submits mean repeated in-app rows for the
  dispatcher.

**RECORDED, NOT SOLVED**, per the plan. Fixing it would mean either adding a
dedup window to a path that predates the mechanism, or re-introducing a guard on
the checklist — and the second is how this bug happened.

### 4. Accepted cost 2 — the screen no longer asserts delivery at all

This is the point of the change, not a regression. The old sentence was a claim
about a delivery no page render can verify.

Three routes to a durable notified-count were considered and **all rejected**:

1. **Pass `effects.dispatchNotified` through from submit.** Survives only the
   immediate post-submit render. Reload, direct URL and the page's own
   `Check again` link all re-render from the pure `handleGetGate`, so it does not
   fix the stated problem.
2. **Read `in_app_notifications`.** Purity-safe, but `notifyDispatchOfBlock`
   writes `type: 'dispatch_assigned'`, shared with genuine assignment
   notifications. Distinguishing means matching the title string
   `'Trip blocked — inspection failed'`, and asserting a safety fact off a
   brittle string match is worse than not asserting it.
3. **A stored flag.** DDL, which this task forbids.

Both the section comment and the file-header item 2 now record this, replacing
an item that asserted precisely the invariant that had failed.

### 5. How the test fails if someone reinstates the redirect or skips the branch

The concrete assertion is `expect(after.total).toBe(2)` in *"writes a defect row
for EVERY failed item when the verdict is BLOCKED"*.

- Remove or early-return the BLOCKED arm of `applyVerdictSideEffects` →
  **"expected +0 to be 2"**.
- Short-circuit `recordInspectionDefects` → same assertion, same message.
- Move the side effects onto a path submit does not take → count 0, same failure.
- Swap `verdict.failures` for `verdict.criticalFailures` → **"expected 1 to be 2"**.
  The fixture carries one critical AND one non-critical failure precisely so
  those two are different numbers; a single-failure fixture could not tell them
  apart.

**What it does NOT cover, stated plainly.** It exercises the SERVER path and
calls the handler directly, so it cannot see a page-level redirect. If someone
reinstated the render-time redirect, drivers would again be pulled off the
checklist and **this file would stay green**. That half is pinned instead by
Task 1's grep (`outcome === 'BLOCKED'` returns nothing in `page.tsx`) and by the
comment block standing in the deleted code's place. The header says this in
those words rather than implying broader coverage.

### 6. The teeth check — performed

Injected `return { defectsWritten: 0, dispatchNotified: 0 };` at the top of the
BLOCKED arm in `inspection-service.ts` and re-ran:

```
× writes a defect row for EVERY failed item when the verdict is BLOCKED
  AssertionError: expected +0 to be 2
× re-submitting the same failed checklist ...   expected +0 to be 2
× writes NO defects when the same checklist passes   expected +0 to be 2
Test Files  1 failed (1)   Tests  3 failed | 2 passed (5)
```

Exactly the message the header predicts. File restored;
`git diff apps/web/src/lib/carrier/inspection-service.ts` is **empty** and the
file does not appear in `git status` at all.

## Verification

**Vitest, BEFORE / AFTER, diffed.**

| Run | Files | Tests | Failures |
| --- | --- | --- | --- |
| BEFORE `src/lib/carrier/__tests__` (cold) | 11 | 127 | **1** — see below |
| BEFORE `src/lib/carrier/__tests__` (warm) | 11 | 127 | 0 |
| AFTER `src/lib/carrier/__tests__` | 11 | 127 | 0 |
| AFTER + new file | 12 | 132 | 0 |

Diff: **+1 file, +5 tests**, all from Task 3. No existing test weakened or
deleted; the pre-existing 127 are unchanged.

**On the baseline discrepancy — reported rather than swallowed.** The very first
(cold) run showed 1 failure: `trip-start-gate-coverage.test.ts > "a refusal
always carries a sentence, never an empty string"` timed out at 30s having run
35.6s. The tree was clean at that point (only the untracked plan directory). It
is a **load-induced flake, not a broken floor**: that test hits the real
database, runs in 5.7s alone, and the cold run's own summary reports `import
82.03s` — the 30s test timeout expired while the suite was still importing under
parallel load. Two subsequent warm runs gave 11/127/0, matching the plan's stated
baseline exactly. Recorded because a real-DB test with a 30s timeout in a suite
whose cold import is 82s will flake again on a cold cache.

**TypeScript, both apps, PROBED.**

- `apps/web`: clean (exit 0) → injected `const __probe: number = 'x';` into
  `tests/carrier/inspection-blocked-side-effects.test.ts` → tsc reported
  **THAT** error (`(707,7): error TS2322`) → removed → clean. Probed a second
  time earlier against `page.tsx` (`(230,7)`) and `inspection-handlers.ts`
  (`(613,7)`) — the two source files actually edited.
- `apps/mobile`: **not modified**; probed anyway to prove the gate is live —
  injected into `lib/inspection-copy.ts`, tsc reported `(61,7): error TS2322`,
  removed, clean.
- `grep -rn "__probe" apps/web/src apps/web/tests apps/mobile` → empty.
  `git status` shows no probe residue; every probed file restored byte-for-byte
  from a `cp` backup (the service file does not even appear in `git status`).

**The probe earned its keep this time.** The first probed web run surfaced **10
real TS18046 errors in the new test file** that the "clean" claim would otherwise
have rested on — `bypass`'s `any` transaction made `findFirst` results `unknown`.
Fixed by declaring a `DefectRow` type, which also puts the asserted column names
back under the compiler (an `any` row would accept a typo'd column as
`undefined` and pass).

**Scope and purity, grep-proved.**

- `git diff --stat apps/mobile` — empty.
- `git diff apps/web/src/lib/carrier/inspection-gate.ts` — empty.
- `git diff apps/web/src/lib/carrier/inspection-service.ts` — empty.
- `handleGetGate` and `evaluateTripStartGate` untouched; no side effect moved
  into either; no server action's behaviour changed.
- `grep -rn "dispatchAlerted" apps/web/src` → exactly 2 (definition + call site).
- `grep -n "has already run" blocked/page.tsx` → nothing.
- No new file under `apps/web/prisma/migrations/`. **No DDL, no data migration.**

**Stray tool-output sweep.** `grep -n "</content>\|</invoke>"` on the new test
file → nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DefectRow` type added to the new test file**
- **Found during:** Task 3, on the first probed tsc run
- **Issue:** `bypass<T>(fn: (tx: any) => Promise<T>)` inferred `T = unknown` for
  `findFirst`/`count` results, producing 10 × TS18046 (`'critical' is of type
  'unknown'`). The file would not have compiled.
- **Fix:** Declared an explicit `DefectRow` shape, used
  `bypass<DefectRow | null>` / `bypass<number>`, and replaced
  `expect(row).not.toBeNull()` + property access with an explicit
  `if (!row) throw` narrowing (which also gives a better failure message).
- **Files modified:** `apps/web/tests/carrier/inspection-blocked-side-effects.test.ts`
- **Commit:** `2b6cb266`

### Fixture decisions the plan did not specify

**Two trucks, not one.** The plan called for a second trip for the counter-case
but did not say to isolate the truck. It is load-bearing:
`findValidPriorInspection` searches by `truckId` + this driver, and Section 12
checks a prior inspection **before** this trip's own. On a shared truck, the
passing trip's inspection would satisfy the blocked trip's gate as
`PRIOR_INSPECTION` and the BLOCKED branch would never be reached — the suite
would pass having tested the wrong rung. A fifth test asserts the two truck ids
differ, so a future "simplification" fails loudly.

**Three items on the blocked checklist, not two.** The plan asked me to work out
the count the fixture implies. `applyVerdictSideEffects`' BLOCKED arm passes
`verdict.failures` (ALL failures), not `criticalFailures`. With only one failure
those two are the same number and swapping them would go undetected, so the
fixture carries one PASS, one **critical** FAIL and one **non-critical** FAIL →
the assertion is `2`, and a `criticalFailures` swap fails with "expected 1 to be 2".

**Acting user is a DRIVER, not an OWNER.** The plan asked for no OWNER/MANAGER
users so the catalogue emit has no recipients. Making the acting user the driver
achieves that and is also what really happens — and it additionally silences
`notifyDispatchOfBlock`, which falls back to every active owner/manager when a
trip has no dispatcher. Confirmed by the run's own log:
`defectsWritten: 2, dispatchNotified: 0` and
`dispatchNotification:done trigger=inspection.failed sent=0 skipped=0 failed=0`.

**`NotificationSendLog` added to teardown.** Queried `pg_constraint` for every FK
referencing `"Tenant"`: `in_app_notifications.org_id` is `ON DELETE RESTRICT`
(the quick-546 trap, handled), but `NotificationSendLog` has **no FK at all** —
so it cannot block the delete and would therefore have been silently left behind
as orphan telemetry in a production table. Deleted explicitly and included in the
verified re-count.

### Conflict between two instructions in the plan

Task 2's `<verify>` block requires "**zero** hits [for `dispatchNotified`] in any
`.tsx`". Task 2c's prose requires the blocked page's header to record why no
notified-count is carried, and route (a) **is** `effects.dispatchNotified`. I
followed the prose: `blocked/page.tsx:32` mentions `effects.dispatchNotified`
inside a comment explaining the rejected route. It is documentation, not a
consumer — there is no `inspectionCopy.dispatchNotified` reference anywhere. The
verify's intent (no code still reading the old copy key) is met.

### Not fixed — reported only

**`notifyDispatchOfBlock`'s repeated in-app rows** (accepted cost 1 above). No
dedup window on that path; repeat submits now reachable. Left as-is per the plan.

## Auth Gates

None.

## Self-Check: PASSED

Files:
- FOUND: `apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx`
- FOUND: `apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx`
- FOUND: `apps/web/src/lib/carrier/inspection-handlers.ts`
- FOUND: `apps/web/tests/carrier/inspection-blocked-side-effects.test.ts`

Commits:
- FOUND: `d15bf8cf` fix(549): stop the render-time BLOCKED redirect skipping every side effect
- FOUND: `70f96eed` fix(549): stop the blocked screen asserting a delivery it cannot verify
- FOUND: `2b6cb266` test(549): pin the BLOCKED side effects against real Postgres rows

Contract checks:
- `page.tsx` contains `quick-549`, no `outcome === 'BLOCKED'`, retains `redirect('/sign-in')`
- `inspection-handlers.ts` contains `dispatchAlerted`
- `blocked/page.tsx` contains `inspectionCopy.dispatchAlerted`
- test file contains `carrierTruckDefect` and `handleSubmitInspection`
