---
phase: 48-tenant-self-onboarding-signup-and-provisioning
verified: 2026-04-29T00:00:00Z
status: passed
score: 12/12 files exist, all key invariants verified
re_verification: false
gaps: []
human_verification:
  - test: Submit sign-up form with a new email end-to-end
    expected: Account is created, user is redirected to /onboarding/welcome, two emails arrive
    why_human: Requires live env vars and a DB row for Plan with key=starter
  - test: Click the confirmation link from the email
    expected: First click to /dashboard; second click to /dashboard?notice=already-confirmed
    why_human: Requires a real email client and a running server
  - test: Submit sign-up with a duplicate email
    expected: Generic success message, bcrypt timing equalization runs, account-exists email sent
    why_human: Timing behavior and sent email can only be verified at runtime
---

# Phase 48: Tenant Self-Onboarding Verification Report

**Phase Goal:** New fleet owners can sign up at /sign-up, the tenant is atomically provisioned in a Postgres transaction, a welcome email and confirmation email are sent, and the owner lands at /onboarding/welcome.

**Verified:** 2026-04-29
**Status:** PASSED
**Re-verification:** No -- initial verification

---

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All 12 specified files exist | VERIFIED | All present at expected paths |
| 2 | provision-tenant.ts runs atomically with bypass_rls scoped to transaction | VERIFIED | set_config 3rd arg TRUE = transaction-local; single prisma dollar-sign-transaction wraps all steps |
| 3 | provision-tenant.ts uses bcrypt 12 rounds | VERIFIED | bcrypt.hash(password, 12) at line 33 |
| 4 | email-token.ts uses AES-256-GCM, 24h TTL, correct return shape | VERIFIED | ALGORITHM = aes-256-gcm, TTL_MS = 24h, returns VerifyResult union |
| 5 | actions.tsx EMAIL_TAKEN path calls bcrypt timing equalization | VERIFIED | await bcrypt.hash timing-equalization-dummy 12 at line 162 |
| 6 | Rate limiter is module-level Map, 10/hour limit | VERIFIED | const rateBuckets at module scope, RATE_LIMIT=10, WINDOW_MS=1h |
| 7 | /api/email-confirm checks emailConfirmedAt (single-use enforcement) | VERIFIED | if emailConfirmedAt !== null throw ALREADY_CONFIRMED; redirected to dashboard?notice=already-confirmed |
| 8 | middleware.ts PUBLIC_PATHS has /onboarding/welcome and /api/email-confirm | VERIFIED | Lines 61-62 of middleware.ts |
| 9 | sign-up-form.tsx has fleet size select with 4 options | VERIFIED | OWNER_OPERATOR, SMALL, MEDIUM, LARGE |
| 10 | provision-tenant.ts returns tenantId/emailToken/trialEndsAt | VERIFIED | ProvisionResult interface; actions.tsx uses all three |
| 11 | sendEmail accepts react property | VERIFIED | SendEmailOptions.react: ReactElement; @react-email/render renders it |
| 12 | createSupabaseServerClient is correctly awaited | VERIFIED | async in server.ts; called with await in actions.tsx line 149 |

**Score:** 12/12

---

## Required Artifacts

| Artifact | Status | Notes |
|----------|--------|-------|
| src/lib/auth/email-token.ts | VERIFIED | AES-256-GCM, 24h TTL, correct VerifyResult union |
| src/lib/validations/onboarding.schemas.ts | VERIFIED | Zod schema, FleetSizeBucketEnum, exports SignUpInput |
| src/lib/onboarding/provision-tenant.ts | VERIFIED | 10 steps in one transaction, returns ProvisionResult |
| src/lib/onboarding/seed-sample-data.ts | VERIFIED | Seeds trucks/customers/loads per bucket, all isSample=true |
| src/lib/onboarding/hydrate-tenant.ts | VERIFIED | Idempotent, marks HYDRATED, calls seedSampleData |
| src/emails/confirm-email.tsx | VERIFIED | React Email with confirmUrl CTA |
| src/emails/welcome-owner.tsx | VERIFIED | React Email with all 4 required props |
| src/app/api/email-confirm/[token]/route.ts | VERIFIED | GET, single-use, bypass_rls, redirects to /dashboard |
| src/app/(auth)/sign-up/actions.tsx | VERIFIED | Rate limiting, timing equalization, Supabase user creation, redirect |
| src/app/(auth)/sign-up/sign-up-form.tsx | VERIFIED | useActionState, 4-option fleet select, field errors |
| src/app/(auth)/sign-up/[[...sign-up]]/page.tsx | VERIFIED | Renders SignUpForm with searchParams |
| src/app/onboarding/welcome/page.tsx | VERIFIED | Static confirmation page, link to /dashboard |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| sign-up-form.tsx | signUpAction | useActionState | WIRED |
| actions.tsx | provision-tenant.ts | direct import + await | WIRED |
| actions.tsx | gmail-client.ts | void sendEmail x2 | WIRED |
| actions.tsx | confirm-email.tsx | JSX to sendEmail.react | WIRED |
| actions.tsx | welcome-owner.tsx | JSX to sendEmail.react | WIRED |
| actions.tsx | Supabase Admin API | createAdminClient createUser | WIRED |
| actions.tsx | /onboarding/welcome | Next.js redirect() | WIRED |
| provision-tenant.ts | email-token.ts | generateEmailToken | WIRED |
| /api/email-confirm | email-token.ts | verifyEmailToken | WIRED |
| middleware.ts | /onboarding/welcome | PUBLIC_PATHS | WIRED |
| middleware.ts | /api/email-confirm | PUBLIC_PATHS | WIRED |

---

## Schema Integrity

All Prisma model fields referenced in provisioning code exist in schema.prisma:

- Tenant: emailConfirmedAt, provisioningPhase, sampleDataSeeded, fleetSizeBucket, contactEmail
- ActivationProgress: completionPct, isActivated, accountCreatedAt
- Subscription: trialEndsAt, stripeCustomerId, stripeSubscriptionId
- Plan: defaultTrialDays / Promo: bonusTrialDays, redemptionCount, maxRedemptions
- Truck.isSample, Customer.isSample, Load.isSample
- Enums: TenantStatus, ProvisioningPhase, SubscriptionStatus, FleetSizeBucket

---

## Anti-Patterns Found

None. No TODO/FIXME/placeholder comments, no stub implementations, no empty handlers across all reviewed files.

---

## Human Verification Required

### 1. End-to-end sign-up flow

**Test:** Submit the sign-up form at /sign-up with a fresh email address.
**Expected:** Redirected to /onboarding/welcome; two emails received (confirmation + welcome); user can reach /dashboard.
**Why human:** Requires live GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_TOKEN_SECRET, and a DB Plan row with key=starter and isActive=true.

### 2. Email confirmation link single-use enforcement

**Test:** Click the confirmation link, then click it again.
**Expected:** First click redirects to /dashboard; second click redirects to /dashboard?notice=already-confirmed.
**Why human:** Requires a real email with a live token.

### 3. Duplicate email timing equalization

**Test:** Submit sign-up with an existing email.
**Expected:** Generic success message, no timing difference, account-exists email sent.
**Why human:** Timing is only observable at runtime; email requires live SMTP.

---

## Gaps Summary

No gaps found. Phase 48 is fully implemented. All 12 required files exist with substantive implementations. All key wiring paths are connected. The provisioning transaction correctly scopes bypass_rls to the transaction, bcrypt runs at 12 rounds, email tokens use AES-256-GCM with 24h expiry, the confirmation route enforces single-use semantics, both middleware entries are present, and the fleet size selector has all 4 required options.

---

_Verified: 2026-04-29_
_Verifier: Claude (gsd-verifier)_
