---
phase: quick-259
plan: 01
subsystem: web/navigation
tags: [z-index, leaflet, notification, header, stacking-context]
dependency_graph:
  requires: []
  provides: [notification-dropdown-above-map]
  affects: [owner-shell, notification-center]
tech_stack:
  added: []
  patterns: [z-[1001] stacking context above Leaflet map tiles]
key_files:
  modified:
    - apps/web/src/components/navigation/owner-shell.tsx
    - apps/web/src/components/navigation/notification-center.tsx
decisions:
  - Use z-[1001] to match Leaflet tile z-index 400+ with headroom for map controls
metrics:
  duration: 3m
  completed: 2026-04-19
  tasks_completed: 1
  files_changed: 2
---

# Phase quick-259: Fix Notification Dropdown Z-Index on Live Map Summary

**One-liner:** Added `relative z-[1001]` to owner shell header and upgraded NotificationCenter panel from `z-50` to `z-[1001]` so the notification dropdown renders above Leaflet map tiles.

## Tasks Completed

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Add z-[1001] to header and notification dropdown panel | ad48a29 |

## What Was Done

The notification bell dropdown was being hidden behind the Leaflet map on `/owner/live-map` because:

1. The `<header>` in `owner-shell.tsx` had no z-index, so it didn't establish a positioned stacking context — child elements (including the notification bell with `z-[1001]`) couldn't stack above the map.
2. The `NotificationCenter` panel had `z-50` (z-index: 50), which is far below Leaflet tile layer z-index 400+.

**Fix:**
- `owner-shell.tsx` line 22: Added `relative z-[1001]` to the header's className to establish a positioned stacking context sitting above the Leaflet map.
- `notification-center.tsx` line 146: Changed `z-50` to `z-[1001]` on the outer div to match the bell wrapper's stacking level.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/components/navigation/owner-shell.tsx` — contains `relative z-[1001]`
- `apps/web/src/components/navigation/notification-center.tsx` — contains `z-[1001]`
- Commit ad48a29 exists
- TypeScript errors found are pre-existing in e2e test files, unrelated to these changes
