---
phase: quick-42
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260304000001_add_role_to_driver_invitation/migration.sql
  - src/app/(admin)/tenants/new/page.tsx
  - src/app/(admin)/actions/tenants.ts
  - src/app/api/auth/accept-invitation/route.ts
  - src/app/(auth)/accept-invitation/page.tsx
  - src/emails/owner-invitation.tsx
  - src/lib/email/send-owner-invitation.ts
autonomous: true
must_haves:
  truths:
    - "Admin can enter owner name and email when creating a tenant"
    - "Creating a tenant also creates a PENDING DriverInvitation with role OWNER"
    - "Owner receives invitation email with link to accept-invitation page"
    - "Accepting an OWNER invitation creates user with OWNER role and redirects to /dashboard"
    - "Accepting a DRIVER invitation still creates user with DRIVER role and redirects to /my-route"
  artifacts:
    - path: "prisma/migrations/20260304000001_add_role_to_driver_invitation/migration.sql"
      provides: "role column on DriverInvitation table"
      contains: "ALTER TABLE"
    - path: "src/emails/owner-invitation.tsx"
      provides: "Owner invitation email template"
      exports: ["OwnerInvitationEmail"]
    - path: "src/lib/email/send-owner-invitation.ts"
      provides: "Owner invitation email sender"
      exports: ["sendOwnerInvitation"]
  key_links:
    - from: "src/app/(admin)/actions/tenants.ts"
      to: "prisma.driverInvitation.create"
      via: "creates invitation with role field"
      pattern: "driverInvitation\\.create"
    - from: "src/app/(admin)/actions/tenants.ts"
      to: "src/lib/email/send-owner-invitation.ts"
      via: "sends email after tenant+invitation creation"
      pattern: "sendOwnerInvitation"
    - from: "src/app/api/auth/accept-invitation/route.ts"
      to: "invitation.role"
      via: "uses invitation role for user creation and redirect"
      pattern: "invitation\\.role.*OWNER|role.*invitation"
---

<objective>
Extend the admin Create Tenant flow so that creating a tenant also invites the tenant owner. Add owner name/email fields to the form, a `role` column on DriverInvitation, create the invitation + send email in the createTenant action, and make accept-invitation role-aware (OWNER -> /dashboard, DRIVER -> /my-route).

Purpose: Currently creating a tenant is a dead end — the tenant has no users. This wires up the full flow: create tenant -> invite owner -> owner accepts -> owner can log in.
Output: Working end-to-end tenant creation with owner invitation.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@prisma/schema.prisma (DriverInvitation model at line 200, UserRole enum at line 14)
@src/app/(admin)/tenants/new/page.tsx (current form — name + slug only)
@src/app/(admin)/actions/tenants.ts (createTenant server action)
@src/app/api/auth/accept-invitation/route.ts (hardcodes DRIVER role + /my-route redirect)
@src/app/(auth)/accept-invitation/page.tsx (accept invitation UI — says "driver registration")
@src/lib/email/send-driver-invitation.ts (email sending pattern to follow)
@src/emails/driver-invitation.tsx (email template pattern to follow)
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB migration + owner email template + send function</name>
  <files>
    prisma/schema.prisma
    prisma/migrations/20260304000001_add_role_to_driver_invitation/migration.sql
    src/emails/owner-invitation.tsx
    src/lib/email/send-owner-invitation.ts
  </files>
  <action>
    1. Add `role UserRole @default(DRIVER)` field to DriverInvitation model in prisma/schema.prisma (after licenseNumber).

    2. Create migration SQL at prisma/migrations/20260304000001_add_role_to_driver_invitation/migration.sql:
       - Add `role` column to DriverInvitation with default 'DRIVER' (so existing rows get DRIVER)
       - Use idempotent pattern: `DO $$ BEGIN ... EXCEPTION ... END $$` wrapping `ALTER TABLE "DriverInvitation" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'DRIVER'`
       - Follow the project migration pattern (no BEGIN/COMMIT — migrate.mjs wraps in transaction)

    3. Run `npx prisma generate` to update the Prisma client types.

    4. Create src/emails/owner-invitation.tsx — copy structure from driver-invitation.tsx but:
       - Export function `OwnerInvitationEmail` with props: { firstName, lastName, organizationName, acceptUrl, expiresAt }
       - Header text: "Welcome to DriveCommand"
       - Message: "{organizationName} has been created on DriveCommand and you have been designated as the owner. Click the button below to create your account and start managing your fleet."
       - Button text: "Set Up Your Account"
       - Same styling as driver-invitation.tsx

    5. Create src/lib/email/send-owner-invitation.ts — follow send-driver-invitation.ts pattern:
       - Export interface OwnerInvitationEmailData { firstName, lastName, organizationName, acceptUrl, expiresAt }
       - Export async function sendOwnerInvitation(toEmail, data) that uses resend.emails.send with OwnerInvitationEmail react component
       - Subject: "Set up your {organizationName} account on DriveCommand"
  </action>
  <verify>
    Run `npx prisma generate` — succeeds without error.
    Run `npx prisma validate` — schema is valid.
    TypeScript check: `npx tsc --noEmit --pretty 2>&1 | head -20` — no new errors from these files.
  </verify>
  <done>
    DriverInvitation model has `role` field with DRIVER default. Migration SQL exists and is idempotent. Owner email template and sender function exist matching driver invitation pattern.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extend Create Tenant form + action + role-aware accept-invitation</name>
  <files>
    src/app/(admin)/tenants/new/page.tsx
    src/app/(admin)/actions/tenants.ts
    src/app/api/auth/accept-invitation/route.ts
    src/app/(auth)/accept-invitation/page.tsx
  </files>
  <action>
    1. Update src/app/(admin)/tenants/new/page.tsx — add owner fields after slug:
       - Section header: "Owner Information" with description "The owner will receive an invitation email to set up their account."
       - Owner First Name (text input, name="ownerFirstName", required)
       - Owner Last Name (text input, name="ownerLastName", required)
       - Owner Email (email input, name="ownerEmail", required)
       - Keep existing styling patterns (label + input + error display)
       - Display emailWarning from result if present (amber banner, same pattern as quick-30 driver invite warning)

    2. Update createTenant in src/app/(admin)/actions/tenants.ts:
       - Extend Zod schema to include ownerFirstName (string min 1), ownerLastName (string min 1), ownerEmail (string email)
       - After creating the tenant, in the SAME try block:
         a. Create a DriverInvitation record with: tenantId=tenant.id, email=ownerEmail, firstName=ownerFirstName, lastName=ownerLastName, role='OWNER', status='PENDING', expiresAt=7 days from now
         b. Build acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/accept-invitation?id=${invitation.id}`
         c. Try sending email via sendOwnerInvitation (import from @/lib/email/send-owner-invitation)
         d. If email fails, return { success: true, emailWarning: "Tenant created but invitation email could not be sent..." } (same pattern as driver invite)
       - Return { success: true, tenant } on full success

    3. Update src/app/api/auth/accept-invitation/route.ts:
       - Change hardcoded `role: 'DRIVER'` on line 89 to `role: invitation.role || 'DRIVER'` (fallback for old invitations without role)
       - Change hardcoded `redirectUrl: '/my-route'` to be role-conditional:
         ```
         const redirectUrl = user.role === 'OWNER' || user.role === 'MANAGER' ? '/dashboard' : '/my-route';
         ```
       - licenseNumber should only be set if invitation.role is 'DRIVER' (owners don't have license numbers): `licenseNumber: invitation.role === 'DRIVER' ? invitation.licenseNumber : null`

    4. Update src/app/(auth)/accept-invitation/page.tsx:
       - Change the text "Set a password to complete your driver registration." to "Set a password to complete your account setup." (generic — works for both owner and driver)
  </action>
  <verify>
    Run `npx tsc --noEmit --pretty 2>&1 | head -30` — no TypeScript errors.
    Run `node scripts/migrate.mjs` — migration applies successfully (or is already applied).
    Verify form renders: start dev server, visit /tenants/new — form shows owner fields.
  </verify>
  <done>
    Create Tenant form has owner name/email fields. Creating a tenant creates invitation with OWNER role and sends email. Accept-invitation creates user with correct role (OWNER->dashboard, DRIVER->my-route). Accept page text is role-generic.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — no TypeScript errors across the project
2. `npx prisma validate` passes — schema is valid
3. Migration SQL is idempotent (can run multiple times safely)
4. Create Tenant form shows: tenant name, slug, owner first name, owner last name, owner email
5. createTenant action creates both tenant and invitation in one flow
6. accept-invitation route uses invitation.role for user creation and role-based redirect
</verification>

<success_criteria>
- Admin can create a tenant with owner details in a single form submission
- DriverInvitation has a `role` field (DRIVER default, OWNER for tenant creation)
- Owner invitation email uses distinct template (not "as a driver" messaging)
- Accepting owner invitation creates OWNER user and redirects to /dashboard
- Accepting driver invitation still works as before (DRIVER role, /my-route redirect)
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/42-extend-create-tenant-flow-with-owner-inv/42-SUMMARY.md`
</output>
