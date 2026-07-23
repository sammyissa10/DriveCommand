---
phase: quick-497
plan: 497
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/server/services/workflows/deriveDriverReadiness.ts
  - apps/web/src/server/services/workflows/__tests__/deriveDriverReadiness.test.ts
  - apps/web/src/server/api/routers/workflows/instance.ts
  - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
  - apps/web/src/server/services/workflows/fireEvent.ts
  - apps/web/src/server/services/workflows/seedStarterPlaybooks.ts
  - apps/web/src/app/api/auth/accept-invitation/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
  - apps/web/src/server/api/routers/workflows/__tests__/seed.test.ts
  - apps/web/scripts/backfill-driver-onboarding-instances.ts
autonomous: true

must_haves:
  truths:
    - "getDriverReadiness NEVER returns { isReady:false, blockerStepNames:[] } — the unactionable dead-end is impossible by construction."
    - "A driver with open dispatch-blocker steps returns isReady:false with populated blockerStepNames and a non-null openInstanceId."
    - "A driver whose onboarding blocker steps are all complete/skipped returns isReady:true."
    - "Onboarding a new carrier driver (via invite acceptance) produces an open onboarding Active Checklist keyed on the DRIVER User.id, visible on the Active Work Board."
    - "A new org receives a default-on ON_DRIVER_CREATE Auto-Start Rule (visible + toggleable in the Auto-Start Rules custom rules table)."
    - "Existing carrier drivers with a linked User but no active DRIVER instance are backfilled with an onboarding checklist and coherent User.isDispatchReady."
  artifacts:
    - path: "apps/web/src/server/services/workflows/deriveDriverReadiness.ts"
      provides: "Pure, unit-testable readiness derivation from live step instances"
      contains: "export function deriveDriverReadiness"
    - path: "apps/web/src/server/api/routers/workflows/instance.ts"
      provides: "getDriverReadiness resolver derived from live steps, not stale User.isDispatchReady"
      contains: "deriveDriverReadiness"
    - path: "apps/web/src/server/services/workflows/seedStarterPlaybooks.ts"
      provides: "Default-on ON_DRIVER_CREATE trigger linked to CDL Driver Onboarding"
      contains: "playbookTrigger.create"
    - path: "apps/web/src/server/services/workflows/generatePlaybookInstance.ts"
      provides: "Optional pre-resolved tenantPrisma param for header-less contexts"
      contains: "args.tenantPrisma"
    - path: "apps/web/src/server/services/workflows/fireEvent.ts"
      provides: "Optional pre-resolved tenantPrisma param, threaded to generatePlaybookInstance"
      contains: "args.tenantPrisma"
    - path: "apps/web/scripts/backfill-driver-onboarding-instances.ts"
      provides: "Idempotent backfill of onboarding instances + default trigger per tenant"
      contains: "getTenantPrismaForOrg"
  key_links:
    - from: "apps/web/src/app/api/auth/accept-invitation/route.ts"
      to: "fireEvent(ON_DRIVER_CREATE)"
      via: "after user-tx commit, DRIVER role only, explicit getTenantPrismaForOrg(tenantId, newUser.id)"
      pattern: "fireEvent"
    - from: "apps/web/src/server/services/workflows/fireEvent.ts"
      to: "generatePlaybookInstance"
      via: "passes tenantPrisma through"
      pattern: "tenantPrisma"
    - from: "apps/web/src/server/api/routers/workflows/instance.ts"
      to: "deriveDriverReadiness"
      via: "active DRIVER stepInstances → readiness"
      pattern: "deriveDriverReadiness"
    - from: "apps/web/scripts/backfill-driver-onboarding-instances.ts"
      to: "generatePlaybookInstance + computeDispatchReadiness"
      via: "getTenantPrismaForOrg(tenantId) injected client"
      pattern: "generatePlaybookInstance"
---

<objective>
Fix the driver readiness gate that can never be satisfied. Today, DRIVER PlaybookInstances are never auto-created (no tenant ever gets an ON_DRIVER_CREATE Auto-Start Rule, and the one fire-point fires at the wrong moment with the wrong id), and `getDriverReadiness` reads the stale `User.isDispatchReady` flag (DB default `false`) — so a driver with no onboarding checklist returns `{ isReady:false, blockerStepNames:[] }`: blocked from dispatch with zero actionable steps.

This plan makes the gate satisfiable via three moves:
1. **Resolver correctness** — derive readiness from LIVE step instances so it can never dead-end.
2. **Auto-start wiring** — seed a default-on ON_DRIVER_CREATE rule, and fire it at invite acceptance (where the DRIVER User first exists) using an explicit tenant client (invite acceptance is pre-auth, so header-based `getTenantPrisma()` throws there).
3. **Backfill** — give existing stuck drivers an onboarding checklist and coherent readiness.

Purpose: unblock dispatch for onboarded drivers with an actionable checklist; satisfy Workflow Engine spec Section 4.3 (readiness aggregation), 4.4/6.5 (event fan-out), and Section 12 (starter playbooks). This is a bug fix to already-built Phase 4 (Automation) — NOT building ahead of Section 14 scope.

Output: corrected resolver + pure helper (with tests), default-on seeded Auto-Start Rule (with test), invite-acceptance fire-point, a DRY optional-tenantPrisma refactor of `fireEvent`/`generatePlaybookInstance`, and an idempotent backfill script.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Spec — MANDATORY before editing (markdown, NOT the .pdf). Confirm Sections 4.3, 4.4, 6.5, 7, 11, 12, 14.
@docs/specs/DriveCommand_Workflow_Engine_v2.md

# Files edited in this plan (read before editing)
@apps/web/src/server/api/routers/workflows/instance.ts
@apps/web/src/server/services/workflows/generatePlaybookInstance.ts
@apps/web/src/server/services/workflows/fireEvent.ts
@apps/web/src/server/services/workflows/seedStarterPlaybooks.ts
@apps/web/src/server/services/workflows/computeDispatchReadiness.ts
@apps/web/src/app/api/auth/accept-invitation/route.ts
@apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/server/api/routers/workflows/__tests__/seed.test.ts

# Consumers of getDriverReadiness — return shape must stay backward-compatible
@apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Derive getDriverReadiness from live step instances (resolver can never dead-end) + unit test</name>
  <files>
    apps/web/src/server/services/workflows/deriveDriverReadiness.ts (new)
    apps/web/src/server/services/workflows/__tests__/deriveDriverReadiness.test.ts (new)
    apps/web/src/server/api/routers/workflows/instance.ts (edit)
  </files>
  <action>
    Extract the readiness math into a pure, dependency-free helper so the invariant is provable in a unit test (no tRPC/Prisma mocking needed).

    1. Create `deriveDriverReadiness.ts` exporting:
       `export function deriveDriverReadiness(activeInstances: Array<{ id: string; stepInstances: Array<{ status: string; stepSnapshot: unknown }> }>): { isReady: boolean; blockerStepNames: string[]; openInstanceId: string | null }`
       Logic (mirror the existing snapshot-reading convention in computeDispatchReadiness.ts and the current resolver):
       - An "open" step is one with status in { NOT_STARTED, IN_PROGRESS, FAILED }. (Complete statuses are COMPLETE / SKIPPED per computeDispatchReadiness.ts — do NOT invent new status strings.)
       - A "blocker" step has `stepSnapshot.isDispatchBlocker === true`.
       - Iterate instances in the given order; collect names of open blocker steps via `snap.title ?? snap.name ?? 'Required step'` (same fallback the current resolver uses).
       - `openInstanceId` = id of the FIRST instance that has ≥1 open blocker step; if none has an open blocker, fall back to the first instance's id when the array is non-empty, else null.
       - `isReady = blockerStepNames.length === 0`.
       INVARIANT (by construction): isReady is DEFINED as `blockerStepNames.length === 0`, so it is impossible to return `{ isReady:false, blockerStepNames:[] }`.

    2. Rewrite the `getDriverReadiness` resolver in instance.ts to stop gating on `User.isDispatchReady`:
       - Keep the CarrierDriver lookup; if no `userId` → return `{ isReady:true, blockerStepNames:[], openInstanceId:null, userId:null }` (UNCHANGED).
       - Load active (status != COMPLETED) DRIVER instances for `entityId=userId` including stepInstances (select stepSnapshot + status; no status filter here — the helper classifies open steps so completed/skipped are naturally excluded).
       - If ZERO active instances exist → return `{ isReady:true, blockerStepNames:[], openInstanceId:null, userId, warning:'NO_ONBOARDING_INSTANCE' as const }`. This is READ-ONLY — do NOT create instances inside a tRPC query (option (b) from the task).
       - Otherwise call `deriveDriverReadiness(activeInstances)` and return `{ ...result, userId }`.
       - Widen the resolver's return TYPE to add optional `warning?: 'NO_ONBOARDING_INSTANCE'`. Do NOT remove/rename `isReady`, `blockerStepNames`, `openInstanceId`, `userId` — NewDispatchForm.tsx, NewTripMobile.tsx, DispatchLoadModal.tsx depend on them. Remove the now-dead `prisma.user.findUnique({ isDispatchReady })` read and its early-return branch. Update the resolver's doc-comment (lines ~148-156) to say readiness is derived from live steps, not User.isDispatchReady.

    3. Create the unit test `deriveDriverReadiness.test.ts` (vitest, pure — no mocks) covering the acceptance invariant:
       - no instances (empty array) ⇒ `{ isReady:true, blockerStepNames:[], openInstanceId:null }`.
       - one instance, one open blocker step (isDispatchBlocker:true, NOT_STARTED) ⇒ isReady:false, blockerStepNames length 1 with the step name, openInstanceId = that instance id.
       - one instance, all blocker steps COMPLETE/SKIPPED ⇒ isReady:true, blockerStepNames:[].
       - explicit invariant assertion: for a driver with a non-blocker open step only ⇒ isReady:true (non-blocker steps never gate) AND there is no possible input yielding isReady:false with empty blockerStepNames.

    Do NOT touch trips.ts server enforcement — it reads User.isDispatchReady, which stays coherent via computeDispatchReadiness (Task 2 auto-start creates instances; Task 3 backfill recomputes). Keeping it out of scope avoids expanding the change surface.
  </action>
  <verify>
    cd apps/web && npx vitest run src/server/services/workflows/__tests__/deriveDriverReadiness.test.ts
    cd apps/web && npx vitest run src/__tests__/workflows-instance.test.ts src/__tests__/workflows-dispatch-enforcement.test.ts
    npx tsc --noEmit (from apps/web — no NEW errors vs ~35 baseline; specifically none in instance.ts or the new files)
  </verify>
  <done>
    deriveDriverReadiness.test.ts passes; the resolver returns the widened shape; no input can produce {isReady:false, blockerStepNames:[]}; existing workflow suites stay green; no new tsc errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Auto-start wiring — optional tenantPrisma refactor, default-on seeded rule, fire at invite acceptance</name>
  <files>
    apps/web/src/server/services/workflows/generatePlaybookInstance.ts (edit)
    apps/web/src/server/services/workflows/fireEvent.ts (edit)
    apps/web/src/server/services/workflows/seedStarterPlaybooks.ts (edit)
    apps/web/src/app/api/auth/accept-invitation/route.ts (edit)
    apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts (edit)
    apps/web/src/server/api/routers/workflows/__tests__/seed.test.ts (edit)
  </files>
  <action>
    A. **DRY optional-tenantPrisma refactor** (required — invite acceptance and the backfill script have NO request headers, so header-based `getTenantPrisma()` throws there):
       - `generatePlaybookInstance`: add optional `tenantPrisma?: PrismaClient` to its args. At the top do `const tenantPrisma = args.tenantPrisma ?? await getTenantPrisma();` and replace EVERY internal `await getTenantPrisma()` call (currently ~4 sites incl. inside `verifyEntity`) with this resolved client. Thread `tenantPrisma` into `verifyEntity(entityType, entityId, tenantId, tenantPrisma)` (it uses getTenantPrisma for VEHICLE/PARTNER; DRIVER keeps bare `prisma` for the platform User table — leave that). The bare-`prisma` `$transaction` bypass_rls write and `resolveAssignee` are header-independent — leave them. Default path (no arg) preserves current request behavior exactly.
       - `fireEvent`: add optional `tenantPrisma?: PrismaClient` to its args; use `args.tenantPrisma ?? await getTenantPrisma()` for the trigger `findMany`, and pass `tenantPrisma` through to each `generatePlaybookInstance(...)` call. Default path unchanged.

    B. **Seed a default-on ON_DRIVER_CREATE Auto-Start Rule** in seedStarterPlaybooks.ts:
       - Make `createCDLDriverOnboarding` RETURN the created playbook id (return `playbook.id`).
       - Inside the SAME `$transaction`, after the three create* calls, create one PlaybookTrigger:
         `tx.playbookTrigger.create({ data: { tenantId, playbookId: <CDL Onboarding id>, triggerEvent: 'ON_DRIVER_CREATE', conditions: {} , recurringConfig: { _custom: true }, isActive: true } })`.
         Rationale: empty `conditions` = match-all (robust default; avoids the recipe `{driverType:'CDL'}` mismatch since entityData carries no driverType). `recurringConfig:{_custom:true}` is the existing sentinel that surfaces it in the Auto-Start Rules custom-rules table (trigger.ts `listCustomRules`) so the owner can toggle/delete it. The existing sentinel idempotency check (findFirst 'CDL Driver Onboarding') already prevents duplicate seeding. This default-on rule is per the explicit task requirement, reconciled with the spec by being a visible, toggleable rule.

    C. **Fire ON_DRIVER_CREATE at invite acceptance** in accept-invitation/route.ts:
       - After the user-creation `$transaction` COMMITS and ONLY when `userRole === 'DRIVER'`, best-effort fire — wrap in try/catch (this route has no `after()` import; a try/catch that logs via `logger.error` and never rethrows is the convention here). Because there is NO session/x-tenant-id yet, pass an EXPLICIT client:
         `await fireEvent({ event:'ON_DRIVER_CREATE', entityData:{ id: user.id, email: userEmail }, tenantId: invitation.tenantId, tenantPrisma: await getTenantPrismaForOrg(invitation.tenantId, user.id) })`.
       - Import `fireEvent` and `getTenantPrismaForOrg`. Place it near the existing `recordActivationEvent` block (which already special-cases DRIVER). Never let a fireEvent failure fail invite acceptance.

    D. **Harden the existing create-route fire** in v1/carrier/fleet/drivers/route.ts:
       - It already fires inside `after()`. `after()` runs post-response where request `headers()` may be unavailable, so pass the explicit client too: add `tenantPrisma: await getTenantPrismaForOrg(orgId)` to the existing `fireEvent({...})` call (orgId is already in scope). Leave the `entityData.id = carrierDriver.userId ?? carrierDriver.id` line as-is: for a brand-new (unlinked) driver it fires the CarrierDriver id and `verifyEntity` throws NOT_FOUND (swallowed) — the invite-acceptance fire (C) is the real path; the create-route fire covers the pre-linked case, and generatePlaybookInstance's CONFLICT de-dupe keeps both safe. Import `getTenantPrismaForOrg`.

    E. **Update seed.test.ts** for the new trigger:
       - Add `playbookTrigger: { create: vi.fn() }` to the mocked `makeTx()` object and to the exposed `_tx`/`getTx()` typing.
       - Add a test: after `seedStarterPlaybooks`, `tx.playbookTrigger.create` was called exactly once with `triggerEvent:'ON_DRIVER_CREATE'`, `conditions:{}`, `isActive:true`, `recurringConfig:{_custom:true}`, and `playbookId` equal to the CDL playbook id returned by the first `tx.playbook.create` mock. Keep the existing "creates exactly 3 playbooks" and idempotency tests green (idempotent path must still make ZERO trigger creates).
  </action>
  <verify>
    cd apps/web && npx vitest run src/server/api/routers/workflows/__tests__/seed.test.ts src/__tests__/workflows-fire-event.test.ts src/__tests__/workflows-instance.test.ts
    npx tsc --noEmit (from apps/web — no NEW errors; check generatePlaybookInstance.ts, fireEvent.ts, seedStarterPlaybooks.ts, both routes)
  </verify>
  <done>
    seedStarterPlaybooks creates the default ON_DRIVER_CREATE trigger (asserted + idempotent); fireEvent/generatePlaybookInstance accept an optional tenantPrisma with unchanged default behavior; invite acceptance and the create route fire with an explicit tenant client; all workflow suites green; no new tsc errors.
  </done>
</task>

<task type="auto">
  <name>Task 3: Backfill script for existing stuck drivers (idempotent, re-runnable)</name>
  <files>
    apps/web/scripts/backfill-driver-onboarding-instances.ts (new)
  </files>
  <action>
    Create a standalone Node/tsx script (mirror the structure of existing apps/web/scripts/*.ts — check one for the dotenv/prisma bootstrap and the `tsx`/`ts-node` invocation convention). It must be idempotent and re-runnable.

    Algorithm, per tenant (iterate all Tenant ids via bare `prisma`):
    1. Ensure the CDL Driver Onboarding playbook exists: call `seedStarterPlaybooks(tenantId)` (its sentinel makes this a no-op if already seeded; it now also seeds the default trigger for freshly-seeded tenants).
    2. Ensure the default trigger exists for ALREADY-seeded tenants: if no `playbookTrigger` with `triggerEvent:'ON_DRIVER_CREATE'` linked to that tenant's 'CDL Driver Onboarding' playbook exists, create it with the same shape as Task 2B (`conditions:{}`, `recurringConfig:{_custom:true}`, `isActive:true`). This guarantees FUTURE drivers auto-start for old tenants too. Use a bare-prisma bypass_rls `$transaction` (the `set_config('app.bypass_rls','on',TRUE)` pattern used throughout this codebase) or `getTenantPrismaForOrg(tenantId)` — pick one and be consistent; getTenantPrismaForOrg is preferred for tenant-scoped reads/writes.
    3. Resolve the CDL Onboarding playbook id for the tenant.
    4. For each `carrier_drivers` row in the tenant WHERE `userId` is not null AND the linked User has role DRIVER: check for an existing active (status != COMPLETED) DRIVER PlaybookInstance for `entityId = userId`. If NONE exists, call
       `await generatePlaybookInstance({ playbookId, entityType:'DRIVER', entityId: userId, tenantId, triggeredBy:'trigger', triggeredEvent:'ON_DRIVER_CREATE', tenantPrisma: await getTenantPrismaForOrg(tenantId) })`.
       generatePlaybookInstance's CONFLICT de-dupe + this pre-check keep it idempotent.
    5. After creating (or if an instance already exists), recompute readiness so `User.isDispatchReady` (read by trips.ts server enforcement) is coherent. NOTE: `computeDispatchReadiness(instanceId)` internally calls header-based `getTenantPrisma()` and will THROW in a script. Handle this cleanly: EITHER (preferred, DRY) apply the same optional-`tenantPrisma` refactor to `computeDispatchReadiness` (add optional param defaulting to `await getTenantPrisma()`, replace its two internal getTenantPrisma calls) and pass `getTenantPrismaForOrg(tenantId)`; OR, if you judge that out of scope, skip the recompute in the script and instead set `User.isDispatchReady` directly from the freshly-created instance's blocker state (a new onboarding checklist has open blockers ⇒ false, which is correct and what the LIVE resolver already reflects). Decide and implement ONE; document the choice in a script header comment. (The live-derived resolver from Task 1 already reflects reality regardless, so full recompute is a coherence nicety for the trips.ts path.)
    6. Log a per-tenant + total summary: tenants processed, triggers created, instances created, drivers already-had-instance. Exit 0 on success.

    Do NOT push or deploy. Do NOT wire this into any cron or build step — it is a one-off maintenance script the user runs manually (document the exact run command in the header comment, e.g. `npx tsx scripts/backfill-driver-onboarding-instances.ts` from apps/web).
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit (script compiles; no new errors)
    Static review: confirm every generatePlaybookInstance/computeDispatchReadiness call in the script passes an explicit tenant client (getTenantPrismaForOrg) and never relies on request headers.
    (Live run against the DB is the USER's call — it mutates data. Provide the exact command; do NOT auto-run it.)
  </verify>
  <done>
    Script compiles, is idempotent (safe to run twice — second run creates 0 instances), ensures per-tenant default trigger + onboarding instances for linked drivers, keeps User.isDispatchReady coherent, and prints a summary. No headers relied upon. Run command documented.
  </done>
</task>

</tasks>

<verification>
Automated (executor runs these):
- `cd apps/web && npx vitest run src/server/services/workflows/__tests__/deriveDriverReadiness.test.ts src/server/api/routers/workflows/__tests__/seed.test.ts src/__tests__/workflows-fire-event.test.ts src/__tests__/workflows-instance.test.ts src/__tests__/workflows-dispatch-enforcement.test.ts` — all green.
- `cd apps/web && npx tsc --noEmit` — no NEW errors beyond the ~35 pre-existing baseline (project memory: only regressions count; specifically zero in the files this plan touches).

Manual (USER, post-merge — requires running web app):
1. New driver: invite a driver and accept the invite → an "CDL Driver Onboarding" Active Checklist appears on the Active Work Board keyed on that driver's User; the New Dispatch form shows the blocker steps (not an empty dead-end).
2. Complete all blocker steps → on refetch (no page refresh) the dispatch warning clears and isReady flips true.
3. Auto-Start Rules page → the ON_DRIVER_CREATE → CDL Driver Onboarding rule is listed and toggleable.
4. Run the backfill once, then again → second run reports 0 new instances (idempotent).
</verification>

<success_criteria>
- getDriverReadiness can NEVER return `{ isReady:false, blockerStepNames:[] }` (proven by deriveDriverReadiness.test.ts and by construction).
- Return shape stays backward-compatible: `{ isReady, blockerStepNames, openInstanceId, userId }` preserved; only optional `warning` added.
- Onboarding a new carrier driver produces an open onboarding Active Checklist keyed on User.id, via a default-on ON_DRIVER_CREATE Auto-Start Rule fired at invite acceptance with an explicit tenant client.
- New orgs get the default-on rule (asserted in seed.test.ts, idempotent); existing orgs get it + backfilled instances via the script.
- Completing all onboarding blocker steps flips isReady true (existing completeStep → computeDispatchReadiness path already updates step/instance status, which the live-derived resolver reflects).
- No schema/migration change. No new patterns. No push/deploy — commit only. Scope stays within the readiness gate (trips.ts enforcement, mobile UI, and unrelated workflow work untouched).
</success_criteria>

<output>
After completion, create `.planning/quick/497-fix-driver-readiness-gate-that-can-never/497-SUMMARY.md`.
Commit boundaries: Task 1, Task 2, Task 3 = three commits (`fix(quick-497): ...`). Executor commits only; the USER pushes/deploys.
</output>
