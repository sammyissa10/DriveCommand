# quick-563 — Put the assignment screen on SearchableSelect

**Date:** 2026-08-27 · **Branch:** `feature/document-import` · **Baseline:** `e68216b2`

---

## The problem

quick-560 established that every complaint filed against
`/carrier/imports/[id]/assign` describes a feature `SearchableSelect` already
ships. The screen's own header comment draws a compact form with availability
inline; the code beneath renders flat, unsearchable, unsorted, full-height
lists. **The file disagrees with itself, and the drawing is the half that is
right.**

Fourth instance this session of a convention existing and not being adopted —
after ActionFooter, the sidebar and the help articles.

## Tasks

### Task 1 — Read the API before using it (steps 1–2)

Quote `SearchableSelectOption`, how a disabled option renders, how a badge
renders, what `sortByStatus` expects. Report anything the screen needs that the
component cannot express **before** building. Report how the app's other pickers
use it — and correct the brief where the premise is wrong.

### Task 2 — Move both lists onto it (steps 3–5)

Pure mapping in `lib/document-import/assignment-options.ts` so the badge and
sort decisions are testable without mounting cmdk. Preserve every inline fact:
availability, hours, compliance flags, insurance expiry, on-a-trip-that-day,
inactive. Preserve quick-561's `blocked && !selected` exactly. Decide and report
on a selection summary.

### Task 3 — Verify (step 6) and guard

Browser at 1568px against the demo tenant: click path, search, blocked marked
and unselectable, both selections visible at once. Unit-guard the mapping,
proven red by reinstating the defects.

## Constraints honoured

No change to validation, the blocks under Create trip, the warnings summary, or
any server action. No change to what makes an option blocked. No new component,
and the shared one not modified. No DDL, no data changes.
