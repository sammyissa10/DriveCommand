---
phase: quick-256
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/lib/carrier/loads.ts
autonomous: true
must_haves:
  truths:
    - "Opening a carrier load with existing stops shows those stops pre-populated in the StopBuilder"
    - "Saving the load edit form without changing stops preserves all existing stops in the database"
    - "Adding a new stop and saving adds it without deleting existing stops"
    - "Removing a stop from the form and saving deletes only that pending stop"
    - "Stops with status arrived or completed are never deleted by persistStops"
  artifacts:
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "persistStops safety guard against empty-array deletion"
      contains: "submittedStops.length === 0"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
      to: "apps/web/src/components/carrier/loads/LoadForm.tsx"
      via: "initialData.stops prop with mapped CarrierStop records"
      pattern: "stops.*mappedStops"
---

<objective>
Fix critical data loss bug where the carrier load edit form does not pre-populate existing stops, and saving with an empty stops array could delete all stops from the database.

Purpose: Prevent stop data loss when editing loads that have been attached to dispatches with stops.
Output: Working stop pre-population in edit mode + safety guards in persistStops.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/components/carrier/stops/StopBuilder.tsx
@apps/web/src/components/carrier/stops/StopCard.tsx
@apps/web/src/lib/carrier/loads.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add persistStops safety guard against empty-array deletion</name>
  <files>apps/web/src/lib/carrier/loads.ts</files>
  <action>
In the `persistStops` function (around line 244), add a safety guard at the very beginning of the function body (after the function signature, before the facility validation):

```typescript
// Safety guard: if no stops submitted but load already has stops, skip entirely.
// An empty submission means "no changes to stops", not "delete all stops".
const existingStopCount = await prisma.carrierStop.count({
  where: { loadId },
});
if (stops.length === 0 && existingStopCount > 0) {
  logger.info('persistStops: skipping — empty submission with existing stops', { orgId, loadId, existingStopCount });
  return;
}
```

Also in the `updateLoad` function, change the condition on line 423 from:
```typescript
if (data.stops !== undefined && data.stops.length > 0) {
```
to:
```typescript
if (data.stops !== undefined) {
```

This allows persistStops to be called even with an empty array, so the safety guard inside persistStops can decide what to do. Currently the `data.stops.length > 0` check means persistStops is never called for empty arrays, but if in the future someone changes the form to send `undefined` vs `[]` differently, we want the safety guard inside persistStops to be the single source of truth.

The existing delete logic in persistStops (line 274-278) already only deletes stops with `status === 'pending'` — this is correct. Stops with status 'arrived' or 'completed' are already protected by this filter. No changes needed there.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no TypeScript errors. Grep for `persistStops` to confirm the safety guard is in place and the updateLoad condition is updated.</verify>
  <done>persistStops has an early return when stops array is empty and existing stops exist in DB. updateLoad calls persistStops for all defined stops arrays (not just non-empty). Existing protection of arrived/completed stops remains intact.</done>
</task>

<task type="auto">
  <name>Task 2: Verify and fix stop pre-population in carrier load edit page</name>
  <files>
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
    apps/web/src/components/carrier/loads/LoadForm.tsx
  </files>
  <action>
The carrier load detail page at `(owner)/carrier/loads/[id]/page.tsx` already maps stops from `getLoad()` into `StopBuilderStop[]` format and passes them as `initialData.stops`. The LoadForm component at line 130 initializes `stops` state from `initialData?.stops ?? []`. The StopBuilder component receives these stops and renders them.

Investigate the actual cause of stops not appearing:

1. Check if `getLoad()` is actually returning stops. The `getLoad` function includes `stops: { orderBy: ..., include: { facility: ... } }` — this should work via the Prisma `CarrierLoad.stops` relation (which queries `CarrierStop` by `loadId`).

2. Check if the stops were created with `loadId` properly set. In `persistStops`, new stops are created with `loadId` (line 313). But stops originally created via dispatch template (not via load form) might have `loadId = null`. If stops were created on the dispatch side and later the load was attached, the `loadId` might not have been backfilled.

3. If the issue is that stops created via dispatch templates don't have `loadId`, add a query to the page that fetches stops by BOTH `loadId` AND via the dispatch relationship:

In `(owner)/carrier/loads/[id]/page.tsx`, after the existing `getLoad` call, add a fallback stop fetch if `load.stops` is empty but the load has a `dispatchId`:

```typescript
// If no stops found via loadId but load is on a dispatch, check for stops
// that belong to the dispatch but weren't linked to this load yet
let stopsForMapping = load.stops as any[];
if (stopsForMapping.length === 0 && load.dispatchId) {
  const dispatchStops = await prisma.carrierStop.findMany({
    where: {
      dispatchId: load.dispatchId,
      OR: [
        { loadId: load.id },
        { loadId: null },  // Stops from dispatch template not yet linked
      ],
    },
    include: { facility: { select: { name: true, city: true, state: true } } },
    orderBy: { sequenceOrder: 'asc' },
  });
  stopsForMapping = dispatchStops;
}
```

Then use `stopsForMapping` instead of `load.stops` in the mapping block below (line 35).

4. In the LoadForm component, the stops state initialization at line 130 looks correct:
```typescript
const [stops, setStops] = useState<StopBuilderStop[]>(initialData?.stops ?? []);
```
This should work since it reads from the prop on first render. No changes needed here unless debugging reveals a React hydration issue — in that case, add a `useEffect` that syncs stops from props on mount.

5. Ensure the form submission includes existing stop IDs. Looking at lines 303-316 of LoadForm.tsx, the submit handler already maps `s.id` for each stop. This is correct — persistStops uses the `id` field to distinguish between updates and creates.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web. Open a carrier load that has stops attached via a dispatch — verify the StopBuilder shows the existing stops pre-populated (not "No stops added yet"). Save the form without changes — verify stops are preserved in the database.</verify>
  <done>Carrier load edit page shows existing stops pre-populated in the StopBuilder. Stops from dispatch templates that lack loadId are found via fallback dispatch query. Saving without changes preserves all stops.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors from apps/web
2. Open a carrier load with existing stops — stops appear pre-populated in StopBuilder
3. Save the load without modifying stops — all stops preserved in database
4. Add a new stop and save — new stop added, existing stops preserved
5. Remove a pending stop and save — only that stop deleted
6. Stops with status arrived/completed cannot be deleted via form
</verification>

<success_criteria>
- No "No stops added yet" shown when editing a load that has stops
- Empty stops array submission does not delete existing stops (safety guard)
- Stop IDs are preserved through edit round-trips (update not delete+create)
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/256-fix-load-edit-form-not-pre-populating-ex/256-SUMMARY.md`
</output>
