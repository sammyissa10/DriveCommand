---
phase: quick-150
plan: 01
subsystem: mobile-driver
tags: [navigation, driver-portal, mobile, quick]
dependency_graph:
  requires: [apps/mobile/lib/navigation.ts]
  provides: [Start Navigation button on My Route screen]
  affects: [apps/mobile/app/(driver)/loads/my-route.tsx]
tech_stack:
  added: []
  patterns: [address-resolution by load status, useCallback for handler, Pressable disabled state]
key_files:
  modified:
    - apps/mobile/app/(driver)/loads/my-route.tsx
decisions:
  - "Resolved address as origin for DISPATCHED/ACCEPTED statuses; destination for all others (EN_ROUTE, IN_TRANSIT, PICKED_UP)"
  - "Button placed between header and KeyboardAvoidingView so it is always visible without scrolling"
metrics:
  duration: "~5 min"
  completed: "2026-04-04"
  tasks_completed: 1
  files_modified: 1
---

# Quick-150: Add Start Navigation Button to Driver My Route Screen Summary

**One-liner:** Start Navigation button on the My Route screen resolves the next active load's address (origin for pickup, destination for delivery) and opens external maps while switching to the Map tab.

## What Was Built

Added a "Start Navigation" button to `my-route.tsx` that:

- Filters loads to find the next non-done load (sorted by sequence)
- Resolves the correct address — origin when status is DISPATCHED or ACCEPTED (heading to pickup), destination for all other active statuses (EN_ROUTE, IN_TRANSIT, PICKED_UP)
- Opens the driver's preferred navigation app via the existing `openNavigation` helper in `lib/navigation.ts`
- Simultaneously navigates to the Map tab via `router.navigate('/(driver)/map')`
- Renders disabled and visually greyed out (50% opacity, surface background) when all loads are DELIVERED or CANCELLED

The button sits between the route header and the scrollable content, making it immediately accessible without scrolling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Start Navigation button to my-route.tsx | f30a85a | apps/mobile/app/(driver)/loads/my-route.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/mobile/app/(driver)/loads/my-route.tsx` — modified, exists
- Commit `f30a85a` — verified present in git log
- TypeScript compiled without errors (`tsc --noEmit` returned clean)
