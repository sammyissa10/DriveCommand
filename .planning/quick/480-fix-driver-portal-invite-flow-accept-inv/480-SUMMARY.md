# Quick 480 — Summary

## What was broken
The driver portal invite flow was unusable end-to-end:
- **Driver side:** setting a password on "Create Your Account" returned
  "An error occurred while creating your account." on every attempt.
- **Admin side:** provisioning portal access for a driver threw a red error toast.

## Root cause (found by inspection + production DB queries)
A login identity in DriveCommand is a **globally unique Supabase Auth user**
(`auth.users.email` is unique across all tenants), mapped 1:1 to a Prisma `User`
by shared id. The invite-acceptance route only pre-checked the **tenant-scoped
Prisma `User` table** for a pre-existing account. When an invited email already
had *any* Supabase Auth identity — e.g. the person is already an OWNER/DRIVER in
another tenant, or an orphaned auth user from a prior partially-failed accept —
`admin.auth.admin.createUser` threw "email already registered", and the route
collapsed that into the generic 500. Because the auth identity persists, every
retry failed identically.

Confirmed against production: the invitation for `ayazali7244@gmail.com`
(tenant `04305834…`) targets an email that is already an OWNER of tenant
`9ce1797e…`. RLS was ruled out by reproducing the `User` insert against prod —
it passes the `bypass_rls` policy and only stops at app-supplied columns. The
route code itself was unchanged since May 1 yet worked on 2026-06-17, i.e. it's
a data-shape regression (colliding emails), not a code edit.

The same gap surfaced on the admin side as a hard error instead of an
"already has access" state, compounded by `createCarrierDriver` storing the
`email` un-normalized while acceptance links `carrier_drivers.userId` on the
lower-cased email (a casing mismatch could leave the link NULL).

## Changes
| File | Change |
|------|--------|
| `api/auth/accept-invitation/route.ts` | On `createUser` email-exists (`email_exists`/422/message), return specific **409** "already associated with a DriveCommand account. Please sign in instead." instead of generic 500. |
| `lib/carrier/fleet-drivers.ts` | Normalize email on write in `createCarrierDriver`; make `resendCarrierDriverInvitation` idempotent → `{ alreadyProvisioned }` (self-heals the `userId` link) instead of erroring. |
| `api/v1/carrier/fleet/drivers/[id]/resend-invitation/route.ts` | Return `alreadyProvisioned` as 200. |
| `components/carrier/fleet/PortalAccessControls.tsx` | Show "This driver already has portal access" (info) instead of red error toast. |
| `tests/unit/auth/accept-invitation.test.ts` | Fresh accept → portal; used invite → 410; email-exists → specific 409. |
| `tests/unit/carrier/resend-invitation-idempotent.test.ts` | Already-linked → alreadyProvisioned; ACCEPTED-but-unlinked → self-heal. |

## Error messages now returned (specific, per requirement)
- Invalid/used/cancelled invitation → 410 "This invitation has already been used or cancelled"
- Expired invitation → 410 "This invitation has expired…"
- Email already has a login (this tenant) → 409 "An account with this email already exists. Please sign in instead."
- Email already a Supabase identity (any tenant) → 409 "This email address is already associated with a DriveCommand account. Please sign in instead."
- Unexpected → 500 (generic, genuinely unexpected only)

## Verification
- `npx vitest run` on the two new files → **5/5 pass**.
- `npx tsc --noEmit` → **0 errors** (no regressions; touched files clean).
- Pre-existing unrelated unit-test failures (`require-auth`, `require-role`,
  `validate-mobile-token`, `schemas`) are the known stale-auth-mock baseline —
  untouched by this task.

## Out of scope (untouched)
Owner login, sysadmin login, tenant signup.

## Follow-up note
Cross-tenant email collisions (same email = owner in tenant A, invited as driver
to tenant B) are now reported clearly but remain unresolvable under the current
one-identity-per-email model — the correct product behavior is the clear 409.
