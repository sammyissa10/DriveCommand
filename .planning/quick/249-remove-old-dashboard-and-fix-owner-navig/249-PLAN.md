---
phase: quick-249
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/dashboard/page.tsx
  - apps/web/src/app/page.tsx
  - apps/web/src/app/onboarding/page.tsx
  - apps/web/src/app/api/auth/login/route.ts
  - apps/web/src/app/api/auth/accept-invitation/route.ts
  - apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
  - apps/web/src/app/(auth)/accept-invitation/page.tsx
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/src/components/navigation/owner-bottom-nav.tsx
  - apps/web/src/app/(owner)/error.tsx
  - apps/web/src/app/(owner)/fuel/error.tsx
autonomous: true
must_haves:
  truths:
    - "Visiting /dashboard redirects owner to /carrier/dashboard"
    - "After login, owners land on /carrier/dashboard not /dashboard"
    - "DriveCommand logo in sidebar links to /carrier/dashboard"
    - "Bottom nav Dashboard link points to /carrier/dashboard"
    - "Driver redirects still go to /home"
    - "SysAdmin redirects still go to /admin-dashboard"
  artifacts:
    - path: "apps/web/src/app/(owner)/dashboard/page.tsx"
      provides: "Redirect from old dashboard"
      contains: "redirect('/carrier/dashboard')"
    - path: "apps/web/src/app/api/auth/login/route.ts"
      provides: "Post-login redirect for owners"
      contains: "/carrier/dashboard"
  key_links:
    - from: "apps/web/src/app/api/auth/login/route.ts"
      to: "/carrier/dashboard"
      via: "redirectUrl response"
      pattern: "redirectUrl.*carrier/dashboard"
    - from: "apps/web/src/components/navigation/sidebar.tsx"
      to: "/carrier/dashboard"
      via: "logo Link href"
      pattern: "href=\"/carrier/dashboard\""
---

<objective>
Remove the old /dashboard as a destination and make /carrier/dashboard the default landing page for owners/managers across all entry points.

Purpose: Carrier Ops is now the primary module. The old dashboard should no longer be a navigation target.
Output: All owner redirects, links, and post-auth flows point to /carrier/dashboard.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/dashboard/page.tsx
@apps/web/src/app/page.tsx
@apps/web/src/app/onboarding/page.tsx
@apps/web/src/app/api/auth/login/route.ts
@apps/web/src/app/api/auth/accept-invitation/route.ts
@apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@apps/web/src/app/(auth)/accept-invitation/page.tsx
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/components/navigation/owner-bottom-nav.tsx
@apps/web/src/app/(owner)/error.tsx
@apps/web/src/app/(owner)/fuel/error.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redirect old dashboard and update all post-auth redirects</name>
  <files>
    apps/web/src/app/(owner)/dashboard/page.tsx
    apps/web/src/app/page.tsx
    apps/web/src/app/onboarding/page.tsx
    apps/web/src/app/api/auth/login/route.ts
    apps/web/src/app/api/auth/accept-invitation/route.ts
    apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    apps/web/src/app/(auth)/accept-invitation/page.tsx
  </files>
  <action>
    1. **apps/web/src/app/(owner)/dashboard/page.tsx** — Replace the ENTIRE file content with a simple server-side redirect:
       ```
       import { redirect } from 'next/navigation';
       export default function OldDashboard() { redirect('/carrier/dashboard'); }
       ```
       Do NOT delete the file — just replace its content so any bookmarks/links to /dashboard still work.

    2. **apps/web/src/app/api/auth/login/route.ts** — On line 140, change `let redirectUrl = '/dashboard'` to `let redirectUrl = '/carrier/dashboard'`. The DRIVER and isSystemAdmin overrides on lines 141-142 remain unchanged.

    3. **apps/web/src/app/api/auth/accept-invitation/route.ts** — On line 255, change the ternary from `'/dashboard'` to `'/carrier/dashboard'`. The DRIVER `/home` path stays the same.

    4. **apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx** — On line 32, change the fallback from `"/dashboard"` to `"/carrier/dashboard"` in `window.location.href = data.redirectUrl || "/carrier/dashboard"`.

    5. **apps/web/src/app/(auth)/accept-invitation/page.tsx** — On line 109, change the fallback from `"/dashboard"` to `"/carrier/dashboard"` in `window.location.href = data.redirectUrl || "/carrier/dashboard"`.

    6. **apps/web/src/app/page.tsx** — On line 9, change `'/dashboard'` to `'/carrier/dashboard'` in the non-DRIVER redirect.

    7. **apps/web/src/app/onboarding/page.tsx** — On line 16, change `'/dashboard'` to `'/carrier/dashboard'` in the non-DRIVER redirect.

    CRITICAL: Do NOT change any DRIVER redirects (must remain `/home`) or SYSTEM_ADMIN redirects (must remain `/admin-dashboard`).
  </action>
  <verify>
    Run `grep -rn "'/dashboard'" apps/web/src/app/page.tsx apps/web/src/app/onboarding/page.tsx apps/web/src/app/api/auth/login/route.ts apps/web/src/app/api/auth/accept-invitation/route.ts apps/web/src/app/\(auth\)/sign-in/ apps/web/src/app/\(auth\)/accept-invitation/` — should return zero matches (all changed to /carrier/dashboard). Then run `grep -rn "'/dashboard'" apps/web/src/app/\(owner\)/dashboard/page.tsx` — should also return zero (file now redirects to /carrier/dashboard).
  </verify>
  <done>All 7 files updated. Owner/manager auth flows redirect to /carrier/dashboard. Driver flows unchanged at /home. SysAdmin unchanged at /admin-dashboard.</done>
</task>

<task type="auto">
  <name>Task 2: Fix sidebar logo link, bottom nav, and error page links</name>
  <files>
    apps/web/src/components/navigation/sidebar.tsx
    apps/web/src/components/navigation/owner-bottom-nav.tsx
    apps/web/src/app/(owner)/error.tsx
    apps/web/src/app/(owner)/fuel/error.tsx
  </files>
  <action>
    1. **apps/web/src/components/navigation/sidebar.tsx** — On line 67, change `href="/dashboard"` to `href="/carrier/dashboard"` on the logo Link in SidebarHeader.

    2. **apps/web/src/components/navigation/owner-bottom-nav.tsx** — On line 8, change `{ href: '/dashboard', ...}` to `{ href: '/carrier/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true }`.

    3. **apps/web/src/app/(owner)/error.tsx** — On line 41, change `href="/dashboard"` to `href="/carrier/dashboard"` on the "Back to Dashboard" link.

    4. **apps/web/src/app/(owner)/fuel/error.tsx** — On line 30, change `href="/dashboard"` to `href="/carrier/dashboard"` on the "Back to Dashboard" link.

    After all changes, do a project-wide grep for any remaining `"/dashboard"` or `'/dashboard'` references in the owner portal and navigation components to catch any missed occurrences. Exclude: middleware.ts OWNER_PATHS array (that's a guard pattern, not a link), openapi spec, mobile routes, dashboard component imports, and the carrier dashboard itself.
  </action>
  <verify>
    Run `grep -rn "href=\"/dashboard\"" apps/web/src/components/navigation/ apps/web/src/app/\(owner\)/` — should return zero matches. Run `cd apps/web && npx tsc --noEmit 2>&1 | head -20` to verify no TypeScript errors introduced.
  </verify>
  <done>Sidebar logo links to /carrier/dashboard. Bottom nav Dashboard tab links to /carrier/dashboard. Error page "Back to Dashboard" links point to /carrier/dashboard. No remaining stale /dashboard hrefs in owner portal or navigation.</done>
</task>

</tasks>

<verification>
1. `grep -rn "href.*\"/dashboard\"" apps/web/src/` should only match middleware.ts OWNER_PATHS array and nothing else
2. `grep -rn "'/dashboard'" apps/web/src/` should only match middleware.ts OWNER_PATHS array and nothing else
3. `cd apps/web && npx tsc --noEmit` passes with zero errors
4. Visiting /dashboard in browser redirects to /carrier/dashboard
5. Logging in as owner lands on /carrier/dashboard
6. Sidebar logo click navigates to /carrier/dashboard
</verification>

<success_criteria>
- /dashboard redirects to /carrier/dashboard (not a 404, not the old page)
- Post-login owner redirect is /carrier/dashboard
- Sidebar logo link is /carrier/dashboard
- Bottom nav Dashboard link is /carrier/dashboard
- Error page "Back to Dashboard" links are /carrier/dashboard
- Driver portal unaffected (/home redirects preserved)
- SysAdmin portal unaffected (/admin-dashboard redirects preserved)
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/249-remove-old-dashboard-and-fix-owner-navig/249-SUMMARY.md`
</output>
