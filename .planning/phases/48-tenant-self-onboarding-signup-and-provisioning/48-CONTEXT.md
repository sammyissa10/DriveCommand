# Phase 48: Tenant Self-Onboarding — Signup and Provisioning - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Everything from the blank `/sign-up` form through atomic tenant creation, sample data seeding by fleet size, email confirmation token generation and redemption, and first landing at `/onboarding/welcome`. Three plans: B-01 provisioning logic, B-02 signup page + server action, B-03 email confirmation + templates.

Phase C (onboarding checklist UX, sample data banner, activation tracking) is explicitly out of scope. This phase ends when: the owner is logged in, sample data is seeded, and the confirmation email has been sent.

</domain>

<decisions>
## Implementation Decisions

### Provisioning transaction (B-01)
- All 14 steps in spec section 6.1 happen inside a single Prisma transaction with `bypass_rls = on`
- `bypass_rls = on` scoped ONLY to this signup transaction; never leaks to other tenant code paths
- If any step fails before commit, the entire transaction rolls back — no half-provisioned tenants
- Password: bcrypt, 12 rounds, matching existing `src/lib/auth/` pattern
- Slug: lowercase kebab-case from companyName, numeric suffix on collision (e.g., "acme-trucking-2")
- Trial length: `plan.defaultTrialDays + (promo?.bonusTrialDays ?? 0)` computed at signup, stored as `trialEndsAt` on Subscription
- Promo lookup: read from `?promo=` URL param; only apply if promo is active, within date range, and under maxRedemptions
- Stripe deferred: `stripeCustomerId` and `stripeSubscriptionId` left NULL. No card collected.

### Sample data seeding (B-01)
- Fork by `fleetSizeBucket`:
  - OWNER_OPERATOR: 1 truck, 1 driver, 1 client, 1 completed load, 1 in-transit load
  - SMALL / MEDIUM / LARGE: 3 trucks, 3 drivers, 2 clients, 1 completed load, 2 in-transit loads
- All sample records flagged `isSample = true`
- Sample data is seeded on first landing (Phase 2 hydration) — NOT during the signup transaction
- `hydrateTenant` is idempotent: returns immediately if `provisioningPhase = HYDRATED`

### Email confirmation token (B-01)
- Single-use, 24-hour expiry
- Signed with AES-256-GCM using existing helpers (same pattern as session cookie)
- Invalidated on first redemption — second click must fail cleanly
- Token stored in a separate signed payload (not in DB); invalidation achieved by writing a redeemed marker to DB

### Signup server action (B-02)
- `signUpAction(formData)` — Next.js Server Action (built-in CSRF protection, do not bypass)
- On success: set session cookie → fire `tenant.created` event → redirect to `/onboarding/welcome`
- On duplicate email: respond identically (same screen, same redirect, similar response time within 100ms); send a "you already have an account" email instead of creating a new tenant
- Rate limit: 10 signups per IP per hour; simple in-memory Map is acceptable for v1
- `?promo=` URL param passed from form submission → looked up in signUpAction

### Public routing (B-02 / B-03)
- `/sign-up`, `/onboarding/welcome`, and `/api/email-confirm/*` must be added to the public route allowlist in `src/middleware.ts`
- Pattern: check how Phase 47 added `/plans` and `/promos` to `ADMIN_ALLOWED_PATHS`, then find the equivalent public-route allowlist for the tenant app

### Email templates (B-03)
- `welcome-owner.tsx`: FROM a named human ("Tom from DriveCommand"), Reply-To routes to real inbox; NOT no-reply@
- `confirm-email.tsx`: contains single-use confirmation link to `/api/email-confirm/[token]`
- Both sent via existing Gmail SMTP transport at `src/lib/email/gmail-client.ts`
- Templates use `@react-email/components` — follow existing template patterns in `src/emails/`
- No new email providers (no Resend, SendGrid, Postmark)

### Session
- Existing AES-256-GCM session cookie from `src/lib/auth/session.ts` — do not introduce any new auth library

### Claude's Discretion
- Visual design of `/sign-up` page (layout, card vs full-page, field ordering) — follow existing DriveCommand dark-mode Tailwind + shadcn/ui patterns
- Loading/error/success states in the signup form
- Email template visual style — follow DriveCommand brand colors and existing email template conventions
- Exact redeemed-token invalidation storage mechanism (lightweight DB flag vs signed expiry claim)

</decisions>

<specifics>
## Specific Ideas

- The confirmation token invalidation must be in a DB table (not just a signed expiry) so that a second click on the same link fails even within the 24-hour window
- Email enumeration defense: measure baseline response time and add `setTimeout` padding if duplicate-email path is measurably faster
- The `isSample` column already exists on Truck, User, Customer/Load from Phase A — do not re-add it
- Middleware note: spec section 5.12 says "ADMIN_ALLOWED_PATHS" is for admin routes; the public-route list for the tenant app may be separate — researcher must verify exact middleware pattern

</specifics>

<deferred>
## Deferred Ideas

- Magic link and SSO login — spec explicitly defers these
- Stripe card collection at signup — deferred to when Stripe is wired
- Marketing site integration (drivecommand.io POSTs to /api/signup) — Phase B builds /sign-up in-app for testing; marketing site wiring is a separate task
- Rate limiting with Upstash Redis — in-memory is fine for v1; Redis upgrade is a future hardening task

</deferred>

---

*Phase: 48-tenant-self-onboarding-signup-and-provisioning*
*Context gathered: 2026-04-29*
