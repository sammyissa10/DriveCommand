---
phase: quick-139
plan: 01
subsystem: auth
tags: [supabase, react-native, expo, auth, context, mobile]

requires:
  - phase: mobile-driver-layout
    provides: driver tab layout with SupportTicketFAB

provides:
  - Graceful stale token recovery in useAuth — user lands on login screen, not crash
  - SupportTicketProvider wrapping in driver layout — FAB works without context crash

affects: [mobile-auth, driver-layout, support-ticket]

tech-stack:
  added: []
  patterns:
    - "Async session load with try/catch/finally for graceful token expiry handling"
    - "SupportTicketProvider wraps Tabs + FAB in both driver and owner layouts"

key-files:
  created: []
  modified:
    - apps/mobile/hooks/useAuth.ts
    - apps/mobile/app/(driver)/_layout.tsx

key-decisions:
  - "signOut on stale token catch is best-effort (nested try/catch) — failure doesn't cascade"
  - "TOKEN_REFRESHED with null session treated as sign-out edge case guard"
  - "SupportTicketProvider placed outside Tabs but inside Fragment — mirrors owner layout exactly"

patterns-established:
  - "Pattern: async session load with try/catch/finally in useAuth"
  - "Pattern: SupportTicketProvider wraps Tabs + FAB together in both portal layouts"

duration: 8min
completed: 2026-03-31
---

# Quick Task 139: Fix Mobile Auth Refresh Token Error and SupportTicketFAB Crash Summary

**Stale Supabase refresh token now gracefully clears and redirects to login; SupportTicketFAB no longer crashes in driver portal due to missing context provider**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-31T00:00:00Z
- **Completed:** 2026-03-31T00:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced synchronous `.then()` chain in `useAuth` with async `loadSession()` wrapped in try/catch/finally — stale `AuthApiError` is caught, `signOut()` clears SecureStore, and `isLoading` is set to false so the app renders the login screen
- Added `TOKEN_REFRESHED` + null session guard in `onAuthStateChange` as an edge case safety net
- Imported `SupportTicketProvider` into the driver layout and wrapped `Tabs`, `NotificationPermissionModal`, and `SupportTicketFAB` — matching the existing owner layout pattern exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Handle invalid refresh token gracefully in useAuth** - `067463c` (fix)
2. **Task 2: Wrap driver layout SupportTicketFAB in SupportTicketProvider** - `457d367` (fix)

## Files Created/Modified

- `apps/mobile/hooks/useAuth.ts` - Async session load with try/catch/finally; stale token caught and cleared via signOut; isLoading always resolves in finally block
- `apps/mobile/app/(driver)/_layout.tsx` - SupportTicketProvider imported and added wrapping Tabs + FAB, matching owner layout pattern

## Decisions Made

- `signOut()` in the catch block is itself wrapped in a nested try/catch — if signOut fails (e.g., already signed out, network error), the failure is swallowed and the user still reaches the login screen
- `TOKEN_REFRESHED` with a null session triggers an early return that clears user/token state, preventing a potential stale UI state edge case
- `SupportTicketProvider` placed identically to the owner layout: wraps everything from `<Tabs>` through `<SupportTicketFAB />`, but NOT `<AppHeader />` or `<SyncStatusBar />`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `FlashList` usage across multiple driver and owner screens (unrelated to this task — `estimatedItemSize` prop not recognized by the installed type definitions). These errors existed before this task and are not caused by either change made here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Mobile app is more resilient to expired auth sessions — users won't see crashes on launch after token expiry
- Both driver and owner portals now have consistent SupportTicketFAB behavior
- Pre-existing FlashList TypeScript errors should be addressed in a future quick task if they cause build issues

---
*Phase: quick-139*
*Completed: 2026-03-31*
