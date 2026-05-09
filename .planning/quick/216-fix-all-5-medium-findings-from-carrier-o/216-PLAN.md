---
phase: quick-216
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/stops/route.ts
  - apps/web/src/app/api/v1/carrier/documents/route.ts
  - apps/web/src/app/api/v1/carrier/route-templates/route.ts
  - apps/web/src/lib/carrier/fleet-drivers.ts
autonomous: true
must_haves:
  truths:
    - "stopType only accepts pickup, delivery, fuel_stop, layover"
    - "documents route uses safe .toString() instead of raw 'as string' casts and validates parentType enum"
    - "scheduleType only accepts fixed_days, frequency, on_call"
    - "equipmentType only accepts dry_van, flatbed, reefer, tanker, step_deck, other"
    - "createCarrierDriver rejects homeTerminalId not owned by org"
    - "updateCarrierDriver rejects userId not belonging to org"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/stops/route.ts"
      provides: "stopType enum validation"
      contains: "z.enum"
    - path: "apps/web/src/app/api/v1/carrier/documents/route.ts"
      provides: "safe FormData extraction with parentType enum validation"
      contains: "toString"
    - path: "apps/web/src/app/api/v1/carrier/route-templates/route.ts"
      provides: "scheduleType and equipmentType enum validation"
      contains: "z.enum"
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "FK ownership checks for homeTerminalId and userId"
      contains: "carrierFacility.findFirst"
  key_links:
    - from: "stops/route.ts"
      to: "StopBuilder UI"
      via: "z.enum matches STOP_TYPE_CLASSES keys"
    - from: "route-templates/route.ts"
      to: "RouteTemplateForm UI"
      via: "z.enum matches form select options"
---

<objective>
Fix all 5 Medium-severity findings from the Carrier Operations audit (quick-213).

Purpose: Close enum validation gaps and cross-tenant FK vulnerabilities in carrier API routes.
Output: 4 hardened files with strict enum validation and FK ownership checks.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/api/v1/carrier/stops/route.ts
@apps/web/src/app/api/v1/carrier/documents/route.ts
@apps/web/src/app/api/v1/carrier/route-templates/route.ts
@apps/web/src/lib/carrier/fleet-drivers.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Harden enum validation in 3 API routes</name>
  <files>
    apps/web/src/app/api/v1/carrier/stops/route.ts
    apps/web/src/app/api/v1/carrier/documents/route.ts
    apps/web/src/app/api/v1/carrier/route-templates/route.ts
  </files>
  <action>
**stops/route.ts (line 11):**
Change `stopType: z.string()` to `stopType: z.enum(['pickup', 'delivery', 'fuel_stop', 'layover'])`.

**route-templates/route.ts (line 11):**
Change `scheduleType: z.string().min(1)` to `scheduleType: z.enum(['fixed_days', 'frequency', 'on_call'])`.

**route-templates/route.ts (line 15):**
Change `equipmentType: z.string().min(1)` to `equipmentType: z.enum(['dry_van', 'flatbed', 'reefer', 'tanker', 'step_deck', 'other'])`.

**documents/route.ts (lines 14-16 in POST handler):**
Replace raw `as string | null` casts with safe `.toString()`:
```
const parentType = formData.get('parent_type')?.toString() ?? null;
const parentId = formData.get('parent_id')?.toString() ?? null;
const documentType = formData.get('document_type')?.toString() ?? null;
```

After the existing null guard (line 19), add parentType enum validation:
```
const validParentTypes = ['dispatch', 'load', 'truck', 'driver'] as const;
if (!validParentTypes.includes(parentType as any)) {
  return NextResponse.json(
    { error: `parent_type must be one of: ${validParentTypes.join(', ')}` },
    { status: 400 }
  );
}
```
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors.</verify>
  <done>All 4 enum fields reject values outside the allowed set; documents route uses safe .toString() extraction with parentType validation.</done>
</task>

<task type="auto">
  <name>Task 2: Add FK ownership checks in fleet-drivers.ts</name>
  <files>apps/web/src/lib/carrier/fleet-drivers.ts</files>
  <action>
**In createCarrierDriver (after the existing userId check, before prisma.carrierDriver.create):**
Add homeTerminalId ownership verification:
```typescript
if (data.homeTerminalId) {
  const facility = await prisma.carrierFacility.findFirst({
    where: { id: data.homeTerminalId, orgId },
  });
  if (!facility) {
    throw new Error('Invalid homeTerminalId: facility not found in this organization');
  }
}
```

**In updateCarrierDriver (after the existing `findFirst` check, before prisma.carrierDriver.update):**
Add userId ownership verification when userId is being changed:
```typescript
if (data.userId !== undefined && data.userId) {
  const user = await prisma.user.findFirst({
    where: { id: data.userId, tenantId: orgId },
  });
  if (!user) {
    throw new Error('Invalid userId: user not found in this organization');
  }
}
```

Also add homeTerminalId ownership check in updateCarrierDriver for consistency:
```typescript
if (data.homeTerminalId !== undefined && data.homeTerminalId) {
  const facility = await prisma.carrierFacility.findFirst({
    where: { id: data.homeTerminalId, orgId },
  });
  if (!facility) {
    throw new Error('Invalid homeTerminalId: facility not found in this organization');
  }
}
```
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors. Grep for `carrierFacility.findFirst` and `user.findFirst` in fleet-drivers.ts to confirm the checks exist.</verify>
  <done>createCarrierDriver rejects homeTerminalId not owned by the org. updateCarrierDriver rejects userId not belonging to the org and homeTerminalId not owned by the org.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with zero errors
- Grep confirms z.enum in stops/route.ts and route-templates/route.ts
- Grep confirms .toString() in documents/route.ts (no `as string` casts remain for FormData gets)
- Grep confirms carrierFacility.findFirst and user.findFirst ownership checks in fleet-drivers.ts
</verification>

<success_criteria>
All 5 Medium audit findings are resolved:
1. stopType validates against 4-value enum
2. documents route uses safe FormData extraction + parentType enum validation
3. scheduleType validates against 3-value enum
4. equipmentType validates against 6-value enum
5. homeTerminalId and userId have FK ownership checks preventing cross-tenant links
</success_criteria>

<output>
After completion, create `.planning/quick/216-fix-all-5-medium-findings-from-carrier-o/216-SUMMARY.md`
</output>
