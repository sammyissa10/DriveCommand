---
phase: quick-262
plan: 01
subsystem: auth
tags: [auth, password-reset, sysadmin, supabase]
dependency_graph:
  requires: [supabase-auth, lib/supabase/client, lib/supabase/admin, lib/auth/supabase]
  provides: [forgot-password-flow, reset-password-page, sysadmin-password-override]
  affects: [sign-in-page, tenant-detail-page]
tech_stack:
  added: []
  patterns: [Supabase auth.resetPasswordForEmail, Supabase auth.onAuthStateChange PASSWORD_RECOVERY, Supabase admin.generateLink, Supabase admin.updateUserById]
key_files:
  created:
    - apps/web/src/app/(auth)/forgot-password/page.tsx
    - apps/web/src/app/(auth)/reset-password/page.tsx
    - apps/web/src/app/api/auth/admin-reset-password/route.ts
    - apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx
  modified:
    - apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    - apps/web/src/app/(admin)/tenants/[id]/page.tsx
decisions:
  - Anti-enumeration: forgot-password always shows success message regardless of whether email exists
  - PASSWORD_RECOVERY event gates reset-password form with 5s timeout for invalid/expired links
  - Sysadmin admin-reset-password uses service role key server-side only, guarded by isSystemAdmin() check
metrics:
  duration: ~6 minutes
  completed: 2026-04-20
  tasks_completed: 2
  files_modified: 6
---

# Phase quick-262: Add Forgot Password Flow and Sysadmin Password Override Summary

**One-liner:** Self-service forgot password via Supabase resetPasswordForEmail + sysadmin password override (send email or set directly) on tenant detail page using service role key.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Forgot password and reset password pages | 4518ec2 | sign-in/page.tsx, forgot-password/page.tsx, reset-password/page.tsx |
| 2 | Sysadmin password reset on tenant detail page | 2dd700d | admin-reset-password/route.ts, reset-password-button.tsx, tenants/[id]/page.tsx |

## What Was Built

### Task 1 — Forgot Password Flow

**Sign-in page:** Added "Forgot password?" link below password field using Next.js Link to `/forgot-password`, styled as `text-sm text-blue-400` for visibility on the dark overlay auth background.

**Forgot password page** (`/forgot-password`): Matches auth card style. Calls `supabase.auth.resetPasswordForEmail()` with `redirectTo: ${origin}/reset-password`. Always shows success message regardless of result — prevents email enumeration attack.

**Reset password page** (`/reset-password`): Listens for `PASSWORD_RECOVERY` auth state event to gate the form. 5-second timeout shows "Invalid or expired reset link" if no event arrives. Two password fields with Eye/EyeOff show/hide toggles. Client-side validation: min 8 chars, passwords must match. On success: shows green message and redirects to sign-in after 3 seconds.

### Task 2 — Sysadmin Password Override

**API route** (`/api/auth/admin-reset-password`): POST handler guarded by `requireAuth()` + `isSystemAdmin()`. Two actions:
- `send_reset`: calls `supabase.auth.admin.generateLink({ type: 'recovery', ... })` — generates and sends reset email
- `set_password`: validates min 8 chars, calls `supabase.auth.admin.updateUserById(userId, { password })` — directly sets password

Service role key used server-side only. Structured logging on both actions and errors.

**ResetPasswordButton component**: Client modal with backdrop. Shows owner name/email. Two option cards:
- Option A: "Send Reset Email" button — calls API with `action: 'send_reset'`
- Option B: "Set Temporary Password" — reveals password input with Eye/EyeOff toggle + "Set Password" button, min 8 chars client validation. Success message instructs sysadmin to share password securely.

**Tenant detail page**: `ResetPasswordButton` wired below `OwnerEmailForm` in the Owner section, only when `tenant.ownerUser` exists.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- FOUND: apps/web/src/app/(auth)/forgot-password/page.tsx
- FOUND: apps/web/src/app/(auth)/reset-password/page.tsx
- FOUND: apps/web/src/app/api/auth/admin-reset-password/route.ts
- FOUND: apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx

Commits exist:
- FOUND: 4518ec2 (Task 1)
- FOUND: 2dd700d (Task 2)

TypeScript: no errors in new/modified files (pre-existing e2e errors unrelated)
