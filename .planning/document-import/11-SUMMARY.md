# Phase 11 — Live board and report

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 13, design
rules Section 15.
**Date:** 2026-08-26 · **Surface:** `apps/web` (owner portal) · **DDL:** none ·
**Installed:** nothing

---

## The three things that were asked for before implementing

### 1 · The copy for the unschedulable on-time state

Ruling 1 asked for this to be reported before it was built. It is one constant,
`ON_TIME_COPY.NO_WINDOWS` in `board-constants.ts`, and it is the only place the
words exist (grep-verified: one occurrence in source, one in the test that pins
it).

> **Label:** `No windows set`
> **Sentence (tooltip + `aria-label`):** *No appointment windows on this trip —
> on-time can't be measured.*
> **Presentation:** neutral grey, `CalendarOff` icon. **Never green, never
> blank.**

Three reasons, in order of weight:

- **Green is read without stopping.** "On track" on a trip nobody set windows on
  tells an owner their day is fine when the truth is that nobody set any
  windows.
- **Blank reads as a bug.** An empty cell prompts "why is this column empty?",
  which is exactly the question the sentence answers.
- **The performance report already behaves this way**, and nobody had written it
  down. `getPerformanceReport` computes `on_time_pct` with
  `NULLIF(count(appointment_end IS NOT NULL), 0)`, so it has always returned
  **null** — not 0%, not 100% — for a windowless trip. This is the board saying
  the same thing in words rather than in a null.

**The live numbers are worse than the brief suggested**, which strengthens the
ruling rather than weakening it:

| | count | |
|---|---|---|
| stops | 720 | |
| stops with an `appointment_end` | **16** | 2.2% |
| trips (not deleted) | 308 | |
| trips with **any** stop window | **7** | **2.3%** |

301 of 308 trips are unschedulable. This is not an edge case; it is the screen.

### 2 · Ruling 4 — who consumes `/api/v1/carrier/live-map/trips`

**Exactly one consumer: `src/components/maps/trips-tab.tsx`**, the "Trips" tab
in the live map's left sidebar. Nothing else. Searched `apps/mobile`,
`packages/`, `apps/web/src`, `apps/web/e2e`, `scripts/` and `docs/` — no other
reference, and no mobile mirror.

It is worse than "named carrier, serves legacy", though. The route queries
`db.route` filtered to `status: 'COMPLETED'`, so despite the name it is a
**completed-legacy-routes list**, and clicking a row jumps to the History tab to
draw that route's GPS trail. It is not a trips endpoint in any current sense of
the word.

**The trap is wider than that one route.** `getLatestVehicleLocations` — the
function backing the entire live map, both desktop and mobile — reads `"Truck"`,
`"Route"`, `"Load"` and `"User"`. The whole `/live-map` surface is legacy-model.
A board built on it could not have displayed a single trip this module commits.
That is why Phase 11 has its own read path rather than extending that one.

Nothing was changed about `live-map/trips`; it is reported, per the ruling.

### 3 · The one refinement made under ruling 1's own rationale

The approved wording was *"any non-terminal stop has `appointment_end < now()`"*.
Taken literally, that marks a stop the driver **arrived at inside its window** as
late the instant the window closes — while they are on the dock, and while the
performance report counts that same stop as on time. Since "the board and the
report cannot disagree about late" was the decisive argument for the ruling, the
predicate also requires that the window was actually **missed**:

```
missed  =  appointment_end IS NOT NULL
           AND ( arrived_at > appointment_end          -- arrived late
                 OR (arrived_at IS NULL AND appointment_end < now) )
```

The excluded case has its own name — a driver who arrived on time and is still
there is in **detention**, which the performance report measures separately as
`avg_dwell_minutes`. Folding it into lateness would be one signal standing for
two facts, the quick-550 defect class.

Recorded in full as **DEC-18**, along with the inclusive `<=` boundary (matching
the report's numerator, pinned by a test).

---

## What was built

### Pure logic — no I/O, imported by the tests

| File | What |
|---|---|
| `lib/carrier/board-constants.ts` | `ATTENTION_RANK`, the stop/trip status vocabularies, and **every user-facing sentence**. One occurrence each, grep-verified. |
| `lib/carrier/board-status.ts` | `windowOutcome`, `missedStops`, `deriveOnTime`, `isBehindSchedule`, `deriveTripAttention`, `stopProgress`, `currentOrNextStop`, `exceptionCount`. |

**`attentionRank` is a derived NUMBER, not a comparator.** GridShell sorts
through TanStack on a column's accessor value, so a comparator would have to
live in the table config — invisible to tests, unassertable without mounting a
grid. A number is sorted by the stock ascending sorter, readable in a snapshot,
and testable as arithmetic. Six ranks:

```
0 FAILED_INSPECTION → 1 NOT_STARTED → 2 BEHIND_SCHEDULE
→ 3 ON_TRACK → 4 COMPLETED → 5 CLOSED
```

`CLOSED` is ruling 2's addition — cancelled and TONU, after completed.
Evaluation order in `deriveTripAttention` is load-bearing and commented: CLOSED
is tested **first**, or every cancelled run carrying a stale failed walkaround
pins itself to the top of the report forever.

### One data source, three projections

`lib/carrier/board-lookup.ts` → `loadBoardFacts(orgId, viewer, now)`.
`lib/carrier/board-view.ts` → `driversView`, `trucksView`, `todaysTripsReport`.

The Drivers view, the Trucks view and the report are three projections of **one
fetch**. Verify check 1 ("toggle views, network tab open → no refetch") passes
structurally: `/api/v1/carrier/live-board` returns both projections, both live in
one piece of state, and the toggle selects an array already in memory. There is
no fetch on the toggle path to reintroduce by accident.

**Section 9 is respected.** A trip's stops can include a `DRIVER_RESIDENCE` end
stop, so this is a facility read site and it **masks** rather than filters —
dropping the row would delete the end stop and make the day look like it
finishes at the last delivery.

### One row component

`components/tracking/BoardRow.tsx`. **Verified: exactly one.**

The phase's named drift is *"two nearly identical row components"*. The swap is
done in **data** — `board-view.ts` fills `primary`, `secondary` and `facts`, and
the component has no idea which view it is rendering. There is nothing for a
second component to specialise, which is a stronger guarantee than a comment
asking the next person not to fork it. A test asserts
`Object.keys(driverRow) === Object.keys(truckRow)`.

### The report

`/carrier/reports/todays-trips`, on the existing **GridShell** — no bespoke
table, nothing installed. All eleven Section 13 columns, plus a twelfth
`attention` column carrying `attentionRank`, seeded as the default sort
ascending. Four filters (status, driver, client, inspection), applied
server-side and composing; option lists are derived from the day's own rows so a
picker can only offer values that exist.

**Permission: reuses `performanceReport` rather than adding a key.**
`UserPermissions` is a hand-maintained interface with a sibling metadata list and
three pickers; DEC-16 recorded what adding to one of those vocabularies costs.
This is a performance report by any reading.

### Badges — colour **and** icon **and** text

`components/tracking/BoardBadges.tsx`, one primitive and two registries. Verify
check 6 ("thumb over the inspection colour → still readable") holds because the
word and the icon each carry the state alone. Red is reserved per Section 15:
**FAILED** gets it; *defects logged* is amber, because that trip may still
legally run.

---

## The two in-scope fixes (ruling 3)

### The nested `<button>` in `TruckRow` — quick-513 family

`TruckRow`'s root was a `<button>` containing **two more `<button>`s** (expand
chevron, kebab). `<button>` forbids interactive descendants: the parser breaks
the nesting, React reports a hydration mismatch, and the inner controls stop
reliably taking their own clicks.

`BoardRow` uses the structure quick-513 documented — an absolutely-positioned
`<Link>` with **no children** covering the row, with the one interactive sibling
(Call the driver) carrying `relative` and coming later in DOM order so it paints
above and takes its own click. No element is inside another interactive element.
The accepted cost, stated rather than hidden: text in the row is not selectable.

**`TruckRow` and `TruckRowExpanded` are deleted, not repaired**, because reading
them turned up something worse than the nesting:

- `TruckRowExpanded` was **entirely hardcoded**. Every truck rendered
  `(555) 123-4567`, `driver@example.com`, `Load #1234`, `Chicago, IL to Dallas,
  TX`, `Arrived at Stop 2 · 10:23 AM`.
- `TruckRow` passed `RouteTimeline` a list that is **always empty** — its own
  TODO says no query populates `dispatch.stops`.
- Its ETA cell printed a literal `On Time` regardless of status.

Those are fabricated operational facts on an owner's dashboard — the same class
as the "dispatch has been notified" sentence quick-549 had to retract. Repairing
the HTML would have left the fiction in place.

### `getLatestVehicleLocations().catch(() => [])`

The empty array it produced was indistinguishable from a tenant that genuinely
owns no trucks, so a database failure rendered as a confident *"No trucks yet ·
Trucks you add to the fleet will show here"* — and the error was never logged, so
nothing anywhere recorded that it happened.

`LiveMapMobile` had **already been forced to work around it**, carrying a
`hasLoaded` flag seeded from `initialVehicles.length > 0` precisely because an
empty array meant "unknown". That workaround had a hole of its own: a tenant who
really owns zero trucks was treated as "still loading" forever and **never saw
the empty state at all** — the one screen that would have told them to add a
truck.

The page now logs the failure and passes `initialLoadFailed`, so `hasLoaded`
seeds from `!initialLoadFailed`. Both directions fixed at once.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` — `apps/web` | **0 errors** |
| `npx tsc --noEmit` — `apps/mobile` | **0 errors** |
| tsc gate **probed** (`const x: number = 'y'`) | Reported `TS2322` in the probe → gate is live, not blind. Probe deleted; no stray `__probe*.ts` anywhere in the repo. |
| New unit tests | **55 passed** (`board-status` 29, `board-view` 26) |
| Full `src/` suite | 1373 passed · **55 failed in 14 files** |
| Those 14 files on a **clean stashed baseline** | **Identical: 14 files, 55 tests.** Pre-existing, measured not assumed. None import anything this phase touched (workflows E251, driver-pay exporters, notifications dispatcher). |
| `ATTENTION_RANK` occurrences | 1 (definition) |
| `"No windows set"` occurrences | 1 in source, 1 in the test pinning it |
| Row components | **1** (`BoardRow.tsx`) |
| Empty state | Three distinct states — not loaded / failed / genuinely empty — asserted by test |

Constraint compliance: **nothing installed**, **no DDL**, **no migration**,
GridShell reused, no bespoke table.

---

## Gaps — reported, not papered over

1. **`CarrierTruck` has no maintenance relation.** `MaintenanceEvent` and
   `ScheduledService` both hang off the **legacy `Truck`**, verified in
   `schema.prisma`. Section 13's "next scheduled maintenance" therefore has no
   source. Rather than an always-empty column or an invented table, the Trucks
   view shows the nearest of the three expiry dates a carrier truck really
   carries and **labels it for what it is** ("Registration due", never
   "Maintenance"). Closing this needs a column.

2. **No reverse geocoder on this page.** "Current location" is derived from the
   trip's own stop state — *At Boucher · Milwaukee, WI* / *En route to …* — and
   says **Unknown** rather than guessing. GPS freshness is a separate cell so it
   is never mistaken for position.

3. **"Estimated time to next stop" is a WINDOW, not a travel-time ETA.** The
   trip has no departure time until it starts and there is no routing call here;
   a straight-line guess would read as a promise. The cell is labelled "Window
   closes" and says "No window set" where there is none. Same restraint the
   optimisation suggestion takes about inventing a departure time.

4. **Four now-orphaned components, left in place rather than swept up:**
   `tracking/RouteTimeline.tsx`, `tracking/RouteStop.tsx`,
   `tracking/ExceptionFlag.tsx`, `tracking/StatusPill.tsx` (the tracking one —
   `ui/ds/StatusPill` is a different, live component). All four existed only to
   serve the deleted `TruckRow`; `ExceptionFlag` was fed by
   `(vehicle.dispatch as any).hasException`, which **no query in this repo ever
   sets**. Reported rather than deleted so the removal is a decision rather than
   a side effect of this diff.

5. **Exception count is computed from rows, not from a flag** — missed windows +
   skipped stops + failed inspection items, with a missed window on a skipped
   stop counted once. There is no exception column anywhere in the carrier
   schema, so the alternative was a flag that is always false.

6. **Scope is `apps/web` only.** The prompt's six items describe the owner's
   live tracking dashboard and the report, both web surfaces; no mobile screens
   were named and none were built. The mobile owner portal has its own dashboard
   and is untouched.

---

## Files

**New (11)**
```
lib/carrier/board-constants.ts          lib/carrier/board-status.ts
lib/carrier/board-lookup.ts             lib/carrier/board-view.ts
lib/carrier/__tests__/board-status.test.ts
lib/carrier/__tests__/board-view.test.ts
components/tracking/BoardRow.tsx        components/tracking/BoardBadges.tsx
components/tracking/BoardToggle.tsx     components/tracking/LiveBoard.tsx
app/api/v1/carrier/live-board/route.ts
app/api/v1/carrier/reports/todays-trips/route.ts
app/(owner)/carrier/reports/todays-trips/page.tsx
app/(owner)/carrier/reports/todays-trips/_grid/{TodaysTripsGrid,columns}.tsx
```

**Modified (5)** — `live-map/page.tsx`, `live-map/LiveMapMobile.tsx`,
`maps/live-map-wrapper.tsx`, `navigation/sidebar.tsx`,
`navigation/owner-more-menu.tsx`

**Deleted (2)** — `tracking/TruckRow.tsx`, `tracking/TruckRowExpanded.tsx`

**Decisions** — `DECISIONS.md` → **DEC-18**
