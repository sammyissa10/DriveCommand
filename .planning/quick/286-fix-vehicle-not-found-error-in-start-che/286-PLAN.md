---
phase: quick-286
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
autonomous: true

must_haves:
  truths:
    - "Selecting a CarrierTruck (e.g., TX-1001) in Start Checklist dialog no longer returns 'Vehicle not found'"
    - "VEHICLE entity verification queries the carrier_trucks table, not the legacy trucks table"
    - "Tenant isolation is enforced on the CarrierTruck lookup via orgId = tenantId"
    - "DRIVER and PARTNER entity verification is unchanged"
  artifacts:
    - path: "apps/web/src/server/services/workflows/generatePlaybookInstance.ts"
      provides: "verifyEntity() resolves VEHICLE via prisma.carrierTruck.findFirst"
      contains: "prisma.carrierTruck.findFirst"
  key_links:
    - from: "apps/web/src/server/services/workflows/generatePlaybookInstance.ts"
      to: "prisma.carrierTruck"
      via: "verifyEntity VEHICLE branch"
      pattern: "prisma\\.carrierTruck\\.findFirst"
    - from: "apps/web/src/server/services/workflows/generatePlaybookInstance.ts"
      to: "tenant scoping"
      via: "orgId filter"
      pattern: "orgId:\\s*tenantId"
---

<objective>
Fix the "Vehicle not found" error thrown when starting a checklist on a CarrierTruck (e.g., TX-1001).

Purpose: The Start Checklist dialog already loads vehicle options from `/api/v1/carrier/fleet/trucks`, which returns CarrierTruck records (the modern carrier-module table). However, the server-side `verifyEntity()` helper in `generatePlaybookInstance.ts` looks the entity up in the legacy `Truck` table via `prisma.truck.findFirst({ where: { id, tenantId } })`. Since the ID came from `carrier_trucks`, the legacy lookup always misses and the user sees "Vehicle not found".

Output: One-line model swap from `prisma.truck` to `prisma.carrierTruck`, with the tenant filter updated from `tenantId` to `orgId` (CarrierTruck's tenant scoping field) so isolation is preserved.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/server/services/workflows/generatePlaybookInstance.ts
@apps/web/src/server/api/routers/workflows/instance.ts
@apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Swap legacy Truck lookup for CarrierTruck in verifyEntity()</name>
  <files>apps/web/src/server/services/workflows/generatePlaybookInstance.ts</files>
  <action>
In `apps/web/src/server/services/workflows/generatePlaybookInstance.ts`, locate the `verifyEntity()` helper (starts at line 214). The VEHICLE branch is at lines 226-230:

```ts
if (entityType === 'VEHICLE') {
  const truck = await prisma.truck.findFirst({ where: { id: entityId, tenantId } });
  if (!truck) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vehicle not found' });
  return truck;
}
```

Replace ONLY that block with a CarrierTruck lookup. CarrierTruck uses `orgId` (NOT `tenantId`) as its tenant scoping field — see `schema.prisma` line 1531 (`orgId String @map("org_id")`). The pattern matches the existing call in `apps/web/src/actions/carrier/save-route-template.ts:111` (`prisma.carrierTruck.findFirst({ where: { id, orgId }, select: { id: true } })`).

Final code for the VEHICLE branch:

```ts
if (entityType === 'VEHICLE') {
  const truck = await prisma.carrierTruck.findFirst({
    where: { id: entityId, orgId: tenantId },
  });
  if (!truck) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vehicle not found' });
  return truck;
}
```

DO NOT change:
- The DRIVER branch (lines 219-225) — still queries `prisma.user`
- The PARTNER branch (lines 231-235) — still queries `prisma.customer`
- The DISPATCH/OTHER fallthrough (line 236) — returns null
- Comment on line 40 still says "Truck for VEHICLE" — update it to "CarrierTruck for VEHICLE" so future readers are not misled.

WHY this fix is correct:
- The Start Checklist dialog at `apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx:79` already loads vehicles from `/api/v1/carrier/fleet/trucks`, which is backed by `listCarrierTrucks()` and returns CarrierTruck rows. The `entityId` submitted to the `generate` mutation is therefore a CarrierTruck.id (e.g., TX-1001's UUID), not a legacy Truck.id. The legacy Truck table belongs to the older fleet module and is no longer the source of vehicle records used by checklists.
- Tenant isolation is preserved: `orgId: tenantId` is the documented carrier-module convention (see `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts:99` — `tenantId: orgId, // carrier module uses orgId for tenant scoping`).
- No other entity type lookups are touched, satisfying the constraint.
  </action>
  <verify>
1. `tsc --noEmit -p apps/web` passes (no type errors from the swap).
2. Open the owner Checklists page, click "Start Checklist", select any active playbook, choose Entity type = Vehicle, pick TX-1001 from the dropdown, click "Start Checklist". Mutation succeeds (dialog closes, new active checklist appears in the list) — no "Vehicle not found" error.
3. Repeat with Entity type = Driver and Entity type = Partner to confirm those flows still verify correctly.
4. Grep confirms only one VEHICLE branch remains and it uses CarrierTruck:
   - `grep -n "prisma.carrierTruck.findFirst" apps/web/src/server/services/workflows/generatePlaybookInstance.ts` → exactly 1 match in the VEHICLE branch.
   - `grep -n "prisma.truck.findFirst" apps/web/src/server/services/workflows/generatePlaybookInstance.ts` → 0 matches.
  </verify>
  <done>
Selecting TX-1001 (or any CarrierTruck) as the VEHICLE entity in the Start Checklist dialog creates a PlaybookInstance scoped to the current tenant. DRIVER and PARTNER verification paths are unchanged. Tenant isolation is enforced via `orgId: tenantId`. No other files modified.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles cleanly across the monorepo.
- Manual E2E: Start Checklist → VEHICLE → TX-1001 succeeds end-to-end (dialog closes, instance row visible).
- Manual E2E: Start Checklist → DRIVER → any driver still works (regression check).
- Manual E2E: Start Checklist → PARTNER → any customer still works (regression check).
- A vehicle from a different tenant (orgId mismatch) still returns "Vehicle not found" — tenant isolation is preserved.
</verification>

<success_criteria>
- "Vehicle not found" no longer occurs for valid CarrierTruck records in the active tenant.
- VEHICLE branch of `verifyEntity()` queries `prisma.carrierTruck` with `orgId: tenantId` filter.
- DRIVER and PARTNER branches are byte-identical to before this plan.
- StartChecklistDialog.tsx and instance.ts are NOT modified — only the service helper.
</success_criteria>

<output>
After completion, create `.planning/quick/286-fix-vehicle-not-found-error-in-start-che/286-SUMMARY.md` documenting the one-line model swap, the orgId vs tenantId nuance, and confirming the dialog (which was already correct) was untouched.
</output>
