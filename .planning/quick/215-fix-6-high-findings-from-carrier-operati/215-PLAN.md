---
phase: quick-215
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/loads/route.ts
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/lib/carrier/facilities.ts
  - apps/web/src/lib/carrier/expenses.ts
  - apps/web/src/lib/carrier/route-templates.ts
  - apps/web/src/actions/carrier/save-route-template.ts
  - apps/web/src/lib/carrier/stops.ts
autonomous: true
must_haves:
  truths:
    - "A load with rateType 'per_load' (propagated from a contract) is accepted by the loads API Zod schema"
    - "Soft-deleted facilities use an 'active' boolean column, not a facilityType prefix hack"
    - "createExpense rejects FK references belonging to other tenants"
    - "createRouteTemplate (API route) rejects FK references belonging to other tenants"
    - "saveRouteTemplate (server action) rejects FK references belonging to other tenants"
    - "createStop rejects loadId belonging to another tenant"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/loads/route.ts"
      provides: "LoadCreateSchema with per_load in rateType enum"
    - path: "apps/web/src/lib/carrier/expenses.ts"
      provides: "createExpense with FK ownership checks for dispatchId, stopId, driverId"
    - path: "apps/web/src/lib/carrier/route-templates.ts"
      provides: "createRouteTemplate with FK ownership checks for clientId, contractId, defaultDriverId, defaultTruckId"
    - path: "apps/web/src/actions/carrier/save-route-template.ts"
      provides: "saveRouteTemplate with FK ownership checks for clientId, contractId, defaultDriverId, defaultTruckId"
    - path: "apps/web/src/lib/carrier/stops.ts"
      provides: "createStop with FK ownership check for loadId"
  key_links:
    - from: "ContractForm"
      to: "LoadCreateSchema"
      via: "per_load rateType propagation"
      pattern: "per_load"
---

<objective>
Fix all 6 High findings from the Carrier Operations audit (213-REPORT.md).

Two are enum/schema mismatches causing failures on specific inputs. Four are tenant isolation gaps on write actions where FK references are accepted without verifying they belong to the requesting tenant's org.

Purpose: Close security and data integrity gaps before they cause cross-tenant data leaks or silent failures.
Output: 6 targeted fixes across 9 files, plus one Prisma migration for the facility active column.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md
@apps/web/src/app/api/v1/carrier/loads/route.ts
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/lib/carrier/facilities.ts
@apps/web/src/app/api/v1/carrier/facilities/route.ts
@apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts
@apps/web/src/lib/carrier/expenses.ts
@apps/web/src/app/api/v1/carrier/expenses/route.ts
@apps/web/src/lib/carrier/route-templates.ts
@apps/web/src/app/api/v1/carrier/route-templates/route.ts
@apps/web/src/actions/carrier/save-route-template.ts
@apps/web/src/lib/carrier/stops.ts
@apps/web/src/app/api/v1/carrier/stops/route.ts
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix per_load rateType rejected by loads Zod schema (Finding #4)</name>
  <files>
    apps/web/src/app/api/v1/carrier/loads/route.ts
    apps/web/src/components/carrier/loads/LoadForm.tsx
  </files>
  <action>
1. In `apps/web/src/app/api/v1/carrier/loads/route.ts`, update the `LoadCreateSchema` `rateType` z.enum to include `'per_load'`:
   ```
   rateType: z.enum(['per_mile', 'flat', 'per_load', 'per_stop', 'per_cwt', 'per_pallet', 'hourly']).optional(),
   ```
   The value `per_load` is used by the ContractForm's RATE_TYPES list (`['per_mile', 'flat', 'per_load', 'hourly']`) and propagates to loads via contract auto-populate. Without this, a load created from a `per_load` contract is rejected with a 400.

2. In `apps/web/src/components/carrier/loads/LoadForm.tsx`, add a `per_load` option to the rate type `<select>` dropdown. Insert it after the `flat` option:
   ```
   <option value="per_load">Per Load</option>
   ```
   Current options are: per_mile, flat, per_cwt, per_pallet, per_stop, hourly. Add per_load after flat.

3. Also in LoadForm.tsx, add `per_load` to the `RATE_TYPE_LABELS` record:
   ```
   per_load: 'Rate per Load ($)',
   ```
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep for `per_load` in both files to confirm presence.
  </verify>
  <done>The value `per_load` is accepted by the loads API Zod schema and is selectable in the LoadForm dropdown. A load created from a per_load contract will no longer be rejected.</done>
</task>

<task type="auto">
  <name>Task 2: Fix soft-delete facility prefix — app-layer guard (Finding #7)</name>
  <files>
    apps/web/src/lib/carrier/facilities.ts
  </files>
  <action>
The current `softDeleteFacility` corrupts `facilityType` with an `inactive_` prefix (e.g., `inactive_terminal`). The `FacilityUpdateSchema` uses `z.string().optional()` so no Zod rejection occurs, but if a soft-deleted facility is loaded via `getFacility()` and re-saved through PATCH, the corrupted value is round-tripped back into the DB. Fix this purely at the app layer — NO schema or migration changes.

1. In `apps/web/src/lib/carrier/facilities.ts`, update `getFacility()` to exclude soft-deleted facilities:
   ```typescript
   export async function getFacility(orgId: string, id: string) {
     return prisma.carrierFacility.findFirst({
       where: {
         id,
         orgId,
         NOT: { facilityType: { startsWith: 'inactive_' } },
       },
     });
   }
   ```
   This means the GET /api/v1/carrier/facilities/[id] endpoint returns 404 for soft-deleted facilities, preventing the edit form from loading them.

2. In `updateFacility()`, add the same guard so a direct PATCH cannot update a soft-deleted facility:
   ```typescript
   export async function updateFacility(orgId: string, id: string, data: FacilityUpdateInput) {
     const existing = await prisma.carrierFacility.findFirst({
       where: { id, orgId, NOT: { facilityType: { startsWith: 'inactive_' } } },
     });
     if (!existing) return null;
     return prisma.carrierFacility.update({ where: { id }, data });
   }
   ```

These two guards close the broken PATCH path. The soft-delete mechanism itself (prefix convention) is preserved as-is — removing the prefix approach requires an `active` column which is a schema change deferred to a future migration (as documented by the existing comment in the code).
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep `inactive_` in facilities.ts — prefix guard present in both getFacility and updateFacility.
  </verify>
  <done>getFacility() and updateFacility() both exclude soft-deleted facilities (those with inactive_ prefix). The edit form cannot load a soft-deleted facility, and a direct PATCH is rejected with 404. No schema changes required.</done>
</task>

<task type="auto">
  <name>Task 3: Add FK ownership checks to createExpense (Finding #5)</name>
  <files>
    apps/web/src/lib/carrier/expenses.ts
  </files>
  <action>
In `apps/web/src/lib/carrier/expenses.ts`, in the `createExpense` function, add ownership checks BEFORE the `prisma.carrierExpense.create()` call (after the existing loadId check on line 97-103). The loadId check already verifies `orgId` — keep it. Add checks for the other FK references:

1. **dispatchId** (if supplied): Before the existing loadId check, add:
   ```typescript
   if (data.dispatchId) {
     const dispatch = await prisma.carrierDispatch.findFirst({
       where: { id: data.dispatchId, orgId },
       select: { id: true },
     });
     if (!dispatch) {
       return { error: 'Invalid dispatch — does not belong to this organization', status: 400 };
     }
   }
   ```

2. **stopId** (if supplied): The stop's dispatch must belong to this org:
   ```typescript
   if (data.stopId) {
     const stop = await prisma.carrierStop.findFirst({
       where: { id: data.stopId, dispatch: { orgId } },
       select: { id: true },
     });
     if (!stop) {
       return { error: 'Invalid stop — does not belong to this organization', status: 400 };
     }
   }
   ```

3. **driverId** (if supplied):
   ```typescript
   if (data.driverId) {
     const driver = await prisma.carrierDriver.findFirst({
       where: { id: data.driverId, orgId },
       select: { id: true },
     });
     if (!driver) {
       return { error: 'Invalid driver — does not belong to this organization', status: 400 };
     }
   }
   ```

Place all three checks after the existing `if (!data.dispatchId && !data.loadId)` guard (line 91-93) and before the existing loadId check (line 97). Keep the existing loadId ownership check as-is — it already does `findFirst({ where: { id: data.loadId, orgId } })`.

Important: orgId comes from the function parameter (injected by the API route from session.tenantId) — never from the request payload.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep `findFirst.*orgId` in expenses.ts — should show 4 ownership checks (dispatch, load, stop, driver).
  </verify>
  <done>createExpense validates that all FK references (dispatchId, loadId, stopId, driverId) belong to the requesting tenant before creating the expense. Cross-tenant FK linking is blocked with a 400 error.</done>
</task>

<task type="auto">
  <name>Task 4: Add FK ownership checks to createRouteTemplate (Finding #6 + #8)</name>
  <files>
    apps/web/src/lib/carrier/route-templates.ts
    apps/web/src/actions/carrier/save-route-template.ts
  </files>
  <action>
**Part A — API route path (`lib/carrier/route-templates.ts`):**

In `createRouteTemplate`, add ownership checks BEFORE the `prisma.routeTemplate.create()` call (currently at line 223). The function receives `orgId` as its first parameter from the API route.

Add these checks:
```typescript
// Verify clientId belongs to this org
const client = await prisma.carrierClient.findFirst({
  where: { id: data.clientId, orgId },
  select: { id: true },
});
if (!client) {
  throw new Error('Invalid client — does not belong to this organization');
}

// Verify contractId if supplied
if (data.contractId) {
  const contract = await prisma.carrierContract.findFirst({
    where: { id: data.contractId, orgId },
    select: { id: true },
  });
  if (!contract) {
    throw new Error('Invalid contract — does not belong to this organization');
  }
}

// Verify defaultDriverId if supplied
if (data.defaultDriverId) {
  const driver = await prisma.carrierDriver.findFirst({
    where: { id: data.defaultDriverId, orgId },
    select: { id: true },
  });
  if (!driver) {
    throw new Error('Invalid driver — does not belong to this organization');
  }
}

// Verify defaultTruckId if supplied
if (data.defaultTruckId) {
  const truck = await prisma.carrierTruck.findFirst({
    where: { id: data.defaultTruckId, orgId },
    select: { id: true },
  });
  if (!truck) {
    throw new Error('Invalid truck — does not belong to this organization');
  }
}
```

Update the API route (`apps/web/src/app/api/v1/carrier/route-templates/route.ts`) POST handler to catch these errors and return 400 — add a catch block similar to the loads route:
```typescript
if (err instanceof Error && err.message.startsWith('Invalid ')) {
  return NextResponse.json({ error: err.message }, { status: 400 });
}
```

**Part B — Server action path (`actions/carrier/save-route-template.ts`):**

In `saveRouteTemplate`, add the same 4 ownership checks AFTER the required field validation block (after line 76 `if (stops.some(...)`) and BEFORE building the templateData object (line 79). Use the same `prisma.carrierXxx.findFirst({ where: { id, orgId } })` pattern. Return `{ success: false, error: 'Invalid client — does not belong to this organization' }` etc.

The `prisma` import is already present in the server action file. orgId comes from `session.tenantId` (line 42).

IMPORTANT: The `stops.some((s) => !s.facility_id)` guard from task 211 on line 74 MUST remain intact — do not remove or modify it.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep `findFirst.*orgId` in route-templates.ts — should show 4 ownership checks.
    Grep `findFirst.*orgId` in save-route-template.ts — should show 4 ownership checks.
  </verify>
  <done>Both the API route path (createRouteTemplate) and server action path (saveRouteTemplate) validate that clientId, contractId, defaultDriverId, and defaultTruckId all belong to the requesting tenant before creating or updating a route template.</done>
</task>

<task type="auto">
  <name>Task 5: Add FK ownership check for loadId in createStop (Finding #2)</name>
  <files>
    apps/web/src/lib/carrier/stops.ts
  </files>
  <action>
In `apps/web/src/lib/carrier/stops.ts`, in the `createStop` function, add a loadId ownership check AFTER the existing facilityId check (line 101-106) and BEFORE the `prisma.carrierStop.create()` call.

The existing code already checks dispatchId ownership (line 93-98) and facilityId ownership (line 101-106). Add the loadId check:

```typescript
// Verify loadId belongs to this org (if supplied)
if (data.loadId) {
  const load = await prisma.carrierLoad.findFirst({
    where: { id: data.loadId, orgId },
    select: { id: true },
  });
  if (!load) {
    return null;
  }
}
```

Return `null` to match the existing pattern (dispatch not found returns null, facility not found returns null). The API route already maps `null` to a 404 response.

Note: The audit finding also mentions `clientId` lacking ownership verification. However, `clientId` is optional on stops and rarely used directly. If present, add the same pattern:
```typescript
if (data.clientId) {
  const client = await prisma.carrierClient.findFirst({
    where: { id: data.clientId, orgId },
    select: { id: true },
  });
  if (!client) {
    return null;
  }
}
```
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep `findFirst.*orgId` in stops.ts createStop function — should show 4 ownership checks (dispatch, facility, load, client).
  </verify>
  <done>createStop validates that loadId and clientId (if supplied) belong to the requesting tenant, in addition to the existing dispatchId and facilityId checks. Cross-tenant FK linking on stops is fully blocked.</done>
</task>

<task type="auto">
  <name>Task 6: Add FK ownership checks to saveRouteTemplate stop creation (Finding related to #6)</name>
  <files>
    apps/web/src/actions/carrier/save-route-template.ts
  </files>
  <action>
In `apps/web/src/actions/carrier/save-route-template.ts`, the `saveRouteTemplate` function creates RouteTemplateStops with `facilityId` from each stop. Each stop's `facilityId` must be verified to belong to the org.

After the FK ownership checks added in Task 4 (for clientId, contractId, defaultDriverId, defaultTruckId), and AFTER the stops array validation, add a batch facility ownership check for all stops:

```typescript
// Verify all stop facilityIds belong to this org
const facilityIds = [...new Set(stops.map((s) => s.facility_id).filter(Boolean))];
if (facilityIds.length > 0) {
  const validFacilities = await prisma.carrierFacility.findMany({
    where: { id: { in: facilityIds }, orgId },
    select: { id: true },
  });
  const validFacilityIds = new Set(validFacilities.map((f) => f.id));
  const invalidFacility = facilityIds.find((id) => !validFacilityIds.has(id));
  if (invalidFacility) {
    return { success: false, error: 'Invalid facility — does not belong to this organization' };
  }
}
```

This batch check is more efficient than N individual queries. Place it right after the template-level FK checks and before the `templateData` construction.

IMPORTANT: The existing `stops.some((s) => !s.facility_id)` guard (line 74) MUST remain intact — it checks for undefined/null facility_id. The new check verifies ownership of the facility_id values that ARE present.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Grep `carrierFacility.findMany` in save-route-template.ts — should show the batch ownership check.
  </verify>
  <done>All facilityIds in route template stops are verified to belong to the requesting tenant before creation. The existing undefined guard from task 211 remains intact. Cross-tenant facility references in route template stops are blocked.</done>
</task>

</tasks>

<verification>
After all 6 tasks:
1. `cd apps/web && npx tsc --noEmit` passes with no errors
2. `cd apps/web && npx prisma migrate status` shows no pending migrations
3. Grep confirms no remaining `inactive_` prefix logic in facilities.ts (only in comments)
4. All createXxx functions in carrier lib have FK ownership checks using orgId from session
</verification>

<success_criteria>
- per_load rateType accepted by loads API and selectable in LoadForm
- Facilities use active boolean column for soft-delete, not facilityType prefix hack
- createExpense validates dispatchId, stopId, driverId ownership
- createRouteTemplate (API) validates clientId, contractId, defaultDriverId, defaultTruckId ownership
- saveRouteTemplate (server action) validates clientId, contractId, defaultDriverId, defaultTruckId, and all stop facilityIds ownership
- createStop validates loadId and clientId ownership
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/215-fix-6-high-findings-from-carrier-operati/215-SUMMARY.md`
</output>
