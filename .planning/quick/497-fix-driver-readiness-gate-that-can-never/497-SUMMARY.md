# Quick-497: Fix the driver readiness gate that can never be satisfied — Summary

**One-liner:** `getDriverReadiness` now derives readiness from live PlaybookInstance step data instead of the stale `User.isDispatchReady` DB-default-false column, and a default-on `ON_DRIVER_CREATE` Auto-Start Rule + invite-acceptance fire-point actually populate onboarding checklists so the gate is satisfiable.

## What was broken

1. **Resolver dead-end**: `getDriverReadiness` gated on `User.isDispatchReady` (DB default `false`), and a driver with zero onboarding checklists had no blocker steps to show — so the dispatch-blocking modal returned `{ isReady:false, blockerStepNames:[] }`: blocked, with nothing actionable to do about it.
2. **No auto-start**: no tenant ever received an `ON_DRIVER_CREATE` `PlaybookTrigger`, so `fireEvent` never had anything to match — DRIVER `PlaybookInstance`s were never created automatically.
3. **Wrong fire point**: the one existing `fireEvent('ON_DRIVER_CREATE', ...)` call (in the fleet-drivers create route) fires before a `User` may exist (unlinked driver), at a moment with no request headers reliably available in `after()`.

## What changed (3 commits)

### Task 1 — `df46f3f6` — Resolver correctness
- New pure helper `apps/web/src/server/services/workflows/deriveDriverReadiness.ts`: `isReady` is *defined* as `blockerStepNames.length === 0`, making the dead-end state impossible by construction (not just unlikely).
- New `apps/web/src/server/services/workflows/__tests__/deriveDriverReadiness.test.ts` — 5 tests, including an exhaustive sweep over `{status} x {isDispatchBlocker}` combinations across 2 instances proving the invariant.
- `apps/web/src/server/api/routers/workflows/instance.ts` `getDriverReadiness`: stopped reading `User.isDispatchReady`; loads active DRIVER `PlaybookInstance`s and calls `deriveDriverReadiness`. Zero active instances → `{ isReady:true, blockerStepNames:[], openInstanceId:null, userId, warning:'NO_ONBOARDING_INSTANCE' }` (read-only — never creates instances inside a tRPC query). Return shape stays backward-compatible: `isReady`/`blockerStepNames`/`openInstanceId`/`userId` unchanged; only optional `warning` added.

### Task 2 — `45c423a8` — Auto-start wiring
- DRY optional-`tenantPrisma` refactor: `generatePlaybookInstance` and `fireEvent` both accept an optional pre-resolved `tenantPrisma` client (threaded into `verifyEntity`). Default (omitted) path is byte-identical to before — resolves via header-based `getTenantPrisma()`.
- `seedStarterPlaybooks.ts`: `createCDLDriverOnboarding` now returns the created playbook id; inside the same seed transaction, creates one default-on `ON_DRIVER_CREATE` `PlaybookTrigger` (`conditions:{}` match-all, `recurringConfig:{_custom:true}` sentinel — the same sentinel `trigger.ts listCustomRules` uses to surface it in the Auto-Start Rules custom-rules table, so it's visible + toggleable, not a hidden lock-in).
- `accept-invitation/route.ts`: after the user-creation transaction commits, for `DRIVER` role invites, fires `ON_DRIVER_CREATE` with an explicit `getTenantPrismaForOrg(invitation.tenantId, user.id)` client (no session/headers exist pre-auth). Best-effort — wrapped in try/catch, never blocks acceptance.
- `v1/carrier/fleet/drivers/route.ts`: the existing `after()`-scoped fire now also passes an explicit `getTenantPrismaForOrg(orgId)` client (headers may be unavailable post-response inside `after()`).
- `seed.test.ts`: added `playbookTrigger.create` mock + a new test asserting the trigger is created exactly once with the exact shape, `playbookId` matching the CDL playbook id from the first `playbook.create` call; existing "3 playbooks" + idempotency tests kept green, idempotent path asserted to make zero trigger creates.

### Task 3 — `a7f451f6` — Backfill script
- Applied the same optional-`tenantPrisma` refactor to `computeDispatchReadiness` (2nd positional arg, default path unchanged, all 5 existing call sites untouched) — chosen over the direct-isDispatchReady-set alternative per the plan's explicit decision point, to keep one source of truth for the blocker-aggregation logic.
- New `apps/web/scripts/backfill-driver-onboarding-instances.ts`: per active tenant — ensures the CDL Driver Onboarding playbook + default trigger exist (covers tenants seeded before this fix), then for every linked (`userId != null`, role=`DRIVER`) carrier driver with no active DRIVER instance, creates one and recomputes readiness. All Prisma calls use an explicit `getTenantPrismaForOrg` client — no request headers relied upon. Idempotent (playbook sentinel + trigger existence check + instance pre-check + `CONFLICT` catch). Prints a per-tenant + total summary and exits non-zero on any error.
- **Run command** (documented in the script header): `npx tsx --env-file=.env.local scripts/backfill-driver-onboarding-instances.ts` from `apps/web`.
- **NOT run against the DB** by the executor — it mutates data; running it is the user's call.

## Spec alignment

Confirmed against `docs/specs/DriveCommand_Workflow_Engine_v2.md` before editing:
- §4.3 (Dispatch Readiness Aggregation) — `computeDispatchReadiness` aggregation logic unchanged; only made callable outside request scope.
- §4.4 / §6.5 (Event Fan-out / fireEvent) — flat key-value equality conditions preserved (`conditions:{}` = match-all is the documented always-match rule); `fireEvent` signature extended additively.
- §7 (tRPC API Surface) — `getDriverReadiness` return contract preserved for existing consumers (`NewDispatchForm.tsx`, `NewTripMobile.tsx`, `DispatchLoadModal.tsx`).
- §12 (Starter Seed Data, Starter 1) — CDL Driver Onboarding structure untouched; only a trigger row added alongside it.
- §14 (Phased Build Plan) — this is a bug fix within already-shipped Phase 4 (Automation) scope; no Phase 5+ features (Preview Panel, analytics, SMS) were touched.
- §3 (Naming Rules) — no new UI-visible copy was introduced; the "CDL Driver Onboarding" name and existing Auto-Start Rules table terminology are reused as-is.

## Verification results

- `deriveDriverReadiness.test.ts` — 5/5 pass (new).
- `seed.test.ts` — 6/6 pass (5 original + 1 new trigger-assertion test; original 3-playbooks/9-step/12-step/6-step/idempotency tests all still green).
- `workflows-fire-event.test.ts`, `workflows-instance.test.ts`, `workflows-dispatch-enforcement.test.ts` — **pre-existing failures, unrelated to this plan.** Confirmed via `git stash` diff-testing: baseline (before any quick-497 change) already fails 12/25 tests across these 3 files with the identical `headers() was called outside a request scope` / mock-wiring errors (these tests call the *real* service functions without mocking `@/lib/context/tenant-context`, so any request-scoped code path fails outside Next's request context — a pre-existing test-infra gap, not something this plan introduced or could regress further). After all 3 tasks: same 12 failed / 13 passed. Zero new failures, zero fixed-then-broken.
- `npx tsc --noEmit` from `apps/web` — **0 errors** after every task (better than the ~35-error baseline noted in project memory, which has apparently been cleaned up since). No errors in any touched file.
- Backfill script: compiles clean under `tsc --noEmit`; static review confirms every `generatePlaybookInstance`/`computeDispatchReadiness` call in the script passes an explicit `getTenantPrismaForOrg` client, never relying on request headers.

## Deviations from plan

None — plan executed exactly as written, including the DRY optional-`tenantPrisma` refactor of `generatePlaybookInstance`/`fireEvent`/`computeDispatchReadiness`, and the recompute-readiness path (not the direct-isDispatchReady-set alternative) in the backfill script.

## Not done (explicitly out of scope per plan)

- `trips.ts` server enforcement (still reads `User.isDispatchReady`, kept coherent via `computeDispatchReadiness` — Task 2's auto-start + Task 3's backfill are what keep it correct; untouched per plan instruction).
- Running the backfill script against the live DB — command is documented; execution is the user's call.
- No schema/migration change. No push, no deploy — commits only.

## Files changed

- `apps/web/src/server/services/workflows/deriveDriverReadiness.ts` (new)
- `apps/web/src/server/services/workflows/__tests__/deriveDriverReadiness.test.ts` (new)
- `apps/web/src/server/api/routers/workflows/instance.ts`
- `apps/web/src/server/services/workflows/generatePlaybookInstance.ts`
- `apps/web/src/server/services/workflows/fireEvent.ts`
- `apps/web/src/server/services/workflows/seedStarterPlaybooks.ts`
- `apps/web/src/server/services/workflows/computeDispatchReadiness.ts`
- `apps/web/src/app/api/auth/accept-invitation/route.ts`
- `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`
- `apps/web/src/server/api/routers/workflows/__tests__/seed.test.ts`
- `apps/web/scripts/backfill-driver-onboarding-instances.ts` (new)

## Commits

- `df46f3f6` fix(quick-497): derive getDriverReadiness from live step instances
- `45c423a8` fix(quick-497): auto-start wiring for CDL Driver Onboarding
- `a7f451f6` fix(quick-497): backfill script for existing stuck drivers

## Self-Check: PASSED

- `apps/web/src/server/services/workflows/deriveDriverReadiness.ts` — FOUND
- `apps/web/src/server/services/workflows/__tests__/deriveDriverReadiness.test.ts` — FOUND
- `apps/web/scripts/backfill-driver-onboarding-instances.ts` — FOUND
- Commit `df46f3f6` — FOUND
- Commit `45c423a8` — FOUND
- Commit `a7f451f6` — FOUND
