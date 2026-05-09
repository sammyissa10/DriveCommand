---
phase: quick-239
plan: "01"
subsystem: driver-portal
tags: [stop-state-machine, navigation, ux, driver-workflow]
dependency_graph:
  requires: []
  provides: [stop-state-machine-ui]
  affects: [driver-portal-my-route]
tech_stack:
  added: []
  patterns: [local-state-for-navigation-tracking, state-machine-helper-function]
key_files:
  modified:
    - apps/web/src/components/driver/route-detail-readonly.tsx
decisions:
  - "navigatingStopId lives in DispatchDetail (not StopActionButtons) so all stops can react to it"
  - "First pending pickup skips Begin Navigation — driver is already at pickup loading"
  - "Complete Stop auto-navigates to next pending stop by sequenceOrder (not stopType-based)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-17T20:53:09Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 239: Fix Driver Portal Stop State Machine Summary

## One-liner
4-state stop machine (begin_navigation/mark_arrived/complete_stop/start_route) with navigatingStopId local state and auto Google Maps open.

## What Was Built

Refactored `route-detail-readonly.tsx` to implement the correct driver stop workflow. Previously all pending stops showed "Mark Arrived" immediately — now drivers go through the proper sequence: Begin Navigation → Mark Arrived → Complete Stop.

### State Machine

Added `getStopAction()` helper that returns one of 5 actions:

| Stop State | Condition | Action |
|---|---|---|
| `completed` | — | `'completed'` (no button) |
| `arrived` + pickup | — | `'start_route'` (green, Play icon) |
| `arrived` + delivery | — | `'complete_stop'` (emerald, CheckCircle) |
| `pending` + first pending + pickup | — | `'mark_arrived'` (driver already there) |
| `pending` + navigatingStopId matches | — | `'mark_arrived'` ("You're on your way...") |
| `pending` (all other) | — | `'begin_navigation'` (blue, Navigation icon) |

### Key Behaviors

- **Begin Navigation**: Opens Google Maps (`window.open`), sets `navigatingStopId` — no server action needed
- **Mark Arrived**: Calls `arriveAction`, clears `navigatingStopId`; shows "You're on your way..." hint when actively navigating
- **Complete Stop / Start Route**: Calls `completeAction`, then auto-opens Google Maps to next pending stop (by `sequenceOrder`) and sets it as navigating
- **Navigating stop circle**: Pulses blue (`animate-pulse`) to visually indicate in-transit state
- **All buttons**: Full-width (`w-full justify-center`) for better touch targets

### State

`navigatingStopId: string | null` lives in `DispatchDetail` so all stops react to the single navigating stop. Only one stop can be "navigating" at a time.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created/modified:
- `apps/web/src/components/driver/route-detail-readonly.tsx` — FOUND

Commits:
- `506575b` feat(quick-239): implement stop state machine in route-detail-readonly — FOUND

TypeScript: zero errors in application code (`cd apps/web && npx tsc --noEmit` — only 3 pre-existing e2e test errors unrelated to this change).

## Self-Check: PASSED
