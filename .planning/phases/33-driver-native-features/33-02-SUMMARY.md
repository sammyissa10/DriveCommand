---
phase: 33-driver-native-features
plan: "02"
subsystem: notifications
tags: [expo-notifications, expo-server-sdk, push-tokens, prisma, react-native, mmkv]

# Dependency graph
requires:
  - phase: 30-mobile-auth
    provides: Bearer token auth — validateMobileToken utility used by push-tokens endpoint
  - phase: 29-monorepo-setup
    provides: Turborepo monorepo — apps/web + apps/mobile structure
  - phase: 33-01
    provides: Driver layout with useAuthContext and MMKV kvStorage

provides:
  - PushToken Prisma model (userId, token, platform, unique per user+platform)
  - POST /api/push-tokens endpoint (upsert by userId+platform)
  - sendPushToUser utility (expo-server-sdk, chunked delivery, best-effort)
  - Push notifications on fleet message send + load dispatch
  - registerPushToken hook (permission request + token registration)
  - Notification tap deep-linking to messages/loads/documents screens
  - NotificationPermissionModal (first-login, MMKV-gated)

affects: [33-03, 34-driver-messaging, 35-driver-documents, future-notification-phases]

# Tech tracking
tech-stack:
  added:
    - expo-server-sdk (Expo push API for FCM + APNs delivery)
  patterns:
    - Fire-and-forget push: void sendPushToUser() in server actions — never blocks request
    - Best-effort delivery: push errors logged but never thrown
    - MMKV-gated modals: shouldShowNotificationModal() reads flag before showing
    - One token per platform per user: @@unique([userId, platform]) upsert pattern

key-files:
  created:
    - apps/web/src/app/api/push-tokens/route.ts
    - apps/web/src/lib/notifications/send-push.ts
    - apps/mobile/hooks/usePushNotifications.ts
    - apps/mobile/components/shared/NotificationPermissionModal.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/(owner)/actions/fleet-messages.ts
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/mobile/hooks/useAuth.ts
    - apps/mobile/app/_layout.tsx
    - apps/mobile/app/(driver)/_layout.tsx

key-decisions:
  - "Used db push instead of migrate dev — schema drift from prior phases makes migrate dev fail; db push syncs directly"
  - "void sendPushToUser() in server actions — push notifications are best-effort, never block user-facing operations"
  - "One token per (userId, platform) with upsert — avoids stale token accumulation when device token rotates"
  - "NotificationPermissionModal in driver layout with 1.2s delay — gives dashboard time to render before interrupting"

patterns-established:
  - "Push sender pattern: sendPushToUser(userId, {title, body, data}) — used everywhere push delivery is needed"
  - "MMKV-gated modals: check flag before showing, write flag on any user interaction (allow or dismiss)"

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 33 Plan 02: Push Notifications Summary

**Expo push notification system: PushToken table, /api/push-tokens endpoint, sendPushToUser utility, fleet message + load dispatch triggers, registerPushToken hook, deep-link tap handler, and first-login permission modal**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-23T15:46:22Z
- **Completed:** 2026-03-23T15:52:15Z
- **Tasks:** 7
- **Files modified:** 10

## Accomplishments
- Full Expo push notification pipeline: backend token storage, delivery utility, trigger points
- Fleet message and load dispatch now send real-time push notifications to drivers
- Permission modal shown on first login with MMKV-gated suppression
- Notification taps deep-link to correct screens in the driver app

## Task Commits

Each task was committed atomically:

1. **Task 1: PushToken Prisma schema** - `4febcb6` (feat)
2. **Task 2: POST /api/push-tokens endpoint** - `9d02bde` (feat)
3. **Task 3: expo-server-sdk + sendPushToUser utility** - `8387350` (feat)
4. **Task 4: Wire push to fleet messaging + load dispatch** - `5301661` (feat)
5. **Task 5: registerPushToken hook + login wiring** - `c9f3b93` (feat)
6. **Task 6: Notification tap handler in root layout** - `015a079` (feat)
7. **Task 7: NotificationPermissionModal** - `925907b` (feat)

**Auto-fixes:** `a90a3a1` (fix: Zod v4 + router type errors)

## Files Created/Modified
- `apps/web/prisma/schema.prisma` - Added PushToken model + User.pushTokens relation
- `apps/web/src/app/api/push-tokens/route.ts` - POST endpoint for token registration (upsert)
- `apps/web/src/lib/notifications/send-push.ts` - sendPushToUser: expo-server-sdk delivery utility
- `apps/web/src/app/(owner)/actions/fleet-messages.ts` - fire-and-forget push after sendOwnerReply
- `apps/web/src/app/(owner)/actions/loads.ts` - fire-and-forget push after dispatchLoad
- `apps/mobile/hooks/usePushNotifications.ts` - registerPushToken: permission + token POST
- `apps/mobile/hooks/useAuth.ts` - Calls void registerPushToken(token) after login
- `apps/mobile/app/_layout.tsx` - setNotificationHandler + deep-link tap listener
- `apps/mobile/app/(driver)/_layout.tsx` - NotificationPermissionModal wired in
- `apps/mobile/components/shared/NotificationPermissionModal.tsx` - First-login permission modal

## Decisions Made
- Used `db push` instead of `migrate dev` — migration history drift from previous phases prevents `migrate dev` from running; `db push` applies schema changes directly to the database
- `void sendPushToUser()` pattern — push delivery is fire-and-forget in all server actions; errors are logged but never surfaced to the user
- `@@unique([userId, platform])` upsert — prevents token accumulation when Expo rotates tokens; always keeps latest token per device type
- Notification permission modal uses 1.2s delay — allows dashboard to render before interrupting the user with a system dialog

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod v4 .errors → .issues API**
- **Found during:** Post-implementation TypeScript check
- **Issue:** Zod v4 renamed `.errors` to `.issues` on ZodError; `.errors` property does not exist
- **Fix:** Changed `parsed.error.errors[0]` to `parsed.error.issues[0]`
- **Files modified:** `apps/web/src/app/api/push-tokens/route.ts`
- **Verification:** `npx tsc --noEmit` passes with no errors in apps/web
- **Committed in:** `a90a3a1`

**2. [Rule 1 - Bug] Fixed Expo Router typed route errors for notification deep-links**
- **Found during:** Post-implementation TypeScript check on apps/mobile
- **Issue:** Expo Router typed routes don't include `/(driver)/messages` etc. in the generated type at compile time, causing TS2345 errors
- **Fix:** Added `as any` cast on push path strings via local `push` helper
- **Files modified:** `apps/mobile/app/_layout.tsx`
- **Verification:** No new TypeScript errors introduced (pre-existing errors remain)
- **Committed in:** `a90a3a1`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — type/API correctness)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered
- `prisma migrate dev` blocked by migration history drift accumulated from prior phases — resolved by using `db push` (same approach used in Phase 32-01)

## User Setup Required
None - no external service configuration required beyond what was set up in prior phases. Expo push notifications use the existing Expo project configured in app.json.

## Next Phase Readiness
- Push token infrastructure complete — any future notification triggers can call `sendPushToUser(userId, {...})`
- Deep-link handler ready for additional `data.screen` values (e.g., 'hos', 'incident')
- Ready for Phase 33-03 (next driver native feature)

---
*Phase: 33-driver-native-features*
*Completed: 2026-03-23*

## Self-Check: PASSED

- FOUND: apps/web/src/app/api/push-tokens/route.ts
- FOUND: apps/web/src/lib/notifications/send-push.ts
- FOUND: apps/mobile/hooks/usePushNotifications.ts
- FOUND: apps/mobile/components/shared/NotificationPermissionModal.tsx
- FOUND: commit 4febcb6 (PushToken schema)
- FOUND: commit 9d02bde (push-tokens endpoint)
- FOUND: commit 8387350 (send-push utility)
- FOUND: commit 5301661 (wire push to actions)
- FOUND: commit c9f3b93 (registerPushToken hook)
- FOUND: commit 015a079 (notification tap handler)
- FOUND: commit 925907b (NotificationPermissionModal)
