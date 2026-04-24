---
phase: quick-235
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/page.tsx
  - apps/web/src/app/api/auth/login/route.ts
  - apps/web/src/app/onboarding/page.tsx
  - apps/web/src/app/api/auth/accept-invitation/route.ts
  - apps/web/src/middleware.ts
  - apps/web/src/components/driver/driver-notification-panel.tsx
  - apps/web/src/components/navigation/notification-center.tsx
autonomous: true
must_haves:
  truths:
    - "Driver login lands on Dashboard tab (/ route), not /my-route"
    - "Dashboard tab is highlighted in bottom nav when on dashboard page"
    - "Notification dropdown is fully visible on 375px mobile screen"
    - "Owner notification dropdown is also mobile-responsive"
  artifacts:
    - path: "apps/web/src/middleware.ts"
      provides: "Driver guard redirects to / instead of /my-route"
      contains: "redirect(new URL('/', request.url))"
    - path: "apps/web/src/app/api/auth/login/route.ts"
      provides: "Driver login redirect to / instead of /my-route"
    - path: "apps/web/src/components/driver/driver-notification-panel.tsx"
      provides: "Responsive width notification panel"
  key_links:
    - from: "apps/web/src/app/api/auth/login/route.ts"
      to: "apps/web/src/app/(driver)/page.tsx"
      via: "redirectUrl for DRIVER role"
      pattern: "role.*DRIVER.*redirect"
---

<objective>
Fix two driver portal UI issues from the task 232 redesign: (1) change the default landing page for drivers from /my-route to the Dashboard tab, and (2) fix the notification dropdown overflowing on mobile screens.

Purpose: Drivers should land on their dashboard after login, and the notification panel should be usable on small screens.
Output: Updated redirect targets and responsive notification panels.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(driver)/page.tsx
@apps/web/src/app/(driver)/layout.tsx
@apps/web/src/middleware.ts
@apps/web/src/app/api/auth/login/route.ts
@apps/web/src/app/page.tsx
@apps/web/src/components/driver/driver-bottom-nav.tsx
@apps/web/src/components/driver/driver-notification-bell.tsx
@apps/web/src/components/driver/driver-notification-panel.tsx
@apps/web/src/components/navigation/notification-bell.tsx
@apps/web/src/components/navigation/notification-center.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Change driver default landing from /my-route to Dashboard (/)</name>
  <files>
    apps/web/src/app/page.tsx
    apps/web/src/app/api/auth/login/route.ts
    apps/web/src/app/onboarding/page.tsx
    apps/web/src/app/api/auth/accept-invitation/route.ts
    apps/web/src/middleware.ts
  </files>
  <action>
    There are 5 places that redirect drivers to /my-route. Change ALL of them to redirect to / instead (the driver portal root, which renders the Dashboard):

    1. `apps/web/src/app/page.tsx` line 9: Change `'/my-route'` to `'/'` — BUT this is the root page itself. Since the driver portal uses the (driver) route group, the driver's dashboard is at the root `/`. The root page.tsx currently redirects authenticated drivers to `/my-route`. Change to redirect to `/` — WAIT, that would be infinite loop since this IS `/`. The driver layout at `(driver)/page.tsx` renders the dashboard. Since the root `page.tsx` is at `/` and the `(driver)/page.tsx` is also at `/` (route group doesn't add path segment), the redirect from root `page.tsx` to `/my-route` is what happens BEFORE the driver layout kicks in. Actually, the (driver) route group layout checks role=DRIVER, so when a driver visits `/`, Next.js should match `(driver)/page.tsx`. The root `page.tsx` at `app/page.tsx` is a DIFFERENT route — it's the landing page for unauthenticated users, and redirects authenticated users. For drivers it should redirect to `/` which will then match `(driver)/page.tsx`. BUT the root `app/page.tsx` IS at `/`, so redirecting to `/` creates a loop.

    CORRECTION after re-analysis: The `(driver)/page.tsx` and `app/page.tsx` are BOTH at `/`. Next.js route groups mean `(driver)/page.tsx` does NOT add a path segment. So there's a conflict — Next.js resolves this by using the root `app/page.tsx` (non-grouped takes precedence? or grouped layout wraps?). The fact that the current code redirects to `/my-route` suggests that hitting `/` goes to `app/page.tsx`, not `(driver)/page.tsx`.

    The correct fix: The driver dashboard needs its own path segment. Since `(driver)/page.tsx` renders at `/` but `app/page.tsx` also renders at `/`, we need to use a dedicated path. The simplest approach: redirect drivers to `/driver-dashboard` or keep using the existing structure.

    ACTUALLY — looking at the bottom nav, Dashboard href is `/` with `exact: true`. And the driver layout at `(driver)/layout.tsx` wraps `(driver)/page.tsx`. In Next.js App Router, route groups like `(driver)` don't affect the URL. If both `app/page.tsx` and `app/(driver)/page.tsx` exist, the `app/page.tsx` takes precedence for the `/` route. The `(driver)/page.tsx` would never be matched directly.

    Re-examining: The `app/page.tsx` redirects drivers to `/my-route`. If we want drivers to land on their dashboard, we should redirect them to a path that renders the dashboard. Since `(driver)/page.tsx` can't be reached at `/` (root page.tsx takes precedence), we need to either:
    - Remove the root `app/page.tsx` redirect and let the driver layout handle it (but then unauthenticated users won't see landing page)
    - OR keep the redirect but point it to a dedicated driver dashboard path

    SIMPLEST FIX: The `(driver)/page.tsx` IS reachable. In Next.js App Router, when a user visits `/`, the framework checks both `app/page.tsx` and `app/(driver)/page.tsx`. The non-grouped `app/page.tsx` takes precedence. But the `(driver)/layout.tsx` only applies if Next.js routes into that group. The redirect in `app/page.tsx` sends drivers to `/my-route`, which matches `app/(driver)/my-route/page.tsx`.

    THE ACTUAL FIX is simple: Change all 5 redirects from `/my-route` to `/driver-home` (or similar), AND rename `(driver)/page.tsx` to render at a reachable path. OR — even simpler — just use an existing pattern: change redirects to point to a path like `/home` and create `app/(driver)/home/page.tsx` that re-exports the dashboard.

    WAIT — let me reconsider. The bottom nav already has `href: '/'` for Dashboard. If the driver clicks Dashboard in the nav, they go to `/`. At `/`, `app/page.tsx` fires, sees they're authenticated as DRIVER, and redirects to `/my-route`. So the Dashboard tab currently doesn't work either — it always redirects to /my-route.

    THE REAL FIX: Change `app/page.tsx` so authenticated drivers redirect to `/home` (a new driver route). Then:
    1. Create `apps/web/src/app/(driver)/home/page.tsx` that re-exports/renders the DriverDashboard (move content from `(driver)/page.tsx`)
    2. Update bottom nav Dashboard href from `/` to `/home`
    3. Update all 5 redirect locations from `/my-route` to `/home`

    Files to change:
    - `apps/web/src/app/page.tsx` line 9: `'/my-route'` -> `'/home'`
    - `apps/web/src/app/api/auth/login/route.ts` line 142: `'/my-route'` -> `'/home'`
    - `apps/web/src/app/onboarding/page.tsx` line 16: `'/my-route'` -> `'/home'`
    - `apps/web/src/app/api/auth/accept-invitation/route.ts` line 255: `'/my-route'` -> `'/home'`
    - `apps/web/src/middleware.ts` line 157: `'/my-route'` -> `'/home'`
    - `apps/web/src/components/driver/driver-bottom-nav.tsx` line 8: Dashboard href from `'/'` to `'/home'`, keep `exact: true`
    - Create `apps/web/src/app/(driver)/home/page.tsx` — move the entire content of `(driver)/page.tsx` into it
    - Keep `(driver)/page.tsx` as a redirect to `/home` (so any stale `/` visits by drivers go to `/home`)

    Do NOT change any other tab hrefs. Do NOT modify the `/my-route`, `/my-load`, `/messages`, or `/more` paths.
  </action>
  <verify>
    1. `npx tsc --noEmit` passes with no errors
    2. Grep for `/my-route` in redirect contexts — should only appear in `driver-routes.ts` revalidatePath calls (those are fine, they revalidate cache)
    3. Bottom nav Dashboard href is `/home`
  </verify>
  <done>
    - Login as driver redirects to /home (Dashboard page)
    - Dashboard tab in bottom nav links to /home and is highlighted when on /home
    - Middleware redirects drivers away from owner paths to /home (not /my-route)
    - All other tabs unchanged
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix notification dropdown mobile overflow</name>
  <files>
    apps/web/src/components/driver/driver-notification-panel.tsx
    apps/web/src/components/navigation/notification-center.tsx
  </files>
  <action>
    Both notification panels have fixed widths that overflow on 375px mobile screens.

    **Driver notification panel** (`driver-notification-panel.tsx` line 117):
    - Change `className="w-[340px] max-h-[480px] ..."` to `className="w-[calc(100vw-2rem)] sm:w-[380px] max-h-[480px] ..."`
    - This makes it nearly full-width on mobile (with 1rem margin on each side) and 380px on sm+ screens.

    **Owner notification center** (`notification-center.tsx` line 146):
    - Change `className="w-[380px] max-h-[480px] ..."` to `className="w-[calc(100vw-2rem)] sm:w-[380px] max-h-[480px] ..."`
    - Same responsive pattern.

    Both bell components (`driver-notification-bell.tsx` and `notification-bell.tsx`) already have:
    - Parent container with `className="relative"` (correct)
    - Dropdown positioned with `className="absolute right-0 top-full mt-2 z-50"` (correct — right-aligned)

    No changes needed to the bell components themselves. Only the panel width needs to be responsive.

    Do NOT change any notification functionality, polling intervals, or mark-read behavior.
  </action>
  <verify>
    1. `npx tsc --noEmit` passes with no errors
    2. Inspect both files — the panel div should have `w-[calc(100vw-2rem)] sm:w-[380px]`
    3. No other className changes in either file
  </verify>
  <done>
    - Driver notification panel is `calc(100vw-2rem)` on mobile, 380px on sm+
    - Owner notification center uses same responsive width
    - Panel is fully visible within viewport on 375px screen (375-32 = 343px panel width)
    - "Notifications" title is fully visible without clipping
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no TypeScript errors
2. All driver redirects point to `/home`, not `/my-route`
3. Notification panels use responsive width classes
4. Bottom nav Dashboard tab points to `/home` with exact match
</verification>

<success_criteria>
- Driver login lands on Dashboard (/home) with Dashboard tab highlighted in bottom nav
- Notification dropdown fully visible on 375px mobile viewport
- Owner notification dropdown also responsive
- No TypeScript errors
- No changes to anything outside specified scope (no FAB changes, no tab behavior changes beyond Dashboard href)
</success_criteria>

<output>
After completion, create `.planning/quick/235-fix-driver-portal-default-landing-tab-an/235-SUMMARY.md`
</output>
