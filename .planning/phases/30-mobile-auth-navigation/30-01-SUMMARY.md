---
phase: 30-mobile-auth-navigation
plan: 01
subsystem: auth
tags: [mmkv, expo-router, react-native, jwt, bearer-token, context, aes-gcm]

requires:
  - phase: 29-monorepo-expo-scaffold
    provides: Expo app scaffold, api-client package with login()/me() stubs, shared types (AuthSession, AuthUser)

provides:
  - AES-256-GCM encrypted Bearer token returned in login JSON response
  - /api/auth/me accepts Authorization: Bearer header (mobile) or cookie (web)
  - MMKV-backed session persistence (apps/mobile/lib/storage.ts)
  - useAuth hook with login, logout, foreground token validation
  - AuthContext/AuthProvider for app-wide auth state
  - Full NativeWind dark-theme login screen
  - Root layout with AuthProvider + 401 auto-logout guard
  - index.tsx role-based redirect (OWNER → /(owner), DRIVER → /(driver))
  - setUnauthorizedHandler() in api-client for 401 interception

affects: [31-driver-portal, 32-owner-portal, all phases using apiClient with auth tokens]

tech-stack:
  added: [react-native-mmkv]
  patterns:
    - AES-256-GCM encrypted token re-used for both cookie session (web) and Bearer token (mobile)
    - AuthContext wraps entire app; AuthGuard child registers 401 handler
    - useAuth hook owns all state; AuthContext just distributes it

key-files:
  created:
    - apps/mobile/lib/storage.ts
    - apps/mobile/hooks/useAuth.ts
    - apps/mobile/context/AuthContext.tsx
  modified:
    - apps/web/src/app/api/auth/login/route.ts
    - apps/web/src/app/api/auth/me/route.ts
    - apps/mobile/app/login.tsx
    - apps/mobile/app/_layout.tsx
    - apps/mobile/app/index.tsx
    - packages/api-client/src/client.ts

key-decisions:
  - "Reuse existing AES-256-GCM session token as Bearer token — no separate JWT library needed; same encrypt() called twice per login"
  - "Bearer path of /api/auth/me hits DB for fresh user+companyName; cookie path returns cached session data for web perf"
  - "AuthGuard component inside AuthProvider registers setUnauthorizedHandler so logout function reference is stable"

patterns-established:
  - "Bearer token pattern: apiRequest adds Authorization header when token provided; 401 fires global handler"
  - "MMKV storage: sessionStorage typed for AuthSession; kvStorage generic for other state"

duration: 4min
completed: 2026-03-22
---

# Phase 30 Plan 01: Auth Flow Summary

**Complete mobile auth system: AES-256-GCM Bearer tokens stored in MMKV, login screen with NativeWind dark theme, AuthContext with auto-logout on 401, and role-based routing to driver/owner portals**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-22T23:29:17Z
- **Completed:** 2026-03-22T23:32:39Z
- **Tasks:** 8
- **Files modified:** 8

## Accomplishments

- Web API extended: login returns token+user in JSON body; /api/auth/me accepts Bearer token — fully backwards-compatible with web cookie auth
- Mobile auth stack: MMKV storage, useAuth hook, AuthContext, full login screen, root layout auth guard, role-based index redirect
- api-client 401 interceptor with swappable `setUnauthorizedHandler` callback enables auto-logout from any screen

## Task Commits

1. **Task 1: Update auth API** - `a366b0f` (feat)
2. **Task 2: MMKV storage wrapper** - `7e9ba62` (feat)
3. **Task 3: useAuth hook** - `eb913b3` (feat)
4. **Task 4: AuthContext** - `21b90f9` (feat)
5. **Task 5: Login screen** - `0c7b715` (feat)
6. **Task 6+7: Root layout + index redirect** - `ab662ff` (feat)
7. **Task 8: 401 interceptor in api-client** - `4fc5a56` (feat)

## Files Created/Modified

- `apps/web/src/app/api/auth/login/route.ts` - Now includes tenant in query, returns `{ token, user }` in JSON body alongside cookie
- `apps/web/src/app/api/auth/me/route.ts` - Accepts `Authorization: Bearer` header; returns AuthUser shape for mobile, legacy SessionData for web
- `apps/mobile/lib/storage.ts` - MMKV wrapper: `sessionStorage` (typed AuthSession) + `kvStorage` (generic)
- `apps/mobile/hooks/useAuth.ts` - Auth hook: session hydration on mount, foreground token validation, login/logout
- `apps/mobile/context/AuthContext.tsx` - AuthProvider + useAuthContext hook
- `apps/mobile/app/login.tsx` - Full login screen: email/password inputs, keyboard config, loading state, error display
- `apps/mobile/app/_layout.tsx` - AuthProvider wrapping app; AuthGuard registers 401 handler
- `apps/mobile/app/index.tsx` - Role-based redirect: OWNER → /(owner), DRIVER → /(driver), unauthenticated → /login
- `packages/api-client/src/client.ts` - `setUnauthorizedHandler` export + 401 intercept in apiRequest

## Decisions Made

- Reused the existing AES-256-GCM `encrypt()` from `lib/auth/session.ts` as the Bearer token rather than introducing a separate JWT library. The same encrypted payload works for both web cookie and mobile Bearer auth.
- The Bearer path of `/api/auth/me` performs a fresh DB query (with tenant join) to return the `AuthUser` shape the mobile app expects. The cookie path returns the cached session for web performance.
- `AuthGuard` is a child component inside `AuthProvider` so it has access to `logout` when registering the 401 handler — avoids stale closure issues.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Auth system complete; `useAuthContext()` is available in all screens
- Phase 31 (driver portal) and Phase 32 (owner portal) can use `useAuthContext()` to get `user` and `token`
- Test with both a driver account and an owner account before moving to Phase 31

## Self-Check: PASSED

All 9 files confirmed present on disk. All 7 task commits confirmed in git log.

---
*Phase: 30-mobile-auth-navigation*
*Completed: 2026-03-22*
