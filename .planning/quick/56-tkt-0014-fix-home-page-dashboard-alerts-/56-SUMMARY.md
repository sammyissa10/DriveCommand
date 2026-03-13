---
phase: quick-56
plan: 01
subsystem: ui
tags: [dashboard, notifications, navigation, bug-fix]

requires: []
provides:
  - "Truck document alerts in the notifications panel now link to /trucks/{truckId}"
affects: [dashboard, notifications-panel]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/app/(owner)/actions/dashboard.ts

key-decisions:
  - "One-line fix: changed href from '/trucks' to template literal with truck.id — truck variable already in scope in the checkDoc closure"

duration: 3min
completed: 2026-03-13
---

# Quick Task 56: TKT-0014 Fix Dashboard Truck Alerts href Summary

**Dashboard truck registration/insurance expiry alerts now navigate directly to /trucks/{truckId} instead of the all-trucks list page**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-13T00:00:00Z
- **Completed:** 2026-03-13T00:03:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed TKT-0014: truck document alerts (registration, insurance) now link to the specific truck's detail page
- `npx tsc --noEmit` passes with no type errors
- All other alert hrefs (driver, invoice, safety) remain unchanged

## Task Commits

1. **Task 1: Fix truck document alert href to include truck ID** - `557d6e5` (fix)

## Files Created/Modified
- `src/app/(owner)/actions/dashboard.ts` - Changed `href: '/trucks'` to `` href: `/trucks/${truck.id}` `` on line 214

## Decisions Made
- None - followed plan as specified. The `truck.id` was already in scope from the outer `for (const truck of truckDocAlerts)` loop, making this a trivial one-line change.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fix is complete and committed; no follow-up required
- Driver alerts remain correctly pointing to `/drivers/${doc.driverId}` — consistent pattern confirmed

---
*Phase: quick-56*
*Completed: 2026-03-13*
