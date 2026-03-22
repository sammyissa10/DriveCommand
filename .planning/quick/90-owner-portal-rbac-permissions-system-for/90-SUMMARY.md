---
phase: quick-90
plan: 1-4
subsystem: auth
tags: [rbac, permissions, manager-role, middleware, server-actions, settings]
dependency_graph:
  requires: [auth-session, auth-context, middleware, sidebar, prisma-schema]
  provides: [manager-permissions, permission-guard, team-permissions-page, server-side-enforcement]
  affects: [all-gated-server-actions, sidebar-nav, middleware-routing]
tech_stack:
  added: []
  patterns: [defense-in-depth, permission-gating, optimistic-ui]
key_files:
  created:
    - src/lib/auth/permissions.ts
    - src/lib/auth/require-permission.ts
    - src/app/(owner)/actions/team-permissions.ts
    - src/app/(owner)/settings/team-permissions/page.tsx
    - prisma/migrations/20260322000001_add_user_permissions/migration.sql
  modified:
    - prisma/schema.prisma
    - src/lib/auth/session.ts
    - src/lib/auth/auth-context.tsx
    - src/lib/auth/guards.tsx
    - src/app/api/auth/login/route.ts
    - src/app/api/auth/me/route.ts
    - src/middleware.ts
    - src/components/navigation/sidebar.tsx
    - src/app/(owner)/actions/payroll.ts
    - src/app/(owner)/actions/invoices.ts
    - src/app/(owner)/actions/customers.ts
    - src/app/(owner)/actions/ai-documents.ts
    - src/app/(owner)/actions/lane-analytics.ts
    - src/app/(owner)/actions/profit-predictor.ts
    - src/app/(owner)/actions/ifta.ts
    - src/app/(owner)/actions/subscription.ts
    - src/app/(owner)/actions/expense-categories.ts
    - src/app/(owner)/actions/expense-templates.ts
    - src/app/(owner)/actions/integrations.ts
decisions:
  - OWNER role always bypasses permission checks at all layers (type system, middleware, server actions)
  - MANAGER defaults to all-false permissions (deny-by-default); OWNER grants via /settings/team-permissions
  - Defense-in-depth: 3 enforcement layers (middleware, PermissionGuard UI, requirePermission server actions)
  - Settings section opened to MANAGER with individual item guards, not hidden entirely
  - subscription.ts uses custom requireOwnerOrManager helper so requirePermission added after it instead
metrics:
  duration: 15min
  completed: 2026-03-22
  tasks: 8
  files: 19
---

# Quick Task 90: Owner Portal RBAC Permissions System for MANAGER Role — Summary

## One-liner

Full RBAC permission system for MANAGER role with 9 boolean permissions stored as JSONB, enforced at middleware, UI (PermissionGuard), and server action layers, with an OWNER-only /settings/team-permissions toggle UI.

## What Was Built

Four sequential plans implementing a defense-in-depth permissions system:

**Plan 1 — DB + Types + Auth Chain:**
- `src/lib/auth/permissions.ts` — Core types: `UserPermissions` interface (9 keys), `DEFAULT_MANAGER_PERMISSIONS` (all false), `OWNER_PERMISSIONS` (all true), `PERMISSION_LABELS`, `PERMISSION_GATED_PATHS`, `hasPermission()`, `getPermissions()`
- `permissions Json?` column added to User model in schema.prisma with migration SQL
- Permissions threaded through: login route → SessionData → /api/auth/me → AuthContext.AuthUser

**Plan 2 — Middleware + PermissionGuard + Sidebar:**
- Middleware MANAGER guard: checks `PERMISSION_GATED_PATHS` and redirects unauthorized requests to `/unauthorized`
- `PermissionGuard` component: OWNER always renders children, MANAGER checks `user.permissions[key]`
- Sidebar: Intelligence items (lane-analytics, profit-predictor, ifta), Business items (crm, invoices, payroll, ai-documents) wrapped with PermissionGuard
- Settings section opened to MANAGER role with per-item PermissionGuard; Team Permissions link shown to OWNER only

**Plan 3 — Team Permissions Settings Page:**
- `src/app/(owner)/actions/team-permissions.ts` — `getTeamMembers()` and `updateUserPermissions()`, both OWNER-only with cross-tenant security check
- `/settings/team-permissions` page — card per MANAGER with 9 permission toggles (Switch + Label + description), optimistic UI with toast feedback, empty state with driver invite prompt

**Plan 4 — Server-side Permission Guards:**
- `src/lib/auth/require-permission.ts` — `requirePermission(key)` helper, OWNER passes immediately, MANAGER checked against session permissions
- Added to 11 server action files (24 total function-level enforcement points)

## Decisions Made

1. **Deny-by-default** — new MANAGER users start with all permissions false; owner explicitly grants each one
2. **3-layer enforcement** — middleware (routing), PermissionGuard (UI visibility), requirePermission (data security). Each layer provides independent protection
3. **OWNER bypasses all checks** — no performance overhead for the primary user role; avoids breaking existing OWNER workflows
4. **Session carries permissions** — permissions baked into encrypted session cookie at login time; no per-request DB call needed for middleware checks
5. **Settings section open to MANAGER** — the section wrapper condition changed from `OWNER-only` to `OWNER || MANAGER`, with individual PermissionGuard per item, so managers with appropriate permissions see only what they can access

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- FOUND: src/lib/auth/permissions.ts
- FOUND: src/lib/auth/require-permission.ts
- FOUND: src/app/(owner)/actions/team-permissions.ts
- FOUND: src/app/(owner)/settings/team-permissions/page.tsx
- FOUND: prisma/migrations/20260322000001_add_user_permissions/migration.sql

Commits verified:
- FOUND: e8c29e9 — Plan 1 (DB + types + auth chain)
- FOUND: 5612f66 — Plan 2 (middleware + PermissionGuard + sidebar)
- FOUND: 3f9fa75 — Plan 3 (team permissions page)
- FOUND: 46cf9ad — Plan 4 (server-side guards)

Build: PASSED (npm run build — /settings/team-permissions listed as dynamic route, no errors)

## Post-Execution Manual Steps Required

1. Run DB migration: `npx prisma migrate deploy` (applies the JSONB column to production)
2. Log out and log back in to refresh the session cookie with the new `permissions` field
3. Test flow: create a MANAGER user → verify they see no gated nav items → go to /settings/team-permissions → grant permissions → verify MANAGER now sees granted items
