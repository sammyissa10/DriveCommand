---
phase: 45-workflow-engine-4-automation
plan: "05"
subsystem: web-ui
tags: [workflow-engine, automation, recipes, dispatch-enforcement, override-audit, trpc, typescript]

# Dependency graph
requires:
  - phase: 45-01
    provides: PlaybookTrigger table + DispatchOverrideAudit table + TriggerEvent enum
  - phase: 45-02
    provides: RECIPES constants + fireEvent service
  - phase: 45-04
    provides: tRPC trigger router (listRecipes/enableRecipe/disableRecipe)
provides:
  - /checklists/automation page (Auto-Start Rules) with 7 recipe cards + custom rules table
  - tRPC trigger router: +listCustomRules, +createCustomRule, +deleteRule
  - tRPC instance router: +getDriverReadiness (by CarrierDriver.id)
  - Dispatch enforcement modal with admin override + DispatchOverrideAudit write
  - 409 DRIVER_NOT_DISPATCH_READY and 403 OVERRIDE_REQUIRES_ADMIN error codes
affects: [45-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "conditions stored as JSON string in createCustomRuleSchema to avoid Zod v4 deep type inference blowup"
    - "TS2589 workaround: useMutation<any, Error, any> with mutationOptions() as any for procedures in large tRPC routers"
    - "userRole passed from server component page.tsx -> DispatchList -> NewDispatchForm for admin gate"
    - "getDriverReadiness resolves CarrierDriver.id -> User.userId -> User.isDispatchReady in single tRPC query"

key-files:
  created:
    - apps/web/src/app/(owner)/checklists/automation/page.tsx
    - apps/web/src/app/(owner)/checklists/automation/_components/AutomationClient.tsx
    - apps/web/src/app/(owner)/checklists/automation/_components/RecipeCard.tsx
    - apps/web/src/app/(owner)/checklists/automation/_components/CustomRulesTable.tsx
    - apps/web/src/app/(owner)/checklists/automation/_components/CreateCustomRuleDialog.tsx
  modified:
    - packages/validation/src/workflows/trigger.ts
    - apps/web/src/server/api/routers/workflows/trigger.ts
    - apps/web/src/server/api/routers/workflows/instance.ts
    - apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
    - apps/web/src/components/carrier/dispatches/DispatchList.tsx
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/app/api/v1/carrier/dispatches/route.ts
    - apps/web/src/app/(owner)/carrier/dispatches/page.tsx

key-decisions:
  - "Conditions stored as JSON string in createCustomRuleSchema — Zod v4 z.record(z.string(), z.any()) creates deeply recursive types that exceed TypeScript's inference limit in tRPC router chains; using z.string().default('{}') + JSON.parse on server avoids this"
  - "TS2589 in RecipeCard and CreateCustomRuleDialog resolved by using useMutation<any, Error, any> with mutationOptions() as any — this is the correct workaround for large tRPC routers where TypeScript cannot infer the full procedure type chain"
  - "Truck-level enforcement (CarrierTruck.isDispatchReady) NOT implemented — Phase 6 tech-debt per research Open Question 2; CarrierTruck has no FK to Truck model"
  - "getDriverReadiness joins CarrierDriver -> User -> PlaybookInstance -> StepInstance in a single tRPC query; returns both isReady flag and blockerStepNames for the modal UI"
  - "ADMIN_ROLES for override: OWNER and MANAGER only (matches server-side check using UserRole enum)"

# Metrics
duration: ~18min
completed: 2026-04-24
---

# Phase 45 Plan 05: Auto-Start Rules Page + Dispatch Enforcement Summary

**Auto-Start Rules page (/checklists/automation) with 7 recipe cards + custom rules table + 3-step creation modal; dispatch creation blocks non-ready drivers with admin override flow writing DispatchOverrideAudit rows**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-24T20:06:52Z
- **Completed:** 2026-04-24T20:24:40Z
- **Tasks:** 2 (Task 3 = human checkpoint — not executed)
- **Files modified:** 13

## Accomplishments

### Task 1: Auto-Start Rules Page + Recipe Cards + Custom Rules

**New route:** `/checklists/automation` — server component shell + `AutomationClient` client component

**AutomationClient** — two-section layout:
- Section 1: "Recipes" — 7 recipe cards in a responsive grid (1/2/3 columns)
- Section 2: "Custom Rules" — table + "Create Custom Rule" button

**RecipeCard** — per-recipe client component:
- Toggle switch + Playbook `<Select>` dropdown + "Active X times" counter
- Dropdown filtered by `suggestedCategory` (falls back to all playbooks if no match)
- Toggle ON requires a playbook selected; switch disabled if no playbook chosen
- Calls `enableRecipe`/`disableRecipe` mutations with imperative side-effects (TS2589 workaround)

**CustomRulesTable** — native HTML table (no shadcn `<Table>` — not installed):
- Columns: When | For which records | Checklist | Status | Actions
- `formatConditions()` helper: `{}` → "All", `{driverType: 'CDL'}` → "driverType = CDL"
- Delete button opens `<AlertDialog>` confirmation

**CreateCustomRuleDialog** — 3-step modal:
- Step 1: native radio inputs for 6 trigger events
- Step 2: `driverType` selector for ON_DRIVER_CREATE; "All records" text + optional key=value condition builder for others
- Step 3: Playbook picker
- Conditions serialized as JSON string before sending to tRPC (schema type workaround)

**tRPC trigger router additions:**
- `listCustomRules` — returns non-recipe triggers (conditions don't match any RECIPES entry) with playbook name
- `createCustomRule` — validates playbookId ownership, parses conditions JSON, creates PlaybookTrigger
- `deleteRule` — verifies ownership + hard-deletes PlaybookTrigger

**Validation schema additions (`packages/validation/src/workflows/trigger.ts`):**
- `createCustomRuleSchema` — playbookId + triggerEvent enum + conditions (string, JSON-encoded)
- `deleteRuleSchema` — triggerId UUID
- Package rebuilt to update dist

### Task 2: Dispatch Enforcement — Block Non-Ready Drivers + Admin Override + Audit

**NewDispatchForm.tsx** — complete rewrite with enforcement:
- `getDriverReadiness` tRPC query fires when `primaryDriverId` changes
- Readiness badge: green "Dispatch Ready" / red "Blocked — N open steps" below the driver dropdown
- On submit: if driver is not ready, blocking dialog opens instead of fetching API

**Blocking dialog:**
- Title: "This driver has incomplete required steps"
- Body: list of open blocker step names (from `blockerStepNames` in readiness payload)
- "View Checklist" button → navigates to `/checklists/instances/[openInstanceId]`
- "Override" button: visible only when `userRole` is in `['OWNER', 'MANAGER']`
- Override flow: "Override" click reveals textarea; submit disabled until reason non-empty
- Submit override → includes `overrideReason + overrideForEntityType='DRIVER' + overrideForEntityId`

**DispatchList.tsx:** Added `userRole?: string` prop, forwarded to `NewDispatchForm`

**dispatches/page.tsx (server component):** Passes `session.role` to `DispatchList`

**createDispatch() server-side:**
- Fetches `User.isDispatchReady` via CarrierDriver.userId
- Throws `DRIVER_NOT_DISPATCH_READY` if not ready and no override reason
- Verifies current user role is OWNER or MANAGER before allowing override
- Writes `DispatchOverrideAudit` row after `prisma.carrierDispatch.create()` when override provided

**API route (dispatches POST):**
- Schema extended: `overrideReason`, `overrideForEntityType: z.literal('DRIVER')`, `overrideForEntityId`
- Passes `currentUserId: session.userId` to `createDispatch()`
- 409 → `DRIVER_NOT_DISPATCH_READY` with human-readable message
- 403 → `OVERRIDE_REQUIRES_ADMIN`

**instance router addition:**
- `getDriverReadiness(carrierDriverId)` → joins CarrierDriver → User.isDispatchReady → PlaybookInstance.stepInstances where isDispatchBlocker=true → returns `{ isReady, blockerStepNames, openInstanceId, userId }`

## Naming Compliance (spec Section 3)

- No `PlaybookTrigger`, `StepInstance`, `StepTemplate`, `PlaybookInstance` in any rendered JSX text
- User-facing names: "Auto-Start Rules", "Recipe", "Checklist", "Step" used throughout

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Auto-Start Rules page + custom rules tRPC procedures | db792c4 | automation/page.tsx, 4 _components, trigger.ts, validation/trigger.ts |
| 2 | Dispatch enforcement — block non-ready drivers + admin override + audit | 2340c89 | NewDispatchForm.tsx, dispatches.ts, instance.ts, route.ts |

## Tech Debt

- **Truck-level enforcement** — `CarrierTruck` has no `isDispatchReady` field and no FK to `Truck`. Phase 6 responsibility. Currently shows no badge for trucks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn `<Table>` and `<RadioGroup>` components not installed**
- **Found during:** Task 1 TypeScript check
- **Issue:** Plan referenced `@/components/ui/table` and `@/components/ui/radio-group` — neither is installed in the web app
- **Fix:** Replaced `<Table>` with native `<table>` HTML + Tailwind styling; replaced `<RadioGroup>/<RadioGroupItem>` with native `<input type="radio">` wrapped in `<label>` elements
- **Files modified:** CustomRulesTable.tsx, CreateCustomRuleDialog.tsx

**2. [Rule 1 - Bug] Zod v4 `z.record(z.string(), z.unknown())` causes TS2589 deep type instantiation**
- **Found during:** Task 1 TypeScript check
- **Issue:** Adding `createCustomRuleSchema` with `conditions: z.record(z.string(), z.any()).default({})` to the trigger router made TypeScript's inference chain exceed the depth limit. The error surfaced as TS2589 on `enableRecipe` mutation in RecipeCard.
- **Fix:** Changed conditions schema to `z.string().default('{}')` (JSON string); parse on server with `JSON.parse`. Added `useMutation<any, Error, any>` workaround for the remaining TS2589 in `RecipeCard` and `CreateCustomRuleDialog`.
- **Files modified:** packages/validation/src/workflows/trigger.ts, RecipeCard.tsx, CreateCustomRuleDialog.tsx

**3. [Rule 1 - Bug] UserRole enum comparison — `'owner'` vs `'OWNER'`**
- **Found during:** Task 2 TypeScript check
- **Issue:** Plan's template used `role !== 'owner' && role !== 'admin'` — but `UserRole` enum in this codebase uses `OWNER` and `MANAGER` (not lowercase). TypeScript caught the type mismatch.
- **Fix:** Changed to `role !== 'OWNER' && role !== 'MANAGER'` in both server-side check (`dispatches.ts`) and client-side gate (`ADMIN_ROLES` constant in NewDispatchForm.tsx)
- **Files modified:** dispatches.ts, NewDispatchForm.tsx

**4. [Rule 2 - Missing functionality] `userRole` not threaded to `NewDispatchForm`**
- **Found during:** Task 2 implementation
- **Issue:** Plan focused on `NewDispatchForm` but didn't account for the fact that the form is nested inside `DispatchList` (client component) which is rendered by a server component page. The role was available in the session on the page but not passed down.
- **Fix:** Added `userRole?: string` prop to `DispatchList`, thread from `dispatches/page.tsx` via `session.role`
- **Files modified:** DispatchList.tsx, dispatches/page.tsx

## Self-Check: PASSED

- FOUND: apps/web/src/app/(owner)/checklists/automation/page.tsx
- FOUND: apps/web/src/app/(owner)/checklists/automation/_components/AutomationClient.tsx
- FOUND: apps/web/src/app/(owner)/checklists/automation/_components/RecipeCard.tsx
- FOUND: apps/web/src/app/(owner)/checklists/automation/_components/CustomRulesTable.tsx
- FOUND: apps/web/src/app/(owner)/checklists/automation/_components/CreateCustomRuleDialog.tsx
- trigger router procedures: listCustomRules, createCustomRule, deleteRule — verified in trigger.ts
- instance router: getDriverReadiness — verified in instance.ts
- createDispatch(): DRIVER_NOT_DISPATCH_READY + OVERRIDE_REQUIRES_ADMIN guards — verified
- DispatchOverrideAudit.create() after prisma.carrierDispatch.create() — verified
- API route: 409 + 403 handlers — verified
- TypeScript: passes (only pre-existing [stopId]/messages unrelated error)
- Naming lint: zero PlaybookTrigger/StepInstance/StepTemplate/PlaybookInstance in JSX text
- Task commits: db792c4, 2340c89 — both verified via git log

---
*Phase: 45-workflow-engine-4-automation*
*Completed (Tasks 1-2): 2026-04-24*
*Task 3 (human checkpoint): pending user verification*
