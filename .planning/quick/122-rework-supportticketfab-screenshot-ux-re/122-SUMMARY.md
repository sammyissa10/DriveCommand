---
phase: quick-122
plan: 01
subsystem: ui
tags: [react-native, expo, support-ticket, screenshot, react-native-view-shot]

# Dependency graph
requires: []
provides:
  - Alert-based pre-capture screenshot flow in SupportTicketFAB
affects: [mobile-support-ticket, SupportTicketFAB]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-capture screenshot pattern: capture screen via captureScreen() BEFORE opening modal so the modal does not appear in the screenshot"

key-files:
  created: []
  modified:
    - apps/mobile/components/shared/SupportTicketFAB.tsx

key-decisions:
  - "Screenshot captured before bottom sheet opens so the form does not appear in the bug report image"
  - "Silent failure on captureScreen() error — screenshot is optional, form opens normally if capture fails"
  - "Removed expo-image-picker dependency from this component — camera/gallery picker no longer needed"

patterns-established:
  - "Pre-capture before modal: always call captureScreen() before setVisible(true) when screenshot context is the current screen"

# Metrics
duration: 8min
completed: 2026-03-28
---

# Quick 122: Rework SupportTicketFAB Screenshot UX Summary

**Alert-based pre-capture flow that screenshots the current screen before the support form opens, replacing the post-open camera/gallery picker**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-28T00:00:00Z
- **Completed:** 2026-03-28T00:08:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced FAB onPress `() => setVisible(true)` with `handleFabPress` that shows a 3-option Alert (Yes/No/Cancel)
- Yes path: `captureScreen({ format: 'jpg', quality: 0.8 })` runs before `setVisible(true)`, capturing the screen the user is looking at — not the form
- No path: opens bottom sheet normally without a screenshot
- Removed `handleAttachScreenshot` function, all `expo-image-picker` imports, and the in-form Attach Screenshot button
- Removed `Camera` icon import from lucide-react-native
- Kept screenshot thumbnail preview + remove (X) button in form unchanged
- Removed unused `attachRow`, `attachButton`, `attachButtonText` styles

## Task Commits

1. **Task 1: Rework FAB onPress to Alert-based screenshot capture flow** - `99f167b` (feat)

**Plan metadata:** see final commit

## Files Created/Modified
- `apps/mobile/components/shared/SupportTicketFAB.tsx` - Reworked screenshot UX: Alert pre-capture flow, removed in-form attachment button

## Decisions Made
- Silent failure on `captureScreen()` error so the form always opens even if screenshot capture fails
- Capture happens before `setVisible(true)` — this is the key ordering that ensures the form is not in the screenshot

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in unrelated FlashList usages across driver/owner screens were present before this task and are not related to changes made here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SupportTicketFAB screenshot UX is complete and clean
- `react-native-view-shot` (already installed at 4.0.3) is the only dependency for this feature

---
*Phase: quick-122*
*Completed: 2026-03-28*

## Self-Check: PASSED

- FOUND: apps/mobile/components/shared/SupportTicketFAB.tsx
- FOUND: .planning/quick/122-rework-supportticketfab-screenshot-ux-re/122-SUMMARY.md
- FOUND: commit 99f167b
