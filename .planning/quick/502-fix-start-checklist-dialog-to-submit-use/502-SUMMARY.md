# Quick-502: Fix Start Checklist dialog to submit User.id — Summary

**One-liner:** `StartChecklistDialog`'s DRIVER picker now submits `User.id` (via a pure `mapDriverOptions` helper) instead of `CarrierDriver.id`, pending (unlinked) drivers render disabled with a hint, generate failures toast, the `ON_DRIVER_CREATE` fire site no longer falls back to `CarrierDriver.id`, and the quick-497 backfill script gained a `--dry` preview + no-linked-user accounting.

## What was broken

1. **Dialog submitted the wrong id.** The DRIVER entity picker in `StartChecklistDialog` mapped options as `{ id: d.id, label }` — `d.id` is `CarrierDriver.id`. The workflow backend contract (`verifyEntity` / `generatePlaybookInstance`) keys DRIVER `entityId` on `User.id` only, so selecting any driver and clicking "Start Checklist" failed `verifyEntity` server-side.
2. **No visibility for pending drivers.** A carrier driver whose invite hadn't been accepted yet (`userId == null`) was shown as a normal, selectable option — selecting it would submit a `CarrierDriver.id` that could never resolve to a `User`.
3. **Silent failure.** `generateMutation`'s error only rendered a barely-visible inline `text-xs` message; no toast, easy to miss.
4. **Fire site fallback.** The `ON_DRIVER_CREATE` fire site in the fleet-drivers POST route had `id: carrierDriver.userId ?? carrierDriver.id` — for a driver created with no linked User yet, this fired the event with a `CarrierDriver.id` masquerading as an entity id, which `verifyEntity` would reject or (worse) silently mismatch.
5. **Backfill script had no preview.** The quick-497 backfill script (never yet run against a live DB) had no dry-run mode and didn't report how many carrier drivers were skipped for having no linked User.

## What changed (4 commits)

### Task 1 — `3ced3494` — Dialog option mapping + error toast
- New pure helper `apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.ts`: a linked driver (`userId` set) maps to `{ id: userId, label, disabled: false }`; an unlinked driver maps to `{ id: 'pending:<CarrierDriver.id>', label, disabled: true, hint: 'Invite pending - driver must accept before onboarding' }` (plain hyphen, no emoji). The `pending:` sentinel can never collide with a real `User.id` and Radix `Select` enforces it's unselectable via `disabled`.
- `StartChecklistDialog.tsx`: DRIVER fetch branch now calls `setEntityOptions(mapDriverOptions(drivers))`; `EntityOption` widened to `{ id; label; disabled?; hint? }` (VEHICLE/PARTNER unaffected — `disabled`/`hint` simply undefined for them); `<SelectItem disabled={opt.disabled}>` renders the label plus a muted `text-xs` hint line when present.
- Added `mapDriverOptions.test.ts` (Vitest, 2 cases: linked → `User.id`/enabled; pending → `pending:` sentinel/disabled/hint).
- Inline mutation-error `<p>` bumped from `text-xs` to `text-sm`.
- **Deviation (Rule 3 — blocking issue):** the new co-located test file didn't match any of `vitest.config.ts`'s three `include` globs (`tests/**`, `src/__tests__/**`, `src/**/__tests__/**`), so it was silently skipped ("No test files found"). Widened `include` to also match `src/**/*.test.ts`. Verified no other stray `*.test.ts` files exist outside the existing conventions, so this is additive only.

### Task 2 — `6b34b5e3` — Fire-site hardening
- `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`: removed the `?? carrierDriver.id` fallback in the `after()` `fireEvent` call. When `carrierDriver.userId` is null, the handler now logs `logger.info(...)` and returns early — `ON_DRIVER_CREATE` is never fired against a non-existent/wrong entity for a driver whose invite hasn't been accepted. Invite acceptance (quick-497's fire point) remains the creation path for those drivers. The surrounding `after()`, try/catch + `logger.error`, `recordActivationEvent`, and `revalidatePath` behavior are untouched.

### Task 3 — `9f28c03a` + `2cbf1e79` — Build-gate fix + backfill script extension
- **`9f28c03a` (deviation, Rule 1 — bug fix):** the initial `onError` callback placed inline inside `trpc.workflows.instance.generate.mutationOptions({...})` caused `next build`'s TypeScript pass to fail with "Type instantiation is excessively deep and possibly infinite" (and, once explicitly typed, a real structural mismatch against `TRPCClientErrorLike<...>`). Moved `onError` to the second argument of `generateMutation.mutate(data, { onError })` instead — the same pattern already used elsewhere in this codebase (`StepDetailEditor.tsx`). `mutationOptions()` keeps only `onSuccess`.
- **`2cbf1e79`:** extended (did not rewrite) `apps/web/scripts/backfill-driver-onboarding-instances.ts`:
  - `--dry` flag: skips the `seedStarterPlaybooks` write, the trigger `.create()` write, `generatePlaybookInstance`, and `computeDispatchReadiness` — all read queries (playbook lookup, trigger existence, carrierDriver findMany, user role check, existing-instance check) still run. Prints a leading `DRY RUN — no writes` banner, per-tenant `WOULD seed CDL Driver Onboarding playbook + trigger` (when the playbook was never seeded — skips that tenant's driver preview since the playbook id can't be resolved without seeding, not an error), `WOULD seed trigger`, and per-driver `WOULD create instance: playbook='CDL Driver Onboarding' userId=<id> driver=<name>` lines.
  - `skippedNoUser`: a separate lightweight `tenantPrisma.carrierDriver.count({ where: { orgId, userId: null, deletedAt: null } })` per tenant (the main processing loop's `userId: { not: null }` filter was left untouched, per plan instruction) — added to `TenantSummary`, the totals reducer, the per-tenant console line, and the totals block as `Skipped (no linked user): <n>`.
  - Header comment updated with a one-line quick-502 note and the new `--dry` run command.
  - **The script was NOT executed** — only extended and verified via `next build`'s type-check pass, per the hard constraint.

## Verification results

- `next build` from `apps/web` — **green** (Turbopack build compiled, `runAfterProductionCompile` completed, TypeScript pass passed with 0 errors). This is the authoritative gate per plan instructions (tsc alone would have missed the mutationOptions type-instantiation failure, which only surfaced under the real build's TypeScript pass).
- `npx vitest run mapDriverOptions` — **2/2 pass** (after the `vitest.config.ts` include-glob fix).
- Grep confirms:
  - `mapDriverOptions.ts`: DRIVER option value derives from `d.userId` (linked branch: `{ id: d.userId, ... }`).
  - `StartChecklistDialog.tsx`: `mapDriverOptions(drivers)` wired into the DRIVER fetch branch; `onError` present at the `mutate()` call site with `toast.error(...)`; inline mutation error is `text-sm text-destructive`.
  - `route.ts`: no `?? carrierDriver.id` remains at the fire site; `if (!carrierDriver.userId)` guard precedes the `fireEvent` call and logs a skip; the `fireEvent` call itself uses `id: carrierDriver.userId` only.
- Reasoned through the acceptance scenarios:
  - Marcus (a linked driver, `userId` set) → `mapDriverOptions` returns `{ id: 'user-abc', disabled: false }` → dialog submits `entityId: 'user-abc'` (a real `User.id`) → `verifyEntity` resolves it → `generate` succeeds.
  - A pending driver (`userId` null) → option is `{ id: 'pending:<cd.id>', disabled: true, hint: 'Invite pending - driver must accept before onboarding' }` → Radix `SelectItem disabled` makes it unselectable, so it can never be submitted.
  - A `generate` failure (e.g. entity not found) → `onError` on the `mutate()` call fires `toast.error(error.message ?? 'Failed to start checklist')`, and the existing inline `text-sm text-destructive` message still renders below the form.

## Deviations from plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `vitest.config.ts` include glob didn't match the plan's specified co-located test path**
- **Found during:** Task 1, running the plan's required Vitest verification step.
- **Issue:** `mapDriverOptions.test.ts` sits next to the component (`_components/mapDriverOptions.test.ts`), not under a `__tests__/` directory — vitest's three `include` globs all require a `__tests__` segment, so the new test was silently skipped ("No test files found, exiting with code 1").
- **Fix:** Added `'src/**/*.test.ts'` to `vitest.config.ts`'s `include` array. Confirmed via `find` that no other stray `*.test.ts` files exist outside the pre-existing conventions, so this is purely additive.
- **Files modified:** `apps/web/vitest.config.ts`
- **Commit:** `3ced3494`

**2. [Rule 1 - Bug] `next build` TypeScript failure from inline `onError` in `mutationOptions()`**
- **Found during:** Task 3's build-gate run.
- **Issue:** `onError` placed directly inside `trpc.workflows.instance.generate.mutationOptions({...})` (alongside `onSuccess`) caused TS to fail with "Type instantiation is excessively deep and possibly infinite"; adding an explicit parameter type surfaced the real cause — a structural mismatch against tRPC's `TRPCClientErrorLike<...>` error shape.
- **Fix:** Moved `onError` to `generateMutation.mutate(data, { onError })`'s second argument — mirrors the existing pattern in `StepDetailEditor.tsx` in the same codebase. `mutationOptions()` now only carries `onSuccess`.
- **Files modified:** `apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx`
- **Commit:** `9f28c03a`

## Not done (explicitly out of scope per plan)

- `generatePlaybookInstance.ts`/`verifyEntity`, `computeDispatchReadiness.ts`, `trips.ts`, `schema.prisma`, `fleet-drivers.ts` list/create logic — untouched.
- The backfill script was **not executed** — extended and type-checked only; running it against the live DB remains the user's call.
- No push, no `vercel` — commits only (orchestrator handles the single final push/deploy decision).

## Files changed

- `apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.ts` (new)
- `apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.test.ts` (new)
- `apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx`
- `apps/web/vitest.config.ts`
- `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`
- `apps/web/scripts/backfill-driver-onboarding-instances.ts`

## Commits

- `3ced3494` fix(quick-502): submit User.id from StartChecklistDialog, not CarrierDriver.id
- `6b34b5e3` fix(quick-502): skip ON_DRIVER_CREATE fire when new carrier driver has no linked User
- `9f28c03a` fix(quick-502): move generate onError to mutate() call to avoid TS deep-instantiation
- `2cbf1e79` fix(quick-502): extend backfill script with --dry preview and no-user accounting

## Self-Check: PASSED

- `apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.ts` — FOUND
- `apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.test.ts` — FOUND
- `apps/web/scripts/backfill-driver-onboarding-instances.ts` — FOUND
- Commit `3ced3494` — FOUND
- Commit `6b34b5e3` — FOUND
- Commit `9f28c03a` — FOUND
- Commit `2cbf1e79` — FOUND
