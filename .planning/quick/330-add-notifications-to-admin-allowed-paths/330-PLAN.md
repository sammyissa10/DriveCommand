---
phase: quick-330
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/middleware.ts
autonomous: true

must_haves:
  truths:
    - "Sysadmin user navigating to /notifications reaches the Notifications page (no redirect)"
    - "Sysadmin remains blocked from non-admin routes (e.g. /dashboard still redirects to /admin-support)"
    - "Non-admin users behavior on /notifications is unchanged by this edit"
  artifacts:
    - path: "apps/web/src/middleware.ts"
      provides: "Updated ADMIN_ALLOWED_PATHS array including /notifications"
      contains: "/notifications"
  key_links:
    - from: "apps/web/src/middleware.ts ADMIN_ALLOWED_PATHS"
      to: "apps/web/src/app/(admin)/notifications/page.tsx"
      via: "URL path /notifications (route group (admin) does not appear in URL)"
      pattern: "ADMIN_ALLOWED_PATHS.*'/notifications'"
---

<objective>
Fix sysadmin 404 (redirect) on the Notifications page by adding `/notifications` to the `ADMIN_ALLOWED_PATHS` array in `apps/web/src/middleware.ts`.

Purpose: The Notifications page lives under the `(admin)` route group, which Next.js strips from the URL. The middleware sysadmin guard currently does not include `/notifications`, so sysadmins get redirected to `/admin-support`. One-line array addition restores access.

Output: A single edited file (`apps/web/src/middleware.ts`) with `/notifications` added to `ADMIN_ALLOWED_PATHS`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/middleware.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add /notifications to ADMIN_ALLOWED_PATHS</name>
  <files>apps/web/src/middleware.ts</files>
  <action>
    In `apps/web/src/middleware.ts`, locate the line declaring `ADMIN_ALLOWED_PATHS` (currently around line 155):

    ```ts
    const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations'];
    ```

    Add `'/notifications'` as a new entry to that array. Place it after `'/automations'` for readability. Final value:

    ```ts
    const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations', '/notifications'];
    ```

    DO NOT modify any other line in the file. DO NOT touch `PUBLIC_PATHS`, `OWNER_PATHS`, `OWNER_ONLY_PATHS`, or any logic. This is a pure data addition.

    Why: The sysadmin Notifications page sits at `apps/web/src/app/(admin)/notifications/page.tsx`. Next.js route groups (parentheses) are removed from the URL, so the page is served at `/notifications`, not `/admin/notifications`. The middleware sysadmin guard checks `pathname.startsWith(p)` against `ADMIN_ALLOWED_PATHS`; without `/notifications` in that list, sysadmins are redirected to `/admin-support`.
  </action>
  <verify>
    1. `npx tsc --noEmit -p apps/web/tsconfig.json` passes (no new TS errors).
    2. Open `apps/web/src/middleware.ts` and confirm the `ADMIN_ALLOWED_PATHS` line contains the literal string `'/notifications'`.
    3. `git diff apps/web/src/middleware.ts` shows exactly one line changed (the array literal) with `'/notifications'` added — no other diff hunks.
  </verify>
  <done>
    `apps/web/src/middleware.ts` contains `/notifications` inside `ADMIN_ALLOWED_PATHS`. No other code is modified. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- `git diff --stat` shows only `apps/web/src/middleware.ts` modified, with a small diff (1 line changed in the array literal).
- Grep confirms presence: `Grep "ADMIN_ALLOWED_PATHS" apps/web/src/middleware.ts` shows the updated array including `/notifications`.
- `npx tsc --noEmit` (web app) passes.
- Manual smoke (after deploy or local dev server): log in as sysadmin → navigate to `/notifications` → page renders (no redirect to `/admin-support`). Navigate to `/dashboard` → still redirected to `/admin-support` (regression check).
</verification>

<success_criteria>
- ADMIN_ALLOWED_PATHS array in `apps/web/src/middleware.ts` includes `/notifications`.
- No other lines in `middleware.ts` are altered.
- No other files in the repo are touched.
- TypeScript compilation succeeds.
- Sysadmins can now reach `/notifications`; all other middleware behavior is unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/330-add-notifications-to-admin-allowed-paths/330-SUMMARY.md`.
</output>
