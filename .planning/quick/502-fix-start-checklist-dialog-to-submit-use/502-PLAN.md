---
phase: quick-502
plan: 502
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx
  - apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.ts
  - apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.test.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
  - apps/web/scripts/backfill-driver-onboarding-instances.ts
autonomous: true

must_haves:
  truths:
    - "Selecting a driver in Start Checklist submits the linked User.id (not CarrierDriver.id), so generate succeeds"
    - "A driver whose invite is not accepted (userId null) is shown but cannot be selected"
    - "A failed generate now surfaces a destructive toast with the server message"
    - "Creating a carrier driver with no linked User never fires ON_DRIVER_CREATE against a non-existent entity"
    - "The backfill script supports a --dry preview and reports skipped-no-user counts"
  artifacts:
    - path: "apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.ts"
      provides: "Pure driver-option mapper (userId -> value, null -> disabled sentinel)"
    - path: "apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.test.ts"
      provides: "Vitest coverage for both mapping branches"
    - path: "apps/web/scripts/backfill-driver-onboarding-instances.ts"
      provides: "Idempotent backfill with --dry and per-driver summary"
  key_links:
    - from: "StartChecklistDialog DRIVER option"
      to: "trpc.workflows.instance.generate"
      via: "entityId = d.userId"
      pattern: "d\\.userId"
    - from: "fleet drivers POST after() fireEvent"
      to: "ON_DRIVER_CREATE"
      via: "skip when userId null, else id = userId"
      pattern: "carrierDriver\\.userId"
---

<objective>
Fix the one broken leg in the driver workflow-readiness loop: `StartChecklistDialog` submits a `CarrierDriver.id` where the backend contract requires a `User.id`. Also harden the auto-start fire site, surface generate errors to the user, and extend the existing quick-497 backfill script.

Purpose: The readiness loop (verifyEntity -> PlaybookInstance.entityId -> computeDispatchReadiness -> User.isDispatchReady -> trips.ts gate) is internally consistent on User.id. The dialog is the only place still sending CarrierDriver.id, which fails `verifyEntity`. The fire site swallows a "Driver not found" when userId is null, and the backfill script (already created by quick-497 but never run) lacks a dry-run and no-user accounting.

Output: Corrected dialog option mapping + disabled pending drivers + error toast; hardened fire site; extended backfill script; a small Vitest on the extracted mapper.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx
@apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
@apps/web/scripts/backfill-driver-onboarding-instances.ts
</context>

<hard_constraints>
- Do NOT modify: generatePlaybookInstance.ts / verifyEntity, computeDispatchReadiness.ts, trips.ts, schema.prisma, fleet-drivers list/create logic, or anything from tasks 498-501.
- Do NOT change the User-keyed backend contract (entityId stays User.id for DRIVER).
- Do NOT run the backfill script — produce/repair it only. Typecheck it, never execute it.
- No emoji in UI copy. Use a plain hyphen: "Invite pending - driver must accept before onboarding".
- `tsc --noEmit` is NOT sufficient. The executor MUST run `next build` from `apps/web/` before declaring done. tsc has ~35 pre-existing baseline errors — only regressions in touched files or a build failure count.
- Executor commits atomically but does NOT push and does NOT run vercel. Orchestrator handles the single final push/deploy decision.
</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Fix DRIVER option mapping (extract pure helper) + generate error toast in StartChecklistDialog</name>
  <files>
    apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.ts
    apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.test.ts
    apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx
  </files>
  <action>
**Change 1 — DRIVER option mapping (dialog lines ~66-77).**

Create a new pure exported helper `apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.ts`:
- Export a type `DriverOption = { id: string; label: string; disabled: boolean }`.
- Export `mapDriverOptions(drivers)` taking an array of `{ id: string; userId?: string | null; firstName?: string; lastName?: string; name?: string }` and returning `DriverOption[]`.
- For a driver WITH `userId`: `{ id: d.userId, label: <name>, disabled: false }` where `<name>` uses the existing logic `(d.name ?? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()) || d.userId`.
- For a driver with `userId == null` (invite not accepted): `{ id: `pending:${d.id}`, label: '<name> — Invite pending - driver must accept before onboarding', disabled: true }`. Use a plain hyphen (NO emoji). The `pending:${d.id}` sentinel is stable, unique, and can never collide with a real User.id.
  - Keep the visible label as the driver name; put the "Invite pending - driver must accept before onboarding" as hint text. Simplest: the option `label` is the driver name and the disabled `<SelectItem>` renders an additional muted hint line — OR encode both into label. Prefer: return `label` = name, and add a separate `hint?: string` field on `DriverOption` for the pending message so the component can render name + muted hint. Adjust the type to `{ id: string; label: string; disabled: boolean; hint?: string }`.

Update `StartChecklistDialog.tsx`:
- The local `EntityOption` type (line ~29) must accommodate `disabled` + optional `hint`. Reuse the exported `DriverOption` type for the DRIVER path, or widen `EntityOption` to `{ id: string; label: string; disabled?: boolean; hint?: string }`.
- In the DRIVER fetch branch (~line 71), replace the inline `.map(...)` with `setEntityOptions(mapDriverOptions(drivers))`. The fleet payload already includes `userId` per driver (Prisma `include`), so no API change is needed.
- In the entity `<SelectContent>` render (~lines 227-231), render each option as `<SelectItem key={opt.id} value={opt.id} disabled={opt.disabled}>` with the label, and when `opt.hint` is present render a muted hint (e.g. a `<span className="text-xs text-muted-foreground">`). Radix enforces disabled items are unselectable; the sentinel value guarantees it can never be submitted as a real User.id. VEHICLE/PARTNER branches stay `{ id, label }` (disabled defaults false/undefined) — ensure they still type-check against the widened type.

**Change 2 — generate mutation onError toast (dialog ~lines 104-113).**

- Add `import { toast } from 'sonner';` (confirm sonner import style used elsewhere in the app).
- Add an `onError` callback to `trpc.workflows.instance.generate.mutationOptions({ ... })` alongside the existing `onSuccess`: `onError: (error) => { toast.error(error.message ?? 'Failed to start checklist'); }`.
- Keep the existing inline error `<p>` (lines ~238-242) but change its class from `text-xs` to `text-sm` (`text-sm text-destructive`).

**Test — mapDriverOptions.test.ts (Vitest):**
Create `apps/web/src/app/(owner)/checklists/_components/mapDriverOptions.test.ts` asserting:
- A driver `{ id: 'cd1', userId: 'user-abc', name: 'Marcus' }` maps to `{ id: 'user-abc', disabled: false }` (label 'Marcus').
- A driver `{ id: 'cd2', userId: null, name: 'Jane' }` maps to a disabled option whose `id` is NOT a real userId (starts with `pending:`) and whose hint/label contains 'Invite pending - driver must accept before onboarding'.
Do NOT build any test harness for the backfill script.
  </action>
  <verify>
    Grep confirms `mapDriverOptions(drivers)` used in the DRIVER branch and option value is `d.userId` inside the helper. Grep confirms `toast.error` in an `onError`, and the inline error `<p>` uses `text-sm`. Run the Vitest for mapDriverOptions (e.g. `npx vitest run mapDriverOptions` from apps/web) — 2 cases pass.
  </verify>
  <done>
    DRIVER options submit User.id; pending (userId null) drivers render disabled with the plain-hyphen hint and cannot be selected; generate failures toast; inline error is text-sm; mapDriverOptions unit test passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Harden ON_DRIVER_CREATE fire site to skip when userId is null</name>
  <files>apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts</files>
  <action>
In the POST handler's `after(async () => { ... fireEvent(...) })` block (~lines 76-92):
- Currently `entityData.id = carrierDriver.userId ?? carrierDriver.id`. Remove the `?? carrierDriver.id` fallback.
- When `carrierDriver.userId` is null/undefined: SKIP the `fireEvent` entirely and log via the existing `logger` at info/debug, e.g. `logger.info('[carrier/fleet/drivers] skipping ON_DRIVER_CREATE — driver not yet linked to a User; invite acceptance will fire it', { driverId: carrierDriver.id })`. Return early from the after() body.
- When `carrierDriver.userId` is present: call `fireEvent` with `id: carrierDriver.userId` (never the CarrierDriver.id).
- Keep the surrounding `after()`, the try/catch + `logger.error`, `recordActivationEvent`, and `revalidatePath('/onboarding/welcome')` behavior fully intact.
- Do NOT touch the invite-acceptance fire path (quick-497) elsewhere — that remains the creation path for pending drivers.
  </action>
  <verify>
    Grep confirms no `?? carrierDriver.id` remains at the fire site and that a `userId` null-guard/skip log precedes the `fireEvent` call. `next build` (Task 3 gate) type-checks the file.
  </verify>
  <done>
    Creating a carrier driver with no linked User logs a skip and never fires ON_DRIVER_CREATE against a non-existent entity; a linked driver fires with User.id.
  </done>
</task>

<task type="auto">
  <name>Task 3: Extend backfill script with --dry and no-user accounting, then run next build gate</name>
  <files>apps/web/scripts/backfill-driver-onboarding-instances.ts</files>
  <action>
The script ALREADY EXISTS from quick-497 and mostly matches the spec (per-tenant seed via seedStarterPlaybooks, trigger-if-absent, generatePlaybookInstance path, CONFLICT-as-skip, computeDispatchReadiness recompute, per-tenant summary). EXTEND it — do NOT rewrite or duplicate:

1. **--dry flag:** Parse `const isDry = process.argv.includes('--dry');`. In dry mode:
   - Skip the `seedStarterPlaybooks(tenant.id)` WRITE and skip the trigger `.create(...)` write and skip both `generatePlaybookInstance` and `computeDispatchReadiness` calls.
   - Still perform all READ queries (playbook lookup, trigger existence check, carrierDriver findMany, user role check, existing-instance check) to produce an accurate preview.
   - Print, per tenant and per driver, what WOULD be created: e.g. `[DRY][tenant] WOULD create instance: playbook='CDL Driver Onboarding' userId=<id> driver=<name>` and `[DRY][tenant] WOULD seed trigger` when the trigger is absent.
   - Note: the current script resolves the playbook AFTER seeding. In dry mode, if the CDL playbook does not yet exist for a tenant (never seeded), print `[DRY][tenant] WOULD seed CDL Driver Onboarding playbook + trigger` and skip that tenant's driver preview (can't resolve playbook id without seeding) — do not error.
   - Print a leading banner `[backfill-driver-onboarding] DRY RUN — no writes` at start.

2. **skipped-no-user accounting:** Add `skippedNoUser: number` to `TenantSummary` and the totals reducer. Increment it for each `CarrierDriver` where `userId` is null (the current findMany filters `userId: { not: null }` — either widen the query to include null and count them, or run a separate lightweight `count` of `userId: null, deletedAt: null` carrier drivers per tenant to populate this number). Prefer a separate count query to avoid changing the existing processing loop's filter.

3. **Per-driver summary detail:** The final summary already prints tenant/trigger/instance/error counts. Add the new `Skipped (no linked user): <n>` line to both the per-tenant console line and the totals block. Keep all existing output.

4. Keep the file's header comment accurate — add a one-line note that quick-502 added `--dry` and no-user accounting.

Do NOT change generatePlaybookInstance / computeDispatchReadiness / seedStarterPlaybooks call signatures. Keep `getTenantPrismaForOrg(orgId)` header-less client usage. Do NOT run the script.

**Build gate (whole plan):** From `apps/web/`, run `next build`. It must pass. Also typecheck the script is included in the build's type pass (it lives under apps/web). Only regressions in touched files or a build failure count against baseline (~35 pre-existing tsc errors are fine).
  </action>
  <verify>
    Read the script back: `--dry` parsed; dry mode skips all writes but runs reads; `skippedNoUser` in TenantSummary + totals + printed. Run `next build` from apps/web — passes with no new errors in touched files. Do NOT execute the backfill script.
  </verify>
  <done>
    Backfill script supports `--dry` (accurate preview, zero writes) and reports skipped-no-user counts per tenant and in totals; `next build` passes.
  </done>
</task>

</tasks>

<verification>
- `next build` from apps/web passes (authoritative gate — tsc alone is insufficient).
- Grep: dialog DRIVER option value derives from `d.userId`; disabled handling for null userId present with plain-hyphen "Invite pending - driver must accept before onboarding"; `onError` toast added; inline error is `text-sm`.
- Grep: fire site skips when userId null; no `?? carrierDriver.id` fallback remains at that site.
- Vitest for mapDriverOptions passes (2 cases).
- Reason through: Marcus (userId set) -> submits User.id -> generate succeeds; a pending driver is unselectable; a generate failure toasts.
</verification>

<success_criteria>
- DRIVER selection submits User.id; pending drivers disabled and unselectable.
- Generate errors surface as a destructive toast; inline error text-sm.
- ON_DRIVER_CREATE never fires with a non-User id; null-userId create logs a skip.
- Backfill script has --dry preview + skipped-no-user accounting, idempotent, not executed.
- `next build` green; atomic commit made; no push, no vercel.
</success_criteria>

<output>
After completion, create `.planning/quick/502-fix-start-checklist-dialog-to-submit-use/502-SUMMARY.md`
</output>
