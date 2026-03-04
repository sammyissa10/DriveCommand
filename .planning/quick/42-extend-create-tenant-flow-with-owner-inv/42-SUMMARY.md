---
phase: quick-42
plan: "01"
subsystem: admin-tenant-onboarding
tags:
  - tenant-creation
  - owner-invitation
  - email
  - auth
  - role-aware
dependency_graph:
  requires:
    - prisma/schema.prisma (DriverInvitation model)
    - src/lib/email/resend-client.ts
    - src/emails/driver-invitation.tsx (pattern reference)
  provides:
    - role field on DriverInvitation table
    - Owner invitation email flow (end-to-end)
    - Role-aware accept-invitation (OWNER->dashboard, DRIVER->my-route)
  affects:
    - src/app/(admin)/tenants/new/page.tsx
    - src/app/(admin)/actions/tenants.ts
    - src/app/api/auth/accept-invitation/route.ts
    - src/app/(auth)/accept-invitation/page.tsx
tech_stack:
  added:
    - src/emails/owner-invitation.tsx (@react-email/components template)
    - src/lib/email/send-owner-invitation.ts (Resend email sender)
    - prisma/migrations/20260304000001_add_role_to_driver_invitation/migration.sql
  patterns:
    - Inner try/catch for email failures (non-blocking, returns emailWarning)
    - Idempotent migration SQL with DO/EXCEPTION block
    - Role-conditional redirect after invitation acceptance
key_files:
  created:
    - prisma/migrations/20260304000001_add_role_to_driver_invitation/migration.sql
    - src/emails/owner-invitation.tsx
    - src/lib/email/send-owner-invitation.ts
  modified:
    - prisma/schema.prisma (role field on DriverInvitation)
    - src/app/(admin)/tenants/new/page.tsx (owner fields + email warning)
    - src/app/(admin)/actions/tenants.ts (owner validation, invitation, email)
    - src/app/api/auth/accept-invitation/route.ts (role-aware user creation + redirect)
    - src/app/(auth)/accept-invitation/page.tsx (generic account setup text)
decisions:
  - "Inner try/catch email pattern: invitation persists even if email fails, emailWarning returned so admin sees amber banner"
  - "role field defaults to DRIVER so all existing invitations remain driver invitations without data migration"
  - "licenseNumber conditionally null for non-DRIVER roles — owners don't have CDL license numbers"
  - "OWNER+MANAGER redirect to /dashboard; DRIVER redirects to /my-route"
  - "invitation.role fallback to 'DRIVER' in accept-invitation for backwards compatibility with pre-migration invitations"
metrics:
  duration: 199s
  completed: "2026-03-04"
  tasks: 2
  files: 8
---

# Quick-42: Extend Create Tenant Flow with Owner Invitation — Summary

**One-liner:** End-to-end tenant onboarding — create tenant + OWNER DriverInvitation + role-aware accept flow with /dashboard redirect.

## What Was Built

Extended the admin Create Tenant flow from a dead-end (tenant only) to a complete onboarding sequence:

1. **DB migration** — Added `role UserRole @default(DRIVER)` to DriverInvitation. Idempotent SQL using DO/EXCEPTION block. All existing driver invitations keep DRIVER role.

2. **Owner email template** — `OwnerInvitationEmail` with "Welcome to DriveCommand" header and "Set Up Your Account" CTA. Distinct messaging from driver invitation ("designated as the owner" vs "invited as a driver").

3. **Email sender function** — `sendOwnerInvitation` following the established `sendDriverInvitation` pattern. Subject: "Set up your {org} account on DriveCommand".

4. **Extended Create Tenant form** — Added "Owner Information" section with first name, last name, and email fields. Amber warning banner displayed if email send fails (tenant is still created).

5. **Extended createTenant action** — Validates owner fields with Zod, creates DriverInvitation with `role: 'OWNER'`, sends email. Returns `emailWarning` (not error) on email failure so the invitation record persists.

6. **Role-aware accept-invitation** — Uses `invitation.role` instead of hardcoded `'DRIVER'`. OWNER/MANAGER redirects to `/dashboard`; DRIVER redirects to `/my-route`. licenseNumber only populated for DRIVER invitations.

7. **Generic accept-invitation page text** — Changed "driver registration" to "account setup" for role-neutral language.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DB migration + owner email template + send function | a35f7b9 | prisma/schema.prisma, migration.sql, owner-invitation.tsx, send-owner-invitation.ts |
| 2 | Extend Create Tenant form + action + role-aware accept-invitation | 8e92f1b | tenants/new/page.tsx, actions/tenants.ts, accept-invitation/route.ts, accept-invitation/page.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx prisma validate` — schema valid
- `npx tsc --noEmit` — no TypeScript errors
- Migration SQL is idempotent (DO/EXCEPTION block)
- Create Tenant form shows: tenant name, slug, owner first name, owner last name, owner email
- createTenant action creates both tenant and invitation in one flow
- accept-invitation route uses invitation.role for user creation and role-based redirect

## Self-Check: PASSED
