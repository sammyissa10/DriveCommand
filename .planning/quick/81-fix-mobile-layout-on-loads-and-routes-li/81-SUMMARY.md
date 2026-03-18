---
phase: quick-81
plan: 01
subsystem: ui
tags: [mobile, responsive, tailwind, dark-mode, loads, routes]

# Dependency graph
requires: []
provides:
  - Mobile-friendly loads list with scrollable tab bar and origin/destination in mobile cards
  - Polished routes list search input with icon, dark-mode-safe status badges, consistent empty state
affects: [loads, routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Horizontally scrollable tab bar with overflow-x-auto + flex-nowrap + whitespace-nowrap
    - Status badge helper returns single combined class string (including dark: variants) rather than separate bgColor/textColor
    - Desktop table container: rounded-xl border border-border bg-card overflow-hidden shadow-sm with inner overflow-x-auto div

key-files:
  created: []
  modified:
    - src/components/loads/load-list.tsx
    - src/components/routes/route-list.tsx

key-decisions:
  - "getRouteStatusClasses refactored to return a single class string instead of { bgColor, textColor } object to simplify call sites and ensure dark mode variants are always applied together"

patterns-established:
  - "Tab bar mobile overflow: wrap in overflow-x-auto div, inner flex with flex-nowrap whitespace-nowrap, reduced padding px-3 sm:px-4 and text-xs sm:text-sm"
  - "Status badge helper: returns single template-literal string with light + dark variants, consumed as className={...classes}"

# Metrics
duration: 2min
completed: 2026-03-18
---

# Quick Task 81: Fix Mobile Layout on Loads and Routes List Pages

**Horizontally scrollable loads tab bar, origin/destination in mobile load cards, polished routes search input with icon, dark-mode status badges, and rounded-xl/shadow-sm desktop table containers matching trucks/drivers pattern**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-18T~00:19Z
- **Completed:** 2026-03-18T~00:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Loads tab bar now scrolls horizontally on mobile (no overflow clipping) with reduced padding and font size at narrow viewports
- Mobile load cards now show origin -> destination route info between customer/rate and date lines
- Routes search input upgraded to polished pattern with Search icon, rounded-lg, bg-card, focus ring (matches trucks/drivers)
- Routes status badges updated with dark mode variants (dark:bg-blue-900/30 dark:text-blue-400, dark:bg-emerald-900/30 dark:text-emerald-400)
- Both desktop table containers updated to rounded-xl + bg-card + shadow-sm, with overflow-x-auto on inner div
- Both empty states updated to rounded-xl border bg-card p-16 pattern with icon, title, and subtitle

## Task Commits

1. **Task 1: Fix loads list mobile layout** - `893a46b` (feat)
2. **Task 2: Fix routes list mobile layout and styling** - `549c568` (feat)

## Files Created/Modified

- `src/components/loads/load-list.tsx` - Scrollable tab bar, origin/destination mobile card line, rounded-xl containers
- `src/components/routes/route-list.tsx` - Polished search input, dark mode badges, refactored status helper, rounded-xl containers, MapPin empty state

## Decisions Made

- Refactored `getRouteStatusClasses` from returning `{ bgColor, textColor }` to a single class string — simplifies all call sites and ensures dark mode variants always travel together with light variants

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Loads and routes list pages now visually match trucks/drivers reference pattern
- No regressions introduced — filtering, sorting, and navigation all preserved

## Self-Check: PASSED

- src/components/loads/load-list.tsx - FOUND
- src/components/routes/route-list.tsx - FOUND
- .planning/quick/81-.../81-SUMMARY.md - FOUND
- Commit 893a46b - FOUND
- Commit 549c568 - FOUND
