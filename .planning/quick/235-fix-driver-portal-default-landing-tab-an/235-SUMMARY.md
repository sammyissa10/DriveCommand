---
phase: quick-235
plan: "01"
subsystem: web-driver-portal
tags: [driver-portal, navigation, responsive, ux]
dependency_graph:
  requires: []
  provides: [driver-home-route, responsive-notifications]
  affects: [driver-portal-layout, login-flow, middleware]
tech_stack:
  added: []
  patterns: [responsive-calc-vw, next-route-groups]
key_files:
  created:
    - apps/web/src/app/(driver)/home/page.tsx
  modified:
    - apps/web/src/app/(driver)/page.tsx
    - apps/web/src/app/page.tsx
    - apps/web/src/app/api/auth/login/route.ts
    - apps/web/src/app/onboarding/page.tsx
    - apps/web/src/app/api/auth/accept-invitation/route.ts
    - apps/web/src/middleware.ts
    - apps/web/src/app/(owner)/carrier/layout.tsx
    - apps/web/src/components/driver/driver-bottom-nav.tsx
    - apps/web/src/components/driver/driver-nav.tsx
    - apps/web/src/components/driver/driver-notification-panel.tsx
    - apps/web/src/components/navigation/notification-center.tsx
decisions:
  - "Created /home as a dedicated driver dashboard route instead of reusing (driver)/page.tsx at /, because app/page.tsx at the root takes Next.js routing precedence over route-group pages and would redirect drivers in a loop"
  - "Converted (driver)/page.tsx to a safety-net redirect to /home rather than deleting it"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-16"
  tasks_completed: 2
  files_modified: 11
---

# Quick-235: Fix Driver Portal Default Landing Tab and Notification Overflow

Driver login now correctly lands on the Dashboard (/home) with the Dashboard tab highlighted in the bottom nav, and notification dropdowns use calc(100vw-2rem) responsive width to fit within 375px mobile viewports.

## Tasks Completed

### Task 1: Change driver default landing from /my-route to Dashboard (/home)

**Root cause:** `app/page.tsx` at the root `/` takes Next.js routing precedence over `(driver)/page.tsx` (route groups don't add URL segments). Authenticated drivers were being redirected to `/my-route` on every visit to `/`, making the Dashboard tab in the bottom nav non-functional.

**Fix:**
- Created `(driver)/home/page.tsx` — dedicated driver dashboard route at `/home`
- Converted `(driver)/page.tsx` to a safety-net redirect to `/home`
- Updated all 6 redirect locations from `/my-route` to `/home`:
  - `app/page.tsx` (landing page auth redirect)
  - `api/auth/login/route.ts` (login response redirectUrl)
  - `onboarding/page.tsx` (post-onboarding redirect)
  - `api/auth/accept-invitation/route.ts` (invitation acceptance redirect)
  - `middleware.ts` (driver guard on owner paths)
  - `(owner)/carrier/layout.tsx` (belt-and-suspenders driver guard)
- Updated Dashboard `href` in both `driver-bottom-nav.tsx` and `driver-nav.tsx` from `/` to `/home`

### Task 2: Fix notification dropdown mobile overflow

**Root cause:** Both notification panels had fixed pixel widths (`w-[340px]` and `w-[380px]`) that overflow a 375px viewport when the bell icon is positioned near the right edge.

**Fix:**
- `driver-notification-panel.tsx`: `w-[340px]` → `w-[calc(100vw-2rem)] sm:w-[380px]`
- `notification-center.tsx`: `w-[380px]` → `w-[calc(100vw-2rem)] sm:w-[380px]`

Both panels now render at `343px` on a 375px screen (1rem margin each side) and at `380px` on sm+ screens.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing coverage] Updated carrier layout belt-and-suspenders redirect**
- **Found during:** Task 1 — grep scan for `/my-route` redirect contexts
- **Issue:** `(owner)/carrier/layout.tsx` had a driver guard that redirected to `/my-route` — would have sent drivers to Route page instead of Dashboard
- **Fix:** Updated to redirect to `/home`
- **Files modified:** `apps/web/src/app/(owner)/carrier/layout.tsx`
- **Commit:** d06ffbc

**2. [Rule 2 - Missing coverage] Updated driver-nav.tsx desktop nav**
- **Found during:** Task 1 — reading driver-nav.tsx
- **Issue:** Plan mentioned only `driver-bottom-nav.tsx` but the desktop nav `driver-nav.tsx` also had `href: '/'` for Dashboard — would break Dashboard active highlight on desktop
- **Fix:** Updated Dashboard href from `/` to `/home` in both nav components
- **Files modified:** `apps/web/src/components/driver/driver-nav.tsx`
- **Commit:** d06ffbc

## Commits

| Hash | Message |
|------|---------|
| d06ffbc | feat(quick-235): change driver default landing from /my-route to /home |
| 23a552c | fix(quick-235): make notification dropdowns responsive on mobile |

## Self-Check: PASSED

- `apps/web/src/app/(driver)/home/page.tsx` — FOUND
- Commit `d06ffbc` — FOUND
- Commit `23a552c` — FOUND
