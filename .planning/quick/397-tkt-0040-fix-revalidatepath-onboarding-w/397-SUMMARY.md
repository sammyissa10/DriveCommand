---
phase: quick-397
plan: 397
subsystem: onboarding
tags: [cache-invalidation, revalidatePath, server-actions, carrier-api, activation-tracker]
key-files:
  modified:
    - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    - apps/web/src/app/api/v1/carrier/clients/route.ts
    - apps/web/src/app/onboarding/welcome/page.tsx
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/(owner)/actions/trucks.ts
    - apps/web/src/app/(owner)/actions/customers.ts
decisions:
  - "revalidatePath must be called synchronously OUTSIDE after() blocks in API route handlers — Next.js does not guarantee cache invalidation from within after()"
  - "inviteDriver owner action was missing recordActivationEvent entirely; added with same try/catch guard pattern used by createTruck/createCustomer"
  - "force-dynamic added to welcome page as defensive layer — activation progress is per-tenant and must never be statically cached by the framework"
---

# Quick-397: TKT-0040 — Onboarding Welcome Stale Cache Fix Summary

## Approach

The `/onboarding/welcome` page was serving stale HTML from Next.js App Router's router cache after entity creation because none of the creation paths called `revalidatePath('/onboarding/welcome')`. The fix has three coordinated parts: (1) add `revalidatePath('/onboarding/welcome')` synchronously OUTSIDE `after()` blocks in all three carrier API POST handlers — `after()` runs post-response and Next.js does not guarantee cache invalidation from within it; (2) add `export const dynamic = 'force-dynamic'` to `page.tsx` as a defensive safety net so the page is never statically cached regardless of revalidation state; (3) close the gap in owner server actions by adding `revalidatePath('/onboarding/welcome')` to `createTruck` and `createCustomer`, and adding both `recordActivationEvent('first_real_driver')` and `revalidatePath('/onboarding/welcome')` to `inviteDriver` which was missing the activation tracker call entirely.

## Files Changed

### apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts

- Added `import { revalidatePath } from 'next/cache';` at top (line 4)
- Added after `createCarrierTruck` succeeds, BEFORE the first `after()` block:
  ```ts
  if (!carrierTruck.isSample) {
    revalidatePath('/onboarding/welcome');
  }
  ```
- Existing `after()` blocks and `recordActivationEvent` call untouched

### apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts

- Added `import { revalidatePath } from 'next/cache';` at top (line 4)
- Added after `createCarrierDriver` / `result.driver` assignment, BEFORE the first `after()` block:
  ```ts
  revalidatePath('/onboarding/welcome');
  ```
  (No isSample gate — matches existing unconditional `recordActivationEvent` behavior in this file)
- Existing `after()` blocks untouched

### apps/web/src/app/api/v1/carrier/clients/route.ts

- Added `import { revalidatePath } from 'next/cache';` at top (line 3)
- Added after `createClient` succeeds, BEFORE the `after()` block:
  ```ts
  if (!client.isSample) {
    revalidatePath('/onboarding/welcome');
  }
  ```
- Existing `after()` block and `recordActivationEvent` call untouched

### apps/web/src/app/onboarding/welcome/page.tsx

- Added between the `ActivationChecklist` import and the `metadata` export:
  ```ts
  // Force dynamic rendering — activation progress is per-tenant and must never be statically cached.
  export const dynamic = 'force-dynamic';
  ```
- No other code modified

### apps/web/src/app/(owner)/actions/trucks.ts

- Inserted `revalidatePath('/onboarding/welcome');` between existing `revalidatePath('/trucks');` and `revalidateTag('dashboard-metrics', 'max');` in `createTruck`
- Existing calls preserved; `recordActivationEvent` call at line 130 untouched

### apps/web/src/app/(owner)/actions/customers.ts

- Inserted `revalidatePath('/onboarding/welcome');` between existing `revalidatePath('/crm');` and `redirect(...)` in `createCustomer`
- Existing calls preserved; `recordActivationEvent` call at line 75 untouched

### apps/web/src/app/(owner)/actions/drivers.ts

- Added `import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';` alongside existing imports
- Added in `inviteDriver` after the `revalidateTag('dashboard-metrics', 'max')` call:
  ```ts
  try {
    await recordActivationEvent(tenantId, 'first_real_driver');
  } catch (err) {
    logger.error('[inviteDriver] activation tracker failed', { invitationId: invitation.id, err });
  }
  revalidatePath('/onboarding/welcome');
  ```
- Existing `revalidatePath('/drivers')` and `revalidateTag` calls preserved
- No other functions in this file modified

## Owner-Actions Audit Table

| File | recordActivationEvent gap? | Added? | revalidatePath('/onboarding/welcome') added? |
|------|---------------------------|--------|----------------------------------------------|
| actions/trucks.ts | No — already present at line 130 | N/A | Yes |
| actions/drivers.ts | YES — missing entirely | Yes, added with try/catch | Yes |
| actions/customers.ts | No — already present at line 75 | N/A | Yes |

## revalidatePath Placement Confirmation

All three carrier API `revalidatePath('/onboarding/welcome')` calls are placed OUTSIDE any `after(async () => { ... })` block — they fire synchronously before the JSON response is returned. Confirmed by inspection of surrounding context in each file.

## TypeScript Result

`npx tsc --noEmit` run from `apps/web/` — zero new errors introduced. All errors shown are pre-existing noise (framer-motion, zustand, nuqs, d3-geo, topojson-client, papaparse, @tanstack/react-virtual — known missing type stubs unrelated to this change).

## Commit

SHA: `f640ba41`
Message: `fix(onboarding): revalidate onboarding welcome on entity creation, force-dynamic safety net, close recordActivationEvent gap in owner-actions [TKT-0040]`

Push confirmation:
```
To https://github.com/sammyissa10/DriveCommand.git
   e5deeb8b..f640ba41  master -> master
```

TKT-0040 fix shipped. Onboarding welcome now reflects new entities without manual reload.
