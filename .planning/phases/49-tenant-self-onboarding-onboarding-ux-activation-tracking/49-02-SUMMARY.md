---
phase: 49-tenant-self-onboarding-onboarding-ux-activation-tracking
plan: "02"
subsystem: onboarding
tags: [prisma, activation-tracking, server-actions, rls, appevent]

# Dependency graph
requires:
  - phase: 49-01
    provides: ActivationProgress DB model + ActivationChecklist UI component
provides:
  - activation-tracker.ts library with recordActivationEvent()
  - Automatic activation event hooks in trucks, customers, loads, accept-invitation
affects:
  - 49-03 (onboarding banner/redirect logic will read ActivationProgress completionPct)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget activation tracking: calls inside try/catch, never propagates, user action always succeeds"
    - "bypass_rls in prisma.$transaction for pre-auth and cross-tenant writes"
    - "Idempotent activation fields: check IS NULL before writing, skip if already set"

key-files:
  created:
    - apps/web/src/lib/onboarding/activation-tracker.ts
  modified:
    - apps/web/src/app/(owner)/actions/trucks.ts
    - apps/web/src/app/(owner)/actions/customers.ts
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/api/auth/accept-invitation/route.ts

key-decisions:
  - "recordActivationEvent never propagates errors — two-layer try/catch ensures user actions always succeed"
  - "Dynamic select keys removed from Prisma findUnique to avoid TypeScript inference producing `never` for accountCreatedAt"
  - "tenantId declared at outer scope of updateLoadStatus (before try/catch) so it is available to both notification block and tracker call"
  - "loads.ts updateLoadStatus: requireTenantId() call promoted to outer function scope, eliminating the conditional tId variable"

patterns-established:
  - "Activation hook pattern: import recordActivationEvent, wrap call in try/catch after primary action succeeds, before revalidatePath/redirect"
  - "isSample guard: only fire activation events for non-sample records (loads.ts IN_TRANSIT check)"
  - "Role guard: accept-invitation fires first_real_driver only when userRole === DRIVER"

# Metrics
duration: 4min
completed: 2026-05-01
---

# Phase 49 Plan 02: Activation Tracker Library + Hooks Summary

**activation-tracker.ts library with idempotent bypass_rls writes to ActivationProgress and AppEvent, hooked into trucks, customers, loads, and accept-invitation**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-01T17:56:27Z
- **Completed:** 2026-05-01T18:00:41Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `activation-tracker.ts` with `recordActivationEvent()`: idempotent, bypass_rls, never propagates, writes error AppEvents on failure, fires `tenant.activated` at 100%
- Hooked into `createTruck` (first_real_truck), `createCustomer` (first_real_client), `updateLoadStatus` (first_load_in_transit when IN_TRANSIT and !isSample), `accept-invitation POST` (first_real_driver when role=DRIVER)
- TypeScript compiles clean across all 5 files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create activation-tracker.ts library** - `29807f2` (feat)
2. **Task 2: Hook tracker into trucks.ts, customers.ts, loads.ts, accept-invitation/route.ts** - `8a4f93a` (feat)

## Files Created/Modified
- `apps/web/src/lib/onboarding/activation-tracker.ts` - Core library: ActivationEventType union, FIELD_MAP, recordActivationEvent() with bypass_rls, idempotency, completionPct formula, tenant.activated event, error AppEvent fallback
- `apps/web/src/app/(owner)/actions/trucks.ts` - Added import + first_real_truck hook after truck.create
- `apps/web/src/app/(owner)/actions/customers.ts` - Added import + first_real_client hook after customer.create
- `apps/web/src/app/(owner)/actions/loads.ts` - Added import + isSample to findUnique select + tenantId at outer scope + first_load_in_transit hook; notification block updated to use outer-scope tenantId
- `apps/web/src/app/api/auth/accept-invitation/route.ts` - Added import + first_real_driver hook (DRIVER role guard) after user creation tx

## Decisions Made
- Removed the dynamic computed key `[field]: true` from the Prisma `findUnique` select — TypeScript inferred `accountCreatedAt` as `never` when a computed key was present in the `select` object. Fixed by selecting all fields explicitly and doing idempotency check via `current[field as keyof typeof current]`.
- Promoted `requireTenantId()` in `updateLoadStatus` to outer function scope (before the try/catch) so it is available to both the existing notification block (which previously declared its own `tId` local) and the new tracker call. This simplification also eliminates the conditional `tId` variable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript `never` type on accountCreatedAt with dynamic Prisma select key**
- **Found during:** Task 1 (activation-tracker.ts creation)
- **Issue:** Using `[field]: true` as a computed key in the Prisma `findUnique` select caused TypeScript to infer `accountCreatedAt` as `never`, producing error TS2339 at `current.accountCreatedAt.getTime()`
- **Fix:** Removed the dynamic key from the select; all needed fields listed explicitly. Idempotency check moved to use `current[field as keyof typeof current]`
- **Files modified:** `apps/web/src/lib/onboarding/activation-tracker.ts`
- **Verification:** `npx tsc --noEmit -p apps/web/tsconfig.json` — no errors
- **Committed in:** `29807f2` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug in initial implementation)
**Impact on plan:** Fix required for TypeScript correctness. Logic is semantically identical to the plan spec. No scope creep.

## Issues Encountered
None beyond the TypeScript inference issue documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Activation tracker is live: all 4 real-product actions now auto-advance the onboarding checklist
- Plan 03 can read `ActivationProgress.completionPct` to drive redirect logic and banner dismissal
- `completionPct` formula implemented: `20 * (1 + truck + driver + client + transit)` = 20/40/60/80/100

---
*Phase: 49-tenant-self-onboarding-onboarding-ux-activation-tracking*
*Completed: 2026-05-01*
