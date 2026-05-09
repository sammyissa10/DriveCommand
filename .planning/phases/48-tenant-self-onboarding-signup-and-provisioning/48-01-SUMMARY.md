---
phase: 48-tenant-self-onboarding-signup-and-provisioning
plan: "01"
subsystem: auth
tags: [aes-256-gcm, crypto, zod, prisma, bcryptjs, provisioning, onboarding, multi-tenant]

# Dependency graph
requires:
  - phase: 47-sysadmin-plans-promos-subscriptions
    provides: Plan, Promo, Subscription, ActivationProgress, AppEvent tables

provides:
  - generateEmailToken / verifyEmailToken — AES-256-GCM token helpers for email confirmation
  - signUpSchema — Zod validation schema for self-signup form
  - provisionTenant() — 14-step atomic bypass_rls transaction (Tenant + User + Subscription + ActivationProgress)
  - seedSampleData() — fleet-bucket-aware sample data seeder (trucks, customers, loads)
  - hydrateTenant() — idempotent wrapper that seeds sample data on first call only

affects:
  - 48-02 (signup action imports provisionTenant + signUpSchema)
  - 48-03 (email confirm route imports verifyEmailToken + hydrateTenant)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - AES-256-GCM with 12-byte random IV, auth tag, base64url encoding for email tokens
    - bypass_rls Prisma transaction pattern (set_config scoped to tx session)
    - Idempotency check before seeding via provisioningPhase enum
    - Atomic promo redemption via $executeRaw UPDATE with conditional WHERE

key-files:
  created:
    - apps/web/src/lib/auth/email-token.ts
    - apps/web/src/lib/validations/onboarding.schemas.ts
    - apps/web/src/lib/onboarding/provision-tenant.ts
    - apps/web/src/lib/onboarding/seed-sample-data.ts
    - apps/web/src/lib/onboarding/hydrate-tenant.ts
  modified:
    - apps/web/.env.example

key-decisions:
  - "Used Node.js built-in crypto module (no extra package) for AES-256-GCM token generation"
  - "Promo code failures are silent (unknown/inactive promo does not hard-fail signup) but PROMO_EXHAUSTED throws to rollback tx"
  - "Used Prisma.TransactionClient type (not Parameters<> pattern) for seedSampleData TX parameter"
  - "Steps 12-14 (AppEvent, emails, Supabase auth) intentionally delegated to signup action caller"
  - "Sample loads use owner userId as driverId since no real driver exists at provisioning time"

patterns-established:
  - "Onboarding lib files live in apps/web/src/lib/onboarding/ — no circular imports with actions layer"
  - "Zod validation schemas for API inputs live in apps/web/src/lib/validations/"
  - "Email token = AES-256-GCM encrypted JSON payload, layout: iv(12) + authTag(16) + ciphertext, base64url"

# Metrics
duration: 25min
completed: 2026-04-28
---

# Phase 48 Plan 01: Provisioning Engine Summary

**AES-256-GCM email tokens, Zod signup schema, and 14-step atomic bypass_rls provisioning transaction with fleet-bucket-aware sample data seeding**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-28T00:00:00Z
- **Completed:** 2026-04-28T00:25:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Email token helper uses Node.js crypto (no extra package) with AES-256-GCM, 24h TTL, single-use design
- provisionTenant() creates Tenant (TRIAL) + User (OWNER) + Subscription (TRIALING) + ActivationProgress atomically; full rollback on any failure
- hydrateTenant() is idempotent — calling it twice on a HYDRATED tenant is a strict no-op

## Task Commits

1. **Task 1: AES-256-GCM email token helper + Zod signup schema** - `5872180` (feat)
2. **Task 2: provision-tenant.ts — 14-step atomic provisioning transaction** - `6e1da10` (feat)
3. **Task 3: seed-sample-data.ts + hydrate-tenant.ts** - `ca57d3d` (feat)

## Files Created/Modified

- `apps/web/src/lib/auth/email-token.ts` - generateEmailToken / verifyEmailToken using AES-256-GCM
- `apps/web/src/lib/validations/onboarding.schemas.ts` - signUpSchema Zod object (6 fields + optional promoCode)
- `apps/web/src/lib/onboarding/provision-tenant.ts` - 14-step atomic provisioning transaction
- `apps/web/src/lib/onboarding/seed-sample-data.ts` - fleet-bucket-aware sample data seeder
- `apps/web/src/lib/onboarding/hydrate-tenant.ts` - idempotent wrapper around seedSampleData
- `apps/web/.env.example` - added EMAIL_TOKEN_SECRET, GMAIL_FROM_NAME, SUPPORT_REPLY_TO entries

## Decisions Made

- Used Node.js built-in `crypto` module for AES-256-GCM tokens (no extra package needed)
- Unknown/inactive promo codes silently ignored; only PROMO_EXHAUSTED (valid but exhausted) throws to roll back the transaction
- Used `Prisma.TransactionClient` type (exported from generated client) rather than the `Parameters<>` inference pattern
- Steps 12–14 (AppEvent write, welcome email, Supabase Auth user creation) intentionally kept outside provisionTenant so signup action controls orchestration
- Sample loads use ownerUserId as driverId since no real driver exists at provisioning time

## Deviations from Plan

None - plan executed exactly as written. Import path for Prisma enums used `../../generated/prisma` (consistent with existing codebase patterns) and `Prisma.TransactionClient` type instead of the plan's `Parameters<>` pattern — both equivalent, both compile cleanly.

## Issues Encountered

None.

## User Setup Required

**New environment variable required before plan 02 or 03 can be used:**

Add to your `.env.local` and Vercel environment variables:

```
EMAIL_TOKEN_SECRET=<64 hex chars>
```

Generate with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Next Phase Readiness

- Plan 02 (signup server action) can now import `provisionTenant` and `signUpSchema` cleanly
- Plan 03 (email confirm route) can import `verifyEmailToken` and `hydrateTenant` cleanly
- No circular dependencies — all lib files import only from other lib files

---
*Phase: 48-tenant-self-onboarding-signup-and-provisioning*
*Completed: 2026-04-28*
