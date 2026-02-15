---
phase: 10-dashboard-system-admin
plan: 02
subsystem: admin-portal
tags: [tenant-management, multi-tenant, authorization, tanstack-table, confirmation-dialogs]
dependency_graph:
  requires:
    - phase-01-plan-02 (base Prisma client for cross-tenant access)
    - phase-02-plan-01 (isSystemAdmin authorization helper)
  provides:
    - tenant-crud-actions (getAllTenants, createTenant, suspendTenant, reactivateTenant, deleteTenant)
    - admin-tenant-ui (list, create, suspend, delete with confirmations)
  affects:
    - admin-portal (added tenant management navigation)
tech_stack:
  added:
    - TanStack Table v8 for tenant list (sorting, filtering)
    - Zod validation for tenant creation (name 2-100 chars, slug 2-50 chars lowercase alphanumeric + hyphens)
  patterns:
    - Defense-in-depth: requireSystemAdmin() called in every server action (layout check is UX-only)
    - Cross-tenant access: base prisma client (NOT getTenantPrisma) for system admin operations
    - Confirmation dialogs: useState for confirmAction state, fixed overlay with modal dialog
    - Color coding: green (Active), red (Suspended/Delete), orange (Suspend)
    - Server/client separation: page.tsx fetches data, client component handles mutations
key_files:
  created:
    - src/app/(admin)/actions/tenants.ts (5 server actions with isSystemAdmin enforcement)
    - src/app/(admin)/tenants/page.tsx (server component with getAllTenants)
    - src/app/(admin)/tenants/tenant-list-client.tsx (TanStack Table with confirmation dialogs)
    - src/app/(admin)/tenants/new/page.tsx (create tenant form with validation)
  modified:
    - src/app/(admin)/layout.tsx (added Tenants nav link in header)
decisions:
  - requireSystemAdmin helper function centralizes authorization check for all tenant actions
  - Base prisma client used for cross-tenant queries (system admin sees ALL tenants)
  - Confirmation dialogs for suspend and delete, no confirmation for reactivate (non-destructive)
  - Delete button uses red styling to indicate destructive action
  - Slug validation enforces lowercase alphanumeric + hyphens with regex /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  - Foreign key constraint errors return friendly message about removing users/trucks/routes first
  - Unique constraint errors on slug return friendly "already exists" message
metrics:
  duration: 282
  tasks_completed: 2
  files_created: 4
  files_modified: 1
  completed_at: 2026-02-15T07:55:41Z
---

# Phase 10 Plan 02: Tenant Management UI Summary

**One-liner:** System admin portal for managing all platform tenants with TanStack Table, CRUD operations, and confirmation dialogs for destructive actions.

## What Was Built

Built complete tenant management system for system administrators to manage all tenants on the platform. System admins can view all tenants with resource counts (users, trucks, routes), create new tenants, suspend/reactivate tenants, and delete tenants with appropriate confirmation dialogs.

## Detailed Changes

### Task 1: Tenant CRUD Server Actions (Commit: a730923)

Created `src/app/(admin)/actions/tenants.ts` with five server actions:

1. **requireSystemAdmin() helper**
   - Centralizes authorization check: `await requireAuth()` then `await isSystemAdmin()`
   - Throws error if not system admin
   - Called at the start of EVERY action (defense-in-depth pattern)

2. **getAllTenants()**
   - Uses base `prisma.tenant.findMany()` (NOT getTenantPrisma - critical for cross-tenant access)
   - Selects: id, name, slug, isActive, createdAt, updatedAt
   - Includes `_count: { users, trucks, routes }` for tenant health metrics
   - Orders by createdAt desc

3. **createTenant(formData)**
   - Validates with Zod: name (2-100 chars), slug (2-50 chars, lowercase alphanumeric + hyphens)
   - Regex validation for slug: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
   - Creates tenant with isActive: true
   - Catches Prisma unique constraint error (P2002 on slug) and returns friendly message
   - Returns `{ success: true, tenant }` or `{ success: false, error: string }`

4. **suspendTenant(tenantId)** / **reactivateTenant(tenantId)**
   - Validates tenantId is non-empty
   - Updates isActive flag (false for suspend, true for reactivate)
   - Calls revalidatePath('/tenants')

5. **deleteTenant(tenantId)**
   - Hard delete per Phase 01 project decision
   - Catches foreign key constraint error (P2003) and returns friendly message about removing users/trucks/routes first
   - Calls revalidatePath('/tenants')

All actions use base `prisma` client from '@/lib/db/prisma' (NOT tenant-scoped getTenantPrisma), which is critical because system admins need to see ALL tenants across the platform.

### Task 2: Admin Tenant Management UI (Commit: 4090462)

Created three pages and updated admin layout:

1. **src/app/(admin)/tenants/page.tsx** (server component)
   - Calls `await getAllTenants()` for server-side data fetching
   - Renders page heading "Tenant Management" with subtitle
   - "Create Tenant" button (bg-gray-900) links to /tenants/new
   - Passes tenants to TenantListClient

2. **src/app/(admin)/tenants/tenant-list-client.tsx** (client component)
   - TanStack Table v8 with sorting, filtering, and global search
   - Columns: Name, Slug (shows '---' if null), Status (badge), Users, Trucks, Routes, Created, Actions
   - Status badge: green "Active" or red "Suspended"
   - Actions column:
     - Suspend button (orange text) if active → opens confirmation dialog
     - Reactivate button (green text) if suspended → executes immediately (non-destructive)
     - Delete button (red text) → opens red confirmation dialog

   - **Confirmation dialog implementation:**
     - useState for `confirmAction: { type: 'suspend' | 'delete', tenantId, tenantName } | null`
     - Fixed overlay (bg-black/50) with centered white dialog card
     - Suspend dialog: "Suspend {name}? Users will not be able to access their accounts."
     - Delete dialog: "Delete {name}? This action cannot be undone. All tenant data will be permanently removed." (red button)
     - Both have Cancel button to dismiss
     - On confirm: call server action, router.refresh(), clear confirmAction
     - Delete action handles foreign key errors and shows alert with friendly message

3. **src/app/(admin)/tenants/new/page.tsx** (client component)
   - Form with two fields: Name (text, required) and Slug (text, required, helper text about format)
   - Client-side error handling with useState for validation/creation errors
   - Calls createTenant server action on submit
   - If result.success, redirects to /tenants
   - If result.success is false, displays error in red banner
   - Cancel link back to /tenants
   - Gray-900 button styling matching admin portal theme

4. **src/app/(admin)/layout.tsx** (modified)
   - Added Link import
   - Added nav element in header with "Tenants" link (white text with hover opacity)
   - Nav positioned next to "DriveCommand Admin" title in a flex container

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod error property name**
- **Found during:** Task 1 verification (TypeScript compilation)
- **Issue:** Used `validation.error.errors[0].message` but ZodError uses `issues` property, not `errors`
- **Fix:** Changed to `validation.error.issues[0].message`
- **Files modified:** src/app/(admin)/actions/tenants.ts
- **Commit:** a730923 (same commit, fixed before committing)

**2. [Rule 1 - Bug] Fixed TypeScript error handling in create form**
- **Found during:** Task 2 verification (TypeScript compilation)
- **Issue:** `result.error` could be undefined, TypeScript error on setError call
- **Fix:** Added null check: `if ('error' in result && result.error)` before setError
- **Files modified:** src/app/(admin)/tenants/new/page.tsx
- **Commit:** 4090462 (same commit, fixed before committing)

## Testing Notes

**Manual verification performed:**
1. Server actions use 'use server' directive: ✓
2. isSystemAdmin called in every action (>= 5 usages via requireSystemAdmin): ✓
3. Base prisma client imported (NOT getTenantPrisma): ✓
4. All five server actions present: ✓
5. getAllTenants used in page.tsx: ✓
6. useReactTable used in client component: ✓
7. confirmAction state for confirmation dialogs: ✓
8. deleteTenant and suspendTenant action calls present: ✓
9. createTenant used in new page: ✓
10. /tenants nav link added to layout: ✓
11. TypeScript compilation passes: ✓

## Success Criteria Met

- [x] System admin sees all tenants with status and resource counts in sortable table
- [x] System admin can create new tenant with name and slug (validation enforced)
- [x] System admin can suspend tenant with confirmation dialog
- [x] System admin can reactivate suspended tenant
- [x] System admin can delete tenant with red confirmation dialog warning about permanence
- [x] All actions enforce isSystemAdmin authorization at server action level

## Self-Check

Verifying all created files exist and commits are recorded:

**Created files:**
- src/app/(admin)/actions/tenants.ts: ✓
- src/app/(admin)/tenants/page.tsx: ✓
- src/app/(admin)/tenants/tenant-list-client.tsx: ✓
- src/app/(admin)/tenants/new/page.tsx: ✓

**Modified files:**
- src/app/(admin)/layout.tsx: ✓

**Commits:**
- Task 1 (a730923): ✓
- Task 2 (4090462): ✓

## Self-Check: PASSED
