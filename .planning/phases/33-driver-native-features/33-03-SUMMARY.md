---
phase: 33-driver-native-features
plan: "03"
subsystem: mobile-offline
tags: [mmkv, netinfo, offline-queue, expo, react-native, mutation-queue]

# Dependency graph
requires:
  - phase: 33-01
    provides: background GPS, NetInfo, useBackgroundGPS hook
  - phase: 33-02
    provides: push notifications, driver layout fragment pattern
  - phase: 31-03
    provides: StatusUpdateButton, driverApi.updateLoadStatus
provides:
  - Offline mutation queue persisted to MMKV (offline-queue.ts)
  - Queue flusher with exponential backoff (queue-flusher.ts)
  - callOrQueue wrapper — transparent online/offline API calls
  - SyncStatusBar component — amber/blue/red sync feedback bar
  - useOfflineSync hook — NetInfo listener + auto-flush on reconnect
  - StatusUpdateButton upgraded to queue mutations when offline
affects: [34-driver-messaging, future-load-screens, future-hos-screens]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - callOrQueue pattern: check NetInfo → call online or enqueue offline, return null for deferred feedback
    - offline-first mutation queue: MMKV-backed array with pending/failed states and retry counting
    - reconnect flush: NetInfo false→true edge triggers automatic drain of pending queue

key-files:
  created:
    - apps/mobile/lib/offline-queue.ts
    - apps/mobile/lib/queue-flusher.ts
    - apps/mobile/lib/api-with-queue.ts
    - apps/mobile/components/shared/SyncStatusBar.tsx
    - apps/mobile/hooks/useOfflineSync.ts
  modified:
    - apps/mobile/components/driver/StatusUpdateButton.tsx
    - apps/mobile/app/(driver)/_layout.tsx

key-decisions:
  - "MMKV-backed queue array serialized as JSON for persistence across app restarts"
  - "callOrQueue returns null (not throws) when offline so callers can show deferred-save feedback"
  - "flushQueue stops on 401 (auth expired) and network errors rather than marking all as failed"
  - "SyncStatusBar mounted at driver layout level for app-wide offline visibility without per-screen wiring"
  - "retryFailed resets retryCount to 0 so backoff starts fresh on manual retry"

patterns-established:
  - "Offline mutation pattern: callOrQueue wraps any write API call to transparently defer when offline"
  - "SyncStatusBar + useOfflineSync: drop into any layout root for zero-config offline feedback"

# Metrics
duration: 2min 13s
completed: 2026-03-23
---

# Phase 33 Plan 03: Offline Mutation Queue Summary

**MMKV-backed offline mutation queue with NetInfo auto-flush, callOrQueue wrapper, and SyncStatusBar for load status updates when device has no connectivity**

## Performance

- **Duration:** 2min 13s
- **Started:** 2026-03-23T00:54:40Z
- **Completed:** 2026-03-23T00:56:53Z
- **Tasks:** 7
- **Files modified:** 7

## Accomplishments

- Offline mutation queue persisted to MMKV survives app restarts; stores type, endpoint, method, body, retryCount, and status per mutation
- Auto-flush on reconnect via NetInfo false→true edge detection in useOfflineSync; exponential backoff (1s/2s/4s) per retry before marking failed
- StatusUpdateButton now uses callOrQueue — shows "Saved offline" toast when queued, haptic feedback when synced immediately

## Task Commits

1. **Task 1: Offline queue types and storage** - `1f590bf` (feat)
2. **Task 2: Queue flusher with backoff** - `7517074` (feat)
3. **Task 3: callOrQueue API wrapper** - `b50e788` (feat)
4. **Task 4: StatusUpdateButton offline wiring** - `364423d` (feat)
5. **Task 5: SyncStatusBar component** - `a69db8d` (feat)
6. **Task 6: useOfflineSync hook** - `d70fc02` (feat)
7. **Task 7: SyncStatusBar in driver layout** - `3329669` (feat)

## Files Created/Modified

- `apps/mobile/lib/offline-queue.ts` - PendingMutation type + MMKV-backed offlineQueue object (getAll, enqueue, remove, markFailed, incrementRetry, counts)
- `apps/mobile/lib/queue-flusher.ts` - flushQueue iterates pending mutations sequentially, exponential backoff, stops on 401 or network error
- `apps/mobile/lib/api-with-queue.ts` - callOrQueue: check NetInfo, call online or enqueue offline, return null when deferred
- `apps/mobile/components/shared/SyncStatusBar.tsx` - Thin 32px bar with amber (offline), blue (syncing), red tappable (failed) states; hidden when all clear
- `apps/mobile/hooks/useOfflineSync.ts` - NetInfo subscriber, detects reconnect edge, calls doFlush, exposes isOnline/isSyncing/pendingCount/failedCount/retryFailed
- `apps/mobile/components/driver/StatusUpdateButton.tsx` - Replaced direct driverApi call with callOrQueue, handles null result with offline toast
- `apps/mobile/app/(driver)/_layout.tsx` - Added useOfflineSync + SyncStatusBar above Tabs navigator

## Decisions Made

- `callOrQueue` returns `null` rather than throwing when offline so callers get a clear signal to show "saved offline" without try/catch changes
- `flushQueue` stops immediately on 401 (auth expired) to prevent spamming expired tokens; network errors also break the loop for next reconnect
- `retryFailed` resets `retryCount` to 0 so exponential backoff restarts fresh on manual retry rather than jumping straight to 4s delays
- `SyncStatusBar` mounted at the driver layout root (above all tab screens) so it appears consistently without needing per-screen wiring

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Offline queue infrastructure is ready; future screens (HOS entry, incident report) can adopt callOrQueue with their respective mutation types
- SyncStatusBar + useOfflineSync can be reused in the owner layout if needed in a future phase
- Phase 34 (driver messaging) can build on this pattern for queued message sends

---
*Phase: 33-driver-native-features*
*Completed: 2026-03-23*
