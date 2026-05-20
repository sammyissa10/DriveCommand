---
phase: quick-397
plan: 397
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
  - apps/web/src/app/api/v1/carrier/clients/route.ts
  - apps/web/src/app/onboarding/welcome/page.tsx
  - apps/web/src/app/(owner)/actions/drivers.ts
  - apps/web/src/app/(owner)/actions/trucks.ts
  - apps/web/src/app/(owner)/actions/customers.ts
autonomous: true

must_haves:
  truths:
    - "After creating the first real truck (carrier API or owner action), navigating back to /onboarding/welcome shows the truck step checked"
    - "After creating the first real driver (carrier API), navigating back to /onboarding/welcome shows the driver step checked"
    - "After inviting the first driver (owner action), the welcome checklist updates on next visit"
    - "After creating the first real client/customer (carrier API or owner action), navigating back to /onboarding/welcome shows the client step checked"
    - "/onboarding/welcome page is dynamically rendered per request (no static cache)"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts"
      provides: "POST handler with revalidatePath('/onboarding/welcome') after createCarrierTruck"
      contains: "revalidatePath('/onboarding/welcome')"
    - path: "apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts"
      provides: "POST handler with revalidatePath('/onboarding/welcome') after createCarrierDriver"
      contains: "revalidatePath('/onboarding/welcome')"
    - path: "apps/web/src/app/api/v1/carrier/clients/route.ts"
      provides: "POST handler with revalidatePath('/onboarding/welcome') after createClient"
      contains: "revalidatePath('/onboarding/welcome')"
    - path: "apps/web/src/app/onboarding/welcome/page.tsx"
      provides: "Force-dynamic rendering"
      contains: "export const dynamic = 'force-dynamic'"
    - path: "apps/web/src/app/(owner)/actions/drivers.ts"
      provides: "inviteDriver with recordActivationEvent + revalidatePath('/onboarding/welcome')"
      contains: "recordActivationEvent"
    - path: "apps/web/src/app/(owner)/actions/trucks.ts"
      provides: "createTruck with revalidatePath('/onboarding/welcome')"
      contains: "revalidatePath('/onboarding/welcome')"
    - path: "apps/web/src/app/(owner)/actions/customers.ts"
      provides: "createCustomer with revalidatePath('/onboarding/welcome')"
      contains: "revalidatePath('/onboarding/welcome')"
  key_links:
    - from: "carrier API POST handlers"
      to: "/onboarding/welcome route cache"
      via: "revalidatePath called OUTSIDE after() blocks"
      pattern: "revalidatePath\\('/onboarding/welcome'\\)"
    - from: "owner server actions (createTruck/inviteDriver/createCustomer)"
      to: "/onboarding/welcome route cache"
      via: "revalidatePath called after recordActivationEvent"
      pattern: "revalidatePath\\('/onboarding/welcome'\\)"
---

<objective>
TKT-0040 fix: The activation checklist on /onboarding/welcome shows stale data after creating the first real truck/driver/client because no creation path calls revalidatePath('/onboarding/welcome'). Next.js App Router serves the stale pre-creation HTML from its router cache on back-navigation.

Three coordinated fixes:
1. PRIMARY — Add revalidatePath('/onboarding/welcome') to all 3 carrier API create routes (trucks, drivers, clients), OUTSIDE the after() blocks
2. DEFENSIVE — Add export const dynamic = 'force-dynamic' to /onboarding/welcome/page.tsx so the page is never statically cached
3. SECONDARY — Audit the three owner server actions:
   - createTruck (apps/web/src/app/(owner)/actions/trucks.ts): HAS recordActivationEvent — only needs revalidatePath('/onboarding/welcome') added
   - createCustomer (apps/web/src/app/(owner)/actions/customers.ts): HAS recordActivationEvent — only needs revalidatePath('/onboarding/welcome') added
   - inviteDriver (apps/web/src/app/(owner)/actions/drivers.ts): MISSING recordActivationEvent — add both recordActivationEvent('first_real_driver') AND revalidatePath('/onboarding/welcome')

Purpose: Activation checklist updates immediately when the user navigates back to /onboarding/welcome.
Output: One commit covering all 7 file changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
@apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
@apps/web/src/app/api/v1/carrier/clients/route.ts
@apps/web/src/app/onboarding/welcome/page.tsx
@apps/web/src/app/(owner)/actions/drivers.ts
@apps/web/src/app/(owner)/actions/trucks.ts
@apps/web/src/app/(owner)/actions/customers.ts
@.planning/debug/tkt-0040-onboarding-welcome-stale-data.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add revalidatePath('/onboarding/welcome') to all 3 carrier API create routes + force-dynamic on welcome page</name>
  <files>
    apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    apps/web/src/app/api/v1/carrier/clients/route.ts
    apps/web/src/app/onboarding/welcome/page.tsx
  </files>
  <action>
PRIMARY FIX — Add `revalidatePath('/onboarding/welcome')` to each carrier API POST handler. The call MUST be placed OUTSIDE the `after(async () => { ... })` blocks because Next.js does NOT guarantee cache invalidation from within after() (per the debug ticket). It should fire synchronously after the create succeeds and before the JSON response is returned.

1. apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts (POST handler, around line 92-118):
   - Import: add `import { revalidatePath } from 'next/cache';` at the top alongside existing imports.
   - In the POST handler, AFTER `const carrierTruck = await createCarrierTruck(orgId, parsed.data);` and BEFORE the first `after(async () => { ... })` block, add:
     ```
     // Invalidate onboarding welcome cache so activation checklist reflects new truck on back-nav.
     // Must be OUTSIDE after() — Next.js does not guarantee revalidation from inside after().
     if (!carrierTruck.isSample) {
       revalidatePath('/onboarding/welcome');
     }
     ```
   - Do NOT touch existing `after()` blocks or the `recordActivationEvent` call.

2. apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts (POST handler, around line 64-91):
   - Import: add `import { revalidatePath } from 'next/cache';` at the top alongside existing imports.
   - In the POST handler, AFTER `const carrierDriver = result.driver;` and BEFORE the first `after(async () => { ... })` block, add:
     ```
     // Invalidate onboarding welcome cache so activation checklist reflects new driver on back-nav.
     // Must be OUTSIDE after() — Next.js does not guarantee revalidation from inside after().
     revalidatePath('/onboarding/welcome');
     ```
   - Note: drivers route does not have an isSample gate today (recordActivationEvent fires unconditionally), so do not add one here — match existing behavior.
   - Do NOT touch existing `after()` blocks or the `recordActivationEvent` call.

3. apps/web/src/app/api/v1/carrier/clients/route.ts (POST handler, around line 90-101):
   - Import: add `import { revalidatePath } from 'next/cache';` at the top alongside existing imports.
   - In the POST handler, AFTER `const client = await createClient(orgId, parsed.data);` and BEFORE the `after(async () => { ... })` block, add:
     ```
     // Invalidate onboarding welcome cache so activation checklist reflects new client on back-nav.
     // Must be OUTSIDE after() — Next.js does not guarantee revalidation from inside after().
     if (!client.isSample) {
       revalidatePath('/onboarding/welcome');
     }
     ```
   - Do NOT touch existing `after()` block or the `recordActivationEvent` call.

DEFENSIVE FIX — Make the welcome page always render dynamically:

4. apps/web/src/app/onboarding/welcome/page.tsx:
   - Immediately AFTER the existing `import { ActivationChecklist } from './checklist';` line and BEFORE `export const metadata = { title: 'Welcome to DriveCommand' };`, add:
     ```
     // Force dynamic rendering — activation progress is per-tenant and must never be statically cached.
     export const dynamic = 'force-dynamic';
     ```
   - Do NOT modify any other code in this file.

Constraints (apply across all four files):
- DO NOT remove or replace ANY existing revalidatePath calls.
- DO NOT add revalidatePath inside any loop.
- DO NOT modify the activationProgress schema, the recordActivationEvent helper, or the ActivationChecklist client component.
- DO NOT change the after() blocks — leave fireEvent and recordActivationEvent calls in place exactly as they are.
- Keep all logging and error handling intact.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` from repo root — must pass with zero new errors.

    Then grep to confirm all 4 calls are present:
    - `grep -n "revalidatePath('/onboarding/welcome')" apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` → exactly 1 hit
    - `grep -n "revalidatePath('/onboarding/welcome')" apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` → exactly 1 hit
    - `grep -n "revalidatePath('/onboarding/welcome')" apps/web/src/app/api/v1/carrier/clients/route.ts` → exactly 1 hit
    - `grep -n "export const dynamic = 'force-dynamic'" apps/web/src/app/onboarding/welcome/page.tsx` → exactly 1 hit

    Confirm revalidatePath is OUTSIDE after() blocks by reading the surrounding 5 lines of context — the line `revalidatePath('/onboarding/welcome')` must NOT be inside any `after(async () => {` block.
  </verify>
  <done>
    - Three carrier API POST handlers each have `revalidatePath('/onboarding/welcome')` placed OUTSIDE after() blocks
    - trucks and clients routes gate the call with `!isSample` matching existing recordActivationEvent gating
    - drivers route fires unconditionally matching existing recordActivationEvent behavior
    - /onboarding/welcome/page.tsx exports `dynamic = 'force-dynamic'`
    - No existing revalidatePath calls were removed
    - No after() blocks or recordActivationEvent calls were modified
    - `tsc --noEmit` passes
  </done>
</task>

<task type="auto">
  <name>Task 2: Close recordActivationEvent gap in inviteDriver + add revalidatePath('/onboarding/welcome') to all 3 owner server actions</name>
  <files>
    apps/web/src/app/(owner)/actions/drivers.ts
    apps/web/src/app/(owner)/actions/trucks.ts
    apps/web/src/app/(owner)/actions/customers.ts
  </files>
  <action>
Audit summary (already verified by reading each file):
- `createTruck` (trucks.ts): ALREADY calls recordActivationEvent('first_real_truck') at line ~130. Only needs revalidatePath('/onboarding/welcome') added.
- `createCustomer` (customers.ts): ALREADY calls recordActivationEvent('first_real_client') at line ~75. Only needs revalidatePath('/onboarding/welcome') added.
- `inviteDriver` (drivers.ts): MISSING recordActivationEvent entirely. Must add BOTH recordActivationEvent('first_real_driver') AND revalidatePath('/onboarding/welcome').

1. apps/web/src/app/(owner)/actions/trucks.ts (createTruck, around line 148):
   - The existing block at line 148-150 already has:
     ```
     revalidatePath('/trucks');
     revalidateTag('dashboard-metrics', 'max');
     redirect(`/trucks/${truckId}`);
     ```
   - Insert `revalidatePath('/onboarding/welcome');` between `revalidatePath('/trucks');` and `revalidateTag(...)`. Final order:
     ```
     revalidatePath('/trucks');
     revalidatePath('/onboarding/welcome');
     revalidateTag('dashboard-metrics', 'max');
     redirect(`/trucks/${truckId}`);
     ```
   - DO NOT touch the `recordActivationEvent` call inside the try block (lines 129-133). It already fires.
   - DO NOT remove existing revalidatePath/revalidateTag calls.

2. apps/web/src/app/(owner)/actions/customers.ts (createCustomer, around line 93-95):
   - The existing block at lines 93-95 has:
     ```
     revalidatePath('/crm');
     redirect(`/crm/${createdId}`);
     ```
   - Insert `revalidatePath('/onboarding/welcome');` between `revalidatePath('/crm');` and `redirect(...)`. Final order:
     ```
     revalidatePath('/crm');
     revalidatePath('/onboarding/welcome');
     redirect(`/crm/${createdId}`);
     ```
   - DO NOT touch the `recordActivationEvent` call inside the try block (lines 74-78). It already fires.
   - DO NOT remove the existing revalidatePath('/crm') call.

3. apps/web/src/app/(owner)/actions/drivers.ts (inviteDriver, around lines 196-211):
   - Add `recordActivationEvent` import: at the top of the file, add:
     ```
     import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';
     ```
     alongside the existing imports (after the fireEvent import is a good neighbor).
   - In the inviteDriver function, AFTER the `// Revalidate` comment (around line 197) and BEFORE the existing `revalidatePath('/drivers');` call, OR AFTER the `revalidateTag('dashboard-metrics', 'max');` call — place these two new operations between the existing revalidate block and the email-warning return:
     ```
     // Record activation event for the first real driver invitation.
     // Wrapped in try/catch — activation tracker must never break the invite flow.
     try {
       await recordActivationEvent(tenantId, 'first_real_driver');
     } catch (err) {
       logger.error('[inviteDriver] activation tracker failed', { invitationId: invitation.id, err });
     }

     // Invalidate onboarding welcome cache so activation checklist reflects new driver on back-nav.
     revalidatePath('/onboarding/welcome');
     ```
   - Final order in inviteDriver (around lines 197-211):
     ```
     // Revalidate
     revalidatePath('/drivers');
     revalidateTag('dashboard-metrics', 'max');

     try {
       await recordActivationEvent(tenantId, 'first_real_driver');
     } catch (err) {
       logger.error('[inviteDriver] activation tracker failed', { invitationId: invitation.id, err });
     }

     revalidatePath('/onboarding/welcome');

     if (!emailSent) { ... }
     return { success: true, message: ... };
     ```
   - DO NOT remove the existing `revalidatePath('/drivers');` or `revalidateTag('dashboard-metrics', 'max');` calls.
   - DO NOT add recordActivationEvent to any other function in this file (only inviteDriver — updateDriver/deactivateDriver/reactivateDriver are out of scope).
   - DO NOT wrap recordActivationEvent in `after()` — the existing carrier routes use after() because they have specific reasons; the owner server actions use direct calls (matching createTruck/createCustomer patterns in this codebase).
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` from repo root — must pass with zero new errors.

    Confirm all changes:
    - `grep -n "revalidatePath('/onboarding/welcome')" apps/web/src/app/\(owner\)/actions/trucks.ts` → exactly 1 hit
    - `grep -n "revalidatePath('/onboarding/welcome')" apps/web/src/app/\(owner\)/actions/customers.ts` → exactly 1 hit
    - `grep -n "revalidatePath('/onboarding/welcome')" apps/web/src/app/\(owner\)/actions/drivers.ts` → exactly 1 hit
    - `grep -n "recordActivationEvent" apps/web/src/app/\(owner\)/actions/drivers.ts` → exactly 2 hits (import + call)
    - `grep -n "revalidatePath('/drivers')" apps/web/src/app/\(owner\)/actions/drivers.ts` → existing call preserved
    - `grep -n "revalidatePath('/trucks')" apps/web/src/app/\(owner\)/actions/trucks.ts` → existing call preserved
    - `grep -n "revalidatePath('/crm')" apps/web/src/app/\(owner\)/actions/customers.ts` → existing call preserved (at least 1 hit in createCustomer)
  </verify>
  <done>
    - inviteDriver imports recordActivationEvent and calls it inside try/catch with 'first_real_driver' key
    - All three owner server actions (createTruck, inviteDriver, createCustomer) call revalidatePath('/onboarding/welcome')
    - All pre-existing revalidatePath and revalidateTag calls are preserved unchanged
    - No other functions in drivers.ts were modified
    - `tsc --noEmit` passes
  </done>
</task>

<task type="auto">
  <name>Task 3: Commit all changes in a single commit</name>
  <files>
    apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    apps/web/src/app/api/v1/carrier/clients/route.ts
    apps/web/src/app/onboarding/welcome/page.tsx
    apps/web/src/app/(owner)/actions/drivers.ts
    apps/web/src/app/(owner)/actions/trucks.ts
    apps/web/src/app/(owner)/actions/customers.ts
  </files>
  <action>
Single commit covering all seven file changes.

Run from repo root (PowerShell):
```
node C:/Users/sammy/.claude/get-shit-done/bin/gsd-tools.js commit "fix(onboarding): revalidatePath('/onboarding/welcome') after carrier + owner create flows, force-dynamic welcome page [TKT-0040]" --files apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts apps/web/src/app/api/v1/carrier/clients/route.ts apps/web/src/app/onboarding/welcome/page.tsx "apps/web/src/app/(owner)/actions/drivers.ts" "apps/web/src/app/(owner)/actions/trucks.ts" "apps/web/src/app/(owner)/actions/customers.ts"
```

DO NOT run `git push`. The orchestrator (or user) pushes at the end of the quick task per project workflow.
  </action>
  <verify>
    `git log -1 --stat` shows the new commit with all 7 files modified and TKT-0040 in the subject line.
  </verify>
  <done>
    Single commit created covering all 7 file changes. No push performed.
  </done>
</task>

</tasks>

<verification>
After all tasks complete, do a final visual sanity check by reading each modified file and confirming:

1. Each carrier API POST handler has `revalidatePath('/onboarding/welcome')` OUTSIDE any `after()` block.
2. Welcome page has `export const dynamic = 'force-dynamic';` at the top.
3. inviteDriver in owner drivers.ts now imports and calls recordActivationEvent + revalidatePath('/onboarding/welcome').
4. createTruck and createCustomer in owner actions now also call revalidatePath('/onboarding/welcome'), with their existing revalidatePath/revalidateTag calls preserved.
5. No `after()` block was modified.
6. `tsc --noEmit` passes for apps/web.

Manual end-to-end test (after deploy — out of scope for this task, but documented for handoff):
- Sign up a new tenant.
- From /onboarding/welcome, navigate to /trucks, create the first real truck, then click back to /onboarding/welcome (or navigate back via browser) — the truck step should now be checked.
- Repeat for first real driver (invite via /drivers) and first real client (/crm). All three steps update on back-nav.
</verification>

<success_criteria>
- All 7 files modified per the spec
- `revalidatePath('/onboarding/welcome')` fires from every entry point that creates the first real truck/driver/client (carrier API + owner actions)
- revalidatePath calls are OUTSIDE after() blocks in carrier API routes
- inviteDriver now records activation events for first_real_driver
- /onboarding/welcome is force-dynamic
- No existing revalidatePath/revalidateTag calls were removed
- TypeScript build clean (`tsc --noEmit` passes)
- Single commit with TKT-0040 in the message
</success_criteria>

<output>
After completion, create `.planning/quick/397-tkt-0040-fix-revalidatepath-onboarding-w/397-SUMMARY.md` summarizing:
- Files changed and the exact line-level change in each
- Confirmation that revalidatePath is OUTSIDE after() in all 3 carrier API routes
- Confirmation that inviteDriver now fires recordActivationEvent
- Commit SHA
- Reminder: user pushes manually when ready to deploy
</output>
