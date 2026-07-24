---
phase: quick-505
plan: 505
subsystem: ui
tags: [react, waypoints, route-form, vitest, form-state]

# Dependency graph
requires:
  - phase: quick-504
    provides: listRouteAssignableDrivers / routeDriverBlockedLabel driver selector (untouched by this task)
provides:
  - Pure removeWaypointById + canRemoveWaypoint helper for waypoint list mutation
  - Remove control rendered on every row (including first/last) on desktop New/Edit Route and mobile New Route
  - onQueryChange plumbing so manually typed addresses survive a key-driven remount
affects: [route-form.tsx, RouteCreateMobile.tsx, route edit page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure list-mutation helpers colocated with a `<name>.test.ts` Vitest file under src/lib/<domain>/"
    - "Optional onQueryChange callback pattern for exposing live input state to a parent above a keyed remount"

key-files:
  created:
    - apps/web/src/lib/routes/waypoint-list.ts
    - apps/web/src/lib/routes/waypoint-list.test.ts
  modified:
    - apps/web/src/components/shared/address-autocomplete.tsx
    - apps/web/src/components/routes/FacilityAddressSelect.tsx
    - apps/web/src/components/routes/route-form.tsx
    - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx

key-decisions:
  - "Endpoint promotion (first->PICKUP, last->DELIVERY) happens inside the pure helper, not in the component, so it's unit-testable without React"
  - "Reused the existing button classNames verbatim per-file (desktop vs ds mobile tokens) rather than introducing a shared button component, to stay in scope"

patterns-established:
  - "Row-level disabled controls stay visually present with an explanatory title/aria instead of being conditionally unmounted"

# Metrics
duration: ~20min
completed: 2026-07-24
---

# Quick Task 505: Cannot Delete Third Destination (TKT-0083) Summary

**Every waypoint row on New/Edit Route (desktop + mobile) now renders a remove control — previously the first and last rows (Origin/Destination) had no X at all, so a 3-row route's Destination row was undeletable.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-24
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- Root cause fixed: `{!isFirst && !isLast && (...)}` was hiding the entire remove-button cluster on endpoint rows in both `route-form.tsx` and `RouteCreateMobile.tsx`
- New pure `removeWaypointById`/`canRemoveWaypoint` helper (`apps/web/src/lib/routes/waypoint-list.ts`) handles removal + endpoint-type promotion, covered by 9 passing Vitest cases
- Fixed a secondary data-loss bug found while tracing: removing a row shifts later rows' FormData `name`, which remounts `AddressAutocomplete` (keyed `manual-${name}`) and used to reset typed text to `''`. `onQueryChange` now keeps `FacilityAddressSelect`'s `manualAddress` in sync with every keystroke so the remount restores the exact typed text.
- Disabled state at the 2-row floor stays visible with a title/aria (`"A route needs at least an origin and a destination"`) instead of disappearing
- Desktop and mobile behavior verified identical; route EDIT page (which shares `route-form.tsx`) gets the same fix automatically

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure waypoint removal helper + Vitest** - `8ba08160` (test)
2. **Task 2: Preserve manually typed addresses across field-name changes** - `d68f3b8d` (fix)
3. **Task 3: Render a remove control on every waypoint row (desktop + mobile)** - `3f498251` (fix)

## Files Created/Modified
- `apps/web/src/lib/routes/waypoint-list.ts` - Pure `removeWaypointById` + `canRemoveWaypoint` + `MIN_WAYPOINTS`
- `apps/web/src/lib/routes/waypoint-list.test.ts` - 9 Vitest cases (middle/first/last removal, 2-row floor, unknown clientId, no-mutation, stop-index contiguity)
- `apps/web/src/components/shared/address-autocomplete.tsx` - Added optional `onQueryChange` prop, fired on every keystroke and on select
- `apps/web/src/components/routes/FacilityAddressSelect.tsx` - Wired `onQueryChange` to keep `manualAddress` state in sync with typing
- `apps/web/src/components/routes/route-form.tsx` - `removeWaypoint` delegates to the helper; remove X now always rendered with computed title/aria
- `apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx` - Same change as desktop, mobile ds tokens preserved; endpoint label spans gained `min-w-0`

## Decisions Made
- None beyond what's captured in `key-decisions` above — plan executed as written.

## Deviations from Plan

None — plan executed exactly as written. Task 2 (the manually-typed-address preservation) was already scoped in the plan as a prerequisite for Task 3, not an unplanned deviation.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

N/A - quick task. No blockers. The reporter's exact repro (Add Stop once on `/routes/new`, delete row 3 "Destination (Delivery)") now works, promoting row 2 to Destination, with contiguous `stops_0_*` FormData indices preserved.

---
*Phase: quick-505*
*Completed: 2026-07-24*

## Self-Check: PASSED

All 7 files confirmed present on disk; all 3 task commits (8ba08160, d68f3b8d, 3f498251) confirmed in git log.

---

## Post-verification addition (2026-07-24)

During live browser verification the reporter (via Sammy) flagged that an *added* stop row
also rendered redundant **Scheduled Time** and **Notes** fields — route timing already lives in
`Route.scheduledDate` at the top of the form, and real per-stop appointment windows belong to the
carrier trip flow (`stops` table), not legacy routes. Removed the visible per-stop Scheduled Time +
Notes inputs on both desktop (`route-form.tsx`) and mobile (`RouteCreateMobile.tsx`). The hidden
`stops_<k>_scheduledAt` / `_notes` fields still submit (empty), so the createRoute/updateRoute
FormData contract is unchanged. `tsc --noEmit` 0 errors. Verified in browser: added stop now shows
only Type + Address.

- `4b730410` fix(quick-505): drop per-stop Scheduled Time + Notes from New Route stop rows

Not deployed, not pushed.
