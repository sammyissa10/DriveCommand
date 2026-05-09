---
phase: quick-229
plan: 01
subsystem: notifications / carrier-ops
tags: [push-notifications, carrier-ops, after-pattern, expo, fleet-messages]
dependency_graph:
  requires: [send-push.ts, prisma PushToken model, expo-server-sdk]
  provides: [sendPushToOrg, DeviceNotRegistered cleanup, dispatch push events, fleet message push events]
  affects: [carrier/notifications.ts, carrier/dispatches.ts, mobile fleet message routes, owner fleet-messages actions]
tech_stack:
  added: [sendPushToOrg function]
  patterns: [after() for all push sends, DeviceNotRegistered token cleanup, sendPushToOrg for org-wide broadcasts]
key_files:
  created: []
  modified:
    - apps/web/src/lib/notifications/send-push.ts
    - apps/web/src/lib/carrier/notifications.ts
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
    - apps/web/src/app/(owner)/actions/fleet-messages.ts
decisions:
  - sendPushToOrg uses User join (tenantId + isActive + optional role) instead of N+1 loop over driver IDs
  - DeviceNotRegistered cleanup uses per-token try/catch so cleanup failures never block delivery
  - dispatch_assigned push runs inside the existing after() context (no second after() needed)
  - dispatch_in_progress push wraps with its own after() since transitionDispatchStatus is called directly from API routes
metrics:
  duration: ~4 minutes
  completed: 2026-04-17
  tasks_completed: 3
  files_modified: 6
---

# Phase quick-229 Plan 01: Wire Carrier Ops Events to Driver Push Notifications Summary

Push notifications wired into 3 carrier event trigger points using after() pattern, with DeviceNotRegistered token cleanup and a new sendPushToOrg helper for efficient broadcast delivery.

## What Was Built

### Task 1: Enhanced send-push.ts
- `sendPushToUser` now tracks receipt indexes against sent messages and deletes stale `PushToken` rows on `DeviceNotRegistered` errors
- New `sendPushToOrg(orgId, notification, options?)` function for org-wide push with tenant isolation via `User.tenantId` join
- `sendPushToOrg` supports an optional `role` filter (e.g. `{ role: 'DRIVER' }`) so broadcasts only reach drivers
- Both functions wrap cleanup in try/catch — cleanup failures never propagate or block delivery

### Task 2: Dispatch Event Push Sends
- `notifications.ts` (`sendDispatchAssignedNotification`): After in-app notification is created, queries `CarrierDriver.userId` and calls `sendPushToUser` with title "New Dispatch Assigned", body includes dispatch number + stop count + departure time — runs inside the existing `after()` context from dispatches.ts callers
- `dispatches.ts` (`transitionDispatchStatus`): On `planned → in_progress`, queries driver userId and wraps `sendPushToUser` in `after()` with title "Trip Started", body includes dispatch number

### Task 3: Fleet Message Push Sends — after() Conversion
All 4 fleet message creation points converted from `void sendPushToUser(...)` to `after()`:

| File | Change |
|------|--------|
| `route.ts` POST broadcast | `sendPushToOrg` with DRIVER role filter (replaces N+1 driver loop) |
| `route.ts` POST targeted | `after(() => sendPushToUser(...))` |
| `[recipientId]/route.ts` POST broadcast | `sendPushToOrg` with DRIVER role filter |
| `[recipientId]/route.ts` POST targeted | `after(() => sendPushToUser(...))` |
| `fleet-messages.ts` load reply | `after(() => sendPushToUser(...))` |
| `fleet-messages.ts` route reply | `after(() => sendPushToUser(...))` |

Title standardized to "New Message from Dispatcher" across all fleet message points.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` — zero type errors in source files
- `grep -rn "void sendPushToUser" apps/web/src/app/api/mobile/owner/fleet/messages/ apps/web/src/app/(owner)/actions/fleet-messages.ts` — zero matches
- `DeviceNotRegistered` cleanup confirmed in send-push.ts (lines 63 and 153)
- `after()` wrapping confirmed in all 3 dispatch/fleet message trigger points
- `sendPushToOrg` exported and used in broadcast paths

## Commits

| Hash | Message |
|------|---------|
| 0c3704e | feat(quick-229): enhance send-push with DeviceNotRegistered cleanup and sendPushToOrg |
| f7140f3 | feat(quick-229): wire push notifications to dispatch-assigned and in_progress events |
| 3a06670 | fix(quick-229): convert fleet message push sends from void fire-and-forget to after() |

## Self-Check: PASSED

Files confirmed present:
- apps/web/src/lib/notifications/send-push.ts — FOUND
- apps/web/src/lib/carrier/notifications.ts — FOUND
- apps/web/src/lib/carrier/dispatches.ts — FOUND
- apps/web/src/app/api/mobile/owner/fleet/messages/route.ts — FOUND
- apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts — FOUND
- apps/web/src/app/(owner)/actions/fleet-messages.ts — FOUND

Commits confirmed: 0c3704e, f7140f3, 3a06670 — all present in git log.
