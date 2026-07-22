# Quick 481 — Summary

## What was broken (New Dispatch Assigned email, e.g. DC-2026-00001)
1. **Total Stops showed 0** even though the assigned load had 2 stops.
2. **Scheduled Departure rendered ~5h off** ("1:00 PM" for an 8:00 AM CDT trip).

## Sending path
`src/lib/carrier/trips.ts` (createDispatch / updateDispatch) → `after()` →
`sendDispatchAssignedNotification` (`src/lib/carrier/notifications.ts`) →
`DispatchAssignedEmail` (`src/emails/carrier/dispatch-assigned.tsx`).

## Root causes
- **Bug 1:** stop count came from `trip._count.stops`
  (`stopCount: dispatchRaw._count.stops`). Stops are attached to the **load**
  (`carrier_stops.load_id`, reached via `trip.carrierLoads[].stops[]`), so the
  trip-relation count was wrong/0 at send time — counting the wrong relation.
- **Bug 2:** the departure was rendered with `toLocaleString('en-US', {…})` and
  **no `timeZone`**, so it printed in the server's zone (UTC on Vercel). An
  8:00 AM CDT departure is stored as 13:00 UTC → printed "1:00 PM".

## Changes
| File | Change |
|------|--------|
| `emails/carrier/dispatch-assigned.tsx` | Added `stops: DispatchStopLine[]` prop + an "Itinerary" section (sequence, type, facility, city). |
| `lib/carrier/dispatch-assigned-email.ts` (new) | Pure builders: `formatDispatchDateTime` (tenant-tz + zone abbrev), `buildDispatchStops` (flatten load stops, sort by dispatch-wide `sequenceOrder`, re-number 1..N), `buildDispatchAssignedEmailData`. |
| `lib/carrier/notifications.ts` | Fetch `carrierLoads → stops → facility` and `tenant.timezone`; build props via the helper; push-notification body reuses the corrected count + departure string. |
| `src/lib/carrier/__tests__/dispatch-assigned-email.test.ts` (new) | 2-stop load + 8:00 AM America/Chicago departure → stopCount 2, ordered itinerary, "8:00 AM CDT" in both the built payload and the rendered HTML. |

## Behavior now
- **Total Stops** = count of stops on the assigned load(s); itinerary listed in
  order, e.g. `1. Pickup — Chicago Warehouse, Chicago` / `2. Delivery — Dallas DC, Dallas`.
- **Scheduled Departure** = "Jul 19, 2026, 8:00 AM CDT" (rendered in the tenant's
  timezone with the zone abbreviation). **DB storage is unchanged** (still the
  absolute UTC instant).

## Verification
- `npx vitest run` on the new test → **4/4 pass** (payload asserts + rendered-HTML asserts).
- `npx tsc --noEmit` → **0 errors**.

## Out of scope / follow-up
- Departure-time DB storage — untouched (absolute UTC instant).
- The dispatch-assigned template's only datetime field is the departure (audited).
- Other notification functions in `notifications.ts` (load-delivered,
  stop-completed, client pickup/delivered) render `appointmentStart` /
  `departedAt` / `new Date()` with the same no-`timeZone` pattern. They are
  different templates and out of scope here, but carry the same latent bug —
  worth a follow-up sweep to render them in the tenant timezone too.
