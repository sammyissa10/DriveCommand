---
phase: quick-330
plan: "01"
subsystem: middleware / auth
tags: [middleware, sysadmin, routing, notifications]
dependency_graph:
  requires: []
  provides: [sysadmin-notifications-access]
  affects: [apps/web/src/middleware.ts]
tech_stack:
  added: []
  patterns: [ADMIN_ALLOWED_PATHS guard]
key_files:
  created: []
  modified:
    - apps/web/src/middleware.ts
decisions:
  - "/notifications added after /automations for alphabetical-ish grouping"
metrics:
  duration: "~3 minutes"
  completed: "2026-05-15"
  tasks_completed: 1
  files_modified: 1
---

# Quick-330: Add /notifications to ADMIN_ALLOWED_PATHS — Summary

**One-liner:** Added `'/notifications'` to the `ADMIN_ALLOWED_PATHS` array in `middleware.ts` so sysadmins can reach the Notifications page without being redirected to `/admin-support`.

## What Was Done

The sysadmin Notifications page lives at `apps/web/src/app/(admin)/notifications/page.tsx`. Next.js strips the `(admin)` route group from the URL, so the page is served at `/notifications`. The middleware sysadmin guard checks each pathname against `ADMIN_ALLOWED_PATHS`; `/notifications` was missing from the array, causing sysadmins to be redirected to `/admin-support`.

**Fix:** One-line array addition — `'/notifications'` appended after `'/automations'`.

## Exact Diff

```diff
-  const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations'];
+  const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations', '/notifications'];
```

File: `apps/web/src/middleware.ts`, line 155. No other lines changed.

## Commits

| Hash    | Message                                                          |
| ------- | ---------------------------------------------------------------- |
| 76f0c97 | fix(quick-330): add /notifications to ADMIN_ALLOWED_PATHS in middleware |

## Verification

- `npx tsc --noEmit` passed (zero errors, one unrelated npm workspace warn).
- `git diff --stat` shows only `apps/web/src/middleware.ts`, 1 insertion + 1 deletion.
- Grep confirms `ADMIN_ALLOWED_PATHS` on line 155 includes `'/notifications'`.

## Smoke Test (manual, post-deploy)

1. Log in as sysadmin → navigate to `/notifications` → page should render (no redirect).
2. Navigate to `/dashboard` → should still redirect to `/admin-support` (regression check).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/middleware.ts` modified: FOUND
- Commit `76f0c97`: FOUND
- No other files modified: CONFIRMED
