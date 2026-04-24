---
phase: quick-281
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/app/(admin)/actions/tenants.ts
  - apps/web/src/app/(admin)/tenants/[id]/page.tsx
  - apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx
  - apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
  - apps/web/src/app/(admin)/tenants/[id]/change-role-modal.tsx
  - apps/web/src/app/api/admin/tenants/[id]/users/route.ts
  - apps/web/src/app/api/admin/users/[id]/role/route.ts
autonomous: true
must_haves:
  truths:
    - "Sysadmin can edit tenant settings (name, contact email, timezone, plan) and save"
    - "Sysadmin sees a users table for any tenant with name, email, role badge, status"
    - "Sysadmin can send password reset email for any user"
    - "Sysadmin can change role for MANAGER/DRIVER users but NOT OWNER"
  artifacts:
    - path: "apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx"
      provides: "Editable tenant settings card"
    - path: "apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx"
      provides: "Users table with actions menu"
    - path: "apps/web/src/app/(admin)/tenants/[id]/change-role-modal.tsx"
      provides: "Role change modal for MANAGER/DRIVER"
    - path: "apps/web/src/app/api/admin/tenants/[id]/users/route.ts"
      provides: "GET users for a tenant"
    - path: "apps/web/src/app/api/admin/users/[id]/role/route.ts"
      provides: "PATCH role for a user"
  key_links:
    - from: "tenant-users-section.tsx"
      to: "/api/admin/tenants/[id]/users"
      via: "fetch GET on mount"
    - from: "tenant-users-section.tsx"
      to: "/api/auth/admin-reset-password"
      via: "fetch POST with send_reset action"
    - from: "change-role-modal.tsx"
      to: "/api/admin/users/[id]/role"
      via: "fetch PATCH with new role"
---

<objective>
Add tenant settings editing, a users list with role badges, password reset, and role change capabilities to the sysadmin tenant detail page.

Purpose: Give sysadmins full tenant management without needing direct database access.
Output: Updated tenant detail page with settings card, users table, and user management actions.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (Tenant model at line 119 — currently has name, slug, timezone, isActive, profitMarginThreshold; User model at line 175 with UserRole enum OWNER/MANAGER/DRIVER)
@apps/web/src/app/(admin)/tenants/[id]/page.tsx (current tenant detail — 2-column grid with Tenant Info + Status cards, then Billing History)
@apps/web/src/app/(admin)/actions/tenants.ts (existing server actions: getTenantById, updateTenant, suspendTenant, etc. — all use requireAdminAccess)
@apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx (existing reset password modal calling /api/auth/admin-reset-password with send_reset or set_password actions)
@apps/web/src/app/api/auth/admin-reset-password/route.ts (existing endpoint — requires sysadmin, supports send_reset and set_password actions)
@apps/web/src/lib/supabase/admin.ts (createAdminClient for Supabase Auth admin operations)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add contactEmail and plan fields to Tenant model, create tenant settings form and update server actions</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/src/app/(admin)/actions/tenants.ts
    apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx
    apps/web/src/app/(admin)/tenants/[id]/page.tsx
  </files>
  <action>
1. **Schema migration** — Add two new fields to the Tenant model in schema.prisma:
   - `contactEmail String?` (optional, nullable)
   - `plan String @default("starter")` (valid values: starter, pro, enterprise — stored as plain string, no enum needed)
   Place them after `timezone` line. Run `npx prisma migrate dev --name add-tenant-contact-email-plan` from apps/web.

2. **Update getTenantById** in tenants.ts — Add `contactEmail`, `plan`, `timezone` to the select clause so they are returned to the detail page.

3. **New server action: updateTenantSettings** in tenants.ts — Accept `{ contactEmail?: string, timezone: string, plan: string }` plus tenantId. Validate with zod: contactEmail is optional email, timezone is non-empty string, plan is one of ['starter', 'pro', 'enterprise']. Call prisma.tenant.update. Revalidate `/tenants/${tenantId}`.

4. **Create tenant-settings-form.tsx** — Client component ('use client'). Props: `tenantId`, `initialContactEmail`, `initialTimezone`, `initialPlan`.
   - Form with 3 fields:
     - Contact Email: `<input type="email">` (optional)
     - Timezone: `<select>` with common IANA timezones (UTC, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Anchorage, Pacific/Honolulu — these cover US trucking). Pre-select current value.
     - Plan: `<select>` with Starter/Pro/Enterprise options. Pre-select current value.
   - Save button calls `updateTenantSettings` server action. Show success/error feedback inline.
   - Style: Use existing Card/CardHeader/CardTitle pattern from shadcn. Match the visual style of existing TenantEditForm (border, spacing, button style).

5. **Update page.tsx** — Restructure layout:
   - Keep back link and header
   - Keep existing 2-column grid (Tenant Info + Tenant Status cards)
   - Add new full-width Tenant Settings card below the grid (using TenantSettingsForm). Pass tenant.contactEmail, tenant.timezone, tenant.plan as props.
   - Keep Billing History below settings
   - Do NOT add Users section yet (Task 2)

Note: The existing TenantEditForm handles name+slug editing. The new TenantSettingsForm handles contactEmail, timezone, plan. Status toggle remains in TenantStatusControls. This avoids modifying existing working components.
  </action>
  <verify>
    Run `npx prisma migrate status` from apps/web to confirm migration applied. Run `npx tsc --noEmit` from repo root. Visit /tenants/[id] in browser — settings card renders with timezone dropdown showing current value, plan dropdown defaulting to "starter", and an optional contact email field. Save updates the record.
  </verify>
  <done>Tenant detail page shows editable settings card with contactEmail, timezone, and plan fields. Save persists changes to database. Migration applied successfully.</done>
</task>

<task type="auto">
  <name>Task 2: Build tenant users API endpoint, users table with role badges, and password reset integration</name>
  <files>
    apps/web/src/app/api/admin/tenants/[id]/users/route.ts
    apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
    apps/web/src/app/(admin)/tenants/[id]/page.tsx
  </files>
  <action>
1. **Create GET /api/admin/tenants/[id]/users** — New route file.
   - Import `requireAuth`, `isSystemAdmin` from `@/lib/auth/supabase`, `prisma` from `@/lib/db/prisma`.
   - Guard: requireAuth + isSystemAdmin check (return 403 if not admin).
   - Extract tenantId from URL params (Next.js 15 dynamic route: `{ params }: { params: Promise<{ id: string }> }`).
   - Query: `prisma.user.findMany({ where: { tenantId }, select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true }, orderBy: [{ role: 'asc' }, { firstName: 'asc' }] })`.
   - NEVER include passwordHash in select.
   - Return JSON array.

2. **Create tenant-users-section.tsx** — Client component ('use client').
   - On mount, fetch `/api/admin/tenants/${tenantId}/users`. Store in state.
   - Render a table with columns: Name (firstName + lastName), Email, Role (badge), Status (dot), Actions (three-dot menu).
   - **Role badges**: OWNER = `bg-purple-100 text-purple-700`, MANAGER = `bg-blue-100 text-blue-700`, DRIVER = `bg-green-100 text-green-700`. Use rounded-full px-2.5 py-0.5 text-xs font-medium.
   - **Status**: Green dot + "Active" for isActive=true, gray dot + "Inactive" for false.
   - **Actions dropdown** (use a simple relative-positioned div with state toggle, no external dropdown library needed):
     - "Send Password Reset" — shown for ALL roles. On click: show confirmation dialog ("Send password reset email to [email]?"). On confirm: POST to `/api/auth/admin-reset-password` with `{ email, action: 'send_reset' }`. Show success toast (simple green banner at top of section) or error.
     - "Change Role" — shown ONLY if user.role !== 'OWNER'. Opens the ChangeRoleModal (Task 3).
   - Loading state: simple "Loading users..." text.
   - Empty state: "No users found for this tenant."

3. **Update page.tsx** — Add `<TenantUsersSection tenantId={tenant.id} />` between the Tenant Settings card and Billing History card. Wrap in a Card with CardHeader "Users" and CardContent.
  </action>
  <verify>
    Run `npx tsc --noEmit`. Visit /tenants/[id] — users table renders with correct role badge colors. Click three-dot menu on a user — "Send Password Reset" appears for all roles, "Change Role" appears only for MANAGER/DRIVER. Click "Send Password Reset" → confirmation → success toast. Check Network tab: GET /api/admin/tenants/[id]/users returns user array without passwordHash.
  </verify>
  <done>Users table renders all tenant users with role badges and status dots. Password reset sends email via existing endpoint. Actions menu correctly hides "Change Role" for OWNER users.</done>
</task>

<task type="auto">
  <name>Task 3: Build role change modal and API endpoint with dual Prisma+Supabase update</name>
  <files>
    apps/web/src/app/api/admin/users/[id]/role/route.ts
    apps/web/src/app/(admin)/tenants/[id]/change-role-modal.tsx
    apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
  </files>
  <action>
1. **Create PATCH /api/admin/users/[id]/role** — New route file.
   - Guard: requireAuth + isSystemAdmin (403 if not).
   - Extract userId from URL params.
   - Parse body: `{ role: string }`. Validate role is 'MANAGER' or 'DRIVER' (reject anything else with 400).
   - Fetch user from Prisma: `prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, tenantId: true, firstName: true, lastName: true, email: true } })`.
   - If not found: 404.
   - If user.role === 'OWNER': return 400 `{ error: 'Cannot change owner role' }`.
   - If tenantId is null or user is sysadmin: return 400 `{ error: 'Cannot change role for this user' }`.
   - **Update Prisma**: `prisma.user.update({ where: { id: userId }, data: { role: newRole } })`.
   - **Update Supabase Auth app_metadata**: Use `createAdminClient()`. Call `supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { role: newRole } })`. The Prisma User.id IS the Supabase Auth user UUID in this codebase (they match).
   - If either update fails, log error and return 500.
   - Return updated user object (id, firstName, lastName, email, role, isActive).

2. **Create change-role-modal.tsx** — Client component.
   - Props: `user: { id, firstName, lastName, role }`, `onClose: () => void`, `onSuccess: (updatedUser) => void`.
   - Modal overlay (same pattern as reset-password-button.tsx — fixed inset-0, bg-black/40 backdrop, centered white card).
   - Title: "Change role for [firstName] [lastName]"
   - Two radio buttons: Manager (value MANAGER), Driver (value DRIVER). Current role pre-selected.
   - Save button: PATCH `/api/admin/users/${user.id}/role` with `{ role: selectedRole }`.
   - On success: call onSuccess with updated user, show brief success feedback, close modal.
   - On error: show inline error message.
   - Cancel button to close.

3. **Wire into tenant-users-section.tsx** — When "Change Role" is clicked in the actions menu:
   - Set state to show ChangeRoleModal for that user.
   - On success callback: update the user in local state array (replace the user object with the returned updated one) so the table updates without a full refetch. Show a green success banner: "Role updated to [role] for [name]".
  </action>
  <verify>
    Run `npx tsc --noEmit`. Visit /tenants/[id] — click three-dot menu on a MANAGER or DRIVER user → "Change Role" → modal opens with current role pre-selected → select different role → Save → table updates with new role badge color. Verify OWNER users do NOT have "Change Role" in their menu. Test API directly: `curl -X PATCH /api/admin/users/[owner-id]/role -d '{"role":"DRIVER"}'` returns 400 "Cannot change owner role".
  </verify>
  <done>Role change modal works for MANAGER/DRIVER users. Both Prisma DB and Supabase Auth app_metadata are updated atomically. OWNER role change is blocked at both UI and API level. Users table updates in-place without full page reload.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. Tenant detail page layout: Header → Stats grid → Tenant Settings card → Users table → Billing History
3. Settings form saves contactEmail, timezone, plan changes
4. Users table shows all tenant users with correct role badge colors
5. Password reset works for all roles via existing endpoint
6. Role change blocked for OWNER at API level (400 response)
7. Role change updates both Prisma and Supabase Auth
8. No passwordHash exposed in any API response
</verification>

<success_criteria>
- Sysadmin can edit tenant settings (contactEmail, timezone, plan) and save successfully
- Users table renders with role-colored badges and active/inactive status dots
- Password reset email sends for any user role
- Role change works for MANAGER/DRIVER, blocked for OWNER
- Both DB role and Supabase Auth app_metadata.role stay in sync after role change
- All new endpoints protected by admin session guard
</success_criteria>

<output>
After completion, create `.planning/quick/281-add-tenant-settings-user-list-password-r/281-SUMMARY.md`
</output>
