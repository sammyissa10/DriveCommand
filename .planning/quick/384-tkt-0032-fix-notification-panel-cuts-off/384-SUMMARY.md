---
phase: quick-384
plan: 01
subsystem: notifications
tags: [bug-fix, mobile-web, css, dvh, notifications]
dependency_graph:
  requires: []
  provides: [viewport-aware-notification-panel-height]
  affects: [driver-notification-panel, notification-center]
tech_stack:
  added: []
  patterns: [dvh-based max-height for mobile browser chrome]
key_files:
  created: []
  modified:
    - apps/web/src/components/driver/driver-notification-panel.tsx
    - apps/web/src/components/navigation/notification-center.tsx
decisions:
  - "Use max-h-[calc(100dvh-140px)] instead of max-h-[480px] — dvh adapts to mobile browser chrome (address bar, bottom nav), vh does not on iOS Safari"
  - "140px buffer = header (~56px) + dropdown offset (~8px) + bottom safe-zone (~76px)"
metrics:
  duration: "< 5 minutes"
  completed: "2026-05-19T18:09:03Z"
  tasks_completed: 2
  files_modified: 2
---

# Quick-384: Fix notification panel clips at bottom on mobile web [TKT-0032]

**One-liner:** Replaced hardcoded `max-h-[480px]` with `max-h-[calc(100dvh-140px)]` on both driver and owner notification panels so they never clip below the visible viewport on mobile web.

## What Was Done

Both notification panel components used a fixed `480px` max-height, which overflows the visible viewport on mobile web browsers (iOS Safari, Chrome Android) where the address bar and bottom navigation consume significant vertical space. The fix uses `dvh` (dynamic viewport height), which automatically adjusts as mobile browser chrome collapses or expands.

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/components/driver/driver-notification-panel.tsx` | `max-h-[480px]` → `max-h-[calc(100dvh-140px)]` on line 117 |
| `apps/web/src/components/navigation/notification-center.tsx` | `max-h-[480px]` → `max-h-[calc(100dvh-140px)]` on line 147 |

## Verification

- Zero occurrences of `max-h-[480px]` remain in `apps/web/src`
- Exactly 2 occurrences of `max-h-[calc(100dvh-140px)]` — one per panel
- `overflow-y-auto` confirmed present on both panel divs (unchanged)
- TypeScript errors present are all pre-existing (missing package declarations: framer-motion, nuqs, zustand) — zero new errors introduced by this CSS-only change

## Commit

`9916c9fc` — `fix(notifications): use dvh-based max-height so notification panel doesn't clip on mobile web [TKT-0032]`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/components/driver/driver-notification-panel.tsx` — modified and committed
- `apps/web/src/components/navigation/notification-center.tsx` — modified and committed
- Commit `9916c9fc` pushed to `origin master`
