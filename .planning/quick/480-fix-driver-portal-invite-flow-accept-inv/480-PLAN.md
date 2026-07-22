# Quick 480 — Fix Driver Portal Invite Flow

## Root cause (verified against production)

A login identity in DriveCommand is a **globally unique Supabase Auth user**
(`auth.users.email` is unique across ALL tenants), but the invite-acceptance
flow only pre-checked the **tenant-scoped Prisma `User` table** for a
pre-existing account.

When an invited email already has a Supabase Auth identity — e.g. the person is
already an OWNER/DRIVER in another tenant, or an orphaned auth user from a prior
partially-failed acceptance — `admin.auth.admin.createUser` throws
"email already registered". The route swallowed that into the generic
**"An error occurred while creating your account."** (HTTP 500), which recurred
identically on every retry because the auth identity persists.

Production evidence: invitation for `ayazali7244@gmail.com` (created 2026-07-18,
tenant `04305834…`) — that email is already an OWNER of tenant `9ce1797e…`
(`auth.users` row from 2026-04-13). The tenant-scoped `existingUser` check finds
nothing in `04305834`, so the flow proceeds to `createUser`, which fails on the
global auth uniqueness → generic 500 forever. RLS/bypass was ruled out by
reproducing the `User` insert against prod (insert passes the bypass policy).

Same underlying gap on the admin side: `resendCarrierDriverInvitation` treats an
already-provisioned/accepted driver as a **hard error** (red toast
"This driver has already accepted their invitation…") instead of a benign
"already has portal access" state. A secondary contributor is that
`createCarrierDriver` stored the driver/invitation `email` **un-normalized**,
while acceptance links `carrier_drivers.userId` on the **lower-cased** email — a
casing mismatch can leave `userId` NULL after acceptance, flipping the admin UI
back to "Grant access" and then hitting the "already accepted" error.

## Tasks

1. **accept-invitation route** (`src/app/api/auth/accept-invitation/route.ts`)
   - When `createUser` fails because the email already exists (Supabase
     `email_exists` / 422 / message match), return a **specific 409**:
     "This email address is already associated with a DriveCommand account.
     Please sign in instead." — not the generic 500.
   - Keep the already-specific invitation messages (used/cancelled → 410,
     expired → 410) and the tenant-scoped duplicate-user 409.
   - Only genuinely unexpected failures keep the generic 500.

2. **fleet-drivers lib** (`src/lib/carrier/fleet-drivers.ts`)
   - Normalize `email` (`toLowerCase().trim()`) on write in
     `createCarrierDriver` (driver row, PENDING-cancel, invitation, user link)
     so the acceptance-time link always matches.
   - Make `resendCarrierDriverInvitation` **idempotent**: if the driver already
     has a linked login (`driver.userId`) or the latest invitation is ACCEPTED,
     return `{ alreadyProvisioned: true, email }` (self-healing the
     `carrier_drivers.userId` link when possible) instead of an error.

3. **resend-invitation API route** — surface `alreadyProvisioned` as a 200 so
   the client shows an info state, not a red error toast.

4. **PortalAccessControls** — on `alreadyProvisioned`, show
   "This driver already has portal access" (info) + refresh (which now renders
   the active state / Resend option), instead of `toast.error`.

5. **Tests** (`tests/unit/`)
   - accept-invitation: fresh invite → success; already-used invite → friendly
     410; email already registered → specific 409.
   - admin provisioning: `resendCarrierDriverInvitation` on an already-linked
     driver → `alreadyProvisioned` (no throw, no error).

## Out of scope
Owner login, sysadmin login, signup — untouched.
