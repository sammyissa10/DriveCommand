# quick-558 — live-board polling diagnostic

**Date:** 2026-08-27 · **Type:** READ-ONLY diagnostic · **Branch:** feature/document-import

## Goal
Answer six questions about polling on `/live-map?view=board` and report. **No code
changes, no DDL, no writes.** Question 3 must be settled by instrumentation, not
by reading the source — it is the question Phase 11 verify #1 exists to answer.

## Tasks
1. **Static read** — locate every timer on the page, quote each interval and its
   effect, establish which components mount at which breakpoint, and survey the
   codebase's existing polling conventions.
2. **Instrument** — drive a real browser, record every `live-board` / `vehicles`
   request with timestamp and size, capture two consecutive payloads for a diff,
   prove or disprove a toggle-triggered fetch by click volume, and check whether
   the CSS-hidden lane is fetching. Repeat at mobile width for the mirror case.
3. **Report** to `.planning/document-import/diagnostics/live-board-polling.md`
   with a per-item audit, recommendations and trade-offs, and no implementation.

## Method note for task 2
One toggle-fetch is indistinguishable from one scheduled fetch — that is the
premise of the task. The way past it is **volume**: click the toggle 20 times in
under 10 s. If the toggle fetches, requests scale with clicks; if it does not,
the count stays pinned to the 15 s cadence. Confirm the clicks landed via
`aria-checked` so a null result cannot be a missed selector.

## Out of scope
Any fix. The interval is a product decision about acceptable staleness and is the
user's call, not this task's.
