---
phase: 34
plan: "02"
subsystem: mobile-messaging
tags: [mobile, messaging, push-notifications, real-time, unread-badge]
dependency_graph:
  requires: [34-01, 33-02]
  provides: [driver-messaging-screen, unread-badge, message-polling]
  affects: [apps/mobile, apps/web/api, packages/api-client]
tech_stack:
  added: []
  patterns: [MMKV-last-read-tracking, setInterval-polling, useFocusEffect-mark-read]
key_files:
  created:
    - apps/web/src/app/api/mobile/driver/messages/unread-count/route.ts
    - apps/web/src/app/api/mobile/driver/messages/mark-read/route.ts
  modified:
    - packages/api-client/src/driver.ts
    - apps/mobile/app/(driver)/messages.tsx
    - apps/mobile/app/(driver)/_layout.tsx
decisions:
  - "Used MMKV client-side last-read timestamp instead of DB readAt field — avoids schema migration, unread count computed as non-driver messages newer than stored timestamp"
  - "Unread count polling uses ?since= query param matching MMKV stored timestamp for accuracy"
metrics:
  duration: "237s (~4 min)"
  completed: "2026-03-25"
  tasks_completed: 6
  files_modified: 5
---

# Phase 34 Plan 02: Driver Messaging Screen Summary

Driver messaging screen with 30s polling, unread badge on Messages tab, mark-read-on-focus using MMKV client-side timestamp tracking.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add unread-count and mark-read REST endpoints | fc36a2e | unread-count/route.ts, mark-read/route.ts |
| 2 | Extend api-client with getUnreadCount, markMessagesRead | 0abed29 | packages/api-client/src/driver.ts |
| 3 | Add polling + mark-read-on-focus to messages screen | 8c9f5ae | apps/mobile/app/(driver)/messages.tsx |
| 4 | Add unread badge to Messages tab in driver layout | 356814e | apps/mobile/app/(driver)/_layout.tsx |
| 5 | Send message functionality | (pre-existing in messages.tsx) | — |
| 6 | Push notification deep-link to messages | (pre-existing in root _layout.tsx) | — |

## What Was Built

**REST Endpoints (2 new sub-routes):**
- `GET /api/mobile/driver/messages/unread-count?since=<ISO>` — counts non-driver messages in driver's load conversations newer than the `since` timestamp. Defaults to last 7 days if no param.
- `POST /api/mobile/driver/messages/mark-read` — acknowledges read state; actual tracking is client-side via MMKV.

**API Client extensions:**
- `driverApi.getUnreadCount(token, since?)` — calls unread-count endpoint
- `driverApi.markMessagesRead(token)` — calls mark-read endpoint

**Messages Screen updates:**
- 30-second polling interval via `setInterval`
- `useFocusEffect` marks all read on screen focus by storing current ISO timestamp in MMKV under `messages_last_read_at`
- Best-effort server acknowledgement via `markMessagesRead`

**Driver Layout (tab bar):**
- `MessageTabIcon` component renders `MessageSquare` with red badge overlay when `unreadCount > 0`
- Polls unread count every 30s using MMKV `lastReadAt` as `?since=` param
- Re-fetches unread count on `AppState` foreground resume
- Badge shows count capped at `99+`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Schema gap] FleetMessage has no readAt/recipientId fields**
- **Found during:** Task 1
- **Issue:** Plan assumed DB-level read tracking via `readAt` and `recipientId`/`isBroadcast` fields, but `FleetMessage` schema has neither.
- **Fix:** Used MMKV client-side last-read timestamp. `getUnreadCount` endpoint accepts `?since=` query param; client passes stored `messages_last_read_at` value. Avoids DB schema migration entirely.
- **Files modified:** unread-count/route.ts, messages.tsx, _layout.tsx
- **Impact:** Functionally equivalent — unread count resets correctly when driver views messages. Cross-device sync of read state not supported (acceptable for mobile-only driver app).

**2. [Rule 1 - Bug] Invalid `listeners` prop on Tabs.Screen**
- **Found during:** Task 4
- **Issue:** Expo Router `Tabs.Screen` doesn't support `listeners` prop (React Navigation API, not available in Expo Router's typed interface).
- **Fix:** Removed `listeners`; badge clears naturally after messages screen marks all read via MMKV and next 30s poll fires.
- **Files modified:** apps/mobile/app/(driver)/_layout.tsx

**3. [Rule 2 - Pre-existing] Tasks 5 and 6 already implemented**
- **Found during:** Review
- **Task 5** (send message + optimistic append + error handling) was fully implemented in the existing messages.tsx from a prior session.
- **Task 6** (push notification deep-link `data.screen === 'messages'`) was already implemented in root `_layout.tsx`.
- No action needed — both verified complete.

## Self-Check: PASSED
