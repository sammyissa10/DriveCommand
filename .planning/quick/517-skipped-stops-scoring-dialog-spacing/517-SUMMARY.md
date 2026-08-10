# Quick-517 — Exclude skipped stops from template scoring; dialog spacing

**Status:** complete
**Date:** 2026-08-09
**Branch:** `feature/document-import`

---

## READ THIS FIRST — the tsc gate was blind, and that outranks both defects

While verifying, `npx tsc --noEmit` in `apps/web` reported four syntax errors in
`apps/web/.next/dev/types/validator.ts` — a **Next-generated file, truncated
mid-write**, timestamped **2026-08-08 01:21**:

```
/route-thread/route.js")          ← line 2591: an unterminated string, no opening
  type __Check = __IsExpected<typeof handler>
```

That file is in the tsconfig `include` (`.next/dev/types/**/*.ts`). With it in the
program, **tsc reports only its syntax errors and silently skips semantic checking
of every source file.** Proven, not inferred: I appended
`const __probe: number = "not a number";` to a test file and tsc stayed silent;
excluding the artifact made it report that error plus four real ones this task had
introduced.

Consequences, stated plainly:

- **Every "tsc 0 errors" claim made against this tree since 2026-08-08 01:21 is
  void — including the one in quick-516's summary yesterday.** The gate was
  answering about one generated file, not the codebase.
- quick-516's code *is* in fact type-clean: with the artifact removed and
  everything from 516 and 517 in the tree, tsc reports 0. So nothing shipped
  broken. The claim was unfounded at the time even though the result held.
- This task's own change had **four real type errors** hidden by it (the required
  `skipped` field missing at four construction sites in
  `template-matching.test.ts`). They are fixed.

Fixed by deleting the corrupted artifact (a gitignored build output that Next
regenerates) and the stale `tsconfig.tsbuildinfo` beside it. There was also a
**stray repo-root `.next/`** holding a copy of the same corrupt file; deleted too,
and worth knowing about given the `vercel --prod` hazard note about which directory
a deploy runs from.

This is the same family as the standing "stop `next dev` before mass file changes —
a restart does not fix the Turbopack cache" rule: an interrupted dev server left
poison on disk. **It is also the most plausible explanation for defect 2 —
see below.**

---

## Defect 1 — skipped stops inflated the import's facility set. Fixed.

`facilitySetForImport` mapped **every** stop to a set member. Applying a template
inserts its `TEMPLATE_ONLY` rows as `skipped: true` consignments (Section 8's
"included, badged, defaulted to skipped"), and on the next read the ladder resolves
those rows at T2 — their address came from that very facility — so they returned to
the scorer as fully-resolved members of a run nobody is driving.

The reported arithmetic reproduces exactly, and is now asserted:

```
before apply   import 5, template 4, ∩4  →  union 5  →  4/5 = 0.80              80%
after apply    import 6, template 4, ∩4  →  union 6  →  4/6 = 0.667
               counts 6 v 4 = 0.333 > 0.30 tolerance  →  ×0.8  =  0.533         53%
```

One skipped row did **both** halves of the damage: it added a member to the union
*and* pushed the stop-count difference past the tolerance, so the ×0.8 downweight
fired too. That is why a 0.80 template and a 0.50 template both rendered 53% — the
ranking stopped discriminating, which is worse than either number being wrong.

**Fix.** `ImportStopRef.skipped: boolean` (required, so no construction site can
forget it and silently restore the defect), set in `importStopsFrom` off the
consignment; `facilitySetForImport` filters skipped stops out. Filtering there
rather than in the scorer fixes the **count as well as the set**, because
`scoreFacilitySets` derives `importStopCount` from `importIds.length` — one filter,
both halves, and the scorer stays a function that does nothing but Jaccard.
Thresholds, weights and the tolerance untouched.

**`buildTemplateDiff` still sees every stop, deliberately.** It is the same function
`applyTemplateToConsignments` walks to build the new list, so dropping rows from it
would drop consignments off the dispatcher's stop list in the name of a percentage.
Scoring and merging want different inputs and now get them.

The opposite rule is pinned by a test so it cannot regress: an **unresolved** stop
still counts (it is on today's run, we just do not know where), or a half-read
manifest scores 1.0.

---

## Defect 2 — the word joins. Fixed, and the diagnosis in the brief does not hold.

### What the compiled output actually said, before any change

I compiled both components with the project's own `tsc --jsx react-jsx` and read
the emitted children arrays. **The spaces were already there, on both surfaces:**

```js
// web  TemplateDecision.tsx
[candidate.diff.matched, " stop", …=== 1 ? '' : 's', " will take this route's order, …"]
// mobile  ImportTemplate.tsx
[candidate.diff.matched, " stop", …=== 1 ? '' : 's', " will take this route's order, …"]
```

`git log -L` shows that line has had the same shape since Phase 6 — the plural
expression and the continuation text have always been on one line, which is the
form JSX preserves. So **the JSX-trimming explanation is wrong twice over**: it was
wrong in quick-515, and it is wrong in this brief too. I could not reproduce
"stopswill" from the source by any route.

What I can offer instead is a mechanism that fits the evidence: the screenshot came
from a dev server whose `.next` contained a **generated file truncated mid-write**
(above). A poisoned Turbopack/dev cache serving stale or partially-written compiled
output is exactly the class of thing that puts text on screen that the source does
not contain, and this repo has a standing note that it happens and that a restart
does not clear it. I cannot prove that is what you saw — I did not have the browser
— so I am not claiming it; I am saying the source was innocent and the build
directory demonstrably was not.

### The fix, which makes the question moot

Rather than re-litigate whitespace rules for a third time, the fix removes the thing
every version of this bug needs in order to exist: the **boundary**. Each sentence
is now built by a pure function and rendered as **one string, one child**.

```
before   <p>{n} stop{n === 1 ? '' : 's'} will take …</p>     4 children, 3 whitespace-sensitive
after    <p>{sentence}</p>                                   1 child, no boundary
```

No JSX text node, no expression adjacency. No trimming rule, parser recovery, React
Native text-fragment measurement, or formatter reflow can act on a gap that is now a
character inside a string. Applied to **every** sentence in that dialog with the
count-expression pattern, on both surfaces. Wording unchanged — this is a spacing
fix, not a rewrite of copy a dispatcher has learned.

- `apps/web/src/lib/document-import/template-copy.ts` — pure
  `applyConfirmSentences(diff)` + `APPLY_CONFIRM_FOOTNOTE`.
- `apps/mobile/lib/template-copy.ts` — verbatim mirror (the two apps cannot import
  each other, and copy belongs in neither `validation` nor `api-client`). This is
  *fewer* places to drift than before, when all four sentences were mirrored as JSX.
- `ApplyConfirmCopy` extracted and exported on web — the dialog body sits behind
  `AlertDialog` and internal `confirming` state, so it was **untestable** before;
  extracting it is what makes the render assertion possible.

### Verified by rendering, not by a transform

`renderToStaticMarkup` (the existing `ContractDecision.test.tsx` pattern), tags
stripped, entities decoded:

- `4 stops will take this route’s order` present, `stopswill` absent
- `2 stops on today’s document are not on this route` present, `stopson` absent
- `1 stop on this route is not on today’s manifest` present
- and a **class-level** check: every token beginning "stop" must be exactly `stop`
  or `stops`.

Then re-compiled both components and confirmed each sentence arrives as
`children: sentence` — a single child. The two remaining count-expressions in those
files are the candidate row (`5 stops · 4 matched`), which is not the dialog and
compiles with its `" · "` intact.

---

## Files

| File | What |
|---|---|
| `apps/web/src/lib/document-import/template-matching.ts` | `ImportStopRef.skipped`; `facilitySetForImport` filters skipped |
| `apps/web/src/lib/document-import/template-lookup.ts` | `importStopsFrom` carries `skipped` off the consignment |
| `apps/web/src/lib/document-import/template-copy.ts` | **new** — pure sentence builder |
| `apps/web/src/components/carrier/imports/TemplateDecision.tsx` | `ApplyConfirmCopy` extracted + exported, one string per sentence |
| `apps/mobile/lib/template-copy.ts` | **new** — verbatim mirror |
| `apps/mobile/components/imports/ImportTemplate.tsx` | same, in the bottom sheet |
| `…/__tests__/template-skipped-scoring.test.ts` | **new**, 6 tests — invariance, the 53% reproduction, no hysteresis |
| `…/__tests__/template-copy.test.ts` | **new**, 6 tests — the sentences |
| `…/imports/__tests__/TemplateDecision.test.tsx` | **new**, 6 tests — the rendered DOM |
| `…/__tests__/template-matching.test.ts` | 4 construction sites given `skipped` (the errors tsc had been hiding) |

---

## Verification — real output

```
$ cd apps/web && npx tsc --noEmit          → WEB tsc exit: 0     (with the corrupted artifact removed)
$ cd apps/mobile && npx tsc --noEmit       → MOBILE tsc exit: 0
$ cd apps/web && npx vitest run src/lib/document-import
 Test Files  25 passed (25)
      Tests  417 passed (417)

$ … plus the render test's directory
 Test Files  27 passed (27)
      Tests  429 passed (429)
```

Was 406 at quick-516; +18 new, 0 changed expectations.

---

## Self-audit

**Both defects, honestly.** Defect 1 is fixed and the ticket's own 53% is
reproduced in a test that fails without the fix. Defect 2's *symptom* is fixed and
pinned by a render, but **the cause named in the brief is not the cause** — the
pre-fix compiled output already contained both spaces on both surfaces. I did not
silently accept the premise and I did not silently reject it: the fix removes the
possibility rather than the suspect.

**Not verified.** Nothing was clicked. I have no browser and no emulator here, so
"the chooser now shows 80% and 50%" is derived from the scorer and the tests, not
observed on your data. The two things worth checking on screen: the two
percentages, and the dialog copy after a hard restart (`.next` deleted, dev server
restarted) — the latter matters because if the joins persist against source that
provably does not contain them, the cause is the serving layer and this fix will
have hidden it rather than solved it.

**Found, not fixed (out of scope).**
- Applying the **same** template twice un-skips the row the first apply inserted:
  `mergeTemplateStop` sets `skipped: false` on matched rows and `buildTemplateDiff`
  ignores `skipped`. The stop list genuinely changes, so the score follows — this is
  merge semantics, not scoring, and filtering the set neither causes nor should mask
  it. Now a characterisation test, so a future change is deliberate. Not currently
  reachable from the UI (the row hides "Use this template" once `appliedAt` is set).
- `StopReview.tsx` mobile renders `{row.referenceCount}ref` → "2ref". Deliberate in
  the source (no space written), so not a whitespace defect, but it reads badly next
  to the web twin.
- My first version of the class-level assertion used `/stops?[a-z]/i`, which matches
  the innocent word "stops" and duly failed on correct copy. Replaced with a
  tokenised check. Recorded because it is the same mistake in miniature as the one
  this ticket is about: a hand-written pattern trusted over the thing itself.

**Constraints.** Thresholds and weights untouched; `template-constants.ts` remains
the sole home of 0.75 / 0.45 / 0.3 / 0.8; Section 15 untouched (copy and one
component extraction, no layout, no colour); nothing installed; no DDL; no writes on
a GET.

Not deployed. Not pushed.
