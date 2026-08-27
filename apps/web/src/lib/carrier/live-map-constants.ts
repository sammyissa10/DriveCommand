/**
 * quick-559 — the live-map surface's poll intervals, in one place.
 *
 * Same discipline as `board-constants.ts`, `template-constants.ts`,
 * `optimisation-constants.ts` and `inspection-constants.ts`: one occurrence
 * each, grep-verifiable, imported rather than restated.
 *
 * Before this file there were THREE `POLL_INTERVAL_MS = 15_000` declarations —
 * `LiveBoard.tsx`, `live-map-wrapper.tsx`, `LiveMapMobile.tsx` — which is how
 * three timers on one page came to look like a single deliberate rate when they
 * were three independent copies of a number nobody had revisited. That is the
 * narrow scope of this module: the live-map surface. It is deliberately NOT a
 * repo-wide polling constant — see the note at the bottom.
 *
 * ─── WHY THE TWO RATES DIFFER ──────────────────────────────────────────────
 *
 * They are not the same number because they do not watch the same thing, and
 * making them match would mean picking one endpoint's answer for both.
 */

/**
 * `/api/v1/carrier/live-board` — 30 seconds.
 *
 * Was 15 s, which made it the fastest non-terminating poll in the application
 * attached to its largest payload (~18–20 kB), and that is backwards.
 * `tracking-poller` — the customer shipment page, also a screen left open all
 * day — has run at 30 s since it shipped, and is the closest analogue in the
 * repo.
 *
 * Two consecutive polls on an idle tenant were measured byte-identical apart
 * from `computedAt` (26 bytes of 18,695 — 99.86 % unchanged), so the old rate
 * was not buying freshness; it was re-sending the same board.
 *
 * What this costs, stated rather than glossed: worst-case staleness on a
 * blocked inspection doubles to 30 s. That is acceptable because the board is
 * not the urgent path — a blocked driver is on the phone, and Phase 10's
 * notification triggers carry the urgency. A board is for glancing at. The
 * board also has a manual Refresh control and a stale-data banner, which is
 * what makes a slower rate a considered trade rather than a silent downgrade.
 */
export const LIVE_BOARD_POLL_INTERVAL_MS = 30_000;

/**
 * `/api/v1/carrier/live-map/vehicles` — 15 seconds. Deliberately UNCHANGED.
 *
 * The board is a set of derived facts about trips; positions are a physical
 * quantity that moves continuously, and the map's markers are the one thing on
 * this page that visibly changes on its own.
 *
 * The rate is matched to the ingest, not chosen by feel: the fastest writer of
 * this data is `driver-gps-ping.tsx`, whose `THROTTLE_MS` is 15_000, so a
 * driver's browser posts a position at most every 15 s (`gps-tracker.tsx` runs
 * at 30 s; the mobile background task at 30 s active). Polling at 15 s tracks
 * the fastest ingest exactly. Polling at 30 s would leave a marker a full
 * ingest cycle behind for no benefit the user can see — and unlike the board,
 * this staleness IS user-visible, since both lanes render a "last updated Ns
 * ago" counter beside the map.
 *
 * Its cost halves anyway: quick-559 removed the duplicate hidden poller, so
 * this endpoint went from two callers to one without touching the rate.
 */
export const LIVE_MAP_VEHICLES_POLL_INTERVAL_MS = 15_000;

/**
 * ─── ON A REPO-WIDE POLLING CONVENTION ─────────────────────────────────────
 *
 * Not attempted here, on purpose. `POLL_INTERVAL_MS` is a repeated NAME across
 * five files carrying values from 1.5 s to 60 s, and those values are mostly
 * defensible in isolation: a terminating progress bar, message threads, badge
 * counts and a live board are genuinely different problems. Collapsing them
 * into a shared ladder is a design decision with its own trade-offs and its own
 * review, not a side effect of a polling fix on one page.
 *
 * What a separate proposal should carry, if one is ever written: a named ladder
 * (interactive / ambient / background), a shared `usePolling` hook so the
 * visibility guard and the catch-up fetch are not re-implemented per component,
 * and an audit of the six current values against it.
 */
