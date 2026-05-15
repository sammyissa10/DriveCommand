---
status: diagnosed
trigger: "/admin/notifications returns 404 on production"
created: 2026-05-15T00:00:00Z
updated: 2026-05-15T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — two distinct bugs identified
test: All investigation steps completed
expecting: N/A — diagnosis complete
next_action: Fix both bugs (route group path mismatch + middleware allowlist gap)

## Symptoms

expected: /admin/notifications renders SysAdmin notification template management UI
actual: 404 on production (drive-command.vercel.app)
errors: Standard Next.js 404. Sysadmin sidebar "Notifications" link redirects to /admin/support instead of /admin/notifications.
reproduction: Visit /admin/notifications on prod. Or click Notifications in sysadmin sidebar.
started: Has never worked on prod. Shipped 2026-05-15 via commits 5d02bed and 761df26.

## Eliminated

- hypothesis: Route file does not exist
  evidence: apps/web/src/app/(admin)/notifications/page.tsx exists and exports a valid default React component with auth guard.
  timestamp: 2026-05-15

- hypothesis: Commits 5d02bed and 761df26 contain the page code
  evidence: 5d02bed only touched .planning/STATE.md (docs). 761df26 only touched package.json and package-lock.json (peer dep fix). Neither commit introduced the page. The page was added in earlier commits 7041a4d and 019e213. All commits are present on origin/master — no branch merge issue.
  timestamp: 2026-05-15

- hypothesis: Next.js config has redirects/rewrites blocking the route
  evidence: next.config.ts contains only headers() — no redirects or rewrites defined.
  timestamp: 2026-05-15

- hypothesis: Middleware intercepts and redirects /admin/notifications to /admin/support
  evidence: Middleware does not redirect to /admin/support for any path. The /admin/support redirect only fires when isSystemAdmin=true and the path is NOT in ADMIN_ALLOWED_PATHS. /notifications is not in ADMIN_ALLOWED_PATHS, so sysadmin visiting /notifications gets redirected to /admin-support. This is Bug #2 — but distinct from the 404 cause.
  timestamp: 2026-05-15

## Evidence

- timestamp: 2026-05-15
  checked: apps/web/src/app/ directory structure
  found: The route group is named (admin) — a parenthetical group. In Next.js App Router, (admin) is a route group and does NOT add a path segment. So the page at apps/web/src/app/(admin)/notifications/page.tsx is served at the URL path /notifications, NOT /admin/notifications.
  implication: BUG #1 — The URL /admin/notifications does not exist. The correct URL is /notifications.

- timestamp: 2026-05-15
  checked: apps/web/src/app/(admin)/layout.tsx nav links
  found: All other admin pages match this pattern — they use /admin-dashboard, /tenants, /admin-support, /billing, /plans, /promos, /docs. All are root-level paths. The Notifications link was added in commit 6d93f3a with href="/notifications" — which is consistent with the route group pattern.
  implication: The nav link href="/notifications" is correct for the route group. The issue description saying "404 at /admin/notifications" may be because someone assumed the URL would be /admin/notifications.

- timestamp: 2026-05-15
  checked: middleware.ts ADMIN_ALLOWED_PATHS
  found: ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations']. The path '/notifications' is NOT in this list.
  implication: BUG #2 — When a sysadmin visits /notifications, middleware sees it is not in ADMIN_ALLOWED_PATHS and redirects to /admin-support. This is why clicking the Notifications sidebar link appears to redirect to /admin/support.

- timestamp: 2026-05-15
  checked: git log for commits 5d02bed and 761df26
  found: 5d02bed = docs only (STATE.md). 761df26 = package.json peer dep fix only. The actual page code was in earlier commits (7041a4d, 019e213, etc). All of these are present on origin/master.
  implication: No missing commits. Code is deployed. The issue is purely routing/middleware.

- timestamp: 2026-05-15
  checked: owner sidebar (apps/web/src/components/navigation/sidebar.tsx)
  found: Sidebar has /settings/notifications and /settings/my-notifications links for owner portal — these are separate owner-portal paths and unrelated to the sysadmin notifications page.
  implication: Sysadmin nav is in the (admin)/layout.tsx header, not sidebar.tsx. No sidebar bug for sysadmin.

## Resolution

root_cause: TWO bugs.
  Bug #1 (primary — 404): /admin/notifications does not exist as a URL. The page lives at /notifications (the (admin) route group strips the path segment). Visiting the correct URL /notifications would work IF middleware allowed it.
  Bug #2 (secondary — middleware block): /notifications is absent from ADMIN_ALLOWED_PATHS in middleware.ts. So even if a sysadmin navigates to /notifications, middleware redirects them to /admin-support. This is why the nav click appears to land on support.
fix: N/A (diagnose only)
verification: N/A
files_changed: []
