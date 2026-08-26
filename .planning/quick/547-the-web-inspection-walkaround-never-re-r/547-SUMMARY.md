---
task: quick-547
title: The web inspection walkaround never re-rendered after an answer
status: complete
date: 2026-08-26
subsystem: carrier / driver inspection (web)
tags: [inspection, phase-9-web, useOptimistic, react-19, next-16, client-state]
files_created:
  - apps/web/src/lib/carrier/inspection-optimistic.ts
  - apps/web/src/lib/carrier/__tests__/inspection-optimistic.test.ts
files_modified:
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
files_deliberately_untouched:
  - apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
  - apps/web/src/lib/carrier/inspection-gate.ts
  - apps/web/src/lib/carrier/inspection-service.ts
  - apps/web/src/lib/carrier/inspection-lookup.ts
  - apps/mobile/**
commits:
  - 492709af feat(quick-547): pure inspection optimistic-overlay module
  - 6818b6df fix(quick-547): the web inspection walkaround re-renders after every answer
ddl: none
---

# quick-547 — The web inspection walkaround re-renders after every answer

## The mechanism

`/inspection/[dispatchId]` is a Server Component (`dynamic = 'force-dynamic'`) that reads
the checklist and hands it down as a **prop**. Every answer action ends in
`refreshInspection()` — two `revalidatePath` calls — and that was the *only* change signal
the screen had. `InspectionRunner`'s header comment stated the assumption outright
("this component holds no answer state at all — every tick you see comes from
`view.sections[].steps[].status`, re-rendered after each action's `revalidatePath`"), and
that assumption was the bug: the write landed, the client never applied the revalidation,
the chip kept reading "Not answered", and the driver tapped again. `ItemCard.run()`
awaited the action, cleared the note/photo/mode and never touched the answer or the router
— which is why **Fail only appeared to work**: `setMode('idle')` collapsed the open form,
visible local motion that was not the answer being reflected.

## The fix, and why the failure guarantee is structural

Two commits, entirely on the client. No server action changed behaviour, signature or
return shape.

**`inspection-optimistic.ts`** — pure, no React, no I/O. `applyOptimisticAnswers(view,
overlay)` merges the answers in flight onto the server's view; `inspectionProgress` and
`sectionRemainingCount` are the derivations lifted out of the runner's `totals` useMemo
(carrying the quick-543 reasoning paragraph with them) so that the header counter and the
per-item chips are computed by one function over one view and cannot disagree.

Two encoded rules: **a server answer always supersedes a claim** (a spent overlay must
never mask a real answer, including a FAILED somebody else recorded), and **a claim naming
a step not in the view is inert** — never appended, because inventing a checklist row on a
DVIR is worse than a missing tick.

**`InspectionRunner`** holds the overlay — not the merged view — in `useOptimistic`, so the
same value drives both what is rendered (`applyOptimisticAnswers`) and which button spins
(`pendingVerbFor`).

Step 4 of the plan asked that a failed write never render as answered. That is
`useOptimistic`'s **automatic discard when the transition ends**, not a check: there is no
`catch` block, no `clearOverlay()` call, and therefore nothing a later edit can drop. It is
the same shape as `autoLinkTarget()` and the T3/T4 verdict union — make the wrong state
unrepresentable rather than guarded. Verified rather than asserted; see below.

## Observed: the transition scope, and whether it flickers

**It flickers, and `router.refresh()` inside the transition is what stops it.** Measured,
not eyeballed: I drove the real component in jsdom (using the `jsdom`/`react-dom` already
present in `node_modules` as hoisted transitive deps) with the server action gated on a
promise I controlled, and ran the same code twice with only the refresh's effect differing.

| | on tap | the instant the action resolves | after the tree lands |
|---|---|---|---|
| **A** — refresh stubbed to do nothing | `Passed` · `All 1 items answered` | **`0 of 1 items answered` · Pass/Fail/N/A back** | — |
| **B** — refresh modelled as Next implements it | `Passed` | `Passed` | `Passed` |

Row A is the flicker, reproduced: the optimistic value is discarded the moment the
transition ends, and if nothing has replaced it the driver watches the tick vanish — the
same bug in a shorter form. Row B held `Passed` continuously across the whole gap;
mid-flight revert: **false**.

Why calling it after an `await` is safe, despite React 19 requiring post-`await` updates to
be re-wrapped in `startTransition`: **Next wraps its own dispatch.** Read off the installed
`next@16.2.1`, `dist/client/components/app-router-instance.js`:

```js
refresh: ()=>{
    (0, _react.startTransition)(()=>{
        (0, _useactionqueue.dispatchAppRouterAction)({ type: _routerreducertypes.ACTION_REFRESH });
    });
},
```

Because that is scheduled while the answer's async action is still pending, React entangles
the two lanes and the overlay is handed over to the new tree instead of being dropped in
front of it. The plan explicitly cited `maintenance-page-client.tsx` as API precedent only,
not a shape to copy — correctly: it calls `router.refresh()` after an `await` in a plain
async handler with no explicit transition at all, which is row A.

## Observed: what actually happens on a forced write failure

Forced by making the action resolve `{ success: false, error: 'Task not found or not
assigned to you' }`. Observed, in order: chip flips to `Passed` on tap → action resolves →
**`0 of 1 items answered`, the Pass/Fail/N/A buttons return, and the banner reads "Task not
found or not assigned to you"**. `router.refresh()` was called **0 times** (the failure
branch returns before it) and the string `Passed` was absent from the DOM. Nothing rendered
as recorded that was not recorded.

Also observed on the other paths: **Fail** flips the chip to `Failed` *and* renders the
typed note and the "A reported fault stays reported" line; **N/A** flips it to `Not
applicable`; and **re-answering** an item the server already has as `COMPLETE` correctly
keeps showing `Passed` while the fail write is in flight — rule 1 working, and the accepted
cost documented in the module rather than hidden.

**Incidental finding, not fixed:** `AnswerChip`'s `NOT_STARTED` branch — the literal
"Not answered" pill — is **unreachable**. It renders only inside `{answered && ...}`, and an
answered step never has that status. An unanswered item shows no chip at all; "visibly
unanswered" is the buttons returning and the counter dropping. Harmless dead code, left
alone as out of scope, but it is why "does the chip say Not answered" is the wrong question
to ask this DOM.

## Observed: the `BeginScreen` finding

**The plan's prime suspect is wrong, with evidence.** The suspicion was that
`onOpened() → router.refresh()` fires after an `await` inside an async `startTransition`
callback, so the transition has already settled. It has not: as quoted above, `refresh()`
establishes its **own** transition and does not depend on the enclosing one being live. So
whatever stopped the checklist appearing, it was not that.

Rather than keep diagnosing why one revalidation signal does not land — the same single
point of failure as the missing ticks — I removed the dependence. `openInspectionChecklist`
has **always returned the built `InspectionChecklistView`** and `BeginScreen` threw it away.
It now hands it up, `InspectionClient` holds it as `opened`, and renders `checklist ??
opened` — the server prop wins the moment it exists, the same "server supersedes a local
stand-in" rule as `applyOptimisticAnswers`. `router.refresh()` is still called, now as a
convergence step rather than the mechanism.

Observed with `refresh` stubbed to a complete no-op: before the tap, "Pre-trip inspection /
Walk around unit 104…"; after the tap, "Section 1 of 1 · Walkaround · 0 of 1 items answered
· Brakes · Pass Fail N/A". **Checklist revealed: true.** It cannot regress to the old
behaviour because it no longer asks the refresh for anything.

## The structural choice in Task 2 item 3, and why

Of the two shapes the plan listed I took **(a): lift the submission into `InspectionRunner`
and pass a callback down**, and I did not take it because it was listed first.

The deciding reason is that the invariant "the transition must outlive the action" is only
enforceable where `router.refresh()` and `useOptimistic`'s setter sit together. Shape (b) —
hoisting the setter through props into `ItemCard`'s existing `useTransition` — would have
split a single rule across a component boundary, which is precisely the kind of rule a later
edit drops without noticing. Secondarily, the card is one of N siblings; a per-card
transition owning a slice of a runner-level overlay makes "one write in flight" a fact
assembled from N places.

What that cost, and what happened to each piece:

- **`ItemCard` no longer owns a transition and no longer imports an answer action.** It
  reports an `AnswerRequest` (`{verb:'pass'}` | `{verb:'fail', note, photoKeys}` |
  `{verb:'na', reason}`) and the runner decides what that claims (`claimFor`) and which
  action carries it (`callFor`).
- **`pending` / `busyVerb` are gone as local state** and are derived from the overlay via
  `pendingVerbFor`. React creates and discards the overlay around exactly the window the
  spinner should cover, so there is nothing left to set or to clear — the `finally { setBusyVerb(null) }`
  it replaces was a hand-maintained copy of a fact React already tracks. Behaviour is
  preserved: buttons disable per-card, not globally.
- **`setMode('idle')` / note / reason / photo clearing still happen, and still only on
  success.** `onAnswer` resolves `true`/`false` and the card's `run()` awaits it. A refused
  write leaves the form open with the text intact so the driver can read the banner and
  retry without retyping.
- **`onError` left `ItemCard`**; the banner is unchanged but is now raised where the failure
  is actually observed.
- The `SignatureScreen` is handed the **optimistic** view, since `remaining` was already
  computed from it — passing the raw view would let the two screens disagree about the same
  checklist for the width of one round trip.

One deliberate subtlety: `claimFor` gives the **fail** claim its note and photo keys (both
honest — `failInspectionItem` stores `result.note`, which is exactly what
`handleGetChecklist` reads back, and the photo bytes are already in R2 from upload-at-capture)
but gives the **N/A** claim none. `markDriverTaskNotApplicable` → `skipStep` writes
`StepInstance.skipReason`, and the checklist view's `note` comes from `result.note`, which
that path never writes. Showing the reason optimistically would have put a line of text on
screen that the next server tree silently removes — a flicker of exactly the kind this task
exists to remove.

## Verification

### TypeScript — both apps, probe-confirmed

`apps/web`: clean. Probe `const __probe: number = 'x';` injected into a file I actually
edited reported:

```
src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx(1104,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

`apps/mobile`: clean. Probe reported:

```
components/driver/workflows/TripInspectionScreen.tsx(940,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

Both probes named the file I put them in, so the gate was semantic and live, not blind on a
parse error elsewhere. Both removed; `git grep -n "__probe"` over `apps/**` and
`packages/**` returns nothing, and no stray `__probe.ts` exists. Both apps re-run clean
afterwards.

*Worth recording:* removing the mobile probe with a script left a **trailing newline** the
original file did not have, so `git status` showed `apps/mobile` modified with a `1 +`
diffstat. Restored with `git checkout --`; the mobile tree is byte-identical to HEAD. A
probe is not removed until `git status` says so.

### Vitest — before and after, diffed

| | Test Files | Tests | Failures |
|---|---|---|---|
| baseline (`npx vitest run src/lib/carrier/__tests__`) | 10 | 105 | 0 |
| after | **11** | **127** | **0** |
| delta | **+1** | **+22** | **0** |

No existing test was weakened, skipped or deleted. No suite-level failure — every file
passed as a file, not merely as a set of assertions.

### The new tests were demonstrated RED

Commented out the supersede rule (`if (isAnswered(step)) return step;`) so the overlay wins
unconditionally, and re-ran:

```
× lets a server COMPLETE supersede a claim of something else
× lets a server FAILED supersede a claim of a pass
× lets a server SKIPPED supersede a claim
AssertionError: expected 'FAILED' to be 'COMPLETE'
AssertionError: expected 'COMPLETE' to be 'FAILED'
AssertionError: expected 'COMPLETE' to be 'SKIPPED'
Tests  3 failed | 19 passed (22)
```

Exactly the three supersede tests reddened and nothing else — so they test the rule they
name, and the other 19 are not silently coupled to it. Rule restored; 22/22 green.

### Mobile — verify only, no edit

`apps/mobile/components/driver/workflows/TripInspectionScreen.tsx` still does
confirm-then-patch on all three answer paths, unchanged:

- L175 `if (!res.ok) throw new Error(await readError(res))` → L176 `patchStep(…, 'COMPLETE')`
- L193 `if (!res.ok) throw …` → L194 `patchStep(…, 'SKIPPED')`
- L315 `if (!res.ok) throw …` → L317 `patchStep(…, 'FAILED', note, …)`

Mobile has never had this defect and was not touched. `git status apps/mobile` is empty and
`git diff --name-only 20717de4..HEAD -- apps/mobile` is empty.

### Scope

`git diff --stat 20717de4..HEAD` — four files, all listed in the frontmatter.
`actions.ts`, `inspection-gate.ts`, `inspection-service.ts`, `inspection-lookup.ts` and
`apps/mobile/**` confirmed untouched by name. No DDL, no migration, no data change.

## Found and deliberately NOT fixed

1. **`AnswerChip`'s "Not answered" branch is dead code** — unreachable behind `{answered && …}`.
   Cosmetic, out of scope, and recorded here so the next person does not spend time asking
   the DOM a question it cannot answer.
2. **The root cause of the missing revalidation is still not diagnosed** — only routed
   around, as the plan directed. `revalidatePath` is still called by every action and the
   server-side re-render is still requested; the fix makes the screen correct whether or not
   it is applied. If it is ever diagnosed, none of this needs removing: the overlay covers
   the round-trip latency regardless.
3. **The jsdom observation harness was not kept.** It gave the evidence in this summary but
   depends on `jsdom` and `react-dom/client` being present only as hoisted transitive
   dependencies, and neither `jsdom` nor a testing-library is a declared dev-dependency of
   `apps/web`. Committing a test that a clean reinstall could break — to gain coverage the
   plan did not ask for — was the wrong trade. The committed tests are pure, per the plan.
   If component tests are ever wanted here, the prerequisite is declaring the dependency,
   not discovering it.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/inspection-optimistic.ts` — FOUND
- `apps/web/src/lib/carrier/__tests__/inspection-optimistic.test.ts` — FOUND
- `apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx` — FOUND, modified
- `apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx` — FOUND, modified
- commit `492709af` — FOUND
- commit `6818b6df` — FOUND
