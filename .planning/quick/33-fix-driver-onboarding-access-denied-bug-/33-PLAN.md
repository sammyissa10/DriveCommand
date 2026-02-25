---
phase: quick-33
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/auth/accept-invitation/route.ts
  - src/app/api/auth/login/route.ts
  - src/app/page.tsx
  - src/app/onboarding/page.tsx
  - src/middleware.ts
autonomous: true
must_haves:
  truths:
    - "Driver accepts invitation, sets password, lands on /my-route (not Access Denied)"
    - "Driver logs in via /sign-in and lands on /my-route (not /dashboard)"
    - "Owner/Manager logs in and still lands on /dashboard as before"
    - "Driver navigating to /dashboard gets redirected to /my-route"
  artifacts:
    - path: "src/app/api/auth/accept-invitation/route.ts"
      provides: "Role-aware redirect after invitation acceptance"
      contains: "/my-route"
    - path: "src/app/api/auth/login/route.ts"
      provides: "Role-aware redirect after login"
      contains: "DRIVER"
    - path: "src/middleware.ts"
      provides: "Middleware redirect for drivers hitting owner pages"
      contains: "DRIVER"
  key_links:
    - from: "src/app/api/auth/accept-invitation/route.ts"
      to: "/my-route"
      via: "redirectUrl in JSON response"
      pattern: "redirectUrl.*my-route"
    - from: "src/app/api/auth/login/route.ts"
      to: "/my-route or /dashboard"
      via: "role-conditional redirectUrl"
      pattern: "role.*DRIVER"
---

<objective>
Fix the Access Denied bug when drivers accept invitations or log in, by making all redirect logic role-aware. Currently every auth flow redirects to /dashboard which is behind the (owner) layout's OWNER/MANAGER guard, causing drivers to hit /unauthorized.

Purpose: Drivers can complete onboarding and log in without hitting Access Denied
Output: Role-aware redirects across all auth touchpoints
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/auth/roles.ts
@src/lib/auth/session.ts
@src/app/(driver)/layout.tsx
@src/app/(owner)/layout.tsx
@src/components/driver/driver-nav.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make API auth routes return role-aware redirect URLs</name>
  <files>
    src/app/api/auth/accept-invitation/route.ts
    src/app/api/auth/login/route.ts
  </files>
  <action>
Create a small helper function (can be inline or a shared util) that returns the correct redirect URL based on role:
- DRIVER -> '/my-route'
- OWNER, MANAGER, SYSTEM_ADMIN -> '/dashboard'

In `src/app/api/auth/accept-invitation/route.ts`:
- Line 121: Change `redirectUrl: '/dashboard'` to `redirectUrl: '/my-route'` (this route ONLY creates DRIVER users, so hardcoding is fine here — no need for role check)

In `src/app/api/auth/login/route.ts`:
- After setSession (around line 61-62), check `user.role`:
  - If `user.role === 'DRIVER'`, return `redirectUrl: '/my-route'`
  - Otherwise, return `redirectUrl: '/dashboard'`
- Keep the same response shape `{ success: true, redirectUrl: '...' }`

Do NOT change the client-side pages (sign-in page, accept-invitation page) — they already use `data.redirectUrl` from the API response, so they will automatically pick up the correct URL.
  </action>
  <verify>
Read both files to confirm the redirectUrl values are role-aware. Grep for any remaining hardcoded '/dashboard' in these two files — there should be none.
  </verify>
  <done>
accept-invitation route returns redirectUrl '/my-route'. Login route returns '/my-route' for DRIVER role, '/dashboard' for others.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix server-side redirects and add middleware guard for drivers</name>
  <files>
    src/app/page.tsx
    src/app/onboarding/page.tsx
    src/middleware.ts
  </files>
  <action>
In `src/app/page.tsx` (root page, line 9):
- Currently does `redirect("/dashboard")` when session exists
- Change to: if `session.role === 'DRIVER'`, redirect to `/my-route`; otherwise redirect to `/dashboard`
- Import is already `getSession` which returns SessionData including `role`

In `src/app/onboarding/page.tsx` (line 16):
- Currently does `redirect("/dashboard")` when tenantId exists
- Change to: if `session.role === 'DRIVER'`, redirect to `/my-route`; otherwise redirect to `/dashboard`

In `src/middleware.ts`:
- Add a guard so that if a DRIVER-role user navigates to `/dashboard` (or any owner-only path), they get redirected to `/my-route` instead of seeing "unauthorized"
- After the session is decrypted (line 44) and before the tenant header injection:
  - Check if `session.role === 'DRIVER'` AND pathname starts with `/dashboard` (or more broadly, known owner paths like `/trucks`, `/drivers`, `/routes`, `/loads`, `/invoices`, `/payroll`, `/crm`, `/settings`, `/compliance`, `/ai-documents`, `/profit-predictor`, `/lane-analytics`, `/ifta`, `/live-map`, `/fuel`, `/safety`, `/tags`)
  - If so, redirect to `/my-route`
- Implementation approach: define an array `OWNER_PATHS` with these prefixes. Check if DRIVER role user is accessing any of them. This is a safety net — the primary fix is the redirect URLs, but this catches direct URL navigation and bookmarks.
- Keep the existing public paths, auth check, and tenant header injection unchanged.
  </action>
  <verify>
1. Read all three files to confirm role-aware redirects
2. Run `npx tsc --noEmit` to verify no TypeScript errors
3. Grep across the entire src/ directory for hardcoded `redirect("/dashboard")` or `redirectUrl: '/dashboard'` — there should be zero remaining (except in owner-specific error pages which are fine since they're behind the owner layout already)
  </verify>
  <done>
- Root page (/) redirects drivers to /my-route, others to /dashboard
- Onboarding page redirects drivers to /my-route after tenant setup
- Middleware catches drivers navigating to owner pages and redirects to /my-route
- No TypeScript errors
  </done>
</task>

</tasks>

<verification>
Full flow verification:
1. Driver invitation flow: accept-invitation API returns redirectUrl '/my-route' -> client navigates there -> (driver) layout loads (not owner layout)
2. Driver login flow: login API returns redirectUrl '/my-route' for DRIVER role -> client navigates there -> driver portal loads
3. Driver direct navigation: typing /dashboard in browser as DRIVER -> middleware redirects to /my-route
4. Owner login flow: login API still returns '/dashboard' for OWNER/MANAGER -> owner portal loads as before (regression check)
5. Root page: logged-in driver visiting / -> redirected to /my-route; logged-in owner -> /dashboard
</verification>

<success_criteria>
- Drivers accepting invitations land on /my-route with the driver portal UI
- Drivers logging in land on /my-route with the driver portal UI
- Drivers cannot accidentally reach owner pages (redirected by middleware)
- Owners and Managers still land on /dashboard as before (no regression)
- Zero TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/33-fix-driver-onboarding-access-denied-bug-/33-SUMMARY.md`
</output>
