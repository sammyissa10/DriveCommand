# quick-558 — SUMMARY

**Date:** 2026-08-27 · **READ-ONLY.** No source file changed, no DDL, no writes.
**Report:** [`.planning/document-import/diagnostics/live-board-polling.md`](../../document-import/diagnostics/live-board-polling.md)

## Headline

**Phase 11 verify #1 PASSES — measured, not reasoned.** The brief recorded it as
BLOCKED. It is not: the confound is real but it is defeatable by click volume,
and the toggle adds no fetch.

**The polling is real and worse than reported.** Three pollers at desktop width,
not two — and the third serves a view nobody can see.

## The six answers, in one line each

1. **15 s, three separate `POLL_INTERVAL_MS = 15_000` declarations** in
   `LiveBoard.tsx:33`, `live-map-wrapper.tsx:46`, `LiveMapMobile.tsx:30`. No
   shared constant.
2. **Three pollers**: `LiveBoard` → `/live-board`; `live-map-wrapper` →
   `/vehicles`; **`LiveMapMobile` → `/vehicles` while `display:none`.**
3. **The toggle adds NO fetch.** 20 toggles in 7.5 s → **1** `live-board`
   request. Verify #1 passes.
4. **99.86 % of the payload is byte-identical between consecutive idle polls.**
   `computedAt` — 26 bytes of 18,695 — is the only difference.
5. **No shared polling hook or constant exists.** 15 s is the *fastest
   non-terminating poll in the app* and carries by far the largest payload.
6. Four options assessed; one is already implemented; the interval is left as a
   product call.

## What was worth the instrumentation

**`LiveMapMobile` is fetching while hidden, and the proof is its own UI.** At
1600 px its unique node is in the DOM, `isVisible: false`, the `display:none`
ancestor is exactly `…lg:hidden`, and **its freshness label reads "3s ago"** — a
counter that resets only inside `fetchVehicles`'s success path. A hidden
component whose freshness counter keeps advancing is fetching, not merely
mounted. Corroborated independently by the request cadence: `vehicles` gaps
alternate short (~2.3 s) / long (~13–16 s), the signature of two 15 s timers
offset from one another. ~1,920 requests and ~10.6 MB per shift for a view that
cannot be seen.

**The mirror case is worse and was not in the brief.** At 390 px the desktop
wrapper is mounted-and-hidden, so `vehicles` is still double-polled *and*
`LiveBoard` still pulls the full 18 kB board every 15 s into a `display:none`
subtree. On a phone, 100 % of `live-board` traffic is unreachable.

**Question 3 needed a method, not a longer look.** One toggle-fetch is
indistinguishable from one scheduled fetch — so the test was volume: 20 toggles
in 7.5 s. If the toggle fetched, requests scale with clicks. One arrived. The
clicks were proven to land via `aria-checked`, because a null result from a
missed selector would look identical to a pass — and the **first attempt was
exactly that**: `BoardToggle` uses `role="radio"` inside `role="radiogroup"`, so
`getByRole('button')` matched nothing and every click silently timed out. That
run was discarded, not reported.

**A Playwright detail that nearly produced a false negative:** `getByRole` reads
the accessibility tree, and `display:none` subtrees are **excluded** from it. The
first probe for `LiveMapMobile` returned 0 nodes and would have "proved" it was
unmounted. A CSS/attribute locator finds it. **When testing whether a hidden
thing exists, a role locator is the wrong instrument by construction.**

## The finding that constrains the fix

`computedAt` is stamped from `Date.now()` on every call, so **no two responses
ever hash the same** — which is precisely what would defeat a naive
`ETag`/`If-None-Match` while looking like it worked. A conditional request helps
only if the hash excludes `computedAt`, and that carve-out has to be written down
next to the code or someone tidies it away.

Also stated rather than glossed: the wrapper's `vehicles` poll is **not** dead in
board mode — `KpiStrip`, `FilterChips` and the desktop `VehicleSidebar` all read
from it and all render in board mode. Only the `LiveMapMobile` copy is waste.

## Recommendation (not implemented)

1. **`ResponsiveSwitch`** instead of `lg:hidden` / `hidden lg:block` on
   `live-map/page.tsx`. Not a new mechanism — it is the one this codebase already
   built for this exact pattern and already uses on 10+ carrier pages, and its own
   header documents the duplicate-mount problem. Duplicate pollers are that defect
   with a different symptom. Trade-off named: one extra frame to first paint, and
   a resize across 1024 px now remounts.
2. **30 s** interval, matching `tracking-poller` — the closest comparable
   always-open surface already in the repo. **Explicitly the user's call**: it
   doubles worst-case staleness on "inspection failed" and "behind schedule", and
   no measurement settles what a live board owes a dispatcher.
3. **ETag afterwards**, with the `computedAt` exclusion. Saves bytes only — all
   four `loadBoardFacts` queries still run.
4. Tab-visibility gating is **already implemented** in all three pollers. If it
   appears on a fix list, it is a duplicate.

Rejected: splitting the payload per projection to halve it. Both projections in
one response is *why* verify #1 passes structurally; trading that for 9 kB would
reintroduce the refetch the check exists to prevent.

## Follow-up worth raising separately

Phase 11's verify #1 should be reworded to state *how* to measure it. As written
— "toggle with the network tab open, expect no refetch" — it is unmeasurable by
eye on a page with three timers, which is how it came to be recorded as blocked
while actually passing.
