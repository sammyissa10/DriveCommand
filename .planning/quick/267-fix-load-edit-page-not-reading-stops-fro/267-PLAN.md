---
phase: quick-267
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Load edit page shows stops when load has dispatchId (existing behavior unchanged)"
    - "Load edit page shows stops when load has no dispatchId but has pendingStopsJson"
    - "Load edit page shows empty stops when load has neither dispatchId nor pendingStopsJson"
    - "Facility lookup for pending stops is tenant-isolated via orgId"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
      provides: "pendingStopsJson fallback logic in load detail server component"
      contains: "pendingStopsJson"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
      to: "prisma.carrierFacility"
      via: "facility lookup for pending stop facility_ids"
      pattern: "carrierFacility.findMany"
---

<objective>
Fix load edit page to read stops from pendingStopsJson when no dispatch is attached.

Purpose: Loads created without a dispatch store their stops in pendingStopsJson (a JSON string on CarrierLoad). The edit page currently only looks at CarrierStop records (which require a dispatch to exist). This means editing a dispatch-less load shows zero stops even though stops were saved.

Output: The load edit page correctly pre-populates the StopBuilder from pendingStopsJson when dispatchId is null.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
@apps/web/src/lib/carrier/loads.ts (StopInput interface at line 24-39)
@apps/web/src/components/carrier/stops/StopCard.tsx (StopBuilderStop interface at line 20-41)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pendingStopsJson fallback in load detail page</name>
  <files>apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx</files>
  <action>
In the load detail page server component (`page.tsx`), add a third branch after the existing dispatch-stop fallback (lines 38-51). The logic should be:

1. Keep existing behavior: if `stopsForMapping.length === 0 && load.dispatchId` -> query CarrierStop by dispatchId (lines 38-51, unchanged).

2. Add NEW branch: if `stopsForMapping.length === 0 && !load.dispatchId && load.pendingStopsJson`:
   - Import `StopInput` from `@/lib/carrier/loads`
   - Parse `load.pendingStopsJson` as `StopInput[]` via `JSON.parse(load.pendingStopsJson as string)`
   - Collect unique `facility_id` values from parsed stops
   - Batch-fetch facility details with tenant isolation:
     ```ts
     const facilities = await prisma.carrierFacility.findMany({
       where: { id: { in: facilityIds }, orgId },
       select: { id: true, name: true, city: true, state: true },
     });
     const facilityMap = new Map(facilities.map(f => [f.id, f]));
     ```
   - Map parsed `StopInput[]` to `StopBuilderStop[]` directly (skip the generic `stopsForMapping` intermediary since the shape differs from CarrierStop):
     ```ts
     const pendingMapped: StopBuilderStop[] = parsedStops.map((s, i) => {
       const fac = facilityMap.get(s.facility_id);
       return {
         id: s.id ?? `pending-${i}`,
         facility_id: s.facility_id,
         facility_name: fac?.name ?? 'Unknown Facility',
         facility_city: fac?.city ?? null,
         facility_state: fac?.state ?? null,
         sequence_order: s.sequence_order,
         stop_type: s.stop_type,
         contact_name: s.contact_name ?? null,
         contact_phone: s.contact_phone ?? null,
         expected_dwell_minutes: null,
         commodity_description: s.commodity_description ?? null,
         bol_required: s.bol_required ?? false,
         pod_required: s.pod_required ?? false,
         special_instructions: s.special_instructions ?? null,
         appt_window_start_offset_min: null,
         appt_window_end_offset_min: null,
         appointment_start: s.appointment_start ?? null,
         appointment_end: s.appointment_end ?? null,
       };
     });
     ```
   - Assign `mappedStops = pendingMapped` (or set a flag so the existing `stopsForMapping.map(...)` block is skipped for this branch).

3. The cleanest approach: restructure so that `mappedStops` is computed in one of three branches:
   - Branch A: `stopsForMapping` has items (from `load.stops` include) -> map as today (lines 55-74)
   - Branch B: no stops but has `dispatchId` -> query dispatch stops, then map (lines 38-51, then 55-74)
   - Branch C: no stops, no dispatchId, has `pendingStopsJson` -> parse JSON, fetch facilities, map to StopBuilderStop directly
   - Branch D: none of the above -> `mappedStops = []`

4. The `getLoad` function already returns the full load record which includes `pendingStopsJson` from Prisma (it does `...load` spread at line 143). No changes needed to `getLoad`.

Important: Do NOT touch the write/update logic in loads.ts. Only the read path in page.tsx changes.
  </action>
  <verify>
Run `npx tsc --noEmit` from the `apps/web` directory to confirm no TypeScript errors.

Manual verification: Open a load that has no dispatch attached but was created with stops. The stop builder should show the stops pre-populated with facility names.
  </verify>
  <done>
Load edit page correctly displays stops from pendingStopsJson when dispatchId is null. Existing dispatch-based stop loading is unchanged. Facility lookup uses orgId for tenant isolation. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in apps/web
- Load with dispatchId: stops load from CarrierStop records (unchanged)
- Load without dispatchId + with pendingStopsJson: stops load from parsed JSON with facility names
- Load without dispatchId + without pendingStopsJson: empty stop builder
</verification>

<success_criteria>
StopBuilder is pre-populated from pendingStopsJson for dispatch-less loads. No regressions for dispatched loads. TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/267-fix-load-edit-page-not-reading-stops-fro/267-SUMMARY.md`
</output>
