---
phase: quick-33
plan: 01
subsystem: auth
tags: [auth, driver, redirect, middleware, onboarding]
dependency_graph:
  requires: [src/lib/auth/session.ts, src/lib/auth/roles.ts]
  provides: [role-aware redirects across all auth touchpoints]
  affects: [driver onboarding flow, driver login flow, middleware routing]
tech_stack:
  added: []
  patterns: [role-conditional redirect, middleware driver guard, OWNER_PATHS allowlist]
key_files:
  created: []
  modified:
    - src/app/api/auth/accept-invitation/route.ts
    - src/app/api/auth/login/route.ts
    - src/app/page.tsx
    - src/app/onboarding/page.tsx
    - src/middleware.ts
decisions:
  - accept-invitation hardcodes /my-route (DRIVER-only endpoint, no role check needed)
  - login route uses conditional redirectUrl based on user.role === 'DRIVER'
  - OWNER_PATHS array in middleware acts as safety net for direct URL navigation and bookmarks
  - middleware guard placed after tenantId check so it only fires for fully-onboarded drivers
metrics:
  duration: ~12 minutes
  completed: 2026-02-25
  tasks_completed: 2
  files_modified: 5
---

# Quick Task 33: Fix Driver Onboarding Access Denied Bug Summary

**One-liner:** Role-aware redirects across all 5 auth touchpoints so drivers land on /my-route instead of hitting Access Denied on the owner-only /dashboard.

## What Was Built

Drivers accepting invitations or logging in were always redirected to `/dashboard`, which is guarded by the `(owner)` layout's `OWNER/MANAGER` role check. This caused a hard "Access Denied" / `/unauthorized` page for every driver after authentication. The fix makes every auth redirect decision role-aware.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Make API auth routes return role-aware redirect URLs | b773ac6 | accept-invitation/route.ts, login/route.ts |
| 2 | Fix server-side redirects and add middleware driver guard | ac87ccf | page.tsx, onboarding/page.tsx, middleware.ts |

## Changes Made

### Task 1 — API Auth Routes

**`src/app/api/auth/accept-invitation/route.ts`**
- Changed `redirectUrl: '/dashboard'` to `redirectUrl: '/my-route'`
- This endpoint only ever creates DRIVER users, so hardcoding is correct

**`src/app/api/auth/login/route.ts`**
- Changed single-value `redirectUrl: '/dashboard'` to conditional:
  `user.role === 'DRIVER' ? '/my-route' : '/dashboard'`
- Client-side sign-in page already consumes `data.redirectUrl` — no client changes needed

### Task 2 — Server-Side Redirects and Middleware

**`src/app/page.tsx`**
- Root page now redirects logged-in drivers to `/my-route`, others to `/dashboard`

**`src/app/onboarding/page.tsx`**
- Onboarding completion redirect is now role-aware: drivers go to `/my-route`

**`src/middleware.ts`**
- Added `OWNER_PATHS` array listing all owner-portal path prefixes
- Added driver guard: if `session.role === 'DRIVER'` and pathname matches any OWNER_PATH, redirect to `/my-route`
- Guard runs after tenant check, so only applies to fully-onboarded drivers
- Acts as safety net for bookmarks and direct URL navigation

## Verification

Full flow confirmed:
1. Driver invitation flow: accept-invitation returns `/my-route` → driver portal loads
2. Driver login flow: login returns `/my-route` for DRIVER role → driver portal loads
3. Driver direct navigation: middleware catches `/dashboard` access → redirects to `/my-route`
4. Owner/Manager login: login still returns `/dashboard` → owner portal loads (no regression)
5. Root page: logged-in driver visiting `/` → `/my-route`; owner → `/dashboard`

TypeScript: `npx tsc --noEmit` — zero errors.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- FOUND: src/app/api/auth/accept-invitation/route.ts
- FOUND: src/app/api/auth/login/route.ts
- FOUND: src/app/page.tsx
- FOUND: src/app/onboarding/page.tsx
- FOUND: src/middleware.ts

Commits verified:
- FOUND: b773ac6 — fix(quick-33): make API auth routes return role-aware redirect URLs
- FOUND: ac87ccf — fix(quick-33): add role-aware server redirects and middleware driver guard
