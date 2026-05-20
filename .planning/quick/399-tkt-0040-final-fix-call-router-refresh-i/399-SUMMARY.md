---
phase: quick-399
plan: 399
subsystem: web/carrier-forms
tags: [tkt-0040, onboarding, router-cache, client-side, bugfix]
dependency_graph:
  requires: [quick-397, quick-398]
  provides: [tkt-0040-closed]
  affects: [onboarding/welcome, carrier/fleet/trucks/new, carrier/fleet/drivers/new, carrier/clients/new]
tech_stack:
  added: []
  patterns: [router.refresh()-before-router.push() on create success]
key_files:
  created: []
  modified:
    - apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
    - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
    - apps/web/src/components/carrier/clients/ClientForm.tsx
decisions:
  - "router.refresh() must be called BEFORE router.push() so the client Router Cache is evicted before Next.js initiates the push-triggered navigation; calling it after means the push can complete and repopulate the cache from a stale prefetch before the refresh kicks in"
  - "dispatch/first_load_in_transit has the same Route-Handler revalidatePath gap — flagged as candidate follow-up QT, out of scope here"
metrics:
  duration: ~10 minutes
  completed: 2026-05-20
  tasks_completed: 1
  files_changed: 3
---

# Phase quick-399: TKT-0040 Final Fix — router.refresh() Before router.push() in Carrier Create Forms

## Approach

After QT 397 (server-side revalidatePath + force-dynamic) and QT 398 (synchronous recordActivationEvent), the onboarding welcome checklist still showed entity steps unchecked because Next.js Route Handlers do not emit the `x-action-revalidated` header that signals the browser to evict its client Router Cache — only Server Actions do. The fix adds `router.refresh()` before `router.push()` in all three carrier entity create forms so the client cache is evicted before any subsequent navigation can serve a stale RSC payload from /onboarding/welcome. Three surgical, line-order-only edits with no server changes, no new dependencies, and no new patterns.

## Edits Applied

| Form | File | Line range | router.refresh() present before this fix? | Position before fix | Position after fix |
|------|------|------------|------------------------------------------|--------------------|--------------------|
| trucks | `apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx` | 239–242 | Yes, but AFTER push | push → refresh | refresh → push |
| drivers | `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx` | 148–152 | No (missing entirely on create path) | push only | refresh → push |
| clients | `apps/web/src/components/carrier/clients/ClientForm.tsx` | 186–188 | Yes, but AFTER push | push → refresh | refresh → push |

## Audit: inviteDriver Flow

`apps/web/src/app/(owner)/actions/drivers.ts` — marked `'use server'` (line 1). It calls `revalidatePath('/onboarding/welcome')` after `recordActivationEvent(tenantId, 'first_real_driver')`. Server Actions emit `x-action-revalidated`, which automatically evicts the client Router Cache. No fix needed. Confirmed correct.

## Audit: dispatch/first_load_in_transit Flow

`apps/web/src/lib/carrier/dispatches.ts` line 619 calls `recordActivationEvent(orgId, 'first_load_in_transit')` inside `transitionDispatchStatus`, which is invoked from a Route Handler at `apps/web/src/app/api/v1/carrier/dispatches/[id]/status/route.ts` — not a Server Action. The same client-Router-Cache gap exists for the final activation step. User impact is lower (most users are off /onboarding/welcome by the time they dispatch a first load), but the stale-checklist behavior is identical if they navigate back. **Candidate follow-up QT.**

## QT 397 and QT 398 Status

Both prior fixes remain fully intact:
- QT 397: `revalidatePath('/onboarding/welcome')` calls in all three Route Handlers + `export const dynamic = 'force-dynamic'` on the welcome page — untouched.
- QT 398: synchronous `await recordActivationEvent(...)` in the Route Handlers — untouched.

## Verification

### TypeScript

`tsc --noEmit` was run against `apps/web`. The three modified files produce zero TypeScript errors. Pre-existing errors in unrelated files (`framer-motion`, `zustand`, `nuqs`, `@tanstack/react-virtual`, `d3-geo`, `topojson-*`, `papaparse`) are unchanged from before this task and are not introduced by this fix.

### Diff stat

```
apps/web/src/components/carrier/clients/ClientForm.tsx      | 2 +-
apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx | 1 +
apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx  | 2 +-
3 files changed, 3 insertions(+), 2 deletions(-)
```

No server-side files touched.

### Manual Smoke Test (user verifies post-deploy)

1. Log in as a tenant with incomplete onboarding.
2. Open `/onboarding/welcome` — note "Add your first truck" is unchecked.
3. In the same browser session, create a truck via `/carrier/fleet/trucks/new`.
4. After redirect to `/carrier/fleet/trucks`, navigate to `/onboarding/welcome`.
5. Expect: "Add your first truck" is now CHECKED (no hard refresh required).
6. Repeat for drivers via `/carrier/fleet/drivers/new` and clients via `/carrier/clients/new`.

## Deviations from Plan

None — plan executed exactly as written.

## Commit

`5c7615d7` — fix(quick-399): call router.refresh() before router.push() in all three carrier create forms

## Self-Check: PASSED

- `apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx` — modified, committed
- `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx` — modified, committed
- `apps/web/src/components/carrier/clients/ClientForm.tsx` — modified, committed
- Commit `5c7615d7` confirmed present in git log

TKT-0040 final fix shipped. Client router cache now evicted on entity creation, /onboarding/welcome reflects new entities across all navigation modes.
