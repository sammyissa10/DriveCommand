---
phase: 19-multi-stop-routes
plan: 02
subsystem: ui
tags: [react, forms, stops, timeline, formdata, address-autocomplete]

requires:
  - phase: 19-01
    provides: [RouteStop table, routeStopSchema, stop CRUD in server actions]
provides:
  - Stop editor in route-form.tsx with add/remove/reorder controls and AddressAutocomplete per stop
  - Stop timeline in route-detail.tsx with position badges, type labels, and status badges (PENDING/ARRIVED/DEPARTED)
  - initialStops prop wired from route-page-client.tsx through route-edit-section.tsx to route-form.tsx
  - stops type added to RoutePageClientProps and RouteEditSectionProps
affects: [route-form, route-detail, route-page-client, route-edit-section]

tech-stack:
  added: []
  patterns:
    - StopDraft client state with clientId for stable React keys, index for FormData keys
    - Hidden index-keyed fields (stops_N_type/scheduledAt/notes) alongside named AddressAutocomplete (stops_N_address)
    - stops_submitted sentinel hidden field distinguishes empty-stops from no-stops-section on server
    - StopStatusBadge inline component for PENDING/ARRIVED/DEPARTED color coding

key-files:
  created: []
  modified:
    - src/components/routes/route-form.tsx
    - src/components/routes/route-detail.tsx
    - src/components/routes/route-edit-section.tsx
    - src/app/(owner)/routes/[id]/route-page-client.tsx

key-decisions:
  - "Address field uses AddressAutocomplete with name=stops_N_address (not hidden + state-only) so form submit captures typed-in values even without map selection"
  - "Up/down reorder buttons (not drag-and-drop) per locked decision from research phase"
  - "Flat FormData key pattern stops_N_address maintained from Plan 01 locked decision"
  - "StopStatusBadge defined inline in route-detail.tsx — not exported, not a separate file — keeps it colocated with usage"
  - "stops? optional on Route interface in route-detail.tsx — routes without stops still render correctly (timeline section conditionally hidden)"

patterns-established:
  - "Stop card with absolute-positioned position badge (-left-3) using primary background for visual hierarchy"
  - "Timeline uses ol + li with flex gap-3 items-start layout: position circle + content block"

duration: 2min
completed: 2026-02-27
---

# Phase 19 Plan 02: Dispatcher UI (Stop Editor + Stop Timeline) Summary

**Stop editor with AddressAutocomplete per stop, up/down reorder, flat FormData serialization in route-form.tsx; stop timeline with position badges and PENDING/ARRIVED/DEPARTED status badges in route-detail.tsx; initialStops wired for edit-mode pre-population.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T05:59:58Z
- **Completed:** 2026-02-27T06:01:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Dispatcher can add PICKUP/DELIVERY stops with AddressAutocomplete, scheduled time, notes, and reorder them up/down during route create and edit
- Route detail page shows stop timeline ordered by position with type label, status badge (PENDING/ARRIVED/DEPARTED), scheduled/arrived/departed timestamps, and optional notes
- Edit mode pre-populates existing stops from the route's `stops` array via `initialStops` prop chain: `getRoute` -> `page.tsx` -> `route-page-client.tsx` -> `route-edit-section.tsx` -> `route-form.tsx`

## Task Commits

Each task was committed atomically:

1. **Task 1: Stop editor in route-form.tsx** - `0505f49` (feat)
2. **Task 2: Stop timeline in route-detail.tsx + data plumbing** - `f026f7f` (feat)

## Files Created/Modified

- `src/components/routes/route-form.tsx` - StopDraft interface, useState<StopDraft[]>, add/remove/moveUp/moveDown/updateStop helpers, stops_submitted hidden field, hidden index-keyed fields, stop card UI with AddressAutocomplete, type select, datetime-local, notes input, position badge, reorder/remove buttons
- `src/components/routes/route-detail.tsx` - RouteStop interface, stops? on Route, StopStatusBadge component, Stops timeline section between Route Details and Assigned Driver cards
- `src/components/routes/route-edit-section.tsx` - Added stops? to route prop type, passes initialStops={route.stops} to RouteForm
- `src/app/(owner)/routes/[id]/route-page-client.tsx` - Added stops? array to route type in RoutePageClientProps

## Decisions Made

- Address field on stop cards uses `name=stops_${idx}_address` directly on `AddressAutocomplete` (not hidden fields + state-only pattern). This ensures the value is submitted even if the user typed an address without selecting from the autocomplete dropdown.
- `StopStatusBadge` is a local function in route-detail.tsx (not exported) — keeps it colocated with its only consumer and avoids creating a new file for a small helper.
- `stops?` is optional on all interfaces — routes without stops render correctly in view mode (timeline section hidden) and create mode (empty state shown).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled cleanly with no errors (`npx tsc --noEmit` passed).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dispatcher UI complete: stop editor (create/edit) and stop timeline (view) both functional
- Stop data round-trips correctly: create with stops -> view stops in timeline -> edit stops pre-populated
- Ready for Plan 03: driver app active-stop view (driver sees their current stop, can mark arrived/departed)

---
*Phase: 19-multi-stop-routes*
*Completed: 2026-02-27*
