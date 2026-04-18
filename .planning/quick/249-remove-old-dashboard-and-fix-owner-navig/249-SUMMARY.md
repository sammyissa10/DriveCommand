---
phase: quick-249
plan: 01
subsystem: web-navigation
tags: [navigation, auth, redirect, owner-portal]
dependency_graph:
  requires: []
  provides: [owner-landing-at-carrier-dashboard]
  affects: [web-auth-flow, web-navigation, owner-portal]
tech_stack:
  added: []
  patterns: [server-side-redirect, client-side-fallback-href]
key_files:
  created: []
  modified:
    - apps/web/src/app/(owner)/dashboard/page.tsx
    - apps/web/src/app/page.tsx
    - apps/web/src/app/onboarding/page.tsx
    - apps/web/src/app/api/auth/login/route.ts
    - apps/web/src/app/api/auth/accept-invitation/route.ts
    - apps/web/src/app/api/auth/callback/route.ts
    - apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    - apps/web/src/app/(auth)/accept-invitation/page.tsx
    - apps/web/src/components/navigation/sidebar.tsx
    - apps/web/src/components/navigation/owner-bottom-nav.tsx
    - apps/web/src/app/(owner)/error.tsx
    - apps/web/src/app/(owner)/fuel/error.tsx
    - apps/web/src/app/(owner)/live-map/error.tsx
    - apps/web/src/app/(owner)/safety/error.tsx
    - apps/web/src/app/(owner)/tags/error.tsx
    - apps/web/src/app/(owner)/settings/team-permissions/page.tsx
decisions:
  - Keep /dashboard file (do not delete) so bookmarks redirect cleanly to /carrier/dashboard
metrics:
  duration: 12m
  completed: 2026-04-18
  tasks_completed: 2
  files_modified: 16
---

# Phase quick-249: Remove Old Dashboard and Fix Owner Navigation Summary

**One-liner:** Replaced all 16 stale `/dashboard` owner redirect and link references with `/carrier/dashboard` across auth flows, navigation components, and error pages — keeping `/home` (driver) and `/admin-dashboard` (sysadmin) untouched.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Redirect old dashboard page + update all post-auth owner redirects | 440a98d |
| 2 | Fix sidebar logo, bottom nav, error pages, and remaining /dashboard links | 3ab68b0 |

## What Was Built

All owner entry points now land on `/carrier/dashboard`:

- `/dashboard` page replaced with `redirect('/carrier/dashboard')` (keeps bookmarks working)
- `POST /api/auth/login` default `redirectUrl` changed from `/dashboard` to `/carrier/dashboard`
- `POST /api/auth/accept-invitation` OWNER/MANAGER redirectUrl changed to `/carrier/dashboard`
- `GET /api/auth/callback` safeNext fallback changed to `/carrier/dashboard`
- Sign-in page client fallback `window.location.href` changed to `/carrier/dashboard`
- Accept-invitation page client fallback changed to `/carrier/dashboard`
- Root `page.tsx` non-DRIVER redirect changed to `/carrier/dashboard`
- Onboarding page non-DRIVER redirect changed to `/carrier/dashboard`
- Sidebar logo Link `href` changed to `/carrier/dashboard`
- OwnerBottomNav Dashboard tab `href` changed to `/carrier/dashboard`
- 5 owner error page "Back to Dashboard" links changed to `/carrier/dashboard`
- team-permissions MANAGER guard `router.replace` changed to `/carrier/dashboard`

Driver redirects (`/home`) and SysAdmin redirects (`/admin-dashboard`) are unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 5 additional stale /dashboard hrefs not listed in plan**
- **Found during:** Task 2 verification grep sweep
- **Issue:** `apps/web/src/app/(owner)/live-map/error.tsx`, `safety/error.tsx`, `tags/error.tsx` (error pages), plus `team-permissions/page.tsx` and `api/auth/callback/route.ts` contained `/dashboard` that would take owners to the old page
- **Fix:** Updated all 5 to point to `/carrier/dashboard`
- **Files modified:** live-map/error.tsx, safety/error.tsx, tags/error.tsx, team-permissions/page.tsx, callback/route.ts
- **Commit:** 3ab68b0

## Verification

- `grep -rn "'/dashboard'\|\"\/dashboard\"" apps/web/src/` returns zero matches outside `middleware.ts` OWNER_PATHS guard array (which is a route guard, not a link)
- TypeScript errors are pre-existing in e2e/carrier Playwright spec files (unrelated to these changes)
- `/dashboard` page now redirects cleanly to `/carrier/dashboard` via Next.js `redirect()`

## Self-Check: PASSED

Files modified confirmed present. Commits 440a98d and 3ab68b0 exist in git log.
