# Quick-517 — Exclude skipped stops from template scoring; dialog spacing

**Status:** planned
**Date:** 2026-08-09
**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` §8, §15

---

## Defect 1 — skipped stops inflate the import's facility set

`facilitySetForImport` maps **every** stop to a set member, skipped or not. After a
template is applied, the merge inserts its `TEMPLATE_ONLY` rows as
`skipped: true` consignments — and on the next read the ladder resolves those rows
at T2 (their address came from the facility), so they arrive back at the scorer as
fully-resolved members of the import's set.

The arithmetic the user reported reproduces exactly:

```
before apply   import 5, template 4, ∩4  → union 5  → 4/5 = 0.80   counts 5v4 = 0.20 ok      → 80%
after apply    import 6, template 4, ∩4  → union 6  → 4/6 = 0.667  counts 6v4 = 0.333 > 0.30 → ×0.8 = 0.533 → 53%
```

The skipped stop does two things at once: it adds a member to the union *and* it
pushes the stop-count difference past the tolerance, so the ×0.8 downweight fires
as well. A stop that is skipped contributes nothing to the trip and must
contribute nothing to the score.

### Fix

- `ImportStopRef.skipped: boolean` — **required**, so no construction site can
  forget it and silently restore today's behaviour.
- `facilitySetForImport` filters skipped stops out. Because `scoreFacilitySets`
  derives `importStopCount` from `importIds.length`, filtering the set fixes the
  set **and** the count in one move — which is what removes both halves of the
  defect.
- `importStopsFrom` reads `skipped` off `StopDecision.consignment`.

### Deliberately NOT changed

`buildTemplateDiff` keeps seeing every stop. It is the same function
`applyTemplateToConsignments` walks to build the new list, so dropping rows from it
would drop consignments from the stop list — data loss, in the name of a
percentage. Scoring and merging want different inputs and now get them.

Thresholds, weights and `TEMPLATE_COUNT_MISMATCH_FACTOR` untouched.

### Tests

1. **A skipped member changes nothing** — the same two sets scored with and
   without one extra skipped stop must return an identical `TemplateScore`.
2. **Hysteresis** — score every template, run the real
   `applyTemplateToConsignments`, rebuild the import stops from the applied
   consignments the way the live read does (the template-only row resolved, and
   skipped), score again: no template's score may move. This is the regression the
   user actually hit.

---

## Defect 2 — the word joins in the apply-confirm dialog

### What the compiled output says

Compiled both files with the project's own `tsc` (`--jsx react-jsx`) and read the
emitted children arrays. **The spaces are present in both:**

```js
// web
[candidate.diff.matched, " stop", …=== 1 ? '' : 's', " will take this route's order, …"]
// mobile
[candidate.diff.matched, " stop", …=== 1 ? '' : 's', " will take this route's order, …"]
```

So the current source does not lose the space at the JSX-trimming stage, and
`git log -L` shows the line has had this shape since Phase 6. That means the
whitespace theory — quick-515's *and* this brief's — does not explain the
screenshot, and I cannot reproduce the join from the source. What I can do is
remove every mechanism that could ever split those sentences, and pin the result
with a render.

### Fix

Each sentence becomes **one interpolated string**, built by a pure function, and
rendered as a single child: `<p>{sentence}</p>` / `<Text>{sentence}</Text>`.
No JSX text node, no expression adjacency, nothing for any trimming rule, parser
recovery, or React Native text-fragment measurement to act on. Applied to every
sentence in that dialog with the count-expression pattern, on both surfaces.

- `apps/web/src/lib/document-import/template-copy.ts` — pure
  `applyConfirmSentences(diff)`, unit-tested under the required vitest path.
- Web: `ApplyConfirmCopy` extracted as a pure exported component (no Radix), so it
  can be rendered in a test — the dialog body is otherwise unreachable without
  interaction.
- Mobile: the same sentences from a local mirror of the builder, per this module's
  existing convention that the two surfaces mirror copy verbatim.

### Verification (not a hand-rolled transform)

- `renderToStaticMarkup(<ApplyConfirmCopy …/>)` — the existing
  `ContractDecision.test.tsx` pattern — asserting the literal
  `4 stops will take` / `2 stops on today's document are` and a
  no-letter-immediately-followed-by-letter-across-a-boundary check.
- Re-compile both components afterwards and confirm each sentence is a single
  string element in the emitted children array.

---

## Constraints honoured

Thresholds and constants stay sole literals in `template-constants.ts`; Section 15
untouched (copy only, no layout); nothing installed; no DDL.

## Verification

`npx tsc --noEmit` in `apps/web` and `apps/mobile`; `npx vitest run src/lib/document-import`.
