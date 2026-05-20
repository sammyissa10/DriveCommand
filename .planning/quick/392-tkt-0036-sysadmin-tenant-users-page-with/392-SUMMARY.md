---
phase: quick-392
plan: 392
subsystem: sysadmin-portal
tags: [sysadmin, users, cross-tenant, tanstack-table, tkt-0036]
dependency_graph:
  requires: [prisma.user, prisma.tenant, (admin)/layout.tsx, middleware.ts]
  provides: [/users route, getAllUsers server action, UsersList client component]
  affects: [(admin) nav, middleware ADMIN_ALLOWED_PATHS]
tech_stack:
  added: []
  patterns: [bare-prisma-cross-tenant-read, tanstack-table-v8, client-side-filter]
key_files:
  created:
    - apps/web/src/app/(admin)/actions/users.ts
    - apps/web/src/app/(admin)/users/page.tsx
    - apps/web/src/app/(admin)/users/users-list.tsx
  modified:
    - apps/web/src/middleware.ts
    - apps/web/src/app/(admin)/layout.tsx
decisions:
  - "Used bare prisma (not getTenantPrisma) for intentional cross-tenant sysadmin reads — matches tenants.ts pattern"
  - "Duplicated requireAdminAccess locally in users.ts — per spec constraint, not imported from tenants.ts"
  - "Applied pre-filtering (useMemo) for Role/Status/Tenant before TanStack Table, globalFilter for search — avoids coupling custom filterFns to accessorKeys"
  - "tenantId is non-nullable in schema, so AdminUserRow.tenantId typed as string (not string | null)"
metrics:
  duration: ~15 min
  completed: 2026-05-19
  tasks: 3
  files_changed: 5
---

# Phase quick-392: TKT-0036 Sysadmin Tenant Users Overview Page Summary

Sysadmin cross-tenant user listing at `/users` with TanStack Table v8, global search (name/email/tenant), and three client-side filter dropdowns (Role/Status/Tenant) — pure pattern-lift from existing `/tenants` admin page.

## What Was Built

**New `/users` route** accessible only to sysadmin. Lists every non-sample, non-sysadmin user across all tenants in a single searchable/filterable table. Sysadmin can find any tenant user for support without logging into individual tenants.

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/src/app/(admin)/actions/users.ts` | `getAllUsers()` server action with local `requireAdminAccess`, bare prisma cross-tenant read, exports `AdminUserRow` type |
| `apps/web/src/app/(admin)/users/page.tsx` | Server component — fetches users, renders `<UsersList>` client component |
| `apps/web/src/app/(admin)/users/users-list.tsx` | Client component — TanStack Table v8, global search, 3 filter dropdowns, 6 columns with role badges + status dots |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/middleware.ts` | Added `'/users'` to `ADMIN_ALLOWED_PATHS` after `'/tenants'` (line 154) |
| `apps/web/src/app/(admin)/layout.tsx` | Added `<Link href="/users">Users</Link>` nav item after Tenants link |

## Security Confirmations

**Bare prisma used (not getTenantPrisma):** Yes. `getAllUsers()` uses the bare `prisma` client for intentional cross-tenant reads, matching the established sysadmin pattern in `actions/tenants.ts`. Comment in file explicitly documents this.

**requireAdminAccess duplicated locally:** Yes. `requireAdminAccess()` is defined inline in `users.ts` — identical body (`requireAuth()` + `isSystemAdmin()` check) but NOT imported from `tenants.ts`. This satisfies the spec constraint and keeps the files independently auditable.

**Field whitelist enforced:** The `select` block includes only 9 fields: `id`, `firstName`, `lastName`, `email`, `role`, `isActive`, `createdAt`, `tenantId`, `tenant.name`. The following sensitive fields are NEVER selected or exposed to the client:
- `passwordHash`
- `licenseNumber`
- `permissions`
- `isDispatchReady`
- `isSample`
- `isSystemAdmin`

## Three-Layer Auth Guard

1. **Middleware** — `ADMIN_ALLOWED_PATHS` now includes `'/users'`; non-sysadmin tokens fail `startsWith('/users')` → redirect to `/admin-support`
2. **Layout** — `(admin)/layout.tsx` calls `isSystemAdmin()` → redirect to `/sign-in` if not admin
3. **Server action** — `getAllUsers()` calls local `requireAdminAccess()` → throws `Unauthorized` if not admin

## UI Spec Implemented

- **Columns:** Name (mailto link), Email, Tenant (tenantId as tooltip), Role (badge: OWNER=purple/MANAGER=blue/DRIVER=green), Status (green/gray dot), Created (date-fns `MMM d, yyyy`)
- **Search:** Custom `globalFilterFn` matches firstName+lastName, email, tenant.name case-insensitively
- **Filters:** Role dropdown (ALL/OWNER/MANAGER/DRIVER), Status dropdown (ALL/Active/Inactive), Tenant dropdown (ALL + distinct tenant names)
- **Empty state:** "No users match the current filters" centered with `text-gray-500 py-8`
- **Sort:** All columns click-to-sort via `getToggleSortingHandler()`, asc/desc arrows shown
- No pagination, no DataTable abstraction — matches `/tenants` pattern exactly

## Deviations from Plan

None — plan executed exactly as written. One note: `tenantId` in the `AdminUserRow` type is typed as `string` (not `string | null`) because the Prisma schema defines `tenantId String @db.Uuid` (non-nullable) on the User model. The spec suggested `string | null` as a possibility — schema confirms non-nullable so the stricter type was used.

## TypeScript Check

`npx tsc --noEmit` passes with zero new errors introduced by these files. Pre-existing errors in the codebase (missing `framer-motion`, `nuqs`, `zustand`, `d3-geo` packages) are unrelated to this task and existed before.

## Commit

`c74e3cf7` — feat(admin): add sysadmin tenant users overview page with search and filters [TKT-0036]

## Self-Check: PASSED

Files exist:
- `apps/web/src/app/(admin)/actions/users.ts` — FOUND
- `apps/web/src/app/(admin)/users/page.tsx` — FOUND
- `apps/web/src/app/(admin)/users/users-list.tsx` — FOUND

Commit `c74e3cf7` exists in git log — FOUND
