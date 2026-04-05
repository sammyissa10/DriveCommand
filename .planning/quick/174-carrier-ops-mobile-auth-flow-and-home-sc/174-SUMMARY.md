---
phase: quick-174
plan: 01
subsystem: carrier-ops-mobile
tags: [carrier-ops, mobile, api-routes, react-native, tanstack-query]
dependency_graph:
  requires:
    - quick-153: carrier ops migrations 005-006
    - quick-157: carrier ops prisma schema (CarrierDriver, CarrierDispatch, CarrierStop models)
  provides:
    - GET /api/mobile/carrier/driver/dispatches
    - GET /api/mobile/carrier/driver/dispatches/[id]
    - carrierDriverApi (typed api-client module)
    - apps/mobile/app/(driver)/carrier/ (home screen + stack layout)
  affects:
    - packages/api-client/src/index.ts (barrel exports)
    - apps/mobile/app/(driver)/_layout.tsx (hidden carrier route)
tech_stack:
  added: []
  patterns:
    - bypass_rls + validateMobileToken pattern (established)
    - TanStack Query + FlashList + useThemeColors (established mobile pattern)
    - CarrierDriver userId lookup for dispatch filtering
key_files:
  created:
    - apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
    - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts
    - packages/api-client/src/carrier-driver.ts
    - apps/mobile/app/(driver)/carrier/_layout.tsx
    - apps/mobile/app/(driver)/carrier/index.tsx
  modified:
    - packages/api-client/src/index.ts
    - apps/mobile/app/(driver)/_layout.tsx
decisions:
  - Used hidden tab (href: null) for carrier route to avoid breaking 5-tab layout; Carrier Dispatches link to be added to More screen in future task
  - Generated dispatchNumber from id prefix (DSP-XXXXXXXX) since CarrierDispatch has no dispatchNumber field in schema
  - CarrierDriver lookup by userId+orgId is required because validateMobileToken returns User.id but dispatch FK uses CarrierDriver.id
  - 4 stub methods in carrierDriverApi (markStopArrived, completeStop, uploadStopDocument, logExpense) are typed but have no backing routes yet — intentional for future tasks
metrics:
  duration: ~15 minutes
  completed: 2026-04-05
  tasks_completed: 2
  files_changed: 7
---

# Phase quick-174 Plan 01: Carrier Driver Mobile Auth Flow and Home Screen Summary

Carrier driver mobile foundation: two REST API routes, a typed api-client module, and a React Native home screen displaying active and upcoming dispatches with pull-to-refresh.

## What Was Built

### Task 1: Carrier Driver Mobile API Routes

**GET /api/mobile/carrier/driver/dispatches** — Returns all `planned` and `in_progress` dispatches assigned to the authenticated driver (as primary or co-driver), ordered by scheduled departure. Each dispatch includes truck unit number, stop summaries with facility names, BOL/POD status derived from stop type and uploaded documents.

**GET /api/mobile/carrier/driver/dispatches/[id]** — Returns full dispatch detail including all stops with full facility addresses (addressLine1, city, state, zip, lat/lng), stop documents, and driver expenses for the dispatch.

Both routes follow the established bypass_rls + validateMobileToken + rate limiting pattern. A two-step lookup is required: first find the `CarrierDriver` record by `userId + orgId` (since dispatches use `CarrierDriver.id` as FK, not `User.id`), then query dispatches with OR filter on `primaryDriverId` / `coDriverId`.

### Task 2: API Client, Mobile Screen, and Tab Integration

**`packages/api-client/src/carrier-driver.ts`** — Exports `carrierDriverApi` with 6 typed methods. `getMyDispatches` and `getDispatchDetail` have backing routes. The other 4 (`markStopArrived`, `completeStop`, `uploadStopDocument`, `logExpense`) are typed stubs for future tasks. All types are self-contained in the module.

**`apps/mobile/app/(driver)/carrier/index.tsx`** — Carrier dispatch home screen:
- Active dispatch card: shows dispatch number, truck unit, departure time, stop progress bar (completed/total using `status === 'completed' || status === 'departed'`)
- Upcoming dispatches: FlashList of compact cards with dispatch number, departure date, stop count
- Empty state: centered Truck icon + "No dispatches assigned" message
- Pull-to-refresh via TanStack Query `isRefetching` + `refetch`

**`apps/mobile/app/(driver)/carrier/_layout.tsx`** — Stack navigator for future carrier sub-screens (dispatch detail, stop actions).

**Driver tab navigator** — `carrier` added as `href: null` (hidden) to avoid breaking the 5-tab layout. Navigation to `/carrier` is available via programmatic `router.push('/carrier')`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `c.text` not in token map**
- **Found during:** Task 2 TypeScript check
- **Issue:** Carrier screen used `c.text` but `useThemeColors()` returns `c.textPrimary`, `c.textSecondary`, etc.
- **Fix:** Replaced all `c.text` → `c.textPrimary`
- **Files modified:** `apps/mobile/app/(driver)/carrier/index.tsx`
- **Commit:** 1b30997

**2. [Rule 1 - Bug] `estimatedItemSize` not in FlashList prop types**
- **Found during:** Task 2 TypeScript check
- **Issue:** FlashList version in this codebase doesn't expose `estimatedItemSize` prop (not used elsewhere in the app)
- **Fix:** Removed the prop — FlashList works without it
- **Files modified:** `apps/mobile/app/(driver)/carrier/index.tsx`
- **Commit:** 1b30997

**3. [Rule 3 - Blocking] api-client dist not rebuilt after adding carrier-driver.ts**
- **Found during:** Task 2 TypeScript check
- **Issue:** Mobile app resolves `@drivecommand/api-client` from `dist/index.js` — new exports weren't visible until rebuilt
- **Fix:** Ran `npx tsc` in `packages/api-client` to regenerate dist
- **Files modified:** `packages/api-client/dist/` (gitignored)
- **Commit:** n/a (dist gitignored, rebuilt at dev time)

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git log.
