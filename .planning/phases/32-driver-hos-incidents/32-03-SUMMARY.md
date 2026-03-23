---
phase: 32-driver-hos-incidents
plan: 03
subsystem: ui
tags: [react-native, expo, nativewind, tanstack-query, lucide-react-native, expo-haptics]

# Dependency graph
requires:
  - phase: 32-02
    provides: driverApi.getHOS, driverApi.updateHOSStatus, HOSData type, HOSEntry type, HOSStatus type
provides:
  - HOSStatusCard component (4 status cards with colors, active border, min 80px)
  - HOSDayBar component (24h proportional segments + red current-time marker)
  - HOSClock component (HH:MM:SS countdown, resets on refetch, red warning state)
  - hos.tsx full screen (status badge, 2x2 grid, day bar, clocks, confirmation modal)
affects: [32-04, any future HOS or driver-screen phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - onLayout to measure barWidth for pixel-accurate absolute positioning in RN
    - Modal bottom sheet pattern (transparent + animationType=slide + backdrop Pressable)
    - useQuery refetchInterval: 60_000 for auto-refreshing driver data
    - useEffect + setInterval for live countdown clocks that reset on prop change

key-files:
  created:
    - apps/mobile/components/driver/HOSStatusCard.tsx
    - apps/mobile/components/driver/HOSDayBar.tsx
    - apps/mobile/components/driver/HOSClock.tsx
  modified:
    - apps/mobile/app/(driver)/hos.tsx

key-decisions:
  - "HOSDayBar uses onLayout to get pixel width, then positions current-time marker with absolute left in pixels (no percentage cast)"
  - "Status card active state uses sky-500 (#0ea5e9) border per brand blue decision from CONTEXT.md"
  - "HOSClock resets totalSeconds state when hoursRemaining prop changes (handles 60s refetch)"
  - "Empty/gap segments in day bar rendered as transparent flex children to maintain proportional layout"

patterns-established:
  - "Bar chart pattern: use onLayout width + absolute pixel positioning for markers"
  - "Clock countdown pattern: useState for seconds + useEffect setInterval + reset on prop change via separate useEffect"

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 32 Plan 03: HOS Screen Summary

**Full HOS screen with 2x2 status card grid, 24-hour day bar with current-time marker, dual HH:MM:SS countdown clocks, and confirmation modal for duty status changes**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-23T05:44:48Z
- **Completed:** 2026-03-23T05:47:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Built HOSStatusCard (min 80px, 4 status colors, sky-500 active border, lucide icons)
- Built HOSDayBar (proportional flex segments, onLayout-based current-time red marker, hour labels)
- Built HOSClock (HH:MM:SS countdown via setInterval, resets on refetch, red warning when < 2h)
- Replaced stub hos.tsx with full screen: status badge + duration, 2x2 status grid, day bar, dual clocks, confirmation modal with from/to labels, optional notes TextInput, haptic + toast on success

## Task Commits

1. **Task 1: Build HOSStatusCard, HOSDayBar, HOSClock components** - `e1c75c5` (feat)
2. **Task 2: Build the main HOS screen with data fetching and status change** - `d6cf939` (feat)

## Files Created/Modified

- `apps/mobile/components/driver/HOSStatusCard.tsx` - Pressable status card, min 80px, 4 status configs, active dot indicator
- `apps/mobile/components/driver/HOSDayBar.tsx` - 32px proportional bar, flex segments for entries, onLayout pixel marker, hour labels
- `apps/mobile/components/driver/HOSClock.tsx` - HH:MM:SS countdown, useEffect reset, red warning state
- `apps/mobile/app/(driver)/hos.tsx` - Full HOS screen: useQuery with 60s refetch, loading/error states, status badge, 2x2 grid, day bar, countdown clocks, Modal confirmation with notes input

## Decisions Made

- **HOSDayBar marker positioning:** Used `onLayout` to get bar pixel width, then computed `left = ratio * width` in pixels for the current-time red line. This avoids RN percentage string casts and is more robust across layouts.
- **Active card border color:** Sky-500 (#0ea5e9) per CONTEXT.md brand blue decision. Individual status colors (slate/purple/green/blue) remain for icons/text only.
- **Clock reset on refetch:** `hoursRemaining` prop changes every 60s (refetch interval). A dedicated `useEffect([hoursRemaining])` resets `totalSeconds` so the clock syncs with server truth rather than drifting indefinitely.
- **Gap segments in day bar:** Unfilled time (before first entry, between entries) rendered as transparent flex children to maintain proportional layout without SVG.

## Deviations from Plan

None — plan executed exactly as written. The HOSDayBar rendering approach (View segments vs SVG) was left to Claude's discretion per plan; chose flex segments + onLayout marker for native feel and no extra dependencies.

## Issues Encountered

None. Pre-existing TypeScript errors in unrelated files (index.tsx router casting, storage.ts MMKV) were present before this plan and not introduced by these changes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- HOS screen complete; drivers can view and change duty status
- Phase 32 Plan 04 (Incident Reporting screen) can proceed immediately
- All HOSData fields from driverApi.getHOS are consumed (currentStatus, timeInCurrentStatus, todayEntries, hoursUntil14Limit, hoursUntil11DriveLimit)

---
*Phase: 32-driver-hos-incidents*
*Completed: 2026-03-23*
