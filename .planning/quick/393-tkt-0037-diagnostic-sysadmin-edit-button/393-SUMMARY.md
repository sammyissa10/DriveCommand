# TKT-0037 Diagnostic: Sysadmin Edit Capabilities for Tenants and Tenant Users

**Task:** 393-tkt-0037-diagnostic-sysadmin-edit-button  
**Date:** 2026-05-19  
**Type:** Read-only diagnostic — no code changed, no commits for code  

---

## Overview

This diagnostic maps every relevant surface for adding sysadmin edit capabilities for tenants and tenant users (TKT-0037). Sysadmin write operations have global blast radius: a wrong `tenantId` can move a user between tenants; a wrong `isSystemAdmin` flag grants platform-wide access; a corrupted `slug` can break routing for an entire tenant. Before any edit UI is built, every Tenant and User field must be classified, existing infrastructure must be inventoried, and a defensible build-scope recommendation must be made. Files inspected: `(admin)/tenants/[id]/page.tsx`, `(admin)/tenants/page.tsx`, `(admin)/tenants/tenant-list-client.tsx`, `(admin)/tenants/[id]/tenant-edit-form.tsx`, `(admin)/tenants/[id]/tenant-settings-form.tsx`, `(admin)/tenants/[id]/tenant-users-section.tsx`, `(admin)/tenants/[id]/owner-email-form.tsx`, `(admin)/users/page.tsx`, `(admin)/users/users-list.tsx`, `(admin)/actions/tenants.ts`, `(admin)/actions/users.ts`, `api/admin/users/[id]/role/route.ts`, `api/admin/tenants/[id]/users/route.ts`, `prisma/schema.prisma`.

---

## Tenant Detail Page — Current State

**File:** `apps/web/src/app/(admin)/tenants/[id]/page.tsx`

**Layout pattern:** Server component. Two-column grid (`lg:grid-cols-2`) at top. Full-width cards below. No tabs.

**Sections and fields currently displayed:**

- **Tenant Info card**
  - Name — `tenant.name` — **currently editable** via `TenantEditForm` (inline form, Save button)
  - Slug — `tenant.slug` — **currently editable** via `TenantEditForm` (inline form, Save button)
  - Tenant ID — `tenant.id` — read-only with copy button
  - Status — derived from `tenant.isActive` + owner presence — read-only badge
  - Created — `tenant.createdAt` — read-only

- **Owner section** (inside Tenant Info card)
  - Owner first + last name — `tenant.ownerUser.firstName / lastName` — read-only
  - Account active since — `tenant.ownerUser.createdAt` — read-only
  - Email — `tenant.ownerUser.email` — **currently editable** via `OwnerEmailForm` (inline, two-step confirm)
  - Password reset — `ResetPasswordButton` — action button (not an edit)
  - If no owner yet: pending/expired invitation name, email, expiry, resend button

- **Resource counts** (inside Tenant Info card)
  - Users, Trucks, Routes — `tenant._count.*` — read-only tiles

- **Tenant Status card** (right column)
  - `isActive` toggle — **currently actionable** via `TenantStatusControls` (Suspend/Reactivate buttons)

- **Tenant Settings card** (full-width)
  - Contact Email — `tenant.contactEmail` — **currently editable** via `TenantSettingsForm`
  - Timezone — `tenant.timezone` — **currently editable** via `TenantSettingsForm`
  - Plan — `tenant.plan` — **currently editable** via `TenantSettingsForm`

- **Users card** (full-width)
  - Per-user: Name, Email, Role badge, Status dot — via `TenantUsersSection`
  - Row action: dropdown with "Send Password Reset" and "Change Role" (MANAGER/DRIVER only)

- **Trial card** (conditional on `subscription`)
  - Trial end date — `subscription.trialEndsAt` — read-only display
  - Extend trial — `ExtendTrialButton` — action button

- **Activation Progress** — `ActivationProgressSection`
- **Automation Runs** — `AutomationRunsSection`

- **Billing History card** (full-width)
  - Invoice #, Amount, Due Date, Status — from `SysAdminInvoice`
  - Link to individual billing record; "New Invoice" button

**Existing edit affordance:** The detail page already has SUBSTANTIAL edit infrastructure. Specifically editable today: name, slug (via `TenantEditForm`), contactEmail, timezone, plan (via `TenantSettingsForm`), owner email (via `OwnerEmailForm`), and role for non-owner users (via `ChangeRoleModal` in `TenantUsersSection`). The fields NOT yet editable through any UI are: `profitMarginThreshold`, `fleetSizeBucket`, `status` (TenantStatus enum, distinct from `isActive`), `manualTrial`, `emailConfirmedAt`, `sampleDataSeeded`, `provisioningPhase`. Also, per-user fields `firstName`, `lastName`, `isActive` are not editable through any current sysadmin UI.

---

## Tenant Model — Field Classification

**Model:** `model Tenant` (schema lines 128–234)

| Field | Type | Classification | Reason |
|---|---|---|---|
| `id` | String (UUID) | IMMUTABLE | Primary key; referenced by every FK in the system as `tenantId` |
| `name` | String | SAFE | Display name only; changing it is cosmetic. **Already editable via TenantEditForm.** |
| `slug` | String (unique) | DANGEROUS | Used as URL path segment and tenant identifier in routing; changing it breaks bookmarked links and any routing logic that looks up tenants by slug. Handled carefully in existing `updateTenant` with unique-constraint check. **Already editable via TenantEditForm.** |
| `timezone` | String | SAFE | Controls display-time formatting; wrong value shows wrong time but doesn't corrupt data. **Already editable via TenantSettingsForm.** |
| `contactEmail` | String? | SAFE | Billing contact only; no auth or identity implications. **Already editable via TenantSettingsForm.** |
| `plan` | String | SAFE (with caveats) | Controls feature gating; downgrading a plan mid-use may surface degraded UI, but no data is corrupted. **Already editable via TenantSettingsForm.** |
| `isActive` | Boolean | SAFE (controlled) | Suspension flag. **Already actionable via TenantStatusControls with Supabase ban/unban side-effect.** Editing this directly via a form instead of the dedicated button would bypass the Supabase Auth ban/unban logic — any new edit path MUST call `suspendTenant`/`reactivateTenant` actions, not write `isActive` directly. |
| `profitMarginThreshold` | Decimal | SAFE | Per-tenant profit alert threshold; no tenancy or auth implications. Currently not surfaced in any edit UI. |
| `createdAt` | DateTime | IMMUTABLE | Audit timestamp; must never change |
| `updatedAt` | DateTime | IMMUTABLE | Managed by Prisma `@updatedAt`; must never be set manually |
| `fleetSizeBucket` | FleetSizeBucket enum | SAFE | Onboarding/segmentation metadata; no data integrity implications |
| `status` | TenantStatus enum | DANGEROUS | This is a separate lifecycle enum (TRIAL / ACTIVE / PAST_DUE / SUSPENDED / CANCELLED) from `isActive`. Changing it directly could create inconsistency with the `Subscription` model and billing state. Should only be changed through billing/subscription logic, not an admin raw editor. |
| `manualTrial` | Boolean | SAFE (admin-only) | Flag that marks a manually-created trial; safe to toggle by sysadmin |
| `emailConfirmedAt` | DateTime? | DANGEROUS | Changing this could falsely mark or unmark email confirmation, affecting onboarding flow gating |
| `sampleDataSeeded` | Boolean | DANGEROUS | If flipped to `false` on a live tenant, seeding logic may attempt to re-insert sample data and cause unique constraint violations or duplicate records |
| `provisioningPhase` | ProvisioningPhase enum | DANGEROUS | Used by the activation progress system to gate provisioning steps; wrong value could break or skip onboarding automation |

**Out of scope (relation fields only, no DB column):** All `users`, `trucks`, `routes`, etc. reverse relations are navigation, not DB columns.

---

## User Model — Field Classification

**Model:** `model User` (schema lines 236–401)

| Field | Type | Classification | Reason |
|---|---|---|---|
| `id` | String (UUID) | IMMUTABLE | Primary key; also the Supabase Auth UUID — must match Supabase's record |
| `tenantId` | String (UUID) | DANGEROUS | Moving a user to a different tenant changes what data they can see and creates a cross-tenant data leak. All the user's existing loads, routes, documents remain in the old tenant, creating orphaned relationships and a potential cross-tenant data breach. |
| `email` | String | DANGEROUS | Login identity for Supabase Auth. Changing it in the DB without updating Supabase Auth creates a split-brain state where the user cannot log in. **Already handled carefully in `updateOwnerEmail` action which syncs both DB and sends notification.** For non-owner users there is no current update path. |
| `passwordHash` | String? | IMMUTABLE | Must NEVER be editable through sysadmin UI. Password changes must go through Supabase Auth reset flow only. Displaying or editing this would be a critical security vulnerability. |
| `role` | UserRole enum | DANGEROUS | Privilege escalation vector. Changing DRIVER to OWNER grants full tenant admin access. **Already partially handled via `/api/admin/users/[id]/role` PATCH with guard against changing OWNER role and with Supabase app_metadata sync.** The existing route correctly forbids changing to OWNER. |
| `isSystemAdmin` | Boolean | IMMUTABLE | Must NEVER be editable through sysadmin UI. Setting this to `true` grants platform-wide sysadmin access. This is the highest-privilege field in the entire schema. |
| `firstName` | String? | SAFE | Display name only; no auth or tenancy implications |
| `lastName` | String? | SAFE | Display name only; no auth or tenancy implications |
| `licenseNumber` | String? | SAFE | Driver CDL number; no auth implications; editable by sysadmin for correction |
| `isActive` | Boolean | SAFE (controlled) | Soft-disable for the user. Unlike tenant suspension, `isActive = false` for a user does NOT automatically trigger a Supabase Auth ban in the current codebase — an `updateUser` action that sets `isActive = false` should also call Supabase Admin API to ban the user session. This is a gap to document and handle in build. |
| `permissions` | Json? | DANGEROUS | RBAC permissions blob. Incorrect values could grant or revoke feature access unpredictably. Should remain read-only in the sysadmin UI. |
| `isDispatchReady` | Boolean | SAFE | Driver dispatch readiness flag; no security implications |
| `createdAt` | DateTime | IMMUTABLE | Audit timestamp; must never change |
| `updatedAt` | DateTime | IMMUTABLE | Managed by Prisma `@updatedAt` |
| `isSample` | Boolean | IMMUTABLE | Marks seed data rows. Flipping this on real users could cause them to be excluded from queries that filter `isSample: false`. Flipping it on sample users would cause them to appear as real users in production queries. Must never be editable via sysadmin UI. |

**Confirmed immutable-in-sysadmin-UI list:** `passwordHash` (use auth reset flow), `isSystemAdmin` (privilege escalation), `isSample` (data integrity), `tenantId` (tenancy move / cross-tenant leak), `id` (PK / Supabase UUID match), `createdAt`, `updatedAt`.

---

## Audit Columns

**Tenant model:** Does NOT have `createdById` or `updatedById` columns. The Tenant model has no audit FK columns of any kind. There are no write paths that populate such columns because they do not exist on the model.

**User model:** Does NOT have `createdById` or `updatedById` columns. The User model is itself the *source* of audit FK columns on other tables (e.g., Truck, Route, Load all have `createdById` → User FK), but the User row itself has no audit trail columns.

**Gap statement:** TKT-0034 (quick-390) fixed the `updatedById` gap only on carrier_* tables (`CarrierClient`, `CarrierContract`, `CarrierFacility`, `CarrierDriver`, `CarrierTruck`, `CarrierDispatch`, `CarrierLoad`). The `Tenant` and `User` tables were never part of TKT-0034 scope and remain without audit columns. Any future write to `Tenant` or `User` by sysadmin actions has no audit trail at the row level. The existing sysadmin actions (`updateTenant`, `updateOwnerEmail`, `updateTenantSettings`, PATCH `/api/admin/users/[id]/role`) all use bare `prisma` (intentionally, for cross-tenant access) and none populate audit columns — because those columns don't exist on these models. Remediation would require a schema migration to add `updatedById` to both Tenant and User, which is architectural scope and is explicitly out of scope for TKT-0037.

---

## Existing Edit Infrastructure

### Tenant write actions (in `apps/web/src/app/(admin)/actions/tenants.ts`)

| Function | Exists | Signature | Surfaced in UI | Notes |
|---|---|---|---|---|
| `updateTenant` | YES | `(tenantId: string, data: { name, slug }) => Promise<{success, error?}>` | YES — `TenantEditForm` on detail page | Zod-validated, slug uniqueness-checked |
| `updateTenantSettings` | YES | `(tenantId: string, data: { contactEmail?, timezone, plan }) => Promise<{success, error?}>` | YES — `TenantSettingsForm` on detail page | Zod-validated, plan constrained to enum |
| `updateOwnerEmail` | YES | `(userId: string, newEmail: string) => Promise<{success, error?}>` | YES — `OwnerEmailForm` on detail page | Two-step confirm; notifies old email; Prisma-only, no Supabase Auth email update |
| `suspendTenant` | YES | `(tenantId: string) => Promise<{success}>` | YES — `TenantStatusControls` | Bans all users in Supabase Auth |
| `reactivateTenant` | YES | `(tenantId: string) => Promise<{success}>` | YES — `TenantStatusControls` | Lifts Supabase Auth ban |
| `extendTrial` | YES | `(tenantId: string, additionalDays: number)` | YES — `ExtendTrialButton` | Updates Subscription model, writes AppEvent |
| `editTenant` / `patchTenant` | NO | — | — | Does not exist |

### User write actions (in `apps/web/src/app/(admin)/actions/users.ts`)

| Function | Exists | Notes |
|---|---|---|
| `updateUser` / `editUser` / `patchUser` | NO | File contains only `getAllUsers()` (read-only) |

### Admin API routes

| Route | Method | Exists | Purpose |
|---|---|---|---|
| `/api/admin/users/[id]/role` | PATCH | YES | Changes role to MANAGER or DRIVER only; syncs Supabase app_metadata; guards against changing OWNER role |
| `/api/admin/tenants/[id]/users` | GET | YES | Lists users for a given tenant (used by `TenantUsersSection`) |
| `/api/admin/users/[id]` | PATCH | NO | Does not exist |
| `/api/admin/tenants/[id]` | PATCH | NO | Does not exist |

**Verdict:** Tenant edit infrastructure is substantially built and surfaced. The gap is for user profile fields (`firstName`, `lastName`, `isActive`) — no server action or API route exists to update these. The `role` change path exists but is API-route only (not a server action). The build for TKT-0037 is primarily about:
1. Adding a user profile edit capability (`firstName`, `lastName`, `isActive`) — greenfield server action + UI
2. Wiring the existing role-change API to a better UX placement in the cross-tenant users list (`/users`) — currently only accessible from within a specific tenant detail page

---

## Edit-Form Precedent

The admin portal does not use `react-hook-form`. The established pattern, demonstrated by all three currently-built admin edit forms, is:

**Pattern: plain React `useState` + `useTransition` + server action**

**Canonical reference files:**
- `apps/web/src/app/(admin)/tenants/[id]/tenant-edit-form.tsx` — inline two-field form
- `apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx` — three-field settings form
- `apps/web/src/app/(admin)/tenants/[id]/owner-email-form.tsx` — single-field with two-step confirm

**Form library:** None. Plain React controlled inputs with `useState`.

**Validation:** Zod is used in the server action (`actions/tenants.ts`); client-side validation is minimal (HTML `required`, `type="email"`).

**Submission pattern:** `startTransition(async () => { const result = await serverAction(...); ... })` — Next.js server action called directly, no `fetch()`.

**Success-state navigation:** `router.refresh()` after success (re-fetches server component data). Success inline banner cleared on next field change.

**Error display:** Inline `<div>` banner above or below the form with red border/bg. No toast library.

**Dirty-state guard:** All forms track `isDirty` (compare current vs initial state) and disable the Save button when nothing has changed, preventing no-op writes.

**Directive:** New sysadmin edit forms for user profile fields MUST follow this pattern — `useState` + `useTransition`, server action call, `router.refresh()` on success, inline error/success banners, dirty-state button disabling.

---

## UI Placement Recommendation

### Tenant edit affordance

**Recommendation: Edit button on detail page only. No list-row edit button.**

**Justification:** The tenant detail page (`/tenants/[id]`) already contains live, working edit forms for name, slug, contactEmail, timezone, and plan. The only actionable gap is surfacing currently-hidden fields (`profitMarginThreshold`, `fleetSizeBucket`, `manualTrial`) — these should be added to the existing `TenantSettingsForm` or a new "Advanced Settings" card on the same detail page. The tenant list (`tenant-list-client.tsx`) already has View, Suspend/Reactivate, and Delete actions per row — adding an Edit link would duplicate the navigation to the detail page where all editing happens. Consistent with existing pattern: the "View" link on the list navigates to the detail page for all editing.

### User edit affordance (from `/users` page — TKT-0036)

**Recommendation: Row action button opens a modal (same pattern as `ChangeRoleModal` in `TenantUsersSection`).**

**Justification:** The `/users` page uses TanStack Table with no detail route — there is no `/users/[id]` page. The existing precedent for user actions in the admin portal is the `ActionsDropdown` + modal pattern established in `TenantUsersSection` (`ChangeRoleModal`). Adding a modal for editing `firstName`, `lastName`, and `isActive` is cheapest to build (no new routes, no new pages), lowest blast radius (scoped to one user, dismissable), and most consistent with the existing row-actions pattern in the same codebase. The `ActionsDropdown` in `TenantUsersSection` already has a three-dot menu — the cross-tenant `/users` list should adopt the same pattern, adding "Edit Profile" and surfacing "Change Role" alongside the already-wired role modal. A dedicated `/users/[id]` detail page is heavier and unnecessary given the narrow set of safe-to-edit fields.

---

## Build-Scope Recommendation

**Recommendation: TWO prompts.**

### Prompt 1 — Tenant Advanced Settings (smaller, lower risk)

Add `profitMarginThreshold`, `fleetSizeBucket`, and `manualTrial` to the existing `TenantSettingsForm` (or a new "Advanced" card). All three fields are SAFE. The server action (`updateTenantSettings`) already exists and is tested — it just needs these three fields added. The form component needs new inputs. This is a narrow diff: ~30 lines of schema validation + ~40 lines of form UI. No new server action. No new API route.

**Explicitly excluded from Prompt 1:** `status` (TenantStatus enum — lifecycle state, dangerous), `emailConfirmedAt` (dangerous), `sampleDataSeeded` (dangerous), `provisioningPhase` (dangerous). These must remain read-only in the sysadmin UI.

### Prompt 2 — User Profile Edit (medium risk, new infrastructure)

Add a server action `updateUserProfile(userId, { firstName, lastName, isActive })` to `(admin)/actions/users.ts`. Add a user edit modal to the `/users` page (within `users-list.tsx`) following the `ChangeRoleModal` pattern. Add an "Edit" option to a new or expanded actions column in the TanStack Table. The `isActive` toggle must also call Supabase Admin API to ban/unban the user session (gap identified above). Role change should remain on the existing API route (`/api/admin/users/[id]/role`) but could be wired into the same modal or kept separate. This prompt has higher risk because it introduces a new write path for user data and requires the Supabase Auth side-effect to be correct.

### Why not ONE prompt?

Tenant advanced settings and user profile edit share no code infrastructure. Combining them in one review increases diff size without reducing round-trips. The user edit prompt carries meaningfully higher risk (new action, Supabase side-effect, ban/unban logic) and benefits from isolated review.

### Why not THREE prompts?

Unlike TKT-0033 which split action creation, UI wiring, and E2E verification across three prompts because each was a standalone Playwright-verified milestone, TKT-0037 user edit is small enough that action + UI modal fit in a single well-scoped prompt. The modal pattern is already established (`ChangeRoleModal`), so the UI wiring does not need its own review cycle.

### TKT-0033 comparison

TKT-0033 was split three ways because: (1) the form infrastructure was new, (2) each prompt had independent verifiable artifacts (schema migration, server action, UI page), and (3) the scope of each part was large. TKT-0037 user edit is smaller — the form pattern is already established, no schema migration is needed, and the safe-to-edit field set is narrow (3 fields). Two prompts is the right balance.

---

TKT-0037 diagnostic complete. Build scope: TWO prompts.
