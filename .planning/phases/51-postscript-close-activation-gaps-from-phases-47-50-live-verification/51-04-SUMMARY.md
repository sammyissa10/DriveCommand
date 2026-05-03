---
phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification
plan: "04"
subsystem: auth
tags: [login, activation, onboarding, redirect, prisma, bypass_rls, supabase]

# Dependency graph
requires:
  - phase: 51-03
    provides: Onboarding checklist CTA links to truck/driver/customer/dispatch create pages
  - phase: 47-48
    provides: ActivationProgress model with isActivated field and tenantId FK
provides:
  - Login route queries ActivationProgress on OWNER sign-in and redirects to /onboarding/welcome when isActivated=false
  - Defensive fallback: missing ActivationProgress row treated as not-activated
  - Non-fatal error handling: activation check failure defaults to /carrier/dashboard without blocking login
affects: [onboarding, tenant-activation, login-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bypass_rls transaction in login route for cross-tenant queries outside RLS context"
    - "ownerIsActivated flag defaulting true with explicit override on OWNER role only"

key-files:
  created: []
  modified:
    - apps/web/src/app/api/auth/login/route.ts

key-decisions:
  - "Non-fatal activation check: check failure defaults to /carrier/dashboard rather than blocking login"
  - "Defensive fallback: missing ActivationProgress row treated as not-activated (redirect to /onboarding/welcome)"
  - "Check only applies to OWNER role — DRIVER and sysadmin redirect logic unchanged"

patterns-established:
  - "Pattern: ownerIsActivated flag defaults true, overridden only inside OWNER role branch"

# Metrics
duration: 2min
completed: 2026-05-03
---

# Phase 51 Plan 04: Auto-redirect non-activated tenants on sign-in Summary

**Login route queries ActivationProgress (bypass_rls transaction) on OWNER sign-in and redirects to /onboarding/welcome when isActivated=false, with non-fatal fallback to dashboard on error**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-03T21:26:14Z
- **Completed:** 2026-05-03T21:28:11Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added `TX_OPTIONS` to `prisma` import in login route (was previously importing `prisma` only)
- Inserted `ActivationProgress` check block after `dbUser.isActive` gate using `bypass_rls` transaction pattern
- OWNER redirect now conditional: `/onboarding/welcome` when `isActivated=false` (or row missing), `/carrier/dashboard` when `isActivated=true`
- DRIVER (`/home`) and sysadmin (`/admin-dashboard`) redirect logic unchanged
- Non-fatal try/catch: activation check failure logs a warning and falls through to dashboard without blocking login

## Task Commits

Each task was committed atomically:

1. **Task 1: Read login route and identify the redirect logic location** - analysis only, no commit
2. **Task 2: Insert ActivationProgress check and conditional redirect** - `43e7bf8` (feat)
3. **Task 3: Verify and commit** - `43e7bf8` (feat — combined with task 2 into single commit per plan spec)

**Plan metadata:** `(docs commit follows)`

## Files Created/Modified
- `apps/web/src/app/api/auth/login/route.ts` - Updated import to include TX_OPTIONS, inserted ownerIsActivated check block (lines 138-159), updated redirectUrl assignment to include OWNER + !ownerIsActivated branch

## Decisions Made
- Non-fatal error handling: activation check failure defaults to `/carrier/dashboard` rather than returning a 500, since failing to read activation status should never block a valid login
- Defensive fallback: missing `ActivationProgress` row (no onboarding row exists) treated as not-activated, redirecting to `/onboarding/welcome`
- Check scope limited to `OWNER` role only — DRIVER and sysadmin roles remain unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit` produced errors in `.next/dev/types/` generated files — pre-existing, not caused by this change. Source-only TypeScript check (filtering `.next/` paths) passed with zero errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plans 51-04 complete: owners signing in with incomplete activation will now land on `/onboarding/welcome` automatically
- Plan 51-05 is next — final plan in phase 51

---
*Phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification*
*Completed: 2026-05-03*
