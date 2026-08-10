# Quick-518 — Re-derive template-inserted stops on apply

**Status:** complete
**Date:** 2026-08-10
**Branch:** `feature/document-import`

---

## First: quick-517 was wrong about this, in both halves

517 recorded this defect as *"found, not fixed — merge semantics, out of scope, not
currently reachable from the UI (the row hides 'Use this template' once `appliedAt`
is set)"*. That reasoning was wrong twice:

- **It is reachable.** Apply A, then press Change and pick B — the chooser quick-516
  built is exactly the detour 517 assumed nobody would take.
- **It was already happening.** Confirmed on screen, not deduced.

The lesson is not subtle: 517 inferred reachability from one component's conditional
instead of following the paths the same session had just added. A characterisation
test was written to "record what happens today", which made a known-wrong behaviour
look settled. It is now an assertion of the right behaviour.

---

## The defect

Applying template A inserts A's not-on-manifest facilities as `TEMPLATE_ONLY`,
`skipped: true` rows — Section 8's "included, badged, one tap to keep". Applying B
afterwards treated those rows as part of today's document, because
`buildTemplateDiff` ignored `skipped`: B matched the ghost's facility, and
`mergeTemplateStop` cleared `skipped` on every matched row. The ghost came back
**unskipped, badged New, Linked, counted in "matched"** — a stop that existed only
because of template A, promoted into the trip on template B's say-so, with no
quantities and nothing to deliver.

---

## The signal used (step 1)

`templateOrigin === 'TEMPLATE_ONLY'` **AND** `skipped` **AND** no document backing
(no `pageNumbers`, no `lineItems`, no non-null `totals`) — `isTemplateInsertedStop`.

`templateOrigin` alone identifies the row and was sufficient; the other two are there
so a false positive is impossible rather than unlikely, because a conjunction makes
**every direction of doubt keep the row**:

| Row | Stripped? | Why |
|---|---|---|
| ghost from a previous apply | yes | all three hold |
| ghost a person **kept** (unskipped) | **no** | un-skipping is how a human says "this is real" |
| ghost someone typed freight onto | **no** | it has content now; removing it deletes work |
| skipped stop off the document | **no** | origin is not `TEMPLATE_ONLY`, and pages back it |
| legacy row, no `templateOrigin` | **no** | pre-Phase-6 rows are never touched |

The failure direction is deliberate: a stale ghost costs a glance, deleted freight
costs a customer. **Document-backed stops are untouchable** — the predicate cannot
reach them.

---

## The fix (step 2) — one filter, three behaviours

```ts
// buildTemplateDiff
const present = importStops.filter((s) => !s.templateInserted);
```

- a ghost can no longer be MATCHED, so `mergeTemplateStop` never gets the chance to
  clear its `skipped`;
- it is not appended as IMPORT_ONLY either, so it cannot survive as a "new" stop;
- `applyTemplateToConsignments` builds the list by walking `diff.rows`, so a row in
  neither loop is **dropped, along with its facility-provenance link** — the
  re-derive the ticket asks for, with no separate stripping pass and no index
  remapping.

Then the ordinary insert logic runs for the incoming template: if B lists that
facility it becomes `TEMPLATE_ONLY` again and is re-inserted **skipped**, exactly as
A left it; if B does not, it is gone. Applying the same template twice is now
idempotent.

It also keeps the **preview honest**, which was the reason to put the filter here
rather than in the merge: candidate rows and the confirm dialog are built from this
same function, so what a dispatcher is shown is still the merge that runs.

`TemplateDiff.templateInsertedDropped` → `TemplateApplyOutcome.reDerived`, surfaced
in the confirm dialog *and* the post-apply line on both surfaces — a stop leaving the
list is stated, not discovered. Worded as *"1 skipped stop added by the last template
is removed and worked out again for this one. Nothing from the document is touched."*

---

## Files

| File | What |
|---|---|
| `apps/web/src/lib/document-import/template-matching.ts` | `isTemplateInsertedStop` + `hasDocumentBacking`; `ImportStopRef.templateInserted`; the `present` filter; `TemplateDiff.templateInsertedDropped` |
| `apps/web/src/lib/document-import/template-lookup.ts` | `importStopsFrom` classifies via the shared predicate |
| `apps/web/src/lib/document-import/template-service.ts` | `TemplateApplyOutcome.reDerived` |
| `apps/web/src/lib/document-import/template-copy.ts` | the re-derive sentence |
| `apps/mobile/lib/template-copy.ts` | mirror |
| `apps/web/src/components/carrier/imports/TemplateDecision.tsx` | post-apply line |
| `apps/mobile/components/imports/ImportTemplate.tsx` | post-apply line |
| `packages/api-client/src/owner-imports.ts` | both new fields mirrored — **`dist/` rebuilt** |
| `…/__tests__/template-reapply.test.ts` | **new**, 13 tests |
| `…/__tests__/template-skipped-scoring.test.ts` | 517's characterisation test flipped to an assertion |
| 3 test files | `templateInserted` added to `ImportStopRef` constructors |

---

## Verification — real output

**The gate was probed first**, per quick-517's lesson. The corrupt
`.next/dev/types/validator.ts` had regenerated (18:25 today) but is now well-formed;
an injected `const __gateProbe: number = "blind"` was **caught**, so tsc is really
checking:

```
src/lib/document-import/template-matching.ts(873,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

```
$ cd apps/web && npx tsc --noEmit          → clean
$ cd apps/mobile && npx tsc --noEmit       → MOBILE exit: 0
$ cd apps/web && npx vitest run src/lib/document-import
 Test Files  26 passed (26)      Tests  430 passed (430)
$ … with the render dir: 28 files, 442 tests passed
```

Was 417 at quick-517; +25.

**The control run matters more than the green one.** With the filter disabled,
6 of the 13 new tests fail and the four "must never touch" guards stay green — so
the tests discriminate rather than merely pass:

```
 ✓ inserts the not-on-manifest facility as a skipped, template-inserted ghost
 × re-inserts it skipped instead of promoting it to a real stop
 × reports the ghost as re-derived rather than dropping it silently
 ✓ takes B's order for the document stops
 × drops the ghost entirely
 × does not carry the ghost's facility link to the surviving stops
 ✓ keeps a ghost a person kept — un-skipping is how a human says "this is real"
 ✓ keeps a skipped stop that came off the document
 ✓ keeps a template-inserted row someone typed freight onto
 ✓ keeps a legacy row with no templateOrigin at all
 × every template scores the same before A, after A, and after B
 ✓ and the same after B drops the ghost
 × keeps the ranking order stable through the sequence
      Tests  6 failed | 7 passed (13)
```

Note the one that passes both ways: *"and the same after B drops the ghost"*. Without
the fix the ghost survives as `IMPORT_ONLY` but stays skipped, and quick-517 already
excludes skipped stops from scoring — so that scenario's **score** was never wrong,
only its stop list. Kept as a guard, but it is not evidence.

---

## Self-audit

**Scope held.** Scorer, thresholds and `template-constants.ts` untouched — grep still
shows the four tuned numbers in one file. `mergeTemplateStop` untouched: it never sees
a ghost now, which is a better fix than teaching it to special-case one. No install,
no DDL, no writes on a GET. Section 15 unaffected (copy plus two report lines).

**Not verified.** Nothing was clicked. The A→B sequence is proven through the real
merge, the real predicate and the real scorer in a test harness, not on your data.
Worth confirming on screen: after applying A then B, the ghost row still reads "Not
on today's manifest" and stays skipped, and the confirm dialog now names the
re-derive.

**A judgement worth flagging.** Re-derivation drops the ghost's facility-provenance
link along with the row. That is correct — the link belonged to a stop that no longer
exists — but if B re-inserts the same facility, the new row carries no link and the
ladder re-resolves it at T2 on the next read, exactly as `templateOnlyConsignment`
already intends. So a T3/T4 confirmation a person made *on a ghost* is not preserved
across a template change. I judged that right: the human confirmed a facility for a
row that the new template may not even include, and Phase 4's rule is that a link
follows its stop rather than its position. It is a behaviour change worth knowing
about, so it is stated rather than buried.

**Ordering.** New stops still go to the end in document order — no slotting, no
tidying, per Section 8 and the phase's constraints. The re-inserted ghost lands where
the incoming template's sequence puts it, which is the template's decision, not ours.

Not deployed. Not pushed.
