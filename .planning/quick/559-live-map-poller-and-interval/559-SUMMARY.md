# quick-559 — SUMMARY

**Date:** 2026-08-27 · **Commits:** `654f96ca` (change), `1881e564` (guard)
**Pre-task commit:** `c56b1401` · **Branch:** feature/document-import

Acts on quick-558's read-only findings.

---

## Step 1 — one lane, not two. The trade-offs as observed

`live-map/page.tsx` now uses `ResponsiveSwitch` instead of rendering both
variants and hiding one with CSS. `ResponsiveSwitch` is not a new mechanism —
it is this repo's own answer to this pattern, used on 10+ carrier pages, and its
header documents the problem in its original form (two live `<form>` trees,
duplicate submit targets). **Duplicate pollers are that same defect wearing
different symptoms**, so the fix is the existing component rather than a bespoke
width check.

Both predicted costs were **measured, not asserted**:

**The lanes leave the server HTML.** Fetching `/live-map?view=board` with no JS:

```
bytes: 52928
contains desktop lane (Board view toggle)    : false
contains desktop lane (Refresh vehicles)     : false
contains mobile lane                         : false
contains ResponsiveSwitch fallback           : true
```

That is the real cost, and it is exactly one frame's worth: `useIsDesktop()`
returns `undefined` until it has mounted on the client, so neither lane can be
server-rendered. A `fallback` reserving the full height was added so that frame
is a neutral surface rather than a layout jump. `initialVehicles` is still
fetched server-side and still seeds whichever lane wins — it just no longer
appears in the initial HTML.

**A resize across 1024 px remounts and refetches** — confirmed:

```
at 1600px -> desktop lane nodes: 1, mobile lane nodes: 0
at  800px -> desktop lane nodes: 0, mobile lane nodes: 1
requests within 4s of the resize: vehicles@+2366ms, live-board@+2718ms
=> lane swapped: true      => remount refetched: true
```

Two honest notes. The `live-board` request at the swap boundary is a transient —
either a fetch already in flight or a final tick as the desktop tree unmounts;
steady state at mobile width is **zero** `live-board` requests over 60 s,
measured below. And the in-browser probe never caught the fallback element
(hydration replaced it before the locator first polled), so the HTML fetch above
is the evidence for it, not the browser timing — which on a dev server is not a
meaningful first-paint number anyway.

## Step 2 — board 15 s to 30 s

Recorded in `live-map-constants.ts` next to the value. At 15 s it was **the
fastest non-terminating poll in the application attached to its largest
payload**, which is backwards. `tracking-poller` — the customer shipment page,
also a screen left open all day — has run at 30 s since it shipped and is the
closest analogue in the repo.

quick-558 measured two consecutive polls on an idle tenant as byte-identical
apart from `computedAt` (26 bytes of 18,695), so the old rate was re-sending the
same board rather than buying freshness.

Cost, stated rather than glossed: worst-case staleness on a blocked inspection
doubles to 30 s. Acceptable because the board is not the urgent path — a blocked
driver is on the phone, Phase 10's notification triggers carry the urgency, and
a board is for glancing at. The board also has a manual Refresh control and a
stale-data banner, which is what makes this a considered trade rather than a
silent downgrade.

## Step 3 — verdict on `/vehicles`: **stays at 15 s**

Not for symmetry, and not for asymmetry's sake. **The rate is matched to the
ingest**, which is a fact about the data rather than a feel about the screen:

- The fastest writer of this data is `driver-gps-ping.tsx`, whose
  `THROTTLE_MS` is **15_000** — a driver's browser posts a position at most
  every 15 s. (`gps-tracker.tsx` runs at 30 s; the mobile background task at
  30 s active / 5 min idle / 10 min off-duty.)
- So 15 s tracks the fastest ingest exactly. **30 s would leave a marker a full
  ingest cycle behind** for no benefit anyone can see.
- Unlike the board, this staleness is **user-visible**: both lanes render a
  "last updated *N*s ago" counter beside the map, so a slower poll shows up as a
  stationary marker under a climbing counter.
- It is also the smaller payload (~5 kB against the board's ~18–20 kB), and its
  cost **halved anyway** when the duplicate poller went — the win is banked
  without touching the rate.

The two endpoints watch different things: the board is a set of derived facts
about trips, changed by human action; positions are a physical quantity that
moves continuously. Making the numbers match would have meant picking one
endpoint's answer for both.

## Step 4 — the constant, and the convention question

`apps/web/src/lib/carrier/live-map-constants.ts`, matching the established
`*-constants.ts` convention (`board-constants`, `inspection-constants`,
`template-constants`, `optimisation-constants`): one occurrence each,
grep-verified, imported rather than restated.

```ts
export const LIVE_BOARD_POLL_INTERVAL_MS = 30_000;
export const LIVE_MAP_VEHICLES_POLL_INTERVAL_MS = 15_000;
```

All three `const POLL_INTERVAL_MS = 15_000` declarations are gone — grep across
`components/maps`, `components/tracking` and `app/(owner)/live-map` returns
nothing. (`tracking-poller.tsx` keeps its own; it is a different surface and out
of scope.)

**Repo-wide convention: worth proposing separately, and deliberately not built
here.** `POLL_INTERVAL_MS` is a repeated *name* across five files carrying six
values from 1.5 s to 60 s, and most are defensible in isolation — a terminating
progress bar, message threads, badge counts and a live board are genuinely
different problems. Collapsing them into a shared ladder is a design decision
with its own trade-offs and its own review, not a side effect of a polling fix
on one page. A proposal should carry: a named ladder (interactive / ambient /
background), a shared `usePolling` hook so the visibility guard and catch-up
fetch stop being re-implemented per component, and an audit of the six current
values against it. That note is written into the constants file so the next
person meets it there.

## Step 5 — before and after, 60 s idle, no user action

Steady-state windows opened *after* the mount burst settled, so the comparison
is like-for-like.

### 1600 px

| | requests | bytes | `live-board` | `vehicles` |
|---|---|---|---|---|
| before | 10 | 88.6 kB | 3 (54.8 kB) | 7 (33.8 kB) |
| **after** | **5** | **51.0 kB** | 2 (36.5 kB) | 3 (14.5 kB) |
| | **−50 %** | **−42 %** | 15 s → 30 s | two pollers → one |

### 390 px (iPhone 14)

| | requests | bytes | `live-board` | `vehicles` |
|---|---|---|---|---|
| before | 10 | 88.6 kB | 3 (54.8 kB) | 7 (33.8 kB) |
| **after** | **4** | **19.3 kB** | **0** | 4 (19.3 kB) |
| | **−60 %** | **−78 %** | **eliminated** | two pollers → one |

Per 8-hour tab: 1600 px **4,800 → 2,400 requests, 41.5 → 23.9 MB**; 390 px
**4,800 → 1,920 requests, 41.5 → 9.0 MB**.

Note the before rows are identical at both widths. That was the defect: the same
traffic regardless of which lane you could actually see.

### The invisible lane is gone at both widths — checked by DOM, not by arithmetic

A halved request count is also what a coincidental cache hit looks like, so the
check is node presence:

| | before | after |
|---|---|---|
| 1600 px — `LiveMapMobile` node | count 1, `isVisible: false`, freshness `"13s ago"` | **count 0** |
| 390 px — `BoardToggle` (desktop-only) node | count 1, `isVisible: false` | **count 0** |
| 390 px — `/live-board` requests / 60 s | 3 | **0** |

The 1600 px "before" row is the quick-558 proof restated: a hidden component
whose own freshness counter kept advancing was fetching, because that counter
resets only inside `fetchVehicles`' success path.

## Step 6 — ETag: not implemented, and why it is third

Recorded as instructed. `computedAt` is stamped from `Date.now()` on **every**
call, so no two responses ever hash the same. A naive `ETag`/`If-None-Match`
would therefore never match — it would add a header, a comparison and a round
trip while producing a 200 with a full body every time: **overhead that looks
like it is working**, which is the worst kind.

It becomes worthwhile only with the hash computed over `{drivers, trucks}` and
`computedAt` **explicitly excluded**, and that carve-out has to be written down
next to the code or someone tidies it away. Two further points for whoever picks
it up: it saves **bytes only** — all four `loadBoardFacts` queries still run to
discover nothing changed, and on this payload the DB cost is the larger number —
and the board's stale-data banner reads `payload.computedAt`, so a 304 leaves it
with nothing to refresh from and needs handling rather than ignoring.

## Verification

- **tsc probed in both apps.** `apps/web` 0 errors; probe (`const x: number = 'y'`
  in `live-map-constants.ts`) reported `TS2322` at that file, so the gate is not
  blind; probe deleted, re-run clean. `apps/mobile` 0 errors, probed the same way.
- **Suite diffed against the pre-task commit.** 18 failed / 126 passed files and
  66 failed / 1,553 passed tests both before and after; failing-file sets
  `diff`-identical. `c56b1401` is code-identical to `5335dba0` (quick-558 was
  docs-only), so that is the correct baseline. The 18 are the standing
  workflows/tRPC, driver-pay exporter, notifications-dispatcher and `tests/unit`
  failures — none touched here. The new guard's 7 tests are additional.

  > **Corrected by quick-561.** The "after" figures above were measured *before*
  > this task wrote its own guard file, so they undercount it. Re-measured at
  > `74350e09` by `git stash`, the true post-quick-559 state is **18 failed /
  > 127 passed files, 66 failed / 1,560 passed tests** — the 126/1,553 row is
  > this task's own tree minus its guard. The conclusion is unchanged (zero
  > regressions, +7 passing from the guard); only the arithmetic was stale.
  > Lesson worth keeping: **run the full suite after the last commit of a task,
  > not before it**, or the number recorded is not the number that shipped.
- **Guard proven red by two verified mutations**, not by reasoning: re-adding a
  local `POLL_INTERVAL_MS` to `LiveBoard` fails the single-constant test;
  restoring the `lg:hidden` / `hidden lg:block` pair fails the dual-mount test.
  Both restored, `git diff` confirms the working tree matches the committed
  state, re-run green.

## Diff

| File | Change |
|---|---|
| `lib/carrier/live-map-constants.ts` | **New.** Both intervals, the reasoning for each, and the repo-wide-convention note. |
| `app/(owner)/live-map/page.tsx` | `ResponsiveSwitch` replaces the CSS dual mount; fallback reserves height. |
| `components/tracking/LiveBoard.tsx` | Local constant to `LIVE_BOARD_POLL_INTERVAL_MS` (30 s). |
| `components/maps/live-map-wrapper.tsx` | Local constant to `LIVE_MAP_VEHICLES_POLL_INTERVAL_MS`. |
| `app/(owner)/live-map/LiveMapMobile.tsx` | Same. |
| `lib/carrier/__tests__/live-map-polling.test.ts` | **New.** 7 tests. |

Untouched, as constrained: board data, columns, projections, the Drivers/Trucks
toggle, the single-response-both-projections shape, and the tab-visibility
guards already present in all three pollers. No DDL, no data changes.

## Per-item audit

| Step | Status |
|---|---|
| 1 · ResponsiveSwitch + trade-off observed | **IMPLEMENTED** — both costs measured (server HTML carries neither lane; resize swaps and refetches), not asserted |
| 2 · Board 15 s to 30 s | **IMPLEMENTED** — with the reasoning recorded beside the value |
| 3 · `/vehicles` verdict | **IMPLEMENTED** — stays at 15 s, argued from the 15 s `driver-gps-ping` ingest rate rather than from symmetry |
| 4 · Shared constant + convention recommendation | **IMPLEMENTED** — one module, three local declarations removed, repo-wide convention recommended as a separate proposal and scoped |
| 5 · Measure after | **IMPLEMENTED** — 60 s windows at both widths; invisible lane confirmed gone at both by DOM node count, not request arithmetic |
| 6 · No ETag, record why | **IMPLEMENTED** — not built; `computedAt` trap, the bytes-not-queries limit, and the banner consequence all recorded |
