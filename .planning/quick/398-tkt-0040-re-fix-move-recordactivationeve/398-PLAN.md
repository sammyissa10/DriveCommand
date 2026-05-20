---
phase: 398-tkt-0040-re-fix-move-recordactivationeve
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
  - apps/web/src/app/api/v1/carrier/clients/route.ts
autonomous: true

must_haves:
  truths:
    - "When POST /api/v1/carrier/fleet/trucks returns 201, the corresponding activationProgress row already reflects first_real_truck=true (DB write completed before response shipped)."
    - "When POST /api/v1/carrier/fleet/drivers returns 201, the corresponding activationProgress row already reflects first_real_driver=true."
    - "When POST /api/v1/carrier/clients returns 201, the corresponding activationProgress row already reflects first_real_client=true."
    - "If recordActivationEvent throws, the create request STILL returns 201 (the error is caught, logged, and swallowed — never rethrown)."
    - "Sample (isSample=true) creates still skip recordActivationEvent for trucks and clients (preserves existing behavior)."
    - "fireEvent for ON_VEHICLE_CREATE and ON_DRIVER_CREATE still runs inside after() (only recordActivationEvent moves)."
    - "revalidatePath('/onboarding/welcome') still fires on every non-sample create (QT 397 fix preserved)."
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts"
      provides: "POST handler awaits recordActivationEvent synchronously inside try/catch BEFORE returning NextResponse"
      contains: "await recordActivationEvent"
    - path: "apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts"
      provides: "POST handler awaits recordActivationEvent synchronously inside try/catch BEFORE returning NextResponse"
      contains: "await recordActivationEvent"
    - path: "apps/web/src/app/api/v1/carrier/clients/route.ts"
      provides: "POST handler awaits recordActivationEvent synchronously inside try/catch BEFORE returning NextResponse"
      contains: "await recordActivationEvent"
  key_links:
    - from: "POST /api/v1/carrier/fleet/trucks (line ~93 createCarrierTruck)"
      to: "recordActivationEvent (synchronous await)"
      via: "inline try/catch BEFORE NextResponse.json return"
      pattern: "await recordActivationEvent\\(orgId, 'first_real_truck'\\)"
    - from: "POST /api/v1/carrier/fleet/drivers (line ~65 createCarrierDriver)"
      to: "recordActivationEvent (synchronous await)"
      via: "inline try/catch BEFORE NextResponse.json return"
      pattern: "await recordActivationEvent\\(orgId, 'first_real_driver'\\)"
    - from: "POST /api/v1/carrier/clients (line ~91 createClient)"
      to: "recordActivationEvent (synchronous await)"
      via: "inline try/catch BEFORE NextResponse.json return"
      pattern: "await recordActivationEvent\\(orgId, 'first_real_client'\\)"
---

<objective>
TKT-0040 re-fix: Eliminate the onboarding-welcome activation race by moving `recordActivationEvent` OUT of Next.js `after()` and into the synchronous request body of all three carrier create routes (trucks, drivers, clients).

Purpose: QT 397's `revalidatePath` + `force-dynamic` was correct but insufficient. `after()` defers execution until AFTER the HTTP response ships. The client navigates to `/onboarding/welcome` immediately after the 201, and even with `force-dynamic` re-querying, the activation row is still NULL because `recordActivationEvent` hasn't run yet. By awaiting it synchronously inside the handler, the DB write is guaranteed to complete BEFORE the 201 is returned — so the very next render (whether SSR or revalidation) sees fresh data.

Output: Three carrier route files updated. `fireEvent` calls stay in `after()` (heavier work, no race-critical UI dependency). `recordActivationEvent` becomes synchronous. `revalidatePath` calls stay. Error handling: try/catch + log + swallow (never rethrow, never fail the 201).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/tkt-0040-onboarding-welcome-stale-data.md
@.planning/debug/tkt-0040-post-fix-verification.md
@apps/web/src/lib/onboarding/activation-tracker.ts
@apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
@apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
@apps/web/src/app/api/v1/carrier/clients/route.ts

# Audit-only references (confirmed clean during planning — DO NOT modify)
# - apps/web/src/app/(owner)/actions/trucks.ts — already calls recordActivationEvent synchronously (line 130)
# - apps/web/src/app/(owner)/actions/drivers.ts — already calls recordActivationEvent synchronously (line 205)
# - apps/web/src/app/(owner)/actions/customers.ts — already calls recordActivationEvent synchronously (line 75)
# - apps/web/src/app/(owner)/actions/loads.ts — synchronous (line 608)
# - apps/web/src/app/api/auth/accept-invitation/route.ts — synchronous (line 255)
# - apps/web/src/lib/carrier/dispatches.ts — synchronous (line 619)
# Only the 3 carrier API create routes have the after() race bug.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move recordActivationEvent out of after() in carrier truck create route</name>
  <files>apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts</files>
  <action>
In `POST` handler, locate the second `after(async () => { ... })` block (lines ~115-123) that wraps `recordActivationEvent(orgId, 'first_real_truck')`.

Remove that `after()` wrapper entirely. Replace it with an inline synchronous block placed AFTER `const carrierTruck = await createCarrierTruck(...)` (line ~93) and AFTER the existing `revalidatePath` block (lines ~97-99), but BEFORE the remaining `after(...)` block that handles `fireEvent` (lines ~102-112) and BEFORE the `return NextResponse.json(...)` (line ~125).

The replacement block:

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

Constraints:
- DO NOT touch the `after()` block that calls `fireEvent({ event: 'ON_VEHICLE_CREATE', ... })` — that stays in `after()`.
- DO NOT touch the `revalidatePath('/onboarding/welcome')` block.
- DO NOT remove the `after` import or the `recordActivationEvent` import — both are still used.
- Preserve the `if (!carrierTruck.isSample)` guard (sample trucks must NOT record activation).
- Use `logger.error` (not `console.error`) — matches the file's existing pattern.
- Place the new block ABOVE the `after()` fireEvent block. Order: createCarrierTruck → revalidatePath → recordActivationEvent (sync) → after(fireEvent) → return 201.
  </action>
  <verify>
1. `grep -n "after(async" apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` should return EXACTLY ONE match (the fireEvent block).
2. `grep -n "recordActivationEvent" apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` should show the call is at module scope inside POST (not nested inside an `after(` block — visually inspect indentation).
3. Run `npx tsc --noEmit` from `apps/web/` — must pass with zero new errors.
4. Trace control flow by reading the POST handler: line containing `await recordActivationEvent` MUST appear BEFORE the line containing `return NextResponse.json({ data: carrierTruck }, { status: 201 })`.
  </verify>
  <done>
- File still compiles (tsc clean).
- Exactly one `after(` call remains in the POST handler (fireEvent only).
- `recordActivationEvent` is awaited synchronously before the 201 return.
- `isSample` guard preserved.
- `revalidatePath` and `fireEvent` behavior unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Move recordActivationEvent out of after() in carrier driver create route</name>
  <files>apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts</files>
  <action>
In `POST` handler, locate the second `after(async () => { ... })` block (lines ~90-96) that wraps `recordActivationEvent(orgId, 'first_real_driver')`.

Remove that `after()` wrapper entirely. Replace it with an inline synchronous block placed AFTER `const result = await createCarrierDriver(...)` / `const carrierDriver = result.driver;` (lines ~65-66) and AFTER the existing `revalidatePath` (line ~70), but BEFORE the remaining `after(...)` block that handles `fireEvent` (lines ~74-87) and BEFORE the `return NextResponse.json(...)` (line ~98).

The replacement block:

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

Constraints:
- DO NOT touch the `after()` block that calls `fireEvent({ event: 'ON_DRIVER_CREATE', ... })` — that stays in `after()`.
- DO NOT touch the `revalidatePath('/onboarding/welcome')` block.
- DO NOT remove the `after` or `recordActivationEvent` imports.
- This route has NO `isSample` guard for drivers (existing behavior — preserve it).
- Use `logger.error` with the structured `{ driverId, err }` payload (upgrades the previous silent `catch {}` — adds visibility without breaking flow).
- Order: createCarrierDriver → revalidatePath → recordActivationEvent (sync) → after(fireEvent) → return 201.
  </action>
  <verify>
1. `grep -n "after(async" apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` should return EXACTLY ONE match (the fireEvent block).
2. `grep -n "recordActivationEvent" apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` should show the call is at POST handler scope, not nested in `after(`.
3. Run `npx tsc --noEmit` from `apps/web/` — must pass.
4. The line `await recordActivationEvent(orgId, 'first_real_driver')` MUST appear BEFORE `return NextResponse.json(...)`.
  </verify>
  <done>
- File still compiles.
- Exactly one `after(` call remains in POST (fireEvent only).
- `recordActivationEvent` awaited synchronously before 201 return.
- `revalidatePath` and `fireEvent` behavior unchanged.
- Tracker errors now logged via `logger.error` (previous behavior was silent — improvement).
  </done>
</task>

<task type="auto">
  <name>Task 3: Move recordActivationEvent out of after() in carrier client create route</name>
  <files>apps/web/src/app/api/v1/carrier/clients/route.ts</files>
  <action>
In `POST` handler, locate the `after(async () => { ... })` block (lines ~99-107) that wraps `recordActivationEvent(orgId, 'first_real_client')`. NOTE: This file currently has ONLY ONE `after()` block (no separate fireEvent block here).

Remove that `after()` wrapper entirely. Replace it with an inline synchronous block placed AFTER `const client = await createClient(...)` (line ~91) and AFTER the existing `revalidatePath` block (lines ~93-97), but BEFORE the `return NextResponse.json(...)` (line ~109).

The replacement block:

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

Constraints:
- This file has NO fireEvent call — after removing the activation `after()`, there should be ZERO `after(` calls remaining in this POST handler.
- Remove the `after` import from the `'next/server'` import (line 1) since it is no longer used. The import currently reads `import { after, NextRequest, NextResponse } from 'next/server';` — change to `import { NextRequest, NextResponse } from 'next/server';`.
- DO NOT remove the `revalidatePath` block (QT 397 stays).
- DO NOT remove the `recordActivationEvent` import.
- Preserve the `if (!client.isSample)` guard.
- Use `logger.error` (matches existing file pattern).
- Order: createClient → revalidatePath → recordActivationEvent (sync) → return 201.
  </action>
  <verify>
1. `grep -n "after(" apps/web/src/app/api/v1/carrier/clients/route.ts` should return ZERO matches inside the POST handler body. (The string "after" may still appear in comments — but no `after(...)` function call.)
2. `grep -n "from 'next/server'" apps/web/src/app/api/v1/carrier/clients/route.ts` — the import line MUST NOT contain `after` (only `NextRequest, NextResponse`).
3. `grep -n "recordActivationEvent" apps/web/src/app/api/v1/carrier/clients/route.ts` should show the call at POST handler scope, not nested in `after(`.
4. Run `npx tsc --noEmit` from `apps/web/` — must pass with zero new errors (unused-import warning for `after` must NOT appear).
5. `await recordActivationEvent(orgId, 'first_real_client')` MUST appear BEFORE `return NextResponse.json(...)`.
  </verify>
  <done>
- File compiles, no unused imports.
- Zero `after(` calls in POST handler.
- `recordActivationEvent` awaited synchronously inside `if (!client.isSample)` guard.
- `revalidatePath` preserved.
- Tracker errors logged but swallowed.
  </done>
</task>

</tasks>

<verification>
Full-phase manual + automated verification:

1. **TypeScript clean:** From repo root, run `cd apps/web && npx tsc --noEmit` — zero errors.

2. **Static pattern scan:**
   - `grep -rn "after(.*recordActivationEvent" apps/web/src/app/api/v1/carrier/` — must return ZERO matches.
   - `grep -rn "after(.*recordActivationEvent" apps/web/src/` — must return ZERO matches anywhere in the codebase.

3. **fireEvent still deferred:**
   - `grep -n "after(" apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` — should match exactly ONE line (the fireEvent block).
   - `grep -n "after(" apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` — should match exactly ONE line (the fireEvent block).
   - `grep -n "after(" apps/web/src/app/api/v1/carrier/clients/route.ts` — should match ZERO lines.

4. **revalidatePath preserved:** All three files still contain `revalidatePath('/onboarding/welcome')`.

5. **Local smoke test (manual):**
   - `cd apps/web && pnpm dev`
   - Sign in as a freshly seeded carrier user (activationProgress all NULL).
   - Create the first non-sample truck via the owner UI.
   - On 201 response, before any client-side refetch, query the DB: `SELECT first_real_truck_at FROM activation_progress WHERE tenant_id = '<orgId>'` — should be non-NULL.
   - Navigate to `/onboarding/welcome` — checkbox for "Add your first truck" should render checked on first paint (no flicker, no second navigation needed).
   - Repeat for driver create and client create.

6. **Error-path smoke test:** Temporarily mock `recordActivationEvent` to throw (e.g., set a bad DB URL for one test) — verify the POST still returns 201 and the error is in `logger.error` output. (Optional — only if user wants extra confidence.)
</verification>

<success_criteria>
- All 3 carrier POST handlers run `recordActivationEvent` synchronously before returning 201.
- Zero `after(` wrappers around `recordActivationEvent` anywhere in `apps/web/src/`.
- `fireEvent` calls remain inside `after()` (unchanged behavior).
- `revalidatePath('/onboarding/welcome')` calls remain (QT 397 fix preserved).
- `isSample` guards preserved on trucks + clients (drivers route has no guard — preserved).
- TypeScript compiles clean (`tsc --noEmit` passes).
- Tracker errors are caught + logged, never rethrown — the 201 ships regardless.
- Manual smoke test: creating a first real truck/driver/client makes the corresponding `/onboarding/welcome` checklist item appear checked on the very next navigation, with no refresh needed.
</success_criteria>

<output>
After completion, create `.planning/quick/398-tkt-0040-re-fix-move-recordactivationeve/398-SUMMARY.md` documenting:
- Files changed (3) with before/after structure snippet for each.
- Confirmation that `after()` still wraps `fireEvent` in trucks + drivers routes.
- Confirmation that `revalidatePath` calls from QT 397 are intact.
- Manual smoke-test result for at least one of the three entity types (truck recommended — has both isSample guard AND fireEvent neighbor).
- Note that this layers ON TOP of QT 397 (revalidatePath) and the dynamic = 'force-dynamic' on the welcome page — both stay in place as defense-in-depth.
- Reminder: do NOT push (user pushes manually).
</output>
