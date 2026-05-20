---
phase: quick-398
plan: "01"
subsystem: onboarding/activation-tracker
tags: [tkt-0040, onboarding, race-condition, after, activation-tracker]
dependency_graph:
  requires: [quick-397]
  provides: [synchronous-activation-progress-writes]
  affects: [/onboarding/welcome, activation_progress table]
tech_stack:
  added: []
  patterns: [synchronous-await-before-response]
key_files:
  modified:
    - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    - apps/web/src/app/api/v1/carrier/clients/route.ts
decisions:
  - "Move recordActivationEvent out of after() and into synchronous handler body so DB write completes before 201 ships"
  - "Remove after import from clients/route.ts (now unused — no fireEvent in that file)"
  - "Upgrade silent catch {} in drivers route to logger.error for visibility"
metrics:
  duration: ~10 minutes
  completed: 2026-05-20
  tasks: 3
  files_changed: 3
---

# Quick Task 398: TKT-0040 Re-Fix — Move recordActivationEvent Out of after()

## Approach

QT 397 added `revalidatePath('/onboarding/welcome')` and `force-dynamic` to the welcome page, but the activation race persisted because `recordActivationEvent` was still inside Next.js `after()` blocks — which defer execution until after the HTTP response ships. The client navigates to `/onboarding/welcome` immediately on 201, so even with `force-dynamic` re-rendering the page, the activation row was still NULL. This fix moves `recordActivationEvent` into the synchronous handler body (before `return NextResponse.json`) in all three carrier create routes, guaranteeing the DB write is complete before the 201 is returned. The `fireEvent` calls that also live in `after()` are deliberately left deferred — they're heavier background work with no race-critical UI dependency.

## Files Changed

### 1. `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts`

**Before:** Two `after()` blocks — one for `fireEvent(ON_VEHICLE_CREATE)`, one for `recordActivationEvent`.

**After:** One `after()` block (fireEvent only). `recordActivationEvent` moved to synchronous inline block after `createCarrierTruck` + `revalidatePath`, before `return NextResponse.json`:

```ts
// Activation tracker: must run BEFORE response so /onboarding/welcome
// re-renders with fresh data on the next navigation (TKT-0040).
// Wrapped in try/catch — tracker errors must NEVER fail the create.
if (!carrierTruck.isSample) {
  try {
    await recordActivationEvent(orgId, 'first_real_truck');
  } catch (err) {
    logger.error('[carrier/fleet/trucks] activation tracker failed', { truckId: carrierTruck.id, err });
  }
}
```

Order: `createCarrierTruck` → `revalidatePath` → `recordActivationEvent (sync)` → `after(fireEvent)` → `return 201`

### 2. `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`

**Before:** Two `after()` blocks — one for `fireEvent(ON_DRIVER_CREATE)`, one for `recordActivationEvent` with a silent `catch {}`.

**After:** One `after()` block (fireEvent only). `recordActivationEvent` moved to synchronous inline block after `createCarrierDriver` + `revalidatePath`, before `return NextResponse.json`. Additionally upgraded the silent `catch {}` to `logger.error` for visibility:

```ts
// Activation tracker: must run BEFORE response so /onboarding/welcome
// re-renders with fresh data on the next navigation (TKT-0040).
// Wrapped in try/catch — tracker errors must NEVER fail the create.
try {
  await recordActivationEvent(orgId, 'first_real_driver');
} catch (err) {
  logger.error('[carrier/fleet/drivers] activation tracker failed', { driverId: carrierDriver.id, err });
}
```

Order: `createCarrierDriver` → `revalidatePath` → `recordActivationEvent (sync)` → `after(fireEvent)` → `return 201`

### 3. `apps/web/src/app/api/v1/carrier/clients/route.ts`

**Before:** One `after()` block wrapping `recordActivationEvent`. `after` imported from `'next/server'`.

**After:** Zero `after()` calls. `after` removed from import (unused). `recordActivationEvent` moved to synchronous inline block after `createClient` + `revalidatePath`, before `return NextResponse.json`:

```ts
// Activation tracker: must run BEFORE response so /onboarding/welcome
// re-renders with fresh data on the next navigation (TKT-0040).
// Wrapped in try/catch — tracker errors must NEVER fail the create.
if (!client.isSample) {
  try {
    await recordActivationEvent(orgId, 'first_real_client');
  } catch (err) {
    logger.error('[carrier/clients] activation tracker failed', { clientId: client.id, err });
  }
}
```

Order: `createClient` → `revalidatePath` → `recordActivationEvent (sync)` → `return 201`

## Owner-Actions Audit Table

All `recordActivationEvent` call sites across `apps/web/src`:

| File | Call Site Line | Sync or Deferred | Action Taken |
|------|---------------|-----------------|--------------|
| `apps/web/src/app/(owner)/actions/trucks.ts` | 130 | Sync (`await` in server action) | No change — already correct |
| `apps/web/src/app/(owner)/actions/drivers.ts` | 205 | Sync (`await` in server action) | No change — already correct |
| `apps/web/src/app/(owner)/actions/customers.ts` | 75 | Sync (`await` in server action) | No change — already correct |
| `apps/web/src/app/(owner)/actions/loads.ts` | 608 | Sync (`await` in server action) | No change — already correct |
| `apps/web/src/app/api/auth/accept-invitation/route.ts` | 255 | Sync (`await` in handler body) | No change — already correct |
| `apps/web/src/lib/carrier/dispatches.ts` | 619 | Sync (`await` in function body) | No change — already correct |
| `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` | 119 | **Was: deferred (after())** → Now: sync | FIXED — moved out of after() |
| `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` | 93 | **Was: deferred (after())** → Now: sync | FIXED — moved out of after() + upgraded silent catch to logger.error |
| `apps/web/src/app/api/v1/carrier/clients/route.ts` | 104 | **Was: deferred (after())** → Now: sync | FIXED — moved out of after(), removed after import |

**Result: Zero deferred recordActivationEvent calls remain anywhere in apps/web/src.**

## Defense-in-Depth Stack (All Layers Active)

This fix layers on top of QT 397 — both remain in place:

1. **QT 397:** `revalidatePath('/onboarding/welcome')` — ensures Next.js ISR cache is busted after each create
2. **QT 397:** `export const dynamic = 'force-dynamic'` on welcome page — forces SSR re-render on every visit, no stale cached page
3. **QT 398 (this fix):** `recordActivationEvent` awaited synchronously — guarantees activation row is non-NULL before 201 ships

## TypeScript Check Result

`npx tsc --noEmit` from `apps/web/` exits with 36 lines of pre-existing errors (all from missing module declarations: `zustand`, `nuqs`, `papaparse`, `@tanstack/react-virtual`, `framer-motion` — unrelated to this change). Zero errors in any of the three modified carrier route files. No new errors introduced.

## Manual Test Checklist

Manual testing cannot be automated. User must verify:

- [ ] `cd apps/web && pnpm dev` — development server starts cleanly
- [ ] Sign in as a freshly seeded carrier user (activationProgress all NULL — or reset the row)
- [ ] **Truck test:** Create the first non-sample truck via the owner UI. After 201, before any client-side refetch, query DB: `SELECT first_real_truck_at FROM activation_progress WHERE tenant_id = '<orgId>'` — value must be non-NULL immediately. Navigate to `/onboarding/welcome` — "Add your first truck" checkbox must render checked on first paint (no flicker, no second navigation needed).
- [ ] **Driver test:** Same flow — create first non-sample driver, verify `first_real_driver_at` non-NULL, verify welcome page reflects it immediately.
- [ ] **Client test:** Same flow — create first non-sample client, verify `first_real_client_at` non-NULL, verify welcome page reflects it immediately.
- [ ] **Sample guard test (trucks):** Create a truck with `isSample: true` — verify `first_real_truck_at` remains NULL (sample creates must NOT record activation).
- [ ] **Sample guard test (clients):** Create a client with `isSample: true` — verify `first_real_client_at` remains NULL.
- [ ] **Error resilience (optional):** Temporarily break DB connection for recordActivationEvent, verify 201 still ships and `logger.error` output appears.

## Commit

SHA: `8a3bd38f`

Message: `fix(onboarding): await recordActivationEvent synchronously so activationProgress is updated before response ships, fixes race exposed by QT 397 [TKT-0040 race fix]`

## Self-Check: PASSED

- [x] `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` — modified, exists
- [x] `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` — modified, exists
- [x] `apps/web/src/app/api/v1/carrier/clients/route.ts` — modified, exists
- [x] Commit `8a3bd38f` exists in git log
- [x] Zero `after(` wrapping `recordActivationEvent` anywhere in codebase
- [x] Exactly one `after(` in trucks route (fireEvent), one in drivers route (fireEvent), zero in clients route
- [x] `revalidatePath('/onboarding/welcome')` present in all three files
- [x] `isSample` guards on trucks and clients preserved; drivers route has no guard (preserved)

---

TKT-0040 race fix shipped. recordActivationEvent now awaits synchronously across all paths.
