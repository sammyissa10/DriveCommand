# Phase 45: Workflow Engine 4 — Automation — Research

**Researched:** 2026-04-24
**Domain:** tRPC trigger router, fireEvent service, PlaybookTrigger Prisma model, dispatch enforcement, notification channels
**Confidence:** HIGH — all findings verified against actual codebase files

---

## Summary

Phase 45 adds the automation layer on top of three completed workflow phases (Foundation, Execution, Inspection Mode). The schema has no `PlaybookTrigger` model yet — this is the only net-new DB object required. All other workflow models (`StepTemplate`, `Playbook`, `PlaybookStep`, `PlaybookInstance`, `StepInstance`, `PlaybookNotification`) exist and are in production. The `fireEvent` service and `recipes.ts` constants file do not exist yet; they are new files that Phase 45 must create.

Five lifecycle hooks are already marked with `TODO(phase-44)` comments at their call sites — three in owner server actions (`drivers.ts`, `trucks.ts`, `customers.ts`) and one in `completeStep.ts`. The carrier-world driver and truck creation paths (`/api/v1/carrier/fleet/drivers` and `/api/v1/carrier/fleet/trucks`) do NOT have TODOs placed yet, meaning those two attachment points must also be wired. The dispatch status transition pathway in `lib/carrier/dispatches.ts` → `transitionDispatchStatus()` is the correct place to attach `ON_DISPATCH_DEPART` (when status transitions to `in_progress`) and `ON_DISPATCH_DELIVER` (when status transitions to `completed`). Dispatch creation in `createDispatch()` is the `ON_DISPATCH_CREATE` attachment point.

The notification layer has push fully wired (`sendPushToUser`, `sendPushToOrg`) and email services exist but SMS has no implementation — it is explicitly deferred to Phase 5 via `TODO(phase-5)` comments in `stepInstance.ts` and `failInspectionItem.ts`. The dispatch enforcement block must be introduced at the `NewDispatchForm` component (`src/components/carrier/dispatches/NewDispatchForm.tsx`) and at the API layer in `createDispatch()`. No `DispatchOverrideAudit` model exists in the schema — Phase 45 must introduce one. The checklists automation page (`/checklists/automation`) does not exist yet and must be created.

**Primary recommendation:** Create `PlaybookTrigger` migration, `fireEvent.ts` service, `recipes.ts` constants, and `trigger.ts` tRPC router as the first four tasks. Then wire all six lifecycle hooks. Then build the automation page and dispatch enforcement modal last.

---

## Current State of Each Deliverable

| Deliverable | Status | Notes |
|-------------|--------|-------|
| `PlaybookTrigger` model (Prisma) | NOT EXISTS | Must be migrated |
| `TriggerEvent` enum (Prisma) | NOT EXISTS | 7 values per spec Section 5.1 |
| `fireEvent.ts` service | NOT EXISTS | New file needed |
| `recipes.ts` constants | NOT EXISTS | New file needed |
| `trigger.ts` tRPC router | NOT EXISTS | Must be added to workflows router index |
| `/checklists/automation` page | NOT EXISTS | New Next.js page needed |
| Dispatch enforcement modal | NOT EXISTS | Logic must go in `NewDispatchForm.tsx` + API |
| `DispatchOverrideAudit` model | NOT EXISTS | Must be added to migration |
| Owner actions fireEvent TODOs | EXISTS | 3 TODOs in drivers.ts, trucks.ts, customers.ts |
| Carrier fleet driver fireEvent hook | NOT MARKED | `/api/v1/carrier/fleet/drivers POST` needs wiring |
| Carrier fleet truck fireEvent hook | NOT MARKED | `/api/v1/carrier/fleet/trucks POST` needs wiring |
| Dispatch create/depart/deliver hooks | NOT MARKED | `createDispatch()`, `transitionDispatchStatus()` in `lib/carrier/dispatches.ts` |
| `playbookCategorySchema` — VEHICLE_INSPECTION | NOT SYNCED | Enum exists in DB but NOT in `packages/validation/src/workflows/enums.ts` |
| Push notification infrastructure | EXISTS | `sendPushToUser`, `sendPushToOrg` fully wired |
| SMS infrastructure | NOT EXISTS | Deferred to Phase 5 per existing TODOs |
| Email infrastructure | EXISTS | Nodemailer/Gmail, but not wired to workflow notifications |

---

## Architecture Patterns

### Pattern 1: Existing Service Layer Convention

All workflow services live in `apps/web/src/server/services/workflows/`. They are pure functions imported into tRPC routers. No HTTP concerns in services.

```
apps/web/src/server/services/workflows/
  generatePlaybookInstance.ts   ✓ exists
  computeDispatchReadiness.ts   ✓ exists
  completeStep.ts               ✓ exists
  failInspectionItem.ts         ✓ exists
  skipStep.ts                   ✓ exists
  playbookStepService.ts        ✓ exists
  seedStarterPlaybooks.ts       ✓ exists
  fireEvent.ts                  ✗ NEEDS CREATING
  recipes.ts                    ✗ NEEDS CREATING
```

### Pattern 2: Existing tRPC Router Convention

Routers live in `apps/web/src/server/api/routers/workflows/`. All procedures use `router`, `adminProcedure`, or `tenantMemberProcedure` from `@/server/api/trpc`. They are merged in `index.ts` and mounted in `root.ts` under the `workflows` namespace.

```typescript
// Pattern — existing router registration (index.ts):
export const workflowsRouter = router({
  stepTemplate: stepTemplateRouter,
  playbook: playbookRouter,
  instance: instanceRouter,
  stepInstance: stepInstanceRouter,
  trigger: triggerRouter,   // ← Phase 45 adds this
});
```

### Pattern 3: Existing tRPC Middleware

- `adminProcedure` — requires OWNER or MANAGER role
- `tenantMemberProcedure` — any authenticated tenant user

The `trigger.listRecipes` and `trigger.enableRecipe`/`disableRecipe` procedures should use `adminProcedure`. The `trigger.fire` procedure is server-side only and should not be exposed as a tRPC procedure callable from the client — `fireEvent()` is called directly from lifecycle hooks.

### Pattern 4: Existing Prisma Transaction Convention

Services use `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`; ... }, TX_OPTIONS)` for bypassing RLS. Import `TX_OPTIONS` from `@/lib/db/prisma`.

### Pattern 5: Existing after() Pattern for Side Effects

Async side effects after HTTP response use `after()` from `next/server`:

```typescript
// Source: apps/web/src/lib/carrier/dispatches.ts
import { after } from 'next/server';
after(() => sendDispatchAssignedNotification(orgId, dispatch.id, data.primaryDriverId));
```

`fireEvent()` calls in the carrier dispatch create/transition flows should use `after()` to avoid blocking the HTTP response.

### Pattern 6: Validation Schemas in packages/validation

Zod schemas for new tRPC inputs go in `packages/validation/src/workflows/`. Create a new file `packages/validation/src/workflows/trigger.ts` and export from `packages/validation/src/workflows/index.ts`.

---

## Critical Codebase Findings

### Finding 1: `PlaybookTrigger` Not in Schema

The spec defines `PlaybookTrigger` in Section 5.2. Confirmed not present in `apps/web/prisma/schema.prisma`. The migration must:
1. Add `TriggerEvent` enum (7 values: `ON_DRIVER_CREATE`, `ON_VEHICLE_CREATE`, `ON_DISPATCH_CREATE`, `ON_DISPATCH_DEPART`, `ON_DISPATCH_DELIVER`, `ON_PARTNER_CREATE`, `MANUAL_ONLY`, `RECURRING`)
2. Add `PlaybookTrigger` table with `(tenantId, triggerEvent)` composite index
3. Add `DispatchOverrideAudit` table (new — not in spec but required by spec's audit trail mandate)
4. Add relation `PlaybookTrigger[]` on `Playbook` model
5. Add relation `PlaybookTrigger[]` on `Tenant` model

### Finding 2: `VEHICLE_INSPECTION` Not in Validation Enum

`PlaybookCategory` in `apps/web/prisma/schema.prisma` has `VEHICLE_INSPECTION` (added in Phase 44 migration). But `playbookCategorySchema` in `packages/validation/src/workflows/enums.ts` does NOT include `VEHICLE_INSPECTION`. Phase 45 must add it:

```typescript
// packages/validation/src/workflows/enums.ts — current (missing value):
export const playbookCategorySchema = z.enum([
  'ONBOARDING', 'SAFETY', 'OPERATIONS', 'COMPLIANCE', 'PARTNER', 'CUSTOM',
  // VEHICLE_INSPECTION IS MISSING
]);
```

### Finding 3: Existing fireEvent TODO Locations

| File | Line | TODO |
|------|------|------|
| `src/app/(owner)/actions/drivers.ts` | 107 | `TODO(phase-44): fireEvent('ON_DRIVER_CREATE', invitation, tenantId)` |
| `src/app/(owner)/actions/trucks.ts` | 114 | `TODO(phase-44): fireEvent('ON_VEHICLE_CREATE', truck, tenantId)` |
| `src/app/(owner)/actions/customers.ts` | 59 | `TODO(phase-44): fireEvent('ON_PARTNER_CREATE', customer, tenantId)` |
| `src/server/services/workflows/completeStep.ts` | 82 | `TODO(phase-44): fireEvent('STEP_COMPLETE', stepInstance, tenantId)` |

Note: The `completeStep.ts` TODO references `STEP_COMPLETE` which is NOT a real TriggerEvent — `completeStep` triggering a fireEvent was likely an early draft idea not in the final spec. Do NOT wire `STEP_COMPLETE`. Only wire the 6 real TriggerEvents from spec Section 6.5.

### Finding 4: Carrier-World Lifecycle Hooks NOT Marked

The carrier operations system uses separate models (`CarrierDriver`, `CarrierTruck`, `CarrierDispatch`). These are the routes that need lifecycle hooks added:

| Event | File | Function |
|-------|------|----------|
| `ON_DRIVER_CREATE` (carrier path) | `src/app/api/v1/carrier/fleet/drivers/route.ts` | POST handler → calls `createCarrierDriver()` |
| `ON_VEHICLE_CREATE` (carrier path) | `src/app/api/v1/carrier/fleet/trucks/route.ts` | POST handler → calls `createCarrierTruck()` |
| `ON_DISPATCH_CREATE` | `src/lib/carrier/dispatches.ts` | `createDispatch()` |
| `ON_DISPATCH_DEPART` | `src/lib/carrier/dispatches.ts` | `transitionDispatchStatus()` when `newStatus === 'in_progress'` |
| `ON_DISPATCH_DELIVER` | `src/lib/carrier/dispatches.ts` | `transitionDispatchStatus()` when `newStatus === 'completed'` |
| `ON_PARTNER_CREATE` | `src/app/(owner)/actions/customers.ts` | `createCustomer()` — TODO already present |
| `ON_DRIVER_CREATE` (legacy path) | `src/app/(owner)/actions/drivers.ts` | `inviteDriver()` — TODO already present (NOTE: this is an invitation, not a user; see Open Questions) |
| `ON_VEHICLE_CREATE` (legacy path) | `src/app/(owner)/actions/trucks.ts` | `createTruck()` — TODO already present |

The carrier system uses `CarrierDriver.orgId` (not `tenantId`) and `CarrierTruck.orgId` for tenant scoping. The `fireEvent` service must accept the org ID as `tenantId` and handle both `User.tenantId` and `CarrierDriver.orgId` contexts, since both map to the same tenant.

**Important:** The carrier driver entity (`CarrierDriver`) uses `id` as the entity identifier, not `User.id`. When firing `ON_DRIVER_CREATE` for carrier drivers, `entityData.id` must be the `CarrierDriver.id`.

### Finding 5: Dispatch Enforcement Integration Point

The `NewDispatchForm.tsx` component (`src/components/carrier/dispatches/NewDispatchForm.tsx`) is a client component that POSTs to `/api/v1/carrier/dispatches`. The enforcement flow requires:

1. **Before submit:** Fetch `isDispatchReady` for the selected driver (`CarrierDriver.userId` → `User.isDispatchReady`) and selected truck (`CarrierTruck` — no current `isDispatchReady` field; uses the workflow system's `PlaybookInstance` aggregation on `Truck.isDispatchReady`)
2. **If not ready:** Show a modal "This driver/truck has incomplete required steps. View checklist or override."
3. **Override path:** Require admin role check + reason text → POST to new endpoint or include `overrideReason` in dispatch create body
4. **Audit:** Log to `DispatchOverrideAudit` table

**Key complexity:** `CarrierDriver` links to `User` via `userId`. `User.isDispatchReady` is already computed by the workflow system. For trucks, the workflow system tracks `Truck.isDispatchReady` (the original `Truck` model, not `CarrierTruck`). The dispatch enforcement check must query `User.isDispatchReady` for the driver and `Truck.isDispatchReady` for the truck (where the truck ID mapping from `CarrierTruck` to `Truck` may not exist — see Open Questions).

### Finding 6: Notification Channels Available

| Channel | Implementation | Status |
|---------|---------------|--------|
| PUSH | `sendPushToUser()` in `src/lib/notifications/send-push.ts` | FULLY WIRED |
| SMS | None — no Twilio or SMS provider exists | NOT IMPLEMENTED (Phase 5) |
| EMAIL | Nodemailer/Gmail in `src/lib/email/` | EXISTS but not wired to workflow notifs |
| IN_APP | `createNotification()` in `src/lib/carrier/in-app-notifications.ts` | EXISTS for carrier module |

Phase 45 spec requires "full notification suite across all types and channels." Given SMS is explicitly deferred to Phase 5 via existing TODOs, and email is not yet wired to workflows, Phase 45 should:
- Wire PUSH for all 7 notification types (already partially done for STEP_ASSIGNED, STEP_FAILED, APPROVAL_NEEDED, DISPATCH_READY)
- Wire EMAIL for INSTANCE_BLOCKED (admin >48h old per spec Section 10)
- Leave SMS as TODO(phase-5) — consistent with existing code pattern
- Consider IN_APP for admin notifications (non-critical per spec Section 10)

### Finding 7: `recipes.ts` — All 7 Recipes Must Be Constants

The recipe library must be defined as constants (not DB records) in `recipes.ts`. Each recipe maps to a `PlaybookTrigger` that gets created when `enableRecipe` is called. The 7 recipes per spec Section 11:

| Recipe Key | TriggerEvent | Condition |
|-----------|-------------|-----------|
| `cdl_driver_onboarding` | `ON_DRIVER_CREATE` | `{ driverType: 'CDL' }` |
| `non_cdl_driver_onboarding` | `ON_DRIVER_CREATE` | `{ driverType: 'NON_CDL' }` |
| `owner_op_onboarding` | `ON_DRIVER_CREATE` | `{ driverType: 'OWNER_OP' }` |
| `pre_trip_inspection` | `ON_DISPATCH_CREATE` | `{}` (no condition) |
| `post_trip_inspection` | `ON_DISPATCH_DELIVER` | `{}` (no condition) |
| `new_vehicle_intake` | `ON_VEHICLE_CREATE` | `{}` (no condition) |
| `partner_onboarding` | `ON_PARTNER_CREATE` | `{}` (no condition) |

Each recipe also needs a `playbookId` field — the tenant admin selects which Playbook to run when the recipe fires. This means `enableRecipe` takes `{ recipeKey, playbookId }`.

---

## Standard Stack (No New Dependencies)

No new npm packages are needed. All required infrastructure exists:

| Need | Existing Solution |
|------|------------------|
| Push notifications | `expo-server-sdk` via `sendPushToUser()` |
| Database | Prisma 7 + existing `prisma` client |
| tRPC | Existing `router`, `adminProcedure`, `tenantMemberProcedure` |
| Auth | `getSession()` from `@/lib/auth/supabase` |
| Validation | Zod in `packages/validation` |
| Email (optional workflow notifs) | `@/lib/email/` (Nodemailer/Gmail) |
| In-app notifications | `createNotification()` from `@/lib/carrier/in-app-notifications` |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Condition evaluation | Custom expression engine | Simple flat key-value equality check (spec explicitly bans more complex logic) |
| Transaction safety | Manual rollback | `prisma.$transaction()` with `TX_OPTIONS` |
| Push delivery | Raw FCM/APNs calls | `sendPushToUser()` which handles Expo SDK chunking |
| SMS | New Twilio client | Leave as `TODO(phase-5)` — consistent with existing codebase pattern |
| Role checks | Manual role validation | `adminProcedure` and `tenantMemberProcedure` from `@/server/api/trpc` |

**Key insight:** The spec is explicit — condition evaluation is "flat key-value equality match. No expression language, no JSONLogic, no regex." Implementing anything more complex violates spec scope.

---

## Common Pitfalls

### Pitfall 1: Dual Lifecycle Paths (Owner vs Carrier)

**What goes wrong:** Wiring `fireEvent` only in the owner server actions (`drivers.ts`, `trucks.ts`) and missing the carrier-world API routes (`/api/v1/carrier/fleet/drivers`, `/api/v1/carrier/fleet/trucks`). Tenants using the carrier module to add drivers would never trigger automation.

**How to avoid:** Wire hooks in BOTH paths. The owner `inviteDriver()` and carrier `createCarrierDriver()` are separate code paths for the same business event. Both must fire `ON_DRIVER_CREATE`.

**Warning sign:** Testing only with the owner portal driver invite — carrier portal driver creation is a different route.

### Pitfall 2: Wrong Entity ID in fireEvent for Carrier Entities

**What goes wrong:** Passing `CarrierDriver.id` as `entityId` when the workflow system's `PlaybookInstance.entityId` is expected to reference a `User.id` (the entity the checklist is attached to).

**Root cause:** The workflow spec uses `EntityType.DRIVER` with `entityId = User.id`, but `CarrierDriver` is a separate model with its own UUID. The two are linked via `CarrierDriver.userId`.

**How to avoid:** For `ON_DRIVER_CREATE` fired from carrier driver creation, use `CarrierDriver.userId` as `entityData.id` if the driver has a linked User, otherwise the checklist cannot attach to a User. Consider logging a warning and skipping if `userId` is null.

### Pitfall 3: `disableRecipe` Must Not Affect Running Instances

**What goes wrong:** When a recipe is disabled, deleting or cancelling existing `PlaybookInstance` records that were spawned by that recipe.

**How to avoid:** `disableRecipe` sets `PlaybookTrigger.isActive = false` only. No instance mutation. Verify with the Phase 4 test: "Disabling a recipe stops future spawns, existing instances untouched."

### Pitfall 4: `VEHICLE_INSPECTION` Missing from Validation Enum

**What goes wrong:** Creating a Playbook with `category: 'VEHICLE_INSPECTION'` fails Zod validation because the validation package enum doesn't include it.

**How to avoid:** Add `VEHICLE_INSPECTION` to `playbookCategorySchema` in `packages/validation/src/workflows/enums.ts` as part of Phase 45 (this is a Phase 44 gap that must be fixed here).

### Pitfall 5: fireEvent Transaction Scope

**What goes wrong:** Calling `fireEvent()` inside the same DB transaction as the triggering mutation. If `generatePlaybookInstance()` inside `fireEvent()` fails, it could roll back the entire driver/truck creation.

**How to avoid:** Per spec Section 6.5, use `after()` (from `next/server`) for the carrier routes — this runs after the HTTP response is sent and outside any transaction. For the owner server actions (which are not HTTP handlers), call `fireEvent()` after the main mutation but outside any transaction scope, as a best-effort post-commit action.

### Pitfall 6: Dispatch Enforcement — `CarrierTruck` vs `Truck`

**What goes wrong:** `CarrierTruck` is a separate model from `Truck`. The workflow system's `isDispatchReady` is on `Truck`, not `CarrierTruck`. When enforcing dispatch block for a truck selected in `NewDispatchForm`, the truck ID is a `CarrierTruck.id` — there's no FK linking `CarrierTruck` to `Truck`.

**How to avoid:** For Phase 45, the dispatch enforcement check should check `User.isDispatchReady` for the driver (since `CarrierDriver.userId → User.isDispatchReady` exists). For the truck, either skip truck-level enforcement if no `Truck` record is linked, or surface a UI-only readiness badge without a hard block. Document this gap in tech-debt. The spec focuses on driver readiness enforcement primarily.

---

## Code Examples

### fireEvent Service (Pattern to Follow)

```typescript
// Source: spec Section 6.5 + existing service patterns
// apps/web/src/server/services/workflows/fireEvent.ts

import { prisma } from '@/lib/db/prisma';
import { generatePlaybookInstance } from './generatePlaybookInstance';
import type { PlaybookEntityType, TriggerEvent } from '@/generated/prisma';

const EVENT_TO_ENTITY_TYPE: Record<string, PlaybookEntityType> = {
  ON_DRIVER_CREATE: 'DRIVER',
  ON_VEHICLE_CREATE: 'VEHICLE',
  ON_DISPATCH_CREATE: 'DISPATCH',
  ON_DISPATCH_DEPART: 'DISPATCH',
  ON_DISPATCH_DELIVER: 'DISPATCH',
  ON_PARTNER_CREATE: 'PARTNER',
};

export async function fireEvent(args: {
  event: TriggerEvent;
  entityData: Record<string, unknown>;
  tenantId: string;
}): Promise<void> {
  const { event, entityData, tenantId } = args;

  const triggers = await prisma.playbookTrigger.findMany({
    where: { tenantId, triggerEvent: event, isActive: true },
  });

  for (const trigger of triggers) {
    // Flat key-value equality match — spec Section 4.4: "No expression language, no JSONLogic, no regex"
    const conditions = (trigger.conditions ?? {}) as Record<string, unknown>;
    const matches = Object.entries(conditions).every(
      ([key, value]) => entityData[key] === value
    );
    if (!matches) continue;

    const entityType = EVENT_TO_ENTITY_TYPE[event];
    if (!entityType) continue;

    try {
      await generatePlaybookInstance({
        playbookId: trigger.playbookId,
        entityType,
        entityId: String(entityData.id),
        tenantId,
        triggeredBy: 'trigger',
      });
    } catch (err) {
      // Best-effort — a failed instance generation must not block the triggering lifecycle event
      console.error('[fireEvent] generatePlaybookInstance failed', { event, triggerId: trigger.id, err });
    }
  }
}
```

### enableRecipe tRPC Procedure (Pattern to Follow)

```typescript
// apps/web/src/server/api/routers/workflows/trigger.ts
const enableRecipe = adminProcedure
  .input(z.object({ recipeKey: z.string(), playbookId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const recipe = RECIPES.find((r) => r.key === input.recipeKey);
    if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found' });

    // Upsert: one active trigger per (tenantId, triggerEvent, playbookId)
    const existing = await prisma.playbookTrigger.findFirst({
      where: { tenantId: ctx.tenantId, triggerEvent: recipe.triggerEvent, playbookId: input.playbookId },
    });

    if (existing) {
      return prisma.playbookTrigger.update({
        where: { id: existing.id },
        data: { isActive: true, conditions: recipe.conditions ?? null },
      });
    }

    return prisma.playbookTrigger.create({
      data: {
        tenantId: ctx.tenantId,
        playbookId: input.playbookId,
        triggerEvent: recipe.triggerEvent,
        conditions: recipe.conditions ?? null,
        isActive: true,
      },
    });
  });
```

### Dispatch Hook Pattern (after() for async side effects)

```typescript
// Source: existing pattern in apps/web/src/lib/carrier/dispatches.ts
import { after } from 'next/server';
import { fireEvent } from '@/server/services/workflows/fireEvent';

// Inside createDispatch(), after prisma.carrierDispatch.create():
after(() =>
  fireEvent({ event: 'ON_DISPATCH_CREATE', entityData: { id: dispatch.id, ...dispatch }, tenantId: orgId })
    .catch((err) => logger.error('[createDispatch] fireEvent failed', err))
);
```

### DispatchOverrideAudit Schema Addition (Prisma)

```prisma
model DispatchOverrideAudit {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  dispatchId  String   @db.Uuid         // CarrierDispatch.id
  userId      String   @db.Uuid         // Admin who approved the override
  reason      String
  entityType  String                     // "DRIVER" | "VEHICLE"
  entityId    String   @db.Uuid
  createdAt   DateTime @default(now()) @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([dispatchId])
}
```

### Automation Page Route

The automation page goes at `apps/web/src/app/(owner)/checklists/automation/page.tsx` per spec Section 8.4 and the module boundary diagram (Section 4.5). It contains:
- Recipe cards with toggle (enabled/disabled pill) and playbook-selector dropdown
- Custom Rules table with Event → Condition → Playbook → Status → Edit/Delete

---

## Testing Strategy (Phase 4 per Spec Section 15)

Required tests per spec Section 15 Phase 4:
1. `fireEvent` matches condition, skips mismatch
2. Disabling a recipe stops future spawns, leaves existing instances untouched
3. Override audit record written with reason + userId
4. Dispatch creation blocked for non-ready driver without override

Test files should follow the existing pattern in `apps/web/src/__tests__/workflows-*.test.ts`.

---

## Open Questions

1. **Owner `inviteDriver()` vs User creation — when does `ON_DRIVER_CREATE` fire?**
   - What we know: The TODO in `drivers.ts` fires on `DriverInvitation` creation (line 107), not on User creation. The invitation entity ID is the invitation record, not a `User.id`.
   - What's unclear: Should `ON_DRIVER_CREATE` fire on invitation creation (before the driver accepts) or on invitation acceptance (when the User record is created)?
   - Recommendation: Fire on invitation creation is incorrect because the driver entity doesn't exist yet. The correct attachment point for the owner path is `apps/web/src/app/api/auth/accept-invitation/route.ts` — when a new User is created upon invite acceptance. Alternatively, change the owner path to fire on User creation with `entityId = user.id`. This needs a decision before planning.

2. **CarrierTruck isDispatchReady — how to enforce truck-level blocking?**
   - What we know: `Truck` (owner module) has `isDispatchReady`. `CarrierTruck` (carrier module) does not. The dispatch enforcement uses `CarrierTruck.id` in `NewDispatchForm`.
   - What's unclear: Is there a mapping from `CarrierTruck` to `Truck`?
   - Recommendation: For Phase 45, enforce driver readiness only (check `CarrierDriver.userId → User.isDispatchReady`). Document truck enforcement as Phase 6 tech-debt. This matches spec emphasis on driver blocking.

3. **`VEHICLE_INSPECTION` in `playbookCategorySchema`**
   - What we know: Missing from the validation Zod enum.
   - Recommendation: Fix this in Phase 45 task 1 (the migration/schema task). It is a Phase 44 gap.

---

## Sources

### Primary (HIGH confidence — directly read from codebase)
- `apps/web/prisma/schema.prisma` — confirmed PlaybookTrigger not present, confirmed all other workflow models exist, confirmed `isDispatchReady` on `User` and `Truck`
- `apps/web/prisma/migrations/` — confirmed Phase 42/43/44 migrations completed, no trigger migration exists
- `apps/web/src/server/services/workflows/` — confirmed all 7 service files, confirmed fireEvent.ts and recipes.ts do NOT exist
- `apps/web/src/server/api/routers/workflows/index.ts` — confirmed trigger router NOT mounted
- `apps/web/src/app/(owner)/actions/drivers.ts` — confirmed TODO at line 107
- `apps/web/src/app/(owner)/actions/trucks.ts` — confirmed TODO at line 114
- `apps/web/src/app/(owner)/actions/customers.ts` — confirmed TODO at line 59
- `apps/web/src/server/services/workflows/completeStep.ts` — confirmed STEP_COMPLETE TODO (non-spec)
- `apps/web/src/lib/carrier/dispatches.ts` — confirmed createDispatch and transitionDispatchStatus, no fireEvent hooks
- `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` — confirmed no TODO
- `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` — confirmed no TODO
- `apps/web/src/lib/notifications/send-push.ts` — confirmed push fully wired
- `packages/validation/src/workflows/enums.ts` — confirmed VEHICLE_INSPECTION missing from playbookCategorySchema
- `docs/specs/DriveCommand_Workflow_Engine_v2.md` — authoritative spec for all decisions

---

## Metadata

**Confidence breakdown:**
- What exists vs doesn't exist: HIGH — directly verified from files
- fireEvent service design: HIGH — follows established service patterns + spec Section 6.5
- Dispatch enforcement integration point: HIGH — `NewDispatchForm.tsx` + `createDispatch()` verified
- Notification channel scope (SMS skip): HIGH — existing TODO(phase-5) comments confirm intent
- Owner vs carrier lifecycle hook ambiguity: MEDIUM — the driver invitation timing question needs human decision

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable domain, no external dependencies)
