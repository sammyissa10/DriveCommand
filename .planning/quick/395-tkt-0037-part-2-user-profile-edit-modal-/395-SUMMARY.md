---
phase: quick-395
plan: 395
subsystem: sysadmin
tags: [sysadmin, users, modal, supabase, ban-unban, server-action]
dependency_graph:
  requires: [quick-394, quick-392]
  provides: [user-profile-edit-modal, supabase-ban-unban]
  affects: [sysadmin-users-page, sysadmin-tenant-detail]
tech_stack:
  added: []
  patterns: [useState+useTransition modal, read-before-write with compensating rollback, Supabase Admin ban_duration]
key_files:
  created:
    - apps/web/src/app/(admin)/users/edit-user-modal.tsx
  modified:
    - apps/web/src/app/(admin)/actions/users.ts
    - apps/web/src/app/(admin)/users/users-list.tsx
    - apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
decisions:
  - "Used ban_duration '876000h' (~100 years) for effectively permanent Supabase session ban — matches Supabase Admin API semantics"
  - "Compensating rollback pattern: Prisma update first, then Supabase; on Supabase failure revert Prisma to keep systems consistent"
  - "EditableUser interface accepted by EditUserModal so tenant-users-section (which has lighter TenantUser shape) can pass data without needing full AdminUserRow"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-20"
  tasks: 3
  files: 4
---

# Quick 395: TKT-0037 Part 2 — Sysadmin User Profile Edit Modal Summary

One-liner: Shared EditUserModal with Supabase ban/unban and compensating Prisma rollback, wired into both /users and /tenants/[id] sysadmin surfaces.

## What Was Built

Three tasks, one commit:

**Task 1 — updateUserProfile server action** (`apps/web/src/app/(admin)/actions/users.ts`)
- Zod schema whitelisting exactly 4 fields: firstName, lastName, role (OWNER/MANAGER/DRIVER only), isActive
- `requireAdminAccess()` guard (existing pattern)
- Hard server-side guard: refuses any user where `isSystemAdmin = true`
- Read-before-write: captures previous state for isActive transition detection and rollback data
- On isActive transition: calls `supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' | 'none' })`
- On Supabase failure: compensating Prisma rollback to previous state, returns `{ success: false, error }` with clear message
- Returns discriminated union `{ success: true, user: AdminUserRow } | { success: false, error: string }`

**Task 2 — EditUserModal component** (`apps/web/src/app/(admin)/users/edit-user-modal.tsx`)
- `'use client'` component using `useState` + `useTransition` (no react-hook-form, no shadcn Dialog)
- Accepts `EditableUser | AdminUserRow | null` so both call sites can pass their native shapes
- Email shown as read-only text with helper copy ("Email cannot be changed here")
- 4 editable fields: First Name (text, required, maxLength=100), Last Name (text, required, maxLength=100), Role (select: OWNER/MANAGER/DRIVER only), Active (checkbox with helper "Unchecking will sign the user out of all sessions")
- Save disabled when isPending or either name field trims to empty
- Error stays visible inside modal on failure; modal only closes on success
- Calls `router.refresh()` after success for server-rendered data consistency

**Task 3 — Wire into both surfaces**
- `/users` page (`users-list.tsx`): new rightmost "Actions" column with Edit button; `editingUser` state; EditUserModal mounted at bottom of JSX
- `/tenants/[id]` users section (`tenant-users-section.tsx`): "Edit User" dropdown item above "Send Password Reset"; `onEdit` callback on ActionsDropdown; EditUserModal with `onSuccess` optimistic update to local users list and success banner

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- `apps/web/src/app/(admin)/actions/users.ts` — modified, exports `updateUserProfile`, `UpdateUserProfileInput`, `UpdateUserProfileResult`
- `apps/web/src/app/(admin)/users/edit-user-modal.tsx` — created, exports `EditUserModal`, `EditableUser`
- `apps/web/src/app/(admin)/users/users-list.tsx` — modified, imports `EditUserModal`, has Actions column
- `apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx` — modified, imports `EditUserModal`, "Edit User" above "Send Password Reset"
- Commit `c7d1d9f0` — confirmed
- `tsc --noEmit` — zero errors in modified files (pre-existing framer-motion/nuqs/d3-geo noise only)

## Self-Check: PASSED

---

TKT-0037 Part 2 shipped. TKT-0037 complete pending sysadmin verification on production.
