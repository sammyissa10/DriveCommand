---
phase: quick-29
plan: "01"
subsystem: dashboard
tags:
  - performance
  - auth
  - suspense
  - streaming
dependency_graph:
  requires:
    - src/lib/auth/session.ts (getSession)
    - src/lib/auth/roles.ts (UserRole)
  provides:
    - Optimized dashboard page with instant header/skeleton render
    - Deduped auth context helpers in dashboard and notification actions
  affects:
    - src/app/(owner)/dashboard/page.tsx
    - src/app/(owner)/actions/dashboard.ts
    - src/app/(owner)/actions/notifications.ts
tech_stack:
  added: []
  patterns:
    - getAuthContext() helper — single getSession() replaces requireRole() + requireTenantId()
    - Synchronous page component — Suspense boundaries activate before any await
key_files:
  modified:
    - src/app/(owner)/dashboard/page.tsx
    - src/app/(owner)/actions/dashboard.ts
    - src/app/(owner)/actions/notifications.ts
decisions:
  - Remove page-level requireRole() — layout already enforces OWNER/MANAGER auth, redundant check was blocking all Suspense boundaries
  - Make DashboardPage synchronous (no async) — fastest possible render path; all data fetching inside Suspense-wrapped child async components
  - getAuthContext() extracts role AND tenantId from same session object — single AES-256-GCM decrypt instead of two per data function
  - Keep requireRole/requireTenantId unchanged in sendLoadUpdateNotification and sendETANotification — those are client-facing actions that need the existing pattern
metrics:
  duration: 231s
  completed: "2026-02-24T20:06:42Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-29 Plan 01: Fix Dashboard Slow Loading / Blank White Screen Summary

**One-liner:** Eliminate ~9→4 AES-256-GCM session decrypts per dashboard load by removing blocking page-level auth and combining role+tenantId extraction into a single getSession() call per data function.

## What Was Built

The dashboard was suffering from a blank white screen on load due to a session decrypt waterfall:

1. Layout: `getSession()` + `getRole()` = 1 decrypt
2. Page: `await requireRole()` = 1 more decrypt — **this blocked ALL Suspense boundaries**
3. Each of 4 data functions: `requireRole()` + `requireTenantId()` = 2 decrypts each (x4 = 8)

**Total: ~10 session decrypts, with the page-level one preventing any skeleton from appearing.**

### Fix 1 — Remove blocking auth from DashboardPage (page.tsx)

Changed `export default async function DashboardPage()` to `export default function DashboardPage()`. Removed the `await requireRole()` call entirely. The layout (`OwnerShell`) already enforces OWNER/MANAGER auth before the page renders. The individual data functions still enforce auth as defense-in-depth.

Result: Page returns JSX synchronously, all 4 Suspense boundaries activate immediately and show skeletons while data loads.

### Fix 2 — getAuthContext() helper (dashboard.ts + notifications.ts)

Added a private `getAuthContext()` helper to both action files:

```typescript
async function getAuthContext(): Promise<{ tenantId: string }> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized: Authentication required');
  const role = session.role as UserRole;
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    throw new Error('Unauthorized: Required roles: OWNER, MANAGER');
  }
  if (!session.tenantId) {
    throw new Error('Tenant context is required');
  }
  return { tenantId: session.tenantId };
}
```

This replaces the previous pattern in `getNotificationAlerts`, `getDashboardMetrics`, `getUpcomingMaintenance`, and `getExpiringDocuments`:

```typescript
// Before (2 session decrypts per function):
await requireRole([UserRole.OWNER, UserRole.MANAGER]);
const tenantId = await requireTenantId();

// After (1 session decrypt per function):
const { tenantId } = await getAuthContext();
```

`SessionData` already contains both `role` and `tenantId` — the helper reads them in a single `getSession()` call instead of two separate calls.

## Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| Session decrypts per cold load | ~9-10 | ~4 |
| Page-level blocking auth | Yes (async + await) | No (synchronous) |
| Skeletons on navigation | Delayed (blank screen) | Instant |
| Defense-in-depth auth | Layout + page + data | Layout + data |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 + 2 | c92341b | Remove blocking page auth, add getAuthContext(), make DashboardPage sync |

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were combined into a single commit since Task 2 was verification-only (confirming the synchronous page change already made in Task 1).

## Verification

- `npx tsc --noEmit` — passes with no errors
- `npx next build` — compiles successfully (`✓ Compiled successfully in 9.2s`)
- `/dashboard` route correctly marked as `ƒ` (dynamic) in build output
- `DashboardPage` is synchronous — no `async` keyword, no `await` at page level
- Each of 4 dashboard data functions calls `getSession()` exactly once (via `getAuthContext()`)
- `sendLoadUpdateNotification` and `sendETANotification` unchanged (still use requireRole + requireTenantId)
- Auth enforced: layout blocks unauthorized access; each data function validates role+tenantId

## Self-Check

Files created/modified:
- `src/app/(owner)/dashboard/page.tsx` — modified (synchronous DashboardPage)
- `src/app/(owner)/actions/dashboard.ts` — modified (getAuthContext helper + 2 updated exports)
- `src/app/(owner)/actions/notifications.ts` — modified (getAuthContext helper + 2 updated exports)

Commits:
- c92341b — verified in git log
