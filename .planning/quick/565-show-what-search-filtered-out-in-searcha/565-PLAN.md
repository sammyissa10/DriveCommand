# quick-565 — Show what search filtered out in SearchableSelect

**Date:** 2026-08-27 · **Branch:** `feature/document-import` · **Baseline:** `a093ea10`

> **Numbering note.** `gsd-tools init` computed **564**; the task was named
> **565** by the user and is filed as 565, so 564 is an unused number rather
> than a missing task. Renumbering the user's task silently would be worse than
> the gap.

---

## The problem

quick-563 shipped collapsed pickers on the assign screen. cmdk hides a
non-matching item outright, leaving no trace. With 14 trucks — three of them
blocked and sorted last — a term that excludes the blocked ones gives a
dispatcher no signal they existed. Blocked options are exactly the ones worth
knowing about, so this is the component's worst failure mode.

Approach is option 2 from the quick-563 close-out: the count goes **inside**
`SearchableSelect`, because the information belongs where the filtering happens,
a count under the picker would need a prop leaking the filter term to every
caller, and `DispatchLoadModal` picking it up is a benefit — the same silent
omission exists there.

## Tasks

### Task 1 — Read the filter path first (steps 1–3)

Report how cmdk filters, where a footer can live, and whether cmdk exposes the
count. Report every consumer and whether the footer helps, is neutral, or is
noise at each. **Report the copy and stop for approval before implementing.**

### Task 2 — Add the count (step 2, after approval)

Two states that currently look identical must be told apart: options exist but
search hid them, versus no options exist at all. Filtering, sorting and
blockedness untouched; no prop exposing the filter term.

### Task 3 — Verify (steps 4–5) and guard

Browser at 1568px on the assign screen: a term that hides blocked options, a
term matching nothing, and a cleared search. Confirm `CommandEmpty` still shows
the caller's copy. Guard the decision, proven red by reinstating the defects.

## Constraints honoured

No change to filtering, sorting, or what makes an option blocked. No prop
exposing the filter term. Assign screen unchanged beyond consuming the updated
component — in the event, unchanged entirely. No DDL, no data changes.
