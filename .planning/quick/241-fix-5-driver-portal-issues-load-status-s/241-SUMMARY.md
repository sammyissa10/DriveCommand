---
phase: quick-241
plan: 01
subsystem: driver-portal
tags: [bug-fix, stop-flow, carrier-ops, timestamps, navigation]
dependency_graph:
  requires: []
  provides: [load-in-transit-cascade, hydration-safe-timestamps, google-maps-next-stop]
  affects: [apps/web/src/lib/carrier/stop-completion.ts, apps/web/src/components/driver/route-detail-readonly.tsx, apps/web/src/app/(driver)/my-route/page.tsx]
tech_stack:
  added: []
  patterns: [useMounted hydration guard, pre-computed closure capture, idempotent updateMany]
key_files:
  created: []
  modified:
    - apps/web/src/lib/carrier/stop-completion.ts
    - apps/web/src/components/driver/route-detail-readonly.tsx
    - apps/web/src/app/(driver)/my-route/page.tsx
decisions:
  - "Used updateMany with status filter for in_transit cascade — idempotent, won't downgrade a load already past in_transit"
  - "Pre-calculated nextStop at render time instead of inside async startTransition callback to avoid stale closure"
  - "Added LocalTime component with useMounted guard — server renders ISO string, client renders local timezone"
  - "Removed CompletedRouteHistory section entirely from Route tab — clean UX, reduces page load"
metrics:
  duration: 15m
  completed: 2026-04-17
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 241: Fix 5 Driver Portal Issues — Load Status, Stop Flow, Navigation, Timestamps, Route Tab

One-liner: Fixed pickup stop in_transit cascade, stale-closure Google Maps nav, UTC timestamp hydration, and removed completed dispatch history from driver route tab.

## What Was Done

### Task 1 — Server-side fixes (commit 4ad109a)

**Fix 1: Load in_transit cascade on pickup completion**

Added a new block in `completeStop()` (`stop-completion.ts`) between the client pickup notification and the existing delivered cascade. When a pickup stop is completed, if the linked load is currently `pending`, `booked`, or `assigned`, it gets updated to `in_transit` via `updateMany` (idempotent — won't downgrade).

**Fix 5: Remove Completed Dispatches from Route tab**

Stripped `getMyDispatchHistory`, `CompletedRouteHistory`, and all associated try/catch state from `my-route/page.tsx`. Both the empty-state and active-dispatch branches no longer render the history section. Clean UX — drivers only see what's active.

**Fix 3: Dispatch query verification**

Reviewed `driver-routes.ts` — the two-step `findFirst` for `in_progress` then `planned`, both scoped by `primaryDriverId + orgId`, is already correct. Added a comment clarifying the priority logic for maintainers.

### Task 2 — Client component fixes (commit d34d7a9)

**Fix 2: Google Maps opens after every stop completion**

The old code computed `nextStop` inside the `startTransition` async callback. After the server action + `revalidatePath`, the closure held the old `allStops` snapshot where the just-completed stop still showed `status: 'pending'`, causing the wrong stop (or same stop) to be targeted.

Fix: Pre-calculate `nextStop` and `nextStopNavUrl` at render time in `StopActionButtons`, before any async work. The click handler uses the pre-captured values.

**Fix 4: Local timezone timestamps with hydration safety**

All 6 date rendering calls in `DispatchDetail` replaced with `<LocalTime>` component:
- `scheduledDeparture` (dispatch header)
- `actualDeparture` (dispatch header)
- `appointmentStart` (per-stop)
- `appointmentEnd` time portion (per-stop)
- `arrivedAt` (per-stop)
- `departedAt` (per-stop)

`LocalTime` uses a `useMounted` hook: on server it renders a plain ISO string (avoids hydration mismatch), on client it renders `toLocaleString` with device timezone. Format: `MMM D, YYYY, H:MM AM/PM`.

## Verification

- `tsc --noEmit` passes (zero new errors; 3 pre-existing e2e Playwright type errors unrelated to this work)
- `grep -rn "in_transit" stop-completion.ts` shows the new `updateMany` cascade
- `grep -rn "CompletedRouteHistory" my-route/page.tsx` returns nothing
- `grep -rn "toLocaleString" route-detail-readonly.tsx` returns only internal helpers (formatLocalTime) and number formatter — no raw date calls
- `grep -c "LocalTime" route-detail-readonly.tsx` returns 9 (1 definition + 6 JSX usages + 2 within definition)
- `nextStop` pre-calculation is at render-time (line 245), outside any onClick handler

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/stop-completion.ts` — modified, in_transit block added
- `apps/web/src/components/driver/route-detail-readonly.tsx` — modified, LocalTime + pre-calculated nextStop
- `apps/web/src/app/(driver)/my-route/page.tsx` — modified, history removed
- Commit 4ad109a exists
- Commit d34d7a9 exists
