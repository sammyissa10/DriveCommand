# quick-569 — PLAN

**Mode:** quick · SURVEY ONLY · read-only
**Date:** 2026-08-30 · **Branch:** `master` · **Pre-task HEAD:** `056713fb`

## Goal

Establish what is actually worth doing next, now that the Document Import module
is complete and deployed. Rank the existing 36-item deferred list in
`12-SUMMARY.md` §7 on current evidence, correct it where quick-553…568 have
closed items, and add what it is missing.

## Constraints (from the brief)

- Read-only. No source change, no DDL, no production write.
- No redesign, no design system, no rewrite proposals.
- Every asserted number comes from production or from the code, never from a
  prior summary.
- State ambiguity explicitly rather than inferring.

## Tasks

1. **Audit the deferred list.** Walk all 36 items; mark each STILL TRUE /
   CLOSED / CHANGED against current source and production. Report anything the
   list overstates.
2. **Evidence on the two flagged items.** (a) Facility geocoding: production
   null-coordinate counts, percentages, and the specific degradation path
   traced through `optimisation-service.ts`. (b) Typed-name signature: exactly
   what a DVIR produced that way does and does not contain, with production
   counts of affected playbooks and instances.
3. **Find what the list is missing.** Five scans: routes with no nav entry,
   components with no importer, API routes with no permission check, features
   whose UI and server half disagree, copy that asserts what the system cannot
   know.
4. **Test suite, honestly.** Run the full suite, classify all 66 failures by
   root cause, and establish whether each was ever passing.
5. **Lint.** Establish what runs, what does not, what it would take, and what
   is going unchecked.
6. **Rank.** Do next / before launch / eventually / do not do — on user impact
   and risk, with a reason for every "do not do".

## Deliverable

`.planning/document-import/diagnostics/next-work-survey.md`, with a per-item
audit covering steps 1–6, each marked ANSWERED / PARTIALLY ANSWERED / NOT
ANSWERED.

## Out of scope

Fixing anything found. Every finding is reported, none is acted on.
