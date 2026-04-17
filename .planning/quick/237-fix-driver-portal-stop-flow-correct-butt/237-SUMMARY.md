---
phase: quick-237
plan: 01
subsystem: driver-portal
tags: [driver-portal, carrier-ops, stop-flow, navigation, ux]
dependency_graph:
  requires: []
  provides: [driver-stop-flow-fixes]
  affects: [driver-portal, carrier-ops]
tech_stack:
  added: []
  patterns: [bypassDocumentCheck option pattern, dispatch priority query]
key_files:
  created: []
  modified:
    - apps/web/src/app/(driver)/actions/driver-routes.ts
    - apps/web/src/lib/carrier/stop-completion.ts
    - apps/web/src/components/driver/route-detail-readonly.tsx
    - apps/web/src/components/driver/driver-dispatch-card.tsx
    - apps/web/src/components/driver/driver-dashboard.tsx
    - apps/web/src/app/(driver)/my-route/page.tsx
decisions:
  - bypassDocumentCheck is hardcoded true in driver server action (role-gated), not passed from client
  - Navigation after stop completion handled in client event handler via window.open, not server
  - firstDeliveryStop computed server-side in getMyActiveDispatch to avoid extra round-trip from dashboard
metrics:
  duration: ~20 minutes
  completed: 2026-04-16
  tasks_completed: 4
  files_modified: 6
---

# Quick-237: Fix Driver Portal Stop Flow — Correct Button Labels, Google Maps Navigation, BOL/POD Bypass

Seven UX/correctness fixes across the driver portal stop completion flow: proper dispatch prioritization, intuitive button labels, automatic Google Maps navigation after stop completion, updated dashboard CTAs, and removal of document gates that were blocking drivers.

## Tasks Completed

| Task | Name | Commit |
|------|------|--------|
| 1 | Fix dispatch query priority, add firstDeliveryStop, bypassDocumentCheck | 9a4ee93 |
| 2 | Fix stop button labels, Google Maps navigation, tappable addresses | 8443b5c |
| 3 | Fix dashboard dispatch card CTA labels and navigation behavior | 6831dc7 |
| 4 | Remove debug console.log, verify TypeScript compilation | 22928ae |

## What Was Fixed

**Fix 1 — Dispatch query priority:** `getMyActiveDispatch` now runs two sequential queries — first tries `in_progress` (ordered by `actualDeparture desc`), then falls back to `planned` (ordered by `scheduledDeparture asc`). Drivers in the middle of a trip no longer get a different planned dispatch shown.

**Fix 2 — Stop-type-aware button labels:** Pending stops show "Mark Arrived". Arrived pickup stops show "Start Route" (Play icon). Arrived delivery/other stops show "Complete Stop" (CheckCircle icon).

**Fix 3 — Google Maps navigation on completion:** `handleComplete` in `StopActionButtons` auto-opens Google Maps after a successful stop completion — to first pending delivery stop (from pickup), or next pending stop by sequence (from delivery). fuel_stop/layover completions have no navigation.

**Fix 4 — Dashboard CTA labels:** `DriverDispatchCard` CTA changed from generic "Start Trip"/"Continue to Stops" to "Start Trip & Navigate" (planned) and "Begin Navigation" (in_progress). Both CTAs are now `<button>` with `useTransition` instead of `<Link>`.

**Fix 5 — BOL/POD bypass for drivers:** `completeStop` in `stop-completion.ts` accepts `options?: { bypassDocumentCheck?: boolean }`. The driver server action `completeCurrentStop` always passes `{ bypassDocumentCheck: true }` — role is enforced at the action layer via `requireRole([DRIVER])`. Owner portal calls remain unchanged.

**Fix 6 — Tappable addresses:** All facility address paragraphs in the stop timeline replaced with `<a>` tags linking to Google Maps directions (blue underlined, opens in new tab).

**Fix 7 — firstDeliveryStop in dispatch response:** `getMyActiveDispatch` now computes and returns `firstDeliveryStop` (first pending delivery stop) in its response. Dashboard CTA uses this to open Maps directly to the first delivery stop.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All modified files exist on disk. All 4 task commits verified in git log (9a4ee93, 8443b5c, 6831dc7, 22928ae). TypeScript compilation passes with zero errors in all modified source files (3 pre-existing e2e spec errors unrelated to this task).
