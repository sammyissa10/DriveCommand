# quick-559 — Remove the duplicate hidden poller and slow the live-board poll

**Date:** 2026-08-27 · **Branch:** feature/document-import · **Pre-task commit:** `c56b1401`

Acts on the read-only findings of quick-558
([diagnostic](../../document-import/diagnostics/live-board-polling.md)).

## Tasks

1. **One lane, not two.** Replace the `lg:hidden` / `hidden lg:block` dual mount in
   `live-map/page.tsx` with `ResponsiveSwitch`. Observe the two trade-offs in
   practice rather than asserting them: whether the lanes leave the server HTML,
   and whether a resize across 1024 px remounts and refetches.
2. **Board 15 s → 30 s.**
3. **Decide `/vehicles` separately.** Do not assume the two must match; the answer
   should come from the rate the data actually changes at, not from symmetry.
4. **One shared constant** for the live-map surface, replacing the three
   `POLL_INTERVAL_MS = 15_000` declarations. Report on a repo-wide convention;
   do not build one.
5. **Measure before and after** at 1600 px and 390 px, 60 s idle steady-state
   windows. The invisible lane must be gone at *both* widths, checked by DOM.
6. **No ETag.** Record why it is third and what would defeat a naive one.

## Method note for task 5
Measure a 60 s window that starts *after* the mount burst has settled, or the
initial fetches inflate the rate and the before/after comparison is not
like-for-like. Confirm the invisible lane by DOM node count, not by request
count — a count that merely halves is also what a coincidental cache hit
looks like.

## Out of scope
Board data, columns, projections, the Drivers/Trucks toggle, payload splitting,
tab-visibility gating (already present in all three pollers), ETag, DDL.
