---
phase: quick-205
plan: 01
subsystem: auth
tags: [supabase, auth, ban, deactivation, session, tenant, driver]

# Dependency graph
requires:
  - phase: quick-90
    provides: RBAC system and requireRole guard used in driver actions
  - phase: 37.6
    provides: Supabase Auth consolidated into supabase.ts, app_metadata claims
provides:
  - Supabase Auth ban/unban integration in suspendTenant/reactivateTenant
  - Supabase Auth ban/unban integration in deactivateDriver/reactivateDriver
  - Post-auth login guard checking user.isActive and tenant.isActive with session destroy
affects: [auth, sysadmin, owner-portal, login]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "After local DB deactivation, call supabaseAdmin.auth.admin.updateUserById with ban_duration"
    - "After local DB reactivation, call supabaseAdmin.auth.admin.updateUserById with ban_duration: none"
    - "Always sign out Supabase sessions (signOut global) when rejecting login for deactivated accounts"
    - "Supabase Auth failures are logged but never throw — local DB state is source of truth"

key-files:
  created: []
  modified:
    - apps/web/src/app/(admin)/actions/tenants.ts
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/api/auth/login/route.ts

key-decisions:
  - "ban_duration 87600h (10 years) used as effectively-permanent ban — avoids needing a new permanent ban concept in Supabase"
  - "Promise.allSettled for tenant user banning — partial failures should not block the suspension"
  - "signOut uses global scope to invalidate all devices"
  - "Login route signs out the Supabase session it just created when rejecting a deactivated user (belt-and-suspenders)"
  - "Pre-existing e2e test TypeScript errors (Locator.not) are unrelated and pre-date this task"

patterns-established:
  - "Post-auth DB guard pattern: after signInWithPassword succeeds, query local DB for isActive before returning session"

# Metrics
duration: 12min
completed: 2026-04-13
---

# Quick Task 205: Fix Account Deactivation So It Actually Blocks Login

**Supabase Auth ban/unban integrated into tenant suspend/reactivate and driver deactivate/reactivate, with post-auth login guard that destroys sessions for deactivated users**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-04-13
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Deactivating a driver now bans them in Supabase Auth (87600h) and invalidates all existing sessions immediately
- Suspending a tenant bans all tenant users in Supabase Auth in parallel and invalidates their sessions
- Reactivating a driver or tenant lifts the ban so users can log in again
- Login route now checks `user.isActive` in addition to `tenant.isActive`, and signs out the Supabase session it just created before returning 403

## Task Commits

1. **Task 1: Supabase Auth ban/unban in tenant and driver actions** - `1d7afa3` (feat)
2. **Task 2: Post-auth login guard for deactivated users** - `db1c57b` (feat)

## Files Created/Modified
- `apps/web/src/app/(admin)/actions/tenants.ts` - Added createAdminClient import; suspendTenant bans all tenant users + invalidates sessions; reactivateTenant lifts bans
- `apps/web/src/app/(owner)/actions/drivers.ts` - Added createAdminClient import; deactivateDriver bans + invalidates session; reactivateDriver lifts ban
- `apps/web/src/app/api/auth/login/route.ts` - Added createAdminClient import; added user.isActive check after tenant check; added signOut call before returning 403 for both deactivated user and suspended tenant cases

## Decisions Made
- Used `ban_duration: '87600h'` (10 years) as the effectively-permanent ban value — Supabase doesn't have a literal "permanent ban" concept
- Used `Promise.allSettled` for the tenant-wide ban loop so one failing user doesn't block the others
- Used `signOut(userId, 'global')` to invalidate all devices/sessions at once
- Login guard signs out the session Supabase just created before returning 403, ensuring no valid cookie is left behind

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed logger.error call signature in ban/unban error handlers**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Plan specified `logger.error('[tag] message:', userId, err)` but the logger.error signature is `(message: string, error?: unknown, context?: Record<string, unknown>)`. Passing userId as error and err as context caused TS2345 type errors.
- **Fix:** Concatenated userId into the message string: `logger.error('[tag] message:' + userId, err)`
- **Files modified:** tenants.ts, drivers.ts
- **Verification:** `tsc --noEmit` passes with zero new errors
- **Committed in:** `1d7afa3` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minor call-site fix to match existing logger signature. No behavior change.

## Issues Encountered
- The login route already had a tenant `isActive` check but it only logged a warning and returned a generic message without signing out the Supabase session. The new code adds the sign-out call and also covers the `user.isActive` case.
- 3 pre-existing TypeScript errors in `e2e/carrier/*.spec.ts` (Playwright `Locator.not` property) are unrelated to this task and were present before execution.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Account deactivation is now enforced at both the Supabase Auth layer (ban) and the login route layer (DB guard)
- Ready for any future work

---
*Phase: quick-205*
*Completed: 2026-04-13*
