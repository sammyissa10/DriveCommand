# Quick-518 — Re-derive template-inserted stops on apply

**Status:** planned
**Date:** 2026-08-10
**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` §8

---

## The defect

Applying template A inserts A's not-on-manifest facilities as `TEMPLATE_ONLY`,
`skipped: true` rows. Applying B afterwards treated those rows as part of today's
document — `buildTemplateDiff` ignores `skipped`, so B matched the ghost's
facility, and `mergeTemplateStop` cleared `skipped`. The row returned as an
ordinary stop: unskipped, badged New, Linked, counted in "matched", no quantities,
riding the trip with nothing to deliver.

quick-517 recorded this as out of scope and "not currently reachable from the UI".
**Both halves of that were wrong.** It is reachable — apply A, then Change to B
through the chooser quick-516 built — and it is confirmed on screen.

## The signal (step 1)

`templateOrigin === 'TEMPLATE_ONLY'` **and** `skipped` **and** no document backing
(no `pageNumbers`, no `lineItems`, no non-null `totals`). A conjunction, so every
direction of doubt keeps the row:

- `templateOrigin` alone identifies the row and is the primary signal.
- `skipped` protects a row a person *kept* — un-skipping is how a human says "this
  one is real", and a decision is never undone by a later apply.
- document backing protects a row someone has typed freight onto.

A legacy row with no `templateOrigin` is therefore never stripped. That is the
correct failure direction: a stale ghost costs a glance, deleted freight costs a
customer.

## The fix (step 2)

**One filter in `buildTemplateDiff`**, not a separate stripping pass:

```ts
const present = importStops.filter((s) => !s.templateInserted);
```

Three behaviours fall out of it, which is why it belongs there and nowhere else:

- a ghost can no longer be MATCHED, so `mergeTemplateStop` never gets to clear its
  `skipped`;
- it is not appended as IMPORT_ONLY either, so it cannot survive as a "new" stop;
- `applyTemplateToConsignments` builds the list by walking `diff.rows`, so a row in
  neither loop is **dropped** — and its provenance link with it. No index remapping,
  no second pass.

If the incoming template lists that facility it becomes `TEMPLATE_ONLY` again and is
re-inserted skipped, exactly as the first application left it. If not, it is gone.

It also keeps the **preview honest**: candidate rows and the confirm dialog are built
from the same function, so what the dispatcher is shown stays the merge that runs.

- `ImportStopRef.templateInserted: boolean` (required, like quick-517's `skipped`).
- `isTemplateInsertedStop(consignment)` — the shared predicate, used by
  `importStopsFrom` so diff, merge and preview cannot disagree.
- `TemplateDiff.templateInsertedDropped` → `TemplateApplyOutcome.reDerived`, reported
  in the confirm dialog and the post-apply line so a stop leaving the list is stated,
  not discovered. Mirrored into `packages/api-client` (**rebuild `dist/`**).

## Tests (steps 3–4)

- Flip quick-517's characterisation test: the same template twice is now idempotent.
- New `template-reapply.test.ts` — A→B with the facility on **both** templates
  (re-inserted skipped, not matched), on **neither** (gone, link not carried), plus
  the four things re-derivation must never touch (a kept ghost, a skipped
  document-backed stop, a ghost with typed freight, a legacy row).
- 517's hysteresis test extended to A→B: every template scores the same before A,
  after A and after B, and the ranking order holds.
- **Run the suite with the filter disabled** and confirm the new tests fail. A test
  that passes both ways proves nothing.

## Constraints

Document-backed stops untouchable; scorer, thresholds and `template-constants.ts`
untouched; Section 15 (copy only); nothing installed; no DDL.

## Verification

`npx tsc --noEmit` both apps — **probe the gate first** (quick-517: a corrupt
`.next/dev/types` artifact makes tsc skip all semantic checking);
`npx vitest run src/lib/document-import`.
