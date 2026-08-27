# quick-560 — SUMMARY

**Date:** 2026-08-27 · **SURVEY ONLY.** No source, CSS, or config changed; no
screenshots committed. Two production `SELECT`s, no writes.
**Report:** [`.planning/document-import/diagnostics/ux-survey.md`](../../document-import/diagnostics/ux-survey.md)

---

## The three findings worth the survey

**1. The empty middle is one string copy-pasted five times, and it has already
shipped a bug.** Not one shared component, not four independent designs:
`flex min-h-dvh flex-col justify-between px-5 py-8`, at five call sites across
three files, used **nowhere else in the app**. There is no component to fix and
no shared shell for the takeover group to put one in — which is how it happened.
It is also not merely cosmetic: `InspectionClient.tsx:137` carries a quick-546
comment recording that this exact layout rendered an error banner *a screen
height away from the button being tapped*, which was reported and investigated as
"nothing happens".

**2. Every complaint about the assignment screen is a feature of a component this
repo already owns.** `SearchableSelect` ships search, per-option `disabled`,
status badges and `sortByStatus` — "Auto-sort options by status (available
first)" — over a priority table that already knows `in_maintenance`,
`expired_docs` and `inactive`. It has **exactly one consumer**,
`DispatchLoadModal`, which uses it four times *for the same job*. And the
assignment screen's own header comment draws the intended design as a compact
label-left/value-right form with two driver rows; what shipped is an exhaustive
list of all fifteen trucks. **The file and the code beneath it disagree**, and the
design contract says the mockup wins.

**3. The notification complaint's premise is wrong, and the production data gives
a better fix than the one requested.** There *is* a cap — `?limit=20`. The real
shape: **71 notifications, 5 unread, and every unread one is operational or
safety** ("Trip blocked — inspection failed" ×2, "Trip blocked — TX-1001 failed
Check brakes…", a new trip, a message). The 46 read `Dispatch Generated` rows,
none newer than 16 June, consume the 20-item budget by recency and bury all five.
A lower cap does nothing; grouping helps a little. **The fix is showing unread
first — and the API already supports `?unread=true`, which the bell already calls
for its count and the panel declines to use.**

## Two complaints that should not be actioned as filed

**The Quick Action tiles are not clipped — they are peeking**, and the peek is the
scroll affordance. `driver-quick-actions.tsx:76` says so in a comment, with
`paddingInline: calc(50% - 80px)` centring a 160 px tile. Fair caveat recorded:
at 390 px that computes to ~99 px rather than the 20 px the comment claims, so
there is a real tuning question — but acting on "clipped" would remove a working
affordance.

**The FAB overlapping "Save & exit" only exists because somebody dragged it
there.** The element is `SupportTicketModal`'s FAB, mounted in the *root* layout
so it reaches the chrome-free takeover group, and it is **draggable to any of
four corners with the corner persisted** — default `bottom-left`. `Save & exit` is
top-right. So this will not reproduce for a user who has not dragged it, and
"fix the overlap" would be tuning against one tester's stored preference. Two
things worth keeping from it anyway: the FAB is `z-50` against the inspection
header's `z-10`, so it wins at any corner; and the design system says **"No FAB
anywhere"**, making the FAB itself the contract violation — global and
pre-existing, not this module's doing.

Also declined: the duty-status block is *already* fourth of five, below the trip
card and quick actions, and its height is four `h-10` status buttons — the one
thing a gloved driver taps. Shrinking it to reclaim space would breach the
contract's 48 pt minimum.

## What could ship today

Five items, each one file, no new component, no new query: **move one JSX line**
so `/help`'s real Guides sit above the stub category cards (the file's own comment
already admits the grid points only at stubs); **one class** on the walkaround's
"Change to fail", which is loud only because it is `flex-1` *alone in its row*
when the other two buttons are gone; **`disabled`** on blocked picker rows, which
are currently fully selectable and refused later; **`stops[last]`** on the driver
trip card, where the array is already on the client; and the **unread filter**
above.

## Method notes worth carrying forward

- **Q2 was answered by string comparison, not impression.** "One component or
  four?" is a grep question, and the answer — a duplicated literal — changes the
  remedy from "edit a component" to "there is no component, and no shell to add
  one to".
- **Q6 was answered with evidence rather than contrarianism**: an in-code comment
  stating the carousel's intent, a persisted drag position, a `limit=20` that
  contradicts the premise, and a production query. A complaint whose premise is
  factually wrong is a stronger "don't fix" than one merely disagreed with.
- **The `ui-ux-pro-max` generator was deliberately not run and that was flagged,
  not hidden.** `CLAUDE.md` sets it as an auto-trigger for design work, but its
  output is a design-system proposal, which this task explicitly excluded. The
  repo's own written contract (`.planning/mobile-design-system.md`) was read
  instead.
- **No screen was opened in a browser.** Driver credentials are not available in
  this environment, so the five driver-facing screens are source claims and are
  labelled as such rather than dressed as observed.

## Ambiguities recorded rather than resolved

The brief says "ten screens" and lists eight (nine counting the inspection
outcome state, which was surveyed because it shares the defect). Item 8,
`/carrier/trips/[id]`, arrived with no captured complaint — one structural
finding is offered and clearly marked as the surveyor's, not a confirmation.
And whether the driver trip card's "where the day ends" needs Phase 7's
residence mask applied was **not checked** and must be before it is built.

## Per-item audit

| # | Question | Status |
|---|---|---|
| 1 | Existing layout conventions; is the fix compliance? | **ANSWERED** |
| 2 | One component or four implementations? | **ANSWERED** — one literal, five sites, quoted |
| 3 | Other pickers; an existing component this declined? | **ANSWERED** — `SearchableSelect`, one consumer |
| 4 | Driver-facing vs owner-facing | **ANSWERED** — by route group, with ds-contract applicability |
| 5 | Cheap vs structural | **ANSWERED** — five cheap, four structural, ordered |
| 6 | What is not worth fixing | **ANSWERED** — four, with evidence; balanced against four confirmed |
