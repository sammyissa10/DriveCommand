# quick-557 — SUMMARY

**Date:** 2026-08-27
**Commits:** `08cfc681` (fix), `5335dba0` (guard)
**Branch:** feature/document-import

---

## Verdict

**The columns read the wrong path.** The query fetches everything the page
needs; the break is at the API → row mapping inside the client.

`listTrips()` runs `trip.findMany` with **no `select`**, so every `Trip` scalar
is returned — `primaryDriverId` and `scheduledDeparture` included — and it
already `include`s `primaryDriver { firstName, lastName }`. Both lanes of
`/carrier/trips` then declared their own copy of the payload shape, and both
copies were the **legacy `Route`** model's vocabulary:

| read by the client | actually on the payload | source of the wrong name |
|---|---|---|
| `item.driverId` | `primaryDriverId` | `Route.driverId` |
| `item.scheduledDate` | `scheduledDeparture` | `Route.scheduledDate` |
| `item._count.loads` | `_count.stops` (only) | — |

Every read returned `undefined`, and `undefined` is exactly what the Driver
column's `if (!driverId) return "Unassigned"` branch and the Date column's
`if (!dateStr) return '—'` branch exist to display. `truckId` **is** a real
`Trip` column, which is why the Truck column alone kept working — and why the
page looked like it had lost data rather than like it was reading the wrong
object.

Live payload keys, captured from the running app during verification:

```
_count, actualArrival, …, primaryDriver, primaryDriverId, …, scheduledDeparture,
status, trailerId, truck, truckId, …
_count on item[0]: {"stops":1,"carrierLoads":2}
```

No `driverId`, no `scheduledDate`, no `_count.loads`.

## Second-order damage on the mobile-web lane

`TripsMobile` filters by scope with `new Date(r.scheduledDate)` → `NaN` →
`if (isNaN(...)) return false`. With the date undefined, **Today and Upcoming
returned zero trips** on a tenant with trips today and tomorrow. Same one
`undefined`, a different and less obvious symptom.

---

## What changed

| File | Change |
|---|---|
| `lib/carrier/trip-list-row.ts` | **New.** The payload shape and the row mapping, once, in the API's vocabulary. |
| `lib/carrier/trips.ts` | `_count` select gains `carrierLoads: true`. Additive. |
| `carrier/trips/_grid/DispatchesGrid.tsx` | Local `ApiDispatch` deleted; maps via `toTripListRow`. |
| `carrier/trips/_grid/types.ts` | `DispatchRow` re-exported from the shared module. |
| `carrier/trips/_grid/columns.tsx` | Date column reads `scheduledDeparture` (column **id** unchanged — persisted grid key); `formatDate` now rejects `Invalid Date`. |
| `carrier/trips/TripsMobile.tsx` | Same local copy deleted; maps via `toTripListRow`. |
| `lib/carrier/__tests__/trip-list-row.test.ts` | **New.** 9 tests. |

Two deliberate choices worth keeping:

1. **The included relation beats the page map.** `TripsPage` builds
   `driverMap`/`truckMap` from `status: 'active'` rows only, so a trip assigned
   to a since-deactivated driver was going to read "Unassigned" even after the
   field names were fixed — the same false statement from a second cause. The
   maps remain as fallback.
2. **The Date column's `id` stays `'scheduledDate'`.** It is a persisted key in
   `grid_preference` under `gridId: "dispatches-overview"`; only the field it
   reads was wrong, so it moved to an `accessorFn` instead.

The `carrierLoads` count is in scope because it is the same defect at the same
boundary: the "Loads" column printed a hardcoded `0` on every row, which is a
false operational fact on an owner's screen (the quick-549 class), not a
cosmetic gap.

---

## Verification

**tsc — probed in both apps.** `apps/web` 0 errors; probe (`const x: number =
'y'` inside `trip-list-row.ts`) reported `TS2322` at the right file, so the gate
is not blind; probe deleted and re-run clean. `apps/mobile` 0 errors, probed the
same way.

**Suite — diffed against a real baseline.** The first attempt used
`--reporter=basic`, which **does not exist in vitest 4**: it exited 0 having run
zero tests. Re-run with the default reporter, and the baseline taken from a
`git worktree` at `HEAD` (inside the repo, no symlinks; removed with
`git worktree remove --force`, repo confirmed intact afterwards).

| | files | tests |
|---|---|---|
| baseline @ `59c4f335` | 18 failed / 125 passed / 8 skipped | 66 failed / 1544 passed |
| after | 18 failed / 126 passed / 8 skipped | 66 failed / 1553 passed |

Failing-file sets **identical** (`diff` clean). Delta is exactly the new file
and its 9 tests. The 18 pre-existing failures are workflows/tRPC (`headers()`
outside a request store), driver-pay golden exporters, notifications dispatcher
and four `tests/unit` files — none touched here.

**Guard proven red**, not assumed: removing `carrierLoads: true` from
`listTrips` fails `listTrips includes the driver relation and counts
carrierLoads` with the expected message. Restored and re-run green.

### DOM, real browser, against the database

Signed in as `demo@drivecommand.com` (OWNER), `/carrier/trips`, 14 rows.

| Trip # | dispatch id | DOM date · driver · truck · loads | DB (`scheduled_departure` at America/Chicago · driver · unit · loads) |
|---|---|---|---|
| DC-2026-00002 | `69098808…c2c6` | Thu, Apr 16 · SAMMY ISSA · TX-1001 · 2 | Thu, Apr 16 (2026-04-16 05:00Z) · SAMMY ISSA · TX-1001 · 2 |
| DC-2026-00027 | `252917e3…40bd` | Mon, Apr 27 · SAMMY ISSA · TX-1001 · 2 | Mon, Apr 27 (2026-04-28 02:00Z) · SAMMY ISSA · TX-1001 · 2 |
| DC-2026-00042 | `671f3ed5…523f` | Mon, May 18 · John Doe · TRK-001 · 1 | Mon, May 18 (2026-05-18 06:00Z) · John Doe · TRK-001 · 1 |
| DC-2026-00067 | `21b59e09…8e68` | Thu, Jun 18 · Carlos Rivera · TRK-001 · 1 | Thu, Jun 18 (2026-06-18 15:00Z) · Carlos Rivera · TRK-001 · 1 |
| DC-2026-00114 | `a341c004…86d7` | Thu, Aug 27 · SAMMY ISSA · TX-1001 · 1 | Thu, Aug 27 (2026-08-27 09:00Z) · SAMMY ISSA · TX-1001 · 1 |

Zero rows read "Unassigned" or "—". The two rows whose UTC instant falls on the
following calendar day (00027, 00007) render the **local** day, which is correct
for a `@db.Timestamptz` column (quick-541: the date-only helpers would be the
inverse bug here).

Mobile-web lane, iPhone 14 viewport: all 14 rows carry driver, date and load
count, and the scope filters now work — **Today** → DC-2026-00114 (2026-08-27),
**Upcoming** → DC-2026-00115 (2026-08-28), where both previously returned empty.

---

## Other grids (step 6)

Only three grids client-fetch and re-declare a payload shape. The other six
(`clients`, `contracts`, `facilities`, `fleet/drivers`, `fleet/trucks`,
`routes`) take server-derived props and cannot drift this way.

| Grid | Verdict |
|---|---|
| **trips** | **Was broken.** Fixed here, both lanes. |
| **loads** (`_grid/LoadsGrid.tsx`) | **Clean.** Every name it reads — `referenceNumber`, `clientId`, `client.name`, `dispatchId`, `dispatch.notes`, `loadType`, `status`, `totalRevenue`, `isSample` — is on `listLoads`'s `include`/scalars. |
| **Today's Trips** (Phase 11) | **Structurally immune.** It imports `TodaysTripRow` from `lib/carrier/board-view` — the server's own type — and casts, with no renaming layer to get wrong. |

Every other consumer of `/api/v1/carrier/dispatches` uses the correct names:
`TodayDispatches.tsx`, `DashboardMobile.tsx`, `DispatchPreview.tsx`,
`DispatchLoadModal.tsx`, `LoadDetailMobile.tsx`, and — notably — the superseded
`src/legacy/2026-05-21/DispatchList.tsx`, which reads `primaryDriverId` /
`scheduledDeparture` correctly. The drift was introduced by the rewrite, not
inherited by it.

**Driver-facing trip lists:** unaffected. `(driver)/home` and `(driver)/my-route`
are on the legacy `Route` model, where `scheduledDate` and `driverId` are the
genuine column names; likewise every `scheduledDate` in `apps/mobile`
(`/api/mobile/owner/routes`, `/api/mobile/driver/route`). The carrier
driver-facing endpoint `/api/mobile/carrier/driver/dispatches` maps
`scheduledDeparture` explicitly. `/carrier/driver/trips` was deleted in
quick-541.

---

## Reported, not changed

- **The "today and tomorrow plus in-progress" window is out of scope** and was
  left alone, as instructed. It behaves as documented: 12 `in_progress` trips
  are pinned in regardless of date, plus 2 scheduled for today/tomorrow. The
  page showed 14 here against the 15 reported, which is the local-midnight
  boundary of `dateFromResolved.setHours(0,0,0,0)`, not a defect. Worth a
  separate look only because 12 of 14 rows being months-old `in_progress` trips
  suggests the tenant has trips that were never completed — a data question, not
  a page one.
- **No DDL, no data changes.** The one server-side edit is an additive
  `_count` select.
