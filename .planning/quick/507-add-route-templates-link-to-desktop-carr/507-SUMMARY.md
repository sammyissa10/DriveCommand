---
phase: quick-507
plan: 01
subsystem: ui
tags: [nav, sidebar, lucide-react, route-templates]

# Dependency graph
requires: []
provides:
  - Desktop sidebar "Route Templates" nav item linking to /carrier/templates
affects: [carrier-trips, route-templates]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - apps/web/src/components/Sidebar/index.tsx

key-decisions:
  - "Placed the new item in the RESOURCES section (not OPERATIONS) because OPERATIONS is already at its documented MAX 5 items; RESOURCES had room (4 -> 5)"
  - "Used the CalendarDays icon (matching the mobile-web owner-more-menu.tsx convention for the same /carrier/templates link) instead of reusing the Route icon, which already represents the legacy /routes item"
  - "Left the item ungated (no managerHasPermission wrapper), matching the existing ungated pattern used for Routes and Checklists, rather than inventing a new permission key not present in UserPermissions"

patterns-established: []

# Metrics
duration: 6min
completed: 2026-07-24
---

# Quick Task 507: Add Route Templates Link to Desktop Carrier Sidebar Summary

**Added a "Route Templates" nav item (CalendarDays icon, /carrier/templates) to the desktop carrier sidebar's Resources section and corrected a stale comment that mislabeled /carrier/templates as "Rate Sheets"**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-24T21:33:00Z
- **Completed:** 2026-07-24T21:39:31Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Desktop carrier owner/manager sidebar now surfaces a "Route Templates" link to /carrier/templates, fixing TKT-0085 (the page worked but was unreachable from the active desktop nav, so the Trip "Route Template" picker was permanently empty for desktop-only users)
- Fixed a misleading inline comment that incorrectly described /carrier/templates as "Rate Sheets" — it is actually the carrier Route Templates feature
- Confirmed the legacy "Routes" -> /routes nav item (a separate system) was left completely untouched
- Confirmed zero tsc errors in the touched file (and zero errors project-wide in this run)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Route Templates nav item and fix the mislabeled comment** - `1ca63942` (feat)
2. **Task 2: Type-check the touched file (no new errors)** - verification only, no file changes, no commit required

## Files Created/Modified
- `apps/web/src/components/Sidebar/index.tsx` - Added `CalendarDays` icon import, corrected the stale "Rate Sheets" comment near the legacy Routes item, and added a "Route Templates" item (href `/carrier/templates`) to the RESOURCES nav section

## Decisions Made
- Placed the new item in RESOURCES rather than OPERATIONS, respecting the documented `MAX 5 ITEMS` constraint on OPERATIONS (already full with Clients, Contracts, Routes, Loads, Trips)
- Used `CalendarDays` icon to match the existing mobile-web convention for the same link (owner-more-menu.tsx), avoiding reuse of the `Route` icon already claimed by the legacy Routes item
- Left the item ungated, consistent with the existing ungated Routes/Checklists items in this file, rather than inventing a new `keyof UserPermissions` value that doesn't exist

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc --noEmit` completed with exit code 0 and zero output (no errors at all in this run, including in the touched file) — no regressions versus the documented ~35-error baseline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TKT-0085 is resolved: desktop carrier owner/manager users can now navigate to /carrier/templates from the active sidebar to create route templates, which will populate the Trip "Route Template" picker
- No blockers or concerns

---
*Phase: quick-507*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: apps/web/src/components/Sidebar/index.tsx
- FOUND: .planning/quick/507-add-route-templates-link-to-desktop-carr/507-SUMMARY.md
- FOUND commit: 1ca63942
