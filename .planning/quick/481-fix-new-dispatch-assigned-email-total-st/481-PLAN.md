# Quick 481 — Fix "New Dispatch Assigned" email (DC-2026-00001)

Sending path: `trips.ts` (createDispatch/updateDispatch) → `after()` →
`sendDispatchAssignedNotification` in `src/lib/carrier/notifications.ts` →
`DispatchAssignedEmail` template in `src/emails/carrier/dispatch-assigned.tsx`.

## Bug 1 — Total Stops shows 0
`sendDispatchAssignedNotification` counted stops via `trip._count.stops`
(`stopCount: dispatchRaw._count.stops`). Stops belong to the **assigned load**
(`carrier_stops.load_id`), reached through `trip.carrierLoads[].stops[]`, so the
trip-relation count was 0/wrong at send time.

Fix: fetch `carrierLoads → stops → facility`, compute Total Stops from the load
stops, and add the itinerary to the email body (sequence, type, facility, city).
`carrier_stops` is `@@unique([dispatchId, sequenceOrder])`, so stops flatten
across loads and sort by `sequenceOrder`, then re-number 1..N for display.

## Bug 2 — Scheduled Departure wrong by ~5h (UTC vs local)
Departure was rendered with `toLocaleString('en-US', {…})` and **no `timeZone`**,
so it printed in the server zone (UTC) → "1:00 PM" for an 8:00 AM CDT trip.

Fix: render the stored instant (UTC in DB — unchanged) in the tenant's timezone
(`Tenant.timezone`) with `timeZoneName: 'short'` → "Jul 19, 2026, 8:00 AM CDT".
The dispatch-assigned template's only datetime field is the departure; audited
and fixed. (Other notification functions/templates with the same pattern are out
of scope — noted in the summary.)

## Tasks
1. `emails/carrier/dispatch-assigned.tsx` — add `stops: DispatchStopLine[]` prop
   + render an "Itinerary" section.
2. `lib/carrier/dispatch-assigned-email.ts` (new) — pure builders:
   `formatDispatchDateTime`, `buildDispatchStops`, `buildDispatchAssignedEmailData`.
3. `lib/carrier/notifications.ts` — fetch load stops + `tenant.timezone`, build
   props via the helper, fix the push-notification body.
4. Test (`src/lib/carrier/__tests__/dispatch-assigned-email.test.ts`) — 2 stops +
   8:00 AM America/Chicago departure: assert stopCount 2, ordered itinerary, and
   rendered time "8:00 AM CDT" (not "1:00 PM").

## Out of scope
DB storage of departure times (unchanged); other email templates.
