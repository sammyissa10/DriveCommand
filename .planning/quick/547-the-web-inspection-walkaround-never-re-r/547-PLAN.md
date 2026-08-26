---
phase: quick-547
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/inspection-optimistic.ts
  - apps/web/src/lib/carrier/__tests__/inspection-optimistic.test.ts
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
  - .planning/quick/547-the-web-inspection-walkaround-never-re-r/547-SUMMARY.md
autonomous: true

must_haves:
  truths:
    - "A driver who taps Pass sees the item flip to 'Passed' and the header counter advance without reloading the page."
    - "Fail and N/A behave the same way — the chip changes, not just the form collapsing."
    - "A write that FAILS leaves the item visibly unanswered and shows the existing error banner; nothing renders as recorded that is not recorded."
    - "The tick does not flicker back to 'Not answered' after the action resolves — the optimistic value is held until the fresh server tree lands."
    - "Tapping 'Start the walkaround' on BeginScreen reveals the checklist without a manual reload."
    - "The progress counter and the per-item chips are derived from the same function, so they cannot disagree."
  artifacts:
    - path: "apps/web/src/lib/carrier/inspection-optimistic.ts"
      provides: "Pure overlay type + applyOptimisticAnswers + progress derivation, no React, no I/O"
      exports: ["applyOptimisticAnswers", "inspectionProgress"]
      min_lines: 60
    - path: "apps/web/src/lib/carrier/__tests__/inspection-optimistic.test.ts"
      provides: "Pure unit tests, no DB, no mocks, in the style of inspection-handlers.test.ts"
      min_lines: 60
    - path: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx"
      provides: "useOptimistic wiring + rewritten header contract comment"
  key_links:
    - from: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx"
      to: "apps/web/src/lib/carrier/inspection-optimistic.ts"
      via: "import + useOptimistic reducer"
      pattern: "applyOptimisticAnswers"
    - from: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx"
      to: "next/navigation router.refresh"
      via: "called INSIDE the same transition as the action, after success"
      pattern: "router\\.refresh\\(\\)"
---

<objective>
`/inspection/[dispatchId]` writes every answer correctly and never re-renders. The driver taps Pass, sees nothing, taps again. The whole Phase 9-web walkaround is unusable.

Fix it on the client, additively. The server actions are untouched.

Purpose: make the screen tell the truth about what the server has recorded, immediately, and structurally refuse to show a tick for a write that failed.
Output: one pure module + its tests, one wired component, one verified summary.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
@apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
@apps/web/src/lib/carrier/inspection-handlers.ts
@apps/web/src/lib/carrier/__tests__/inspection-handlers.test.ts
@apps/web/src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx
</context>

<investigation_already_done>
Do NOT re-derive any of this. It is settled.

**The mechanism is `revalidatePath` and nothing on the client.** `page.tsx` is a Server Component (`dynamic = 'force-dynamic'`) that passes `checklist` down as a PROP. `actions.ts:93-95`'s `refreshInspection` is the only change signal. `InspectionRunner.tsx:48-51` documents the assumption — "This component holds no answer state at all — every tick you see comes from `view.sections[].steps[].status`, re-rendered after each action's `revalidatePath`" — **and that assumption is the bug**. `ItemCard`'s `run()` awaits the action, clears note/photo/mode, and never touches the answer or the router.

The app's actual working convention is `revalidatePath` + `router.refresh()` — 124 occurrences of `router.refresh()` across 77 files in `apps/web/src`. `useOptimistic` has 5 in-repo users; `apps/web/src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx` is the house pattern.

**Ruled out, do not re-investigate:** `experimental.staleTimes` (not configured), middleware (`/inspection/*` gets a plain `NextResponse.next()`), `cache()`/`unstable_cache` in the read path (none), client state seeded from props (none). Next is 16.2.1 and `revalidatePath` does set `pathWasRevalidated` — the server-side re-render IS requested. The gap is the client applying it, and this fix deliberately stops depending on it.

**All four paths are broken at the data layer.** Pass, Fail, N/A all go through the same `run()`; Start goes through `openInspectionChecklist`. **Fail only APPEARED to work because `run()` ends with `setMode('idle')`**, which collapses the open fail form — visible local-state motion that is not the answer being reflected. The chip still read "Not answered" and the header still read "0 of 5".

**Mobile does NOT have this defect.** `apps/mobile/components/driver/workflows/TripInspectionScreen.tsx` holds the checklist in `useState` and does confirm-then-patch. Verify only; do not edit mobile.
</investigation_already_done>

<tasks>

<task type="auto">
  <name>Task 1: The pure overlay module and its tests</name>
  <files>
apps/web/src/lib/carrier/inspection-optimistic.ts
apps/web/src/lib/carrier/__tests__/inspection-optimistic.test.ts
  </files>
  <action>
Create `apps/web/src/lib/carrier/inspection-optimistic.ts`. **Pure — no React import, no Prisma, no I/O, no `'use client'`.** Same three-file discipline as the rest of Phase 9: this is the decision, and it has no runtime of its own.

Import `InspectionStepView` and `InspectionChecklistView` (type-only) from `@/lib/carrier/inspection-handlers`.

Export at minimum:

1. **The optimistic answer type.** One entry per in-flight answer: the `stepInstanceId` and the `InspectionStepView['status']` it is claiming, plus whatever the UI needs to render a "saving" affordance (a boolean or a discriminant — decide, and say in a comment which one the runner reads). Name the collection type too; the runner will hold an array or a keyed record.

2. **`applyOptimisticAnswers(view, overlay)` → `InspectionChecklistView`.** Returns a NEW view with the overlay merged onto matching steps. Does not mutate `view`, its sections, or its steps.

3. **The progress derivation currently inlined in `InspectionRunner`'s `totals` useMemo** (lines ~611-617): the `answerableByDriver` filter and the answered count, returning `{ total, answered, remaining }`. Move it here so the counter and the chips cannot disagree — that is the entire reason it leaves the component. **Carry its reasoning comment across verbatim** (the quick-543 paragraph about a DISPATCHER-assigned step sitting in the denominator forever). A rule that moves without its reason gets deleted by the next person.

Two rules the module MUST encode, each with a comment saying why:

- **A server status ALWAYS supersedes an overlay entry for the same step once the server value is no longer `NOT_STARTED`/`IN_PROGRESS`.** A stale overlay must never mask a real answer — including one somebody else recorded. The overlay is a claim about a write in flight; the moment the server has an answer, the claim is spent.
- **Progress counts ONLY `answerableByDriver` steps.** quick-543's rule, unchanged.

Also decide and comment: an overlay entry naming a `stepInstanceId` that is not in the view is **inert** — it is never appended as a new step. Appending would invent a checklist item.

Then write `apps/web/src/lib/carrier/__tests__/inspection-optimistic.test.ts`, matching the pure-function style of the neighbouring `inspection-handlers.test.ts` — `import { describe, it, expect } from 'vitest'`, no DB, no mocks, small hand-built `InspectionChecklistView` fixtures.

Must cover, at minimum:
  - the overlay applies to the right step ONLY (a sibling in the same section is untouched);
  - a **server** value that is already `COMPLETE`/`FAILED`/`SKIPPED` supersedes an overlay claiming something else;
  - a step with no overlay entry comes through untouched (assert identity or deep equality — state which and why);
  - progress ignores non-`answerableByDriver` steps;
  - an overlay for an unknown `stepInstanceId` is inert — the step count is unchanged;
  - the input `view` is not mutated.

Do NOT weaken or delete any existing test.

Note if you write any source-scanning assertion: normalise line endings with `.replace(/\r\n/g,'\n')`. This repo has no `.gitattributes` and `core.autocrlf=true`, so working-tree files are CRLF while the index is LF. quick-546 was bitten by exactly this.
  </action>
  <verify>
From `apps/web` (PowerShell — no `&&`; use `;` or `if ($?) { }`):

1. `npx vitest run src/lib/carrier/__tests__/inspection-optimistic.test.ts` — all green.
2. **Demonstrate the tests actually fail.** Break `applyOptimisticAnswers` so the server value no longer supersedes the overlay (e.g. let the overlay win unconditionally). Re-run. Confirm RED, and confirm it is the supersede test that reddens. Restore the file and re-run green. Record both outputs in the summary — a test never seen red is a test not yet known to test anything.
  </verify>
  <done>
`inspection-optimistic.ts` exists, is pure, and encodes both rules with their reasons. Its test file passes, has been demonstrated red, and the demonstration is recorded. Commit: `feat(quick-547): pure inspection optimistic-overlay module`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire the overlay in so an answer shows immediately</name>
  <files>
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
  </files>
  <action>
**Constraint that governs this whole task: do NOT change any server action's behaviour, signature or return shape.** `apps/web/src/app/(driver-fullscreen)/inspection/actions.ts` is not edited. `refreshInspection` stays exactly as it is. The fix is additive on the client. Do not touch `inspection-gate.ts`, `inspection-service.ts`, `inspection-lookup.ts`, or anything under `apps/mobile`.

**1. `useOptimistic` in `InspectionRunner`, over `view`, applying the overlay via `applyOptimisticAnswers`.**

Render the sections, the chips and the progress header off the OPTIMISTIC view, and derive progress with the module's function (delete the inlined `totals` useMemo body, keeping the reasoning comment in its new home).

**Why `useOptimistic` rather than a plain `useState` overlay, and this must be in the comment:** when the transition ends, React **discards the optimistic value automatically**. A failed write therefore cannot render as answered — the guarantee is structural, not a check that a later edit could drop. That is the same shape of reasoning as `autoLinkTarget()` and the T3/T4 verdict union: make the wrong state unrepresentable rather than guarded.

**2. The one real trap — the transition must outlive the action.**

The optimistic update and the server action must be inside the SAME transition, and **`router.refresh()` must be called inside that same transition after a successful action**, so the transition stays pending until the fresh server tree lands. If the transition ends before the server tree arrives, the tick **flickers back to "Not answered"** — the optimistic value is discarded before the real one replaces it, and the driver sees the bug again in a shorter form.

Reason about this explicitly, then **verify it empirically in the browser** and state the observed behaviour in the summary: does the chip hold steadily from tap through to the server tree, or is there a flicker? If there is one, say what you changed to remove it. "It looked fine" is not an observation.

**3. Where the transition and the setter live.**

`useOptimistic`'s setter may only be called from inside a transition or an action, and `ItemCard` currently owns its own `useTransition` (line ~235). The setter will live in `InspectionRunner`. **Check where the two have to sit relative to each other and restructure deliberately.** The likely shapes are (a) lift the answer submission into `InspectionRunner` and pass a callback down to `ItemCard`, or (b) hoist the setter through props into `ItemCard`'s existing transition. **Do not just pick one because it is listed first** — state in the summary what you chose and why, including what happens to `ItemCard`'s local `pending` / `busyVerb` disabled-state and its `setMode('idle')` / note / photo clearing, all of which must keep working.

**4. Failure must be visible in both directions.**

Keep the existing `onError` banner. Additionally make sure the item **visibly returns to unanswered** when the write fails. Test this for real — force a failure (e.g. temporarily make one action return `{ success: false, error: '...' }`, or answer with a stale/garbage `stepInstanceId`, or kill the dev server mid-tap) and **report what actually happens**, not what should. Restore anything you stubbed.

**5. `BeginScreen` in `InspectionClient.tsx`.**

It already calls `router.refresh()` via `onOpened` and reportedly still does not reveal the checklist. **Determine empirically whether that path needs more than a refresh** — the prime suspect is the refresh being called after an `await` inside an async `startTransition` callback, so the transition has already settled by the time it fires — and fix it so tapping "Start the walkaround" reveals the checklist without a reload. **Report the finding either way**, including if it turns out to work correctly once Task 2's other changes land.

**6. Rewrite the header doc comment.**

`InspectionRunner`'s header currently asserts "**ANSWERS LIVE ON THE SERVER. This component holds no answer state at all**" (lines 48-54). After this change that is FALSE. Rewrite it to state the new contract:
  - the server is authoritative;
  - the overlay is transient and **self-discarding** — React drops it when the transition ends;
  - nothing renders as recorded that is not recorded, once the transition settles;
  - and why the transient copy does not reintroduce the "two copies eventually disagree" problem the old comment was defending against (it cannot outlive the transition, and a server answer supersedes it by construction in `applyOptimisticAnswers`).

Keep the ONLINE-ONLY paragraph and the RE-ANSWERING IS ONE-DIRECTIONAL paragraph — they are still true. **A stale comment that lies about the invariant is worse than no comment.**
  </action>
  <verify>
1. Run the app and exercise the real screen as a driver:
   - **Pass** → chip flips to "Passed" and the header counter advances, no reload;
   - **Fail** (with note, and with a photo on an item that requires one) → chip flips to "Failed";
   - **N/A** → chip flips to "Not applicable";
   - **no flicker** back to "Not answered" after any of the three;
   - **forced failure** → banner shows AND the item is visibly unanswered;
   - **"Start the walkaround"** on a tenant that reaches `BeginScreen` → checklist appears without a reload.
2. Re-run `npx vitest run src/lib/carrier/__tests__/inspection-optimistic.test.ts` — still green after the wiring.
3. Grep the runner for any leftover reference to the old `totals` useMemo body or a duplicated `answerableByDriver` count — there must be exactly one derivation, in the module.
  </verify>
  <done>
Every answer path updates the screen immediately with no flicker; a failed write shows the banner and leaves the item unanswered; `BeginScreen` reveals the checklist without a reload (or the finding is reported); the header comment states the new contract truthfully. Commit: `fix(quick-547): the web inspection walkaround re-renders after every answer`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify the gates, diff the suite, write the summary</name>
  <files>.planning/quick/547-the-web-inspection-walkaround-never-re-r/547-SUMMARY.md</files>
  <action>
**A. TypeScript, in BOTH apps, PROBED not trusted.**

Per CLAUDE.md, a parse error ANYWHERE in the program silently suppresses semantic checking of everything — so a clean run only counts after the gate has been proved live.

  1. `apps/web`: `npx tsc --noEmit`. Then inject `const __probe: number = 'x';` into a file you **actually edited** (`InspectionRunner.tsx` or `inspection-optimistic.ts`), re-run, and **confirm tsc reports THAT error**. Delete the probe. Re-run clean.
  2. `apps/mobile`: `npx tsc --noEmit`. Mobile is not edited, so probe a scratch line in a real mobile source file, confirm, delete. Mobile must be clean and **unmodified** — confirm with `git status`.
  3. **If the reported errors are all syntax errors, or all in files you did not touch, the gate is BLIND, not green.** Delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then re-run.
  4. Before committing, sweep for leftovers: `git grep -n "__probe"` across the repo, and check for stray `__probe.ts` files (quick-519 found a previous run's still sitting in `src/lib/document-import/`).

**B. Vitest, before and after, DIFFED.**

Baseline captured live while planning, from `apps/web`:

```
npx vitest run src/lib/carrier/__tests__
→ Test Files 10 passed (10) · Tests 105 passed (105) · 0 failures
```

Run it again after the change. Report BOTH counts and the delta. Expected: **11 files**, 105 + N tests, 0 failures. **If a test FILE fails while all of its assertions pass, read the Failed Suites block, not the assertions** — Phase 10 lost time to exactly that (an FK violation in `afterAll` teardown).

Do NOT weaken or delete any existing test to make a run green.

**C. Mobile — verify only.**

Confirm `apps/mobile/components/driver/workflows/TripInspectionScreen.tsx` still does confirm-then-patch (`if (!res.ok) throw` before `patchStep(...,'COMPLETE')`) and is untouched by this task. State it in the summary. No mobile edit.

**D. Write `.planning/quick/547-the-web-inspection-walkaround-never-re-r/547-SUMMARY.md`** covering:
  - the mechanism, in one paragraph — prop-passed server view, `revalidatePath` as the only change signal, the client never applying it;
  - what the fix is and why `useOptimistic`'s automatic revert is the step-4 guarantee rather than a check;
  - **the transition-scope observation** — whether the tick flickered, and what holds it steady;
  - **what happened on a forced failure**, observed;
  - **the `BeginScreen` finding**, whichever way it went;
  - the structural choice made in Task 2 item 3 and why;
  - probe evidence for both tsc gates (the error tsc reported for the probe, quoted);
  - the before/after vitest counts, diffed;
  - the demonstrated-red evidence from Task 1;
  - anything found and deliberately NOT fixed.

**E. Commit only. Do NOT push.** The user pushes.
  </action>
  <verify>
`npx tsc --noEmit` clean in `apps/web` AND `apps/mobile`, each after a successful probe. `npx vitest run src/lib/carrier/__tests__` from `apps/web` — 11 files, 0 failures, count diffed against the 10/105 baseline. `git grep -n "__probe"` returns nothing. `git status` shows no modification under `apps/mobile`. `git log --oneline -3` shows the task's commits and no push.
  </verify>
  <done>
Both typecheck gates pass and are proved live by a probe. Suite counts diffed and reported. Summary written with every observed behaviour recorded rather than assumed. Commit: `docs(quick-547): summary`. Nothing pushed.
  </done>
</task>

</tasks>

<verification>
- `apps/web`: `npx tsc --noEmit` — 0 errors, probe-confirmed.
- `apps/mobile`: `npx tsc --noEmit` — 0 errors, probe-confirmed, tree unmodified.
- `apps/web`: `npx vitest run src/lib/carrier/__tests__` — 11 files, ≥105 tests, 0 failures.
- New pure tests demonstrated RED before green.
- No leftover `__probe` anywhere.
- `actions.ts`, `inspection-gate.ts`, `inspection-service.ts`, `inspection-lookup.ts`, `apps/mobile/**` all unmodified — confirm with `git diff --stat`.
- No DDL, no migration, no data change.
- Three atomic commits. No push.
</verification>

<success_criteria>
- A driver taps Pass, Fail or N/A and the chip and the header counter change immediately, with no reload and no flicker back to "Not answered".
- A failed write shows the existing banner and leaves the item visibly unanswered — structurally, via `useOptimistic`'s automatic revert.
- "Start the walkaround" reveals the checklist without a reload, or the reason it cannot is reported.
- Progress and chips read from one derivation in `inspection-optimistic.ts`.
- `InspectionRunner`'s header comment describes the contract that now exists.
- Mobile untouched and confirmed still correct.
</success_criteria>

<output>
After completion, create `.planning/quick/547-the-web-inspection-walkaround-never-re-r/547-SUMMARY.md`.
</output>
