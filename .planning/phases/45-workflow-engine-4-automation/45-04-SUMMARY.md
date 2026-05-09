---
phase: 45-workflow-engine-4-automation
plan: "04"
subsystem: api
tags: [workflow-engine, automation, trigger, trpc, lifecycle-hooks, recipes, typescript]

# Dependency graph
requires:
  - phase: 45-01
    provides: PlaybookTrigger table with TriggerEvent enum
  - phase: 45-02
    provides: fireEvent() service + RECIPES constants + getRecipeByKey()
provides:
  - tRPC trigger router: listRecipes, enableRecipe, disableRecipe (admin-only)
  - enableRecipeSchema + disableRecipeSchema Zod schemas in @drivecommand/validation
  - 8 lifecycle attachment points wired via fireEvent
  - All 4 phase-44 TODOs removed
affects: [45-05, 45-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "trigger router pattern: adminProcedure only, no fire procedure exposed, conditions matched via JSON.stringify client-side"
    - "after() pattern for carrier fleet routes: HTTP response not blocked by automation"
    - "disableRecipe: findMany + client-side condition filter + updateMany(id: { in: [] }) — avoids Prisma JSON equality limitations"

key-files:
  created:
    - packages/validation/src/workflows/trigger.ts
    - apps/web/src/server/api/routers/workflows/trigger.ts
  modified:
    - packages/validation/src/workflows/index.ts
    - apps/web/src/server/api/routers/workflows/index.ts
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/(owner)/actions/trucks.ts
    - apps/web/src/app/(owner)/actions/customers.ts
    - apps/web/src/server/services/workflows/completeStep.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    - apps/web/src/lib/carrier/dispatches.ts

key-decisions:
  - "DriverInvitation has no driverType field — ON_DRIVER_CREATE fires with id+email only; CDL/NON_CDL/OWNER_OP recipe conditions will not match from the owner invite flow until driverType is added to DriverInvitation schema (research Open Question 1, deferred to Phase 46)"
  - "disableRecipe uses findMany + client-side JSON.stringify filter instead of Prisma updateMany with JSON conditions — avoids Prisma's unreliable JSONB equality filter"
  - "listRecipes uses Promise.all with async map — countInstancesForPlaybook called per recipe for active play count"
  - "Carrier status literals confirmed lowercase: 'in_progress', 'completed' — match existing transitionDispatchStatus state machine"

# Metrics
duration: 11min
completed: 2026-04-24
---

# Phase 45 Plan 04: tRPC Trigger Router + 8 Lifecycle Hook Attachment Points Summary

**tRPC trigger router (listRecipes/enableRecipe/disableRecipe) mounted, 8 fireEvent attachment points wired across 3 owner server actions + 2 carrier fleet routes + 3 dispatch lifecycle transitions**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-24T19:51:32Z
- **Completed:** 2026-04-24T20:02:09Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Created `packages/validation/src/workflows/trigger.ts` with `enableRecipeSchema` + `disableRecipeSchema`
- Created `apps/web/src/server/api/routers/workflows/trigger.ts` — 3 admin-only tRPC procedures:
  - `listRecipes`: loads all active PlaybookTrigger rows for tenant, matches to RECIPES via JSON.stringify, returns per-recipe enabled state + play count
  - `enableRecipe`: upserts PlaybookTrigger (reactivate if exists, create if new) linked to tenant's chosen playbook
  - `disableRecipe`: findMany matching by triggerEvent + client-side JSON condition filter → updateMany(isActive: false); never touches PlaybookInstance rows
- Mounted `trigger: triggerRouter` in `workflows/index.ts` — Plan 05 UI can call `workflows.trigger.*`
- Wired 3 owner-portal hooks:
  - `inviteDriver` → `ON_DRIVER_CREATE` after `DriverInvitation.create()`
  - `createTruck` → `ON_VEHICLE_CREATE` after `prisma.truck.create()`
  - `createCustomer` → `ON_PARTNER_CREATE` after `prisma.customer.create()`
- Removed bogus `STEP_COMPLETE` TODO from `completeStep.ts` (STEP_COMPLETE is not a TriggerEvent per spec Section 5.1)
- Wired 5 carrier-world hooks:
  - `carrier/fleet/drivers` POST → `ON_DRIVER_CREATE` via `after()` (prefers `userId` over `CarrierDriver.id`)
  - `carrier/fleet/trucks` POST → `ON_VEHICLE_CREATE` via `after()`
  - `createDispatch()` → `ON_DISPATCH_CREATE` via `after()`
  - `transitionDispatchStatus()` planned→in_progress → `ON_DISPATCH_DEPART` via `after()`
  - `transitionDispatchStatus()` in_progress→completed → `ON_DISPATCH_DELIVER` via `after()`

## Trigger Router Endpoint Signatures

```typescript
// All procedures are admin-only (OWNER or MANAGER role required)
workflows.trigger.listRecipes()          // query — returns Recipe[] with { enabled, playbookId, playbookName, activeCount }
workflows.trigger.enableRecipe({ recipeKey: string, playbookId: UUID })   // mutation
workflows.trigger.disableRecipe({ recipeKey: string })                     // mutation — returns { disabled: number }
```

## 8 Hook Locations with File and Position

| # | Event | File | Position |
|---|-------|------|----------|
| 1 | ON_DRIVER_CREATE | apps/web/src/app/(owner)/actions/drivers.ts | After `prisma.driverInvitation.create()` |
| 2 | ON_VEHICLE_CREATE | apps/web/src/app/(owner)/actions/trucks.ts | After `prisma.truck.create()` |
| 3 | ON_PARTNER_CREATE | apps/web/src/app/(owner)/actions/customers.ts | After `prisma.customer.create()` |
| 4 | ON_DRIVER_CREATE | apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts | `after()` after `createCarrierDriver()` |
| 5 | ON_VEHICLE_CREATE | apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts | `after()` after `createCarrierTruck()` |
| 6 | ON_DISPATCH_CREATE | apps/web/src/lib/carrier/dispatches.ts (createDispatch) | `after()` after dispatch + stops created |
| 7 | ON_DISPATCH_DEPART | apps/web/src/lib/carrier/dispatches.ts (transitionDispatchStatus) | `after()` in planned→in_progress branch |
| 8 | ON_DISPATCH_DELIVER | apps/web/src/lib/carrier/dispatches.ts (transitionDispatchStatus) | `after()` in in_progress→completed branch |

## Task Commits

1. **Task 1: trigger router + schemas + mount** - `b903f62` (feat)
2. **Task 2: owner-portal hooks + STEP_COMPLETE removal** - `4eeb5e9` (feat)
3. **Task 3: carrier-world hooks** - `4135440` (feat)

## Decision: Invitation vs User Timing for ON_DRIVER_CREATE

The owner portal fires `ON_DRIVER_CREATE` at **invitation creation** (not user creation). This matches the location of the original TODO in `drivers.ts`. However, `DriverInvitation` has no `driverType` field, meaning the CDL/NON_CDL/OWNER_OP recipe conditions will not match. Only "blanket" triggers (no conditions) will activate from the owner invite path.

Resolution options for Phase 46:
1. Add `driverType` to `DriverInvitation` model
2. Move the hook to `/api/auth/accept-invitation/route.ts` where the User record is created (User model may have more fields)
3. Pass `driverType` from the invite form into entityData after adding it to the invitation schema

## Decision: Carrier Status Literals

Confirmed status string literals in `transitionDispatchStatus` are lowercase (`'in_progress'`, `'completed'`). No deviation from plan needed — plan already used lowercase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2783 duplicate `id` key in spread**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** `{ id: truck.id, ...truck }` and `{ id: customer.id, ...customer }` spread objects that already contain `id` — TypeScript error TS2783
- **Fix:** Flipped to `{ ...truck, id: truck.id }` and `{ ...customer, id: customer.id }` so the explicit `id` takes precedence
- **Files modified:** actions/trucks.ts, actions/customers.ts
- **Commit:** 4eeb5e9

**2. [Rule 1 - Bug] Simplified listRecipes — removed invalid Prisma _count subselect**
- **Found during:** Task 1
- **Issue:** Plan's template used `_count: { select: { playbook: { select: { instances: true } } } }` which is not valid Prisma syntax (PlaybookTrigger has no direct instances relation)
- **Fix:** Used separate `countInstancesForPlaybook()` helper that counts `PlaybookInstance` rows by `playbookId + tenantId`
- **Files modified:** trigger.ts
- **Commit:** b903f62

**3. [Rule 4 resolved at Rule 1] disableRecipe condition matching**
- **Found during:** Task 1
- **Issue:** Plan noted Prisma JSON equality might not support deep matching via `updateMany`
- **Fix:** Applied the findMany → client-side filter → updateMany pattern the plan suggested as fallback
- **Files modified:** trigger.ts
- **Commit:** b903f62

**4. [Rule 2 - Missing functionality] DriverInvitation has no driverType**
- **Found during:** Task 2 investigation
- **Decision:** Fire event with id+email only; document limitation; defer driverType addition to Phase 46
- **Impact:** CDL/NON_CDL/OWNER_OP recipe conditions will not match from owner invite flow; only unconditioned triggers will activate

## Self-Check: PASSED

- FOUND: packages/validation/src/workflows/trigger.ts
- FOUND: apps/web/src/server/api/routers/workflows/trigger.ts
- FOUND: trigger: triggerRouter in workflows/index.ts
- FOUND: export * from './trigger' in validation workflows/index.ts
- fireEvent in drivers.ts: 3 references (import + 1 call + 1 error log)
- fireEvent in trucks.ts: 3 references
- fireEvent in customers.ts: 3 references
- fireEvent in carrier/fleet/drivers/route.ts: 3 references
- fireEvent in carrier/fleet/trucks/route.ts: 3 references
- fireEvent in dispatches.ts: 7 references (import + 3 calls + 3 error logs)
- Zero phase-44 TODOs remaining
- STEP_COMPLETE: no fireEvent call, only explanatory comment
- TypeScript: passes (only pre-existing [stopId]/messages error unrelated to this plan)
- Task commits: b903f62, 4eeb5e9, 4135440 — all verified via git log

---
*Phase: 45-workflow-engine-4-automation*
*Completed: 2026-04-24*
