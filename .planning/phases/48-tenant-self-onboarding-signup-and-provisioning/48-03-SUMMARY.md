---
phase: 48-tenant-self-onboarding-signup-and-provisioning
plan: "03"
subsystem: auth
tags: [email, nodemailer, react-email, aes-256-gcm, email-confirmation, onboarding]

# Dependency graph
requires:
  - phase: 48-tenant-self-onboarding-signup-and-provisioning
    plan: "01"
    provides: "generateEmailToken / verifyEmailToken utility, emailConfirmedAt on Tenant schema"
provides:
  - "ConfirmEmailTemplate React Email component (confirm-email.tsx)"
  - "WelcomeOwnerEmail React Email component (welcome-owner.tsx)"
  - "GET /api/email-confirm/[token] — verifies AES-256-GCM token, sets emailConfirmedAt, idempotent"
  - "gmail-client.ts SendEmailOptions.replyTo optional field"
affects: [48-02, 48-04, email-sending, tenant-provisioning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React Email templates follow blue-header / white-content / footer style (owner-invitation.tsx pattern)"
    - "Email confirmation is pre-auth — uses bypass_rls transaction, no session required"
    - "Idempotent token redemption — ALREADY_CONFIRMED throws inside transaction, caught at handler level, redirects to /dashboard?notice=already-confirmed"

key-files:
  created:
    - apps/web/src/emails/confirm-email.tsx
    - apps/web/src/emails/welcome-owner.tsx
    - apps/web/src/app/api/email-confirm/[token]/route.ts
  modified:
    - apps/web/src/lib/email/gmail-client.ts

key-decisions:
  - "replyTo is optional in SendEmailOptions — existing callers unaffected, spread operator pattern used"
  - "Email confirmation route uses NextResponse.redirect (not next/navigation redirect) — avoids NEXT_REDIRECT throw in route handlers"
  - "bypass_rls transaction used for email confirm — pre-auth route, no tenant session available"
  - "Idempotency handled by throwing ALREADY_CONFIRMED inside transaction and catching at handler level to redirect gracefully"

patterns-established:
  - "React Email template pattern: blue #1e40af header, white content block, CTA button, footer with divider"
  - "Pre-auth API routes use bypass_rls and NextResponse.redirect, never next/navigation redirect"

# Metrics
duration: 15min
completed: 2026-04-29
---

# Phase 48 Plan 03: Email Templates and Confirmation Route Summary

**AES-256-GCM email confirmation flow with React Email templates, idempotent token redemption, and gmail-client replyTo support for warm human-sender welcome emails**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-29T05:30:00Z
- **Completed:** 2026-04-29T05:44:23Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Email confirmation GET route handles first-click (sets emailConfirmedAt), second-click (redirects to already-confirmed), expired/tampered token (redirects to link-invalid) — all without 500 errors
- Two React Email templates created following existing owner-invitation.tsx pattern: ConfirmEmailTemplate (transactional) and WelcomeOwnerEmail (warm founder tone from "Tom")
- gmail-client.ts extended with optional replyTo field — zero impact on existing 30+ callers

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Email templates, confirmation route, gmail-client replyTo** - `b35104d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/lib/email/gmail-client.ts` - Added `replyTo?: string` to SendEmailOptions, spread into sendMail call
- `apps/web/src/emails/confirm-email.tsx` - ConfirmEmailTemplate — blue header, 24h link, "If you didn't create..." note
- `apps/web/src/emails/welcome-owner.tsx` - WelcomeOwnerEmail — warm tone from Tom, trial end date, 3 onboarding steps CTA
- `apps/web/src/app/api/email-confirm/[token]/route.ts` - GET handler: decode URL, verifyEmailToken, bypass_rls tx, set emailConfirmedAt, redirect

## Decisions Made
- Used `NextResponse.redirect` not `next/navigation redirect` — route handlers don't catch NEXT_REDIRECT thrown by navigation's redirect, would surface as unhandled error
- Idempotency via throw-catch inside transaction: ALREADY_CONFIRMED is a known controlled flow, not an error — redirects to `/dashboard?notice=already-confirmed`
- `replyTo` uses spread operator so existing callers need zero changes

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- `npm run lint` from apps/web fails with "no such directory: lint" — confirmed pre-existing environment issue unrelated to this plan (verified by stashing all changes and reproducing the same error). TypeScript compile (`tsc --noEmit`) passes clean.

## User Setup Required
- `EMAIL_TOKEN_SECRET` — 64 hex chars (32 bytes). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `GMAIL_FROM_NAME` — set to `Tom from DriveCommand` so welcome emails show human sender name
- `SUPPORT_REPLY_TO` — reply-to address for welcome emails (falls back to GMAIL_USER if not set)
- Add `EMAIL_TOKEN_SECRET` to Vercel environment variables before deploying

## Next Phase Readiness
- Email confirmation loop is complete: 48-01 generates tokens, 48-03 verifies them
- 48-02 (sign-up page) can now import ConfirmEmailTemplate and WelcomeOwnerEmail and call sendEmail with replyTo
- Ready for Wave 3 (48-04 and beyond): sign-in, onboarding pages

---
*Phase: 48-tenant-self-onboarding-signup-and-provisioning*
*Completed: 2026-04-29*
