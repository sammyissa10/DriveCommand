---
phase: quick-281
plan: "01"
subsystem: sysadmin-portal
tags: [sysadmin, tenant-management, prisma-migration, role-management, password-reset]
dependency_graph:
  requires: [sysadmin-auth, prisma-db, supabase-admin-client]
  provides: [tenant-settings-editing, tenant-users-table, role-change, password-reset-for-any-user]
  affects: [tenant-detail-page, admin-api-routes]
tech_stack:
  added: []
  patterns: [server-action-with-zod, client-fetch-api-route, inline-actions-dropdown, prisma-generate]
key_files:
  created:
    - apps/web/prisma/migrations/20260422200001_add_tenant_contact_email_plan/migration.sql
    - apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx
    - apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
    - apps/web/src/app/api/admin/tenants/[id]/users/route.ts
    - apps/web/src/app/api/admin/users/[id]/role/route.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/(admin)/actions/tenants.ts
    - apps/web/src/app/(admin)/tenants/[id]/page.tsx
    - apps/web/src/generated/prisma/ (regenerated)
decisions:
  - ChangeRoleModal co-located in tenant-users-section.tsx to avoid a separate import file for a tightly-coupled component
  - Supabase Auth app_metadata update on role change is fire-and-forget (logged on failure) so DB inconsistency is surfaced without blocking the UX
  - Migration applied to Supabase manually via migration.sql file since direct DB port 5432 is unreachable from local dev
metrics:
  duration: "~8 minutes"
  completed: "2026-04-22"
  tasks_completed: 3
  files_changed: 9
---

# Phase quick-281: Add Tenant Settings, User List, Password Reset, and Role Change

Sysadmin tenant detail page now includes editable settings (contactEmail, timezone, plan), a full users table with role-colored badges, password reset for any user, and role change for MANAGER/DRIVER users — all without direct DB access.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Add contactEmail/plan fields, settings form, server action | 5ebaa3c | schema.prisma, tenants.ts, tenant-settings-form.tsx, page.tsx |
| 2 | Build users API, users table, password reset integration | 69cb0bf | api/admin/tenants/[id]/users/route.ts, tenant-users-section.tsx |
| 3 | Role change API + modal, Prisma client regen | 9fe7743 | api/admin/users/[id]/role/route.ts, generated/prisma/ |

## What Was Built

### Schema Changes
- Added `contactEmail String?` and `plan String @default("starter")` to Tenant model
- Migration: `20260422200001_add_tenant_contact_email_plan`

### Tenant Settings Form (`tenant-settings-form.tsx`)
- 3-field form: Contact Email (optional), Timezone (7 IANA zones), Plan (starter/pro/enterprise)
- Server action `updateTenantSettings` with zod validation
- Inline success/error feedback, Save button disabled when no changes

### Users Table (`tenant-users-section.tsx`)
- Fetches `GET /api/admin/tenants/[id]/users` on mount
- Role badges: OWNER=purple, MANAGER=blue, DRIVER=green
- Status dot: green Active / gray Inactive
- Actions dropdown with click-outside close
- "Send Password Reset" for all roles (confirmation dialog → `/api/auth/admin-reset-password`)
- "Change Role" hidden for OWNER users
- `ChangeRoleModal` co-located: radio buttons for MANAGER/DRIVER, live table update on success

### API Routes
- `GET /api/admin/tenants/[id]/users` — returns user array (no passwordHash)
- `PATCH /api/admin/users/[id]/role` — updates Prisma DB + Supabase Auth app_metadata, blocks OWNER change with 400

### Page Layout
Header → Stats grid → Tenant Settings card → Users card → Billing History

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma client not regenerated after schema change**
- **Found during:** Task 3 TypeScript check
- **Issue:** Prisma client didn't include `contactEmail`/`plan` fields since the generated client was stale
- **Fix:** Ran `prisma generate` to regenerate client from updated schema
- **Files modified:** `apps/web/src/generated/prisma/`
- **Commit:** 9fe7743

**2. [Rule 1 - Bug] Zod v4 enum syntax incompatibility**
- **Found during:** Task 3 TypeScript check
- **Issue:** `z.enum([...], { errorMap: () => ... })` not valid in Zod v4 API
- **Fix:** Changed to `z.enum(['starter', 'pro', 'enterprise'] as const)` without custom errorMap
- **Files modified:** `apps/web/src/app/(admin)/actions/tenants.ts`
- **Commit:** 9fe7743

## Self-Check

**Files exist:**
- `apps/web/prisma/migrations/20260422200001_add_tenant_contact_email_plan/migration.sql` - FOUND
- `apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx` - FOUND
- `apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx` - FOUND
- `apps/web/src/app/api/admin/tenants/[id]/users/route.ts` - FOUND
- `apps/web/src/app/api/admin/users/[id]/role/route.ts` - FOUND

**Commits exist:** 5ebaa3c, 69cb0bf, 9fe7743 - FOUND

**TypeScript:** `npx tsc --noEmit` in apps/web exits 0 - PASSED

## Self-Check: PASSED
