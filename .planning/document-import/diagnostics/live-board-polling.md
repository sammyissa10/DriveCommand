# Diagnostic — live-board polling on `/live-map?view=board`

**quick-558 · 2026-08-27 · READ-ONLY. No code was changed.**

Measured in a real browser (Chromium via Playwright) against the local dev server
on the production database, signed in as `demo@drivecommand.com` (OWNER), org
`7e9eca25-1f97-46ed-9365-e67be49436d5`. Every number below is observed, not
inferred; where something is inferred it says so.

**Headline:** Phase 11 verify #1 **PASSES** — measured, not reasoned. The toggle
adds no fetch. The polling is real and is worse than reported: at desktop width
there are **three** pollers, not two, and one of them serves a view nobody can
see. At mobile width the 18 kB board payload is fetched every 15 s for a board
that is `display: none`.

---

## 1. Poll intervals — where they are set

Three separate `POLL_INTERVAL_MS` declarations, all `15_000`, in three files.
There is no shared constant.

**`live-board`** — [LiveBoard.tsx:33](../../../apps/web/src/components/tracking/LiveBoard.tsx#L33):

```ts
const POLL_INTERVAL_MS = 15_000;
```

```ts
useEffect(() => {
  void fetchBoard();
  const interval = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    void fetchBoard();
  }, POLL_INTERVAL_MS);
  return () => clearInterval(interval);
}, [fetchBoard]);
```

**`vehicles`** — set in **two** places, both 15 s.

[live-map-wrapper.tsx:46](../../../apps/web/src/components/maps/live-map-wrapper.tsx#L46):

```ts
const POLL_INTERVAL_MS = 15_000;
…
useEffect(() => {
  if (activeTab !== 'live') return;
  fetchVehicles();                       // immediate on entering Live
  const interval = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    if (activeTabRef.current !== 'live') return;
    fetchVehicles();
  }, POLL_INTERVAL_MS);
  return () => clearInterval(interval);
}, [activeTab, fetchVehicles]);
```

[LiveMapMobile.tsx:30](../../../apps/web/src/app/(owner)/live-map/LiveMapMobile.tsx#L30):

```ts
const POLL_INTERVAL_MS = 15_000;
…
// Poll, but never while the tab is hidden.
useEffect(() => {
  void fetchVehicles();
  const interval = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    void fetchVehicles();
  }, POLL_INTERVAL_MS);
  return () => clearInterval(interval);
}, [fetchVehicles]);
```

Note what is **already** there and should not be re-invented: all three guard on
`document.visibilityState === 'hidden'`, and the two `vehicles` pollers also
register a `visibilitychange` catch-up fetch. **Browser-tab visibility is already
handled.** What is not handled is *element* visibility — a component that is
`display: none` still polls, because `visibilityState` describes the tab, not the
component.

**Measured cadence**, 65 s idle at 1600 px, no user action:

```
vehicles:   8 requests   gaps: 2188, 13797, 2322, 12474, 2350, 16470, 2515 ms
live-board: 4 requests   gaps: 16333, 14880, 18748 ms
→ vehicles 1.85 per 15s · live-board 0.92 per 15s
```

The alternating **short (~2.2–2.5 s) / long (~12.5–16.5 s)** gap pattern on
`vehicles` is the signature of two independent 15 s timers offset by ~2.3 s. The
gaps are not exactly 15 000 ms because these are *response* receipt times against
a dev server; `setInterval` itself does not drift.

---

## 2. How many pollers run at desktop width

**Three**, hitting two endpoints.

| Component | Endpoint | Interval | Rendered at 1600 px? | Serving anything? |
|---|---|---|---|---|
| `LiveBoard` | `/api/v1/carrier/live-board` | 15 s | **yes, visible** | yes — the board |
| `live-map-wrapper` | `/api/v1/carrier/live-map/vehicles` | 15 s | **yes, visible** | yes — see below |
| `LiveMapMobile` | `/api/v1/carrier/live-map/vehicles` | 15 s | **mounted, `display:none`** | **no** |

### `LiveMapMobile` polls while hidden — confirmed, three ways

[page.tsx](../../../apps/web/src/app/(owner)/live-map/page.tsx) renders both
lanes unconditionally and hides one with CSS:

```tsx
<div className="fixed inset-x-0 top-14 bottom-[72px] z-0 lg:hidden">
  <LiveMapMobile … />
</div>
<div className="hidden lg:block lg:h-[calc(100vh-8rem)]">
  <LiveMapWrapper … />
</div>
```

`lg:hidden` is `display: none`. React mounts the subtree, effects run, timers
start. Measured at 1600 px:

```
"Refresh vehicle positions" nodes: 1        ← aria-label unique to LiveMapMobile
isVisible: false
computed display on the button itself: flex
display:none ancestors: ["fixed inset-x-0 top-14 bottom-[72px] z-0 lg:hidden"]
live text: "3s ago"
```

The third line is the decisive one. That button's label is
`` `${secondsAgo}s ago` ``, and `secondsAgo` resets to 0 only inside
`fetchVehicles`'s success path. **A hidden component whose own freshness counter
keeps advancing is fetching**, not merely mounted. Combined with the two-series
gap pattern in §1, `LiveMapMobile` is confirmed as the second `vehicles` poller.

**This is ~1,920 requests and ~9 MB per 8-hour desktop session for a view that
cannot be seen.**

### The mirror case is worse

Same probe at 390 px (iPhone 14), 60 s idle:

```
desktop-only ([class*="lg:block"]) containers in DOM: 1
BoardToggle nodes: 1, visible: false
LiveMapMobile refresh button visible: true
vehicles per 15s: 2.50   live-board per 15s: 1.25
```

At mobile width the desktop wrapper is mounted-and-hidden, so `vehicles` is still
double-polled — and **`LiveBoard` is still fetching the full 18 kB board every
15 s for a board rendered inside a `display:none` subtree.** The mobile lane has
no board UI at all. On a phone, 100 % of `live-board` traffic is unreachable.

### One nuance that constrains the fix

The wrapper's `vehicles` poll is **not** dead in board mode. Its poll is gated on
`activeTab === 'live'`, not on `viewMode`, and in board mode the wrapper still
renders `KpiStrip`, `FilterChips` and the desktop `VehicleSidebar`, all derived
from `vehicles` ([live-map-wrapper.tsx:69-76](../../../apps/web/src/components/maps/live-map-wrapper.tsx#L69),
[:269-281](../../../apps/web/src/components/maps/live-map-wrapper.tsx#L269)).
Switching to the board does not make that request pointless. Only the
`LiveMapMobile` copy is pointless at desktop width.

---

## 3. Does the toggle add a fetch? — **No. Definitively.**

Instrumented, not inferred, because that is what verify #1 asks.

The confound the brief names is real: one toggle-fetch is indistinguishable from
one scheduled fetch. The way past it is **volume**. If the toggle fetched, the
request count would scale with the click count; if it does not, the count stays
pinned to the 15 s cadence no matter how many times you click.

**20 toggles in 7.5 s, observed for 9.5 s:**

```
t=80083ms vehicles   4.8 kB
t=80511ms live-board 18.3 kB
t=82324ms vehicles   4.8 kB
live-board: 1   vehicles: 2
Drivers aria-checked after 20 clicks (last click = Drivers): true   ← clicks landed
```

**1 `live-board` request for 20 toggles.** Expected if the toggle fetched: ~20.
Expected from the timer alone over 9.5 s: ≤1. The observed value is the timer's.

Two supporting details:

- The clicks demonstrably landed — `aria-checked` tracked the final click, and an
  earlier 6-toggle run left the control in the expected state too. This is not a
  null result from a missed selector. (It nearly was: `BoardToggle` uses
  `role="radio"` inside `role="radiogroup"`, so `getByRole('button')` finds
  nothing. The first attempt failed that way and was discarded, not reported.)
- Structure agrees: `view` is a **prop** on `LiveBoard`, `fetchBoard` is
  `useCallback(…, [])`, and the poll effect's deps are `[fetchBoard]`. `view`
  appears in no dependency array, so a projection change cannot re-run the fetch.
  The route returns both projections in one response and `setView` is an array
  pick over state already in memory.

**One honest caveat.** The single request in the toggle window landed 10.0 s after
its predecessor, against a nominal 15 s. That is response-receipt jitter on a dev
server (the same run shows an 18.7 s gap in the other direction) and not evidence
of a toggle-triggered fetch — because a toggle-triggered fetch would have produced
twenty, not one.

### Consequence for Phase 11

**Verify #1 is PASSED, not blocked.** The check as written ("toggle with the
network tab open, expect no refetch") is unmeasurable by eye while three timers
run — the brief is right about that. It is measurable by click-volume, and it
passes. The verify step should be reworded to say *how* to measure it rather than
left as a manual observation that the page's own polling defeats.

---

## 4. What is in the 20.7 kB, and how much of it changes

Payload observed here: **18,695 bytes** (18.3 kB) rather than the reported 20.7 kB
— same structure, a slightly different moment of tenant state. 13–14 driver rows
and 13–14 truck rows per response.

`/api/v1/carrier/live-board` returns
[`liveBoardPayload`](../../../apps/web/src/lib/carrier/board-view.ts#L301):

```ts
export function liveBoardPayload(facts: BoardFacts): LiveBoardPayload {
  return { drivers: driversView(facts), trucks: trucksView(facts), computedAt: facts.now.toISOString() };
}
```

One row, as sent:

```json
{"key":"driver:64f2b6f4…:a341c004…","tripId":"a341c004…","href":"/carrier/trips/a341c004…",
 "tripReference":"DC-2026-00114","tripStatus":"planned","inspection":"NOT_STARTED",
 "onTime":"NO_WINDOWS","attention":"NOT_STARTED","attentionRank":1,
 "lastPositionAt":"2026-06-17T02:11:21.503Z",
 "primary":{"title":"SAMMY ISSA","subtitle":"12193988543","phone":"12193988543"},
 "secondary":{"title":"TX-1001","subtitle":"2022 Peterbilt 878"},
 "facts":[{"label":"Current or next stop","value":"DealerCorp · Griffith, IN","tone":"default"},
          {"label":"Stops","value":"0 / 3"},
          {"label":"Window closes","value":"No window set","tone":"muted"}]}
```

Note the payload is **fully rendered** — display labels, tones, formatted
"0 / 3" strings, phone numbers — because Phase 11 computes the presentation
server-side. Both projections ship every time by design (that is what makes the
toggle free), so the response is roughly twice the rows actually on screen.

### Delta between two consecutive polls on an idle tenant

```
bytes:                          18695 vs 18695
byte-identical overall:         false
identical IGNORING computedAt:  TRUE
drivers identical:              true
trucks  identical:              true
computedAt: 2026-08-27T14:41:01.770Z → 2026-08-27T14:41:16.679Z
computedAt is 26 bytes of 18695
```

**99.86 % of the payload is byte-identical between consecutive polls, and
`computedAt` is the only thing that differs.** Both row arrays — every driver row
and every truck row — are unchanged.

This is the single most consequential finding for §6, and it cuts both ways:

- It is the strongest argument that the current rate is buying nothing on a quiet
  tenant.
- It is also exactly what would **defeat a naive `ETag`/`If-None-Match`**: the
  server stamps `computedAt` from `Date.now()` on every call, so no two responses
  ever hash the same. A conditional request only helps if `computedAt` is excluded
  from the hash — a deliberate decision, not a middleware drop-in.

### Cost per response

`loadBoardFacts` issues **4 database queries** — one deep `trip.findMany` (stops,
facilities, driver, truck, inspection) plus a `Promise.all` of `playbookInstance`,
`gPSLocation` and `driverHOSEntry`
([board-lookup.ts:240,315](../../../apps/web/src/lib/carrier/board-lookup.ts#L240)).
Neither route sets `Cache-Control`, `ETag`, or `revalidate` — verified by grep;
both are plain `NextResponse.json`.

### Traffic for one dispatcher, one 8-hour shift, one open tab

At the measured cadence, using the reported wire sizes (20.7 / 5.5 kB):

| | requests | bytes | DB queries |
|---|---|---|---|
| `live-board` (1 poller × 4/min) | 1,920 | ~39.7 MB | ~7,680 |
| `vehicles` (2 pollers × 4/min) | 3,840 | ~21.1 MB | — |
| **total** | **5,760** | **~61 MB** | — |
| *of which the hidden mobile poller* | *1,920* | *~10.6 MB* | *—* |

Multiply by concurrent dispatchers. This is one tab.

---

## 5. Existing polling conventions in this codebase

**There is no shared polling hook and no shared interval constant.** Every
polling component declares its own. `POLL_INTERVAL_MS` is a repeated *name* in
five files carrying three different values — a naming convention, not a shared
one. Grep-verified across `src/`:

| Interval | Surfaces |
|---|---|
| 1.5 s | `ImportProgress` (`POLL_MS`) — a progress bar, terminates |
| 5 s | `ConversationList`, `MessageThread`, driver `messaging-panel` |
| 10 s | `DispatchMessages`, `StopDetailMessages`, driver `stop-messages` |
| **15 s** | **`LiveBoard`, `live-map-wrapper`, `LiveMapMobile`** |
| 30 s | `QuickMessageBoard`, `messages-badge`, `vehicle-details-sheet`, `tracking-poller` |
| 60 s | `notification-bell`, `driver-notification-bell`, `dispatch-badge` |

So 15 s is the **fastest non-terminating poll in the application**, and it carries
by far the largest payload. The 5 s and 10 s message polls fetch conversation
deltas; the 60 s badges fetch a count. Nothing else in the codebase pulls 18–20 kB
on a 15 s loop.

The closest analogue by purpose is `tracking-poller` — the customer-facing
shipment tracking page, a screen someone also leaves open — at **30 s**.

Two conventions **do** exist and are already followed here:

1. **Tab-visibility guarding.** `document.visibilityState === 'hidden'` plus a
   `visibilitychange` catch-up. All three live-map pollers already do this.
2. **`ResponsiveSwitch`** — [ui/ResponsiveSwitch.tsx](../../../apps/web/src/components/ui/ResponsiveSwitch.tsx),
   built on `useIsDesktop()`, and adopted by 10+ carrier pages. Its own header
   documents the exact problem this page has:

   > *The mobile-web design-system pattern historically rendered both breakpoint
   > variants simultaneously, toggled with CSS (`lg:hidden` / `hidden lg:block`).
   > That leaves two independent `<form>` trees (and their state) live in the DOM
   > at once…*
   >
   > *ResponsiveSwitch instead waits for `useIsDesktop()` to resolve past its
   > `undefined` (pre-mount) state and then renders a single variant — never both.*

   It was written for duplicate forms. **Duplicate pollers are the same defect
   with a different symptom**, and `/live-map` is one of the pages that never
   adopted it.

---

## 6. Recommendation and trade-offs

Three findings, three different fixes, and they are independent. Ordered by
confidence, not by size.

### A. Stop the hidden lane from polling — **recommend, no product decision needed**

Wrap the two lanes in the existing `ResponsiveSwitch` instead of `lg:hidden` /
`hidden lg:block`. This is not a new mechanism; it is the mechanism this codebase
already built for this exact pattern and already uses on ten other pages.

- **Removes at desktop:** 1,920 requests and ~10.6 MB per shift — one third of the
  page's traffic, for a view that is `display: none`.
- **Removes at mobile:** the entire `live-board` poll (~39.7 MB per shift) plus
  the duplicate `vehicles` poll, all of it currently unreachable.
- **Trade-off:** `ResponsiveSwitch` returns its `fallback` until `useIsDesktop()`
  resolves after mount, so the map/board paints one frame later than today, and
  the server-rendered `initialVehicles` no longer appear in the pre-mount HTML.
  Cheap here — this page already shows a loading state for the dynamically
  imported map — but it **is** a real change to first paint and should be looked
  at rather than assumed harmless.
- **Ambiguity, stated:** resizing across 1024 px will now unmount one lane and
  mount the other, discarding its in-memory `vehicles` state and re-fetching. Today
  both are always warm. Almost nobody resizes across that boundary mid-shift, but
  the behaviour does change.

### B. Lengthen the interval — **recommend 30 s, but it is your call**

15 s is the fastest poll in the app attached to the largest payload, and §4 shows
two consecutive polls on an idle tenant differ **only in `computedAt`**. 30 s
halves the board's traffic and DB load and matches `tracking-poller`, the closest
comparable surface already in the codebase.

- **Trade-off, and it is a product decision, not a technical one:** the worst-case
  staleness of "inspection failed" or "behind schedule" doubles from 15 s to 30 s.
  A dispatcher watching a board *is* watching for those. There is no measurement
  that settles this — it depends on what the board is for. The board already has a
  manual **Refresh** button and a stale-data banner, which is what makes a longer
  interval defensible rather than a silent downgrade.
- **Do not go past 60 s** without a different mechanism; at that point the label
  "live board" stops being true and the honest move is streaming, not a slower
  timer.

### C. Conditional requests — **worth doing, but not as the first move**

`ETag` + `If-None-Match` on `/live-board` would turn ~99.86 % of these responses
into a 304 with no body.

- **Trade-off, and it is the trap:** `computedAt` is stamped from `Date.now()` on
  every call, so the hash must be computed over `{drivers, trucks}` **with
  `computedAt` excluded**, or no two responses ever match and the header is pure
  overhead. That is a deliberate carve-out someone must not later "tidy up".
- It also saves **bytes only, not database work** — all four queries in
  `loadBoardFacts` still run to discover that nothing changed. On this payload the
  DB cost (7,680 queries/shift/tab) is the larger number.
- A `computedAt`-free 304 also means the client cannot refresh its "last updated"
  stamp on a no-change poll. Minor, but the board's staleness banner reads from
  `payload.computedAt`, so this needs handling rather than ignoring.

### D. Tab-visibility gating — **already done. Do not re-implement.**

All three pollers already skip while the tab is hidden and catch up on
`visibilitychange`. If this appears on a fix list, it is a duplicate.

### What I would do, in order

1. **A** — no product decision, uses an existing in-repo mechanism, removes a
   third of desktop traffic and nearly all mobile traffic.
2. **B at 30 s** — pending your call on staleness. Everything else is a rounding
   error next to halving the largest poll.
3. **C** — after A and B, and only with the `computedAt` exclusion written down
   next to the code, because that detail is what makes or breaks it.

Not recommended: reducing what the payload contains, or making the toggle fetch
per-projection to halve the response. Both projections in one response is what
makes verify #1 pass structurally (§3), and trading that away to save 9 kB would
reintroduce the exact refetch this check exists to prevent.

---

## Per-item audit

| # | Question | Status |
|---|---|---|
| 1 | Poll interval for `live-board` and `vehicles`, quoted with location | **ANSWERED** — three `POLL_INTERVAL_MS = 15_000` declarations in three files, quoted with the effects around them; measured cadence confirms 15 s |
| 2 | How many pollers at desktop width; is `LiveMapMobile` polling while hidden | **ANSWERED** — three pollers named with intervals; `LiveMapMobile` confirmed mounted, `display:none`, and fetching, by DOM node + hidden-ancestor chain + a live "3s ago" counter + a two-series gap signature. Mirror case at mobile width measured too |
| 3 | Does the toggle add a fetch — definitively, instrumented | **ANSWERED** — 20 toggles in 7.5 s produced 1 `live-board` request; clicks proven to land via `aria-checked`. Verify #1 **passes**. Timing caveat stated rather than buried |
| 4 | Payload contents and delta between consecutive polls | **ANSWERED** — full row shape quoted; two consecutive idle polls identical apart from `computedAt`, 26 bytes of 18,695 = **99.86 % unchanged**; 4 DB queries per call; no cache headers; per-shift totals computed |
| 5 | Existing polling convention | **ANSWERED** — no shared hook or constant; full interval table across the app; 15 s is the fastest non-terminating poll and the largest payload; `tracking-poller` at 30 s is the closest analogue; `ResponsiveSwitch` + visibility guarding identified as the two conventions that do exist |
| 6 | Recommendation and trade-off, covering all four named options | **ANSWERED** — all four addressed (D already implemented); recommendation ordered with the staleness call left explicitly to product, and the `computedAt` trap in option C named |

**Constraints honoured:** read-only — no source file was modified, no migration,
no write of any kind. The Drivers/Trucks toggle, the board's data and its columns
are untouched. Instrumentation ran entirely in a throwaway browser context via
temporary scripts outside `apps/`, since deleted. Ambiguities are stated inline
rather than resolved by inference: the 10.0 s gap in §3, the first-paint and
resize consequences of option A, and the 18.3 vs 20.7 kB difference from the
reported observation.
