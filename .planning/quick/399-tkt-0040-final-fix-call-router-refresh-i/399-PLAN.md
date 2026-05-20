---
phase: quick-399
plan: 399
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
  - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
  - apps/web/src/components/carrier/clients/ClientForm.tsx
autonomous: true

must_haves:
  truths:
    - "After creating a truck via /carrier/fleet/trucks/new, navigating to /onboarding/welcome shows 'Add your first truck' CHECKED"
    - "After creating a driver via /carrier/fleet/drivers/new, navigating to /onboarding/welcome shows 'Add your first driver' CHECKED"
    - "After creating a client via /carrier/clients/new, navigating to /onboarding/welcome shows 'Add your first client' CHECKED"
    - "On the create-path of all three carrier entity forms, router.refresh() is called BEFORE router.push() in the success handler"
  artifacts:
    - path: "apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx"
      provides: "Truck create form with router.refresh() before router.push() on create success"
      contains: "router.refresh"
    - path: "apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx"
      provides: "Driver create form with router.refresh() before router.push() on create success"
      contains: "router.refresh"
    - path: "apps/web/src/components/carrier/clients/ClientForm.tsx"
      provides: "Client create form with router.refresh() before router.push() on create success"
      contains: "router.refresh"
  key_links:
    - from: "CarrierTruckForm.tsx (create path)"
      to: "Next.js client Router Cache"
      via: "router.refresh() called BEFORE router.push() in success handler"
      pattern: "router\\.refresh\\(\\)[\\s\\S]{0,200}router\\.push"
    - from: "CarrierDriverForm.tsx (create path)"
      to: "Next.js client Router Cache"
      via: "router.refresh() called BEFORE router.push() in success handler"
      pattern: "router\\.refresh\\(\\)[\\s\\S]{0,200}router\\.push"
    - from: "ClientForm.tsx (create path)"
      to: "Next.js client Router Cache"
      via: "router.refresh() called BEFORE router.push() in success handler"
      pattern: "router\\.refresh\\(\\)[\\s\\S]{0,200}router\\.push"
---

<objective>
TKT-0040 final fix. After QT 397 (revalidatePath) and QT 398 (synchronous recordActivationEvent), the onboarding welcome checklist still shows entity steps UNCHECKED in production. Diagnostic QT (.planning/debug/tkt-0040-third-diagnostic.md) traced the actual root cause: revalidatePath() called from a Route Handler invalidates the SERVER cache but does NOT emit the x-action-revalidated header — only Server Actions do that. The browser's client-side Router Cache for /onboarding/welcome is never evicted, so the next navigation serves the stale RSC payload no matter how many times the server revalidates.

Fix: add (or reorder) router.refresh() in the success handler of all three carrier entity create forms so it fires BEFORE router.push(). router.refresh() clears all client-router-cache segments, guaranteeing the next navigation to /onboarding/welcome triggers a fresh RSC fetch with the correct activation state.

Purpose: Close TKT-0040 permanently. Server-side fixes (revalidatePath, force-dynamic, synchronous activation writes) stay in place — this is the final missing piece on the client side.

Output: Three small, surgical edits to client form success handlers. No server changes. No new dependencies. No new patterns introduced (router.refresh is already used in these files for the edit path).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/debug/tkt-0040-third-diagnostic.md
@apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
@apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
@apps/web/src/components/carrier/clients/ClientForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reorder/add router.refresh() before router.push() in all three carrier create forms</name>
  <files>
    apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
    apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
    apps/web/src/components/carrier/clients/ClientForm.tsx
  </files>
  <action>
Fix the create-path success handler in all three files. The order matters: router.refresh() MUST run before router.push() so the client router cache is evicted before navigation, guaranteeing the next visit to /onboarding/welcome (or any other route) fetches a fresh RSC payload.

Why this fix is correct (from the diagnostic — do not re-derive, just trust it):
- revalidatePath() in the Route Handler invalidates the server Data Cache + Full Route Cache, but does NOT signal the browser to evict its Router Cache.
- Only Server Actions emit the x-action-revalidated header that triggers client-side cache eviction. Route Handlers do not.
- router.refresh() on the client clears ALL client-router-cache segments. Calling it after a successful POST is the documented Next.js workaround for Route-Handler-driven mutations.
- Calling it BEFORE router.push() ensures the eviction happens before any subsequent prefetch/navigation can repopulate the cache from a stale prefetched RSC.

==============================================================
FILE 1: apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
==============================================================

Current code (lines 239-242, inside handleSubmit, create path):
```ts
      } else {
        router.push('/carrier/fleet/trucks');
        router.refresh();
      }
```

Change to:
```ts
      } else {
        router.refresh();
        router.push('/carrier/fleet/trucks');
      }
```

That is the ONLY change in this file. Do NOT touch the edit path (lines 233-238) — it already calls onSuccess() OR router.refresh() correctly, and there is no navigation to /onboarding/welcome from the edit success handler.

==============================================================
FILE 2: apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
==============================================================

Current code (lines 148-152, inside handleSubmit, success branch):
```ts
      if (isEdit) {
        router.refresh();
      } else {
        router.push('/carrier/fleet/drivers');
      }
```

Change to:
```ts
      if (isEdit) {
        router.refresh();
      } else {
        router.refresh();
        router.push('/carrier/fleet/drivers');
      }
```

Note: this file is currently MISSING router.refresh() on the create path entirely. Add it BEFORE router.push(). Do not touch the edit path.

==============================================================
FILE 3: apps/web/src/components/carrier/clients/ClientForm.tsx
==============================================================

Current code (lines 186-188, inside handleSubmit, success branch):
```ts
      toast.success(isEdit ? 'Client updated' : 'Client created');
      router.push('/carrier/clients');
      router.refresh();
```

Change to:
```ts
      toast.success(isEdit ? 'Client updated' : 'Client created');
      router.refresh();
      router.push('/carrier/clients');
```

This file handles both create and edit in the same branch (no isEdit guard around navigation). Both paths benefit equally from the reorder. No conditional logic to add.

==============================================================
What NOT to change (re-confirm from task brief)
==============================================================
- Do NOT remove or modify any revalidatePath() call in the Route Handlers (QT 397 stays).
- Do NOT remove or modify `export const dynamic = 'force-dynamic'` (QT 397 stays).
- Do NOT remove or modify the synchronous recordActivationEvent calls in the Route Handlers (QT 398 stays).
- Do NOT convert any Route Handler into a Server Action.
- Do NOT add cache-busting query params to fetch() calls.
- Do NOT add router.refresh() to the Cancel button handlers.
- Do NOT touch the edit branches except where shown above (CarrierDriverForm edit branch already has router.refresh and is fine; CarrierTruckForm edit branch is fine; ClientForm has no separate edit branch).
- Do NOT modify the dispatch/load `transitionDispatchStatus` flow (audit-only — see notes below).

==============================================================
Audit notes (no code changes from this task)
==============================================================
Recorded here for the SUMMARY so the user can decide whether to open a follow-up QT:

1. `inviteDriver` flow (apps/web/src/app/(owner)/actions/drivers.ts):
   - Confirmed: marked `'use server'` (line 1). It is a Server Action.
   - It calls `revalidatePath('/onboarding/welcome')` (line 211) AFTER `recordActivationEvent(tenantId, 'first_real_driver')`.
   - Server Action revalidatePath DOES emit x-action-revalidated → client cache evicted automatically.
   - No fix needed for this flow.

2. Load dispatch flow (`first_load_in_transit`):
   - `apps/web/src/lib/carrier/dispatches.ts` line 619 calls `recordActivationEvent(orgId, 'first_load_in_transit')` inside `transitionDispatchStatus`.
   - `transitionDispatchStatus` is invoked from a Route Handler at `apps/web/src/app/api/v1/carrier/dispatches/[id]/status/route.ts` (not a Server Action).
   - This means the same client-router-cache gap exists for the FINAL activation step (first_load_in_transit, which flips isActivated=true).
   - This is the LAST checklist item — most users will already be off /onboarding/welcome by the time they dispatch their first load, so user impact is lower than the truck/driver/client gap. But it WILL exhibit the same stale-checklist behavior if the user dispatches and then navigates back to welcome.
   - Out of scope for this QT per the task brief ("audit, no modification unless gap found"). Flag to user in the SUMMARY as a candidate follow-up QT.
   - The client trigger for transitionDispatchStatus also calls revalidatePath in its Route Handler — confirm whether the dispatch status update UI calls router.refresh() before navigation. If it does not, the bug pattern is identical.

3. Server Action call sites for `first_real_truck`/`first_real_driver`/`first_real_client`:
   - apps/web/src/app/(owner)/actions/loads.ts line 608 calls recordActivationEvent for first_load_in_transit — it is a Server Action (file starts with 'use server'), so its revalidatePath is fine. No fix needed.
   - The carrier truck/driver/client CREATE flows go through Route Handlers (apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts, .../drivers/route.ts, .../clients/route.ts). These are the only three flows that need the client-side router.refresh() fix — and they are exactly the three forms this task modifies.
  </action>
  <verify>
1. Run TypeScript check:
   `cd apps/web && npx tsc --noEmit`
   Must pass with zero errors.

2. Static grep verification — the call ORDER must be refresh-before-push on all three create paths:
   - CarrierTruckForm.tsx line range 238-243 must contain `router.refresh()` on a line that appears BEFORE `router.push('/carrier/fleet/trucks')`.
   - CarrierDriverForm.tsx line range 148-155 (post-edit, the else branch) must contain `router.refresh()` immediately before `router.push('/carrier/fleet/drivers')`.
   - ClientForm.tsx line range 186-190 must contain `router.refresh()` immediately before `router.push('/carrier/clients')`.

3. Confirm no other lines changed in the three files (use `git diff --stat` — each file should show small, surgical diff: <8 lines changed).

4. Confirm no server-side files were touched in this task (server route handlers untouched).

5. Manual smoke (user verifies post-deploy, do not block on this in the task):
   a. Log in as a tenant with incomplete onboarding.
   b. Open /onboarding/welcome in a tab → note "Add your first truck" is unchecked.
   c. In the same browser session, create a truck via /carrier/fleet/trucks/new.
   d. After redirect to /carrier/fleet/trucks list, navigate to /onboarding/welcome.
   e. Expect: "Add your first truck" is now CHECKED (without a hard refresh).
   f. Repeat (b)-(e) for drivers via /carrier/fleet/drivers/new and clients via /carrier/clients/new.
  </verify>
  <done>
- Three files (CarrierTruckForm.tsx, CarrierDriverForm.tsx, ClientForm.tsx) have `router.refresh()` called BEFORE `router.push()` on the create-success path.
- `tsc --noEmit` passes.
- No other code changed (no server changes, no new patterns, no new dependencies).
- SUMMARY.md notes the dispatch `first_load_in_transit` audit finding as a candidate follow-up QT.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` → zero errors
- `git diff apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx` → only lines 240-241 reordered (2-line swap)
- `git diff apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx` → one line added: `router.refresh();` before `router.push('/carrier/fleet/drivers');`
- `git diff apps/web/src/components/carrier/clients/ClientForm.tsx` → only lines 187-188 reordered (2-line swap)
- No server-side route handlers, no activation-tracker.ts, no onboarding/welcome page changes.
</verification>

<success_criteria>
- All three carrier create forms call router.refresh() before router.push() on successful create.
- TypeScript compiles cleanly.
- Manual smoke (post-deploy) shows /onboarding/welcome checklist updates after entity create without requiring a hard refresh.
- Server-side fixes from QT 397 (revalidatePath + force-dynamic) and QT 398 (synchronous recordActivationEvent) remain untouched.
- SUMMARY.md documents the dispatch flow audit finding (first_load_in_transit may have the same gap — candidate follow-up QT).
</success_criteria>

<output>
After completion, create `.planning/quick/399-tkt-0040-final-fix-call-router-refresh-i/399-SUMMARY.md` with:
- Root cause restatement (one paragraph) — Route-Handler revalidatePath does not evict client router cache.
- The three edits (file + line + diff snippet).
- Confirmation that QT 397 and QT 398 fixes are still in place.
- Audit finding: `transitionDispatchStatus` for `first_load_in_transit` calls through a Route Handler too — same bug pattern likely exists for the dispatch-status-change UI. Flag as candidate follow-up QT.
- Verification: tsc clean + manual smoke instructions for user.
</output>
