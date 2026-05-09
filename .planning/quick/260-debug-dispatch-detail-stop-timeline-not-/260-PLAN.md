---
phase: quick-260
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/loads.ts
autonomous: true
must_haves:
  truths:
    - "Stops defined in StopBuilder during load creation are preserved even without a dispatchId"
    - "When a load with pending stops is attached to a dispatch, stops appear in the dispatch detail timeline"
    - "Existing load creation and editing flows with a dispatchId continue to work unchanged"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "pendingStopsJson text column on CarrierLoad"
      contains: "pendingStopsJson"
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "createLoad stores stops as JSON when no dispatchId; updateLoad persists pending stops when dispatchId is set"
  key_links:
    - from: "createLoad"
      to: "CarrierLoad.pendingStopsJson"
      via: "JSON.stringify of stops array when no dispatchId"
      pattern: "pendingStopsJson.*JSON\\.stringify"
    - from: "updateLoad"
      to: "persistStops"
      via: "JSON.parse pendingStopsJson when dispatchId newly set"
      pattern: "pendingStopsJson.*persistStops"
---

<objective>
Fix dispatch detail stop timeline showing empty after attaching a load.

Purpose: When a load is created with stops in StopBuilder but without a dispatch, those stops are silently dropped because CarrierStop.dispatchId is required. Later, when the load is attached to a dispatch, there are zero CarrierStop records to migrate, so the stop timeline remains empty.

Output: Stops survive load creation without a dispatch and auto-persist when a dispatch is attached.
</objective>

<context>
@apps/web/prisma/schema.prisma
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
@apps/web/src/lib/carrier/dispatches.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pendingStopsJson column and wire create/update load</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/src/lib/carrier/loads.ts
  </files>
  <action>
**Root Cause:** `createLoad` in loads.ts line 228 has `if (data.stops && data.stops.length > 0 && load.dispatchId)` — stops are only persisted when `dispatchId` exists. Since loads are always created without a dispatch (NewLoadPage has no dispatchId), stops from StopBuilder are silently dropped. When the load is later attached via DispatchLoadsPanel (PATCH with `{ dispatchId }`), `updateLoad` tries to migrate existing CarrierStop records but there are none to migrate. Result: empty stop timeline.

**Schema change:**
In `apps/web/prisma/schema.prisma`, add a `pendingStopsJson` text column to the `CarrierLoad` model:
```
pendingStopsJson String? @map("pending_stops_json") @db.Text
```
Place it after the `notes` field. Run `npx prisma migrate dev --name add-pending-stops-json` from `apps/web/`.

**Fix createLoad (apps/web/src/lib/carrier/loads.ts):**
Change the stops persistence block (around line 228) from:
```typescript
if (data.stops && data.stops.length > 0 && load.dispatchId) {
    await persistStops(orgId, load.id, load.dispatchId, data.stops);
}
```
To:
```typescript
if (data.stops && data.stops.length > 0) {
    if (load.dispatchId) {
        await persistStops(orgId, load.id, load.dispatchId, data.stops);
    } else {
        // No dispatch yet — store stops as JSON for later persistence when dispatch is assigned
        await prisma.carrierLoad.update({
            where: { id: load.id },
            data: { pendingStopsJson: JSON.stringify(data.stops) },
        });
        logger.info('createLoad: stored pending stops as JSON (no dispatchId)', {
            orgId,
            loadId: load.id,
            stopCount: data.stops.length,
        });
    }
}
```

**Fix updateLoad (apps/web/src/lib/carrier/loads.ts):**
After the existing stop migration block (around line 397-429, where `dispatchId` changes to non-null and `updateMany` runs), add logic to check for `pendingStopsJson`:

After the `updateMany` call inside `if (data.dispatchId !== null)` block, add:
```typescript
// Also persist any pending stops that were stored as JSON during load creation
const loadWithPending = await prisma.carrierLoad.findFirst({
    where: { id, orgId },
    select: { pendingStopsJson: true },
});
if (loadWithPending?.pendingStopsJson) {
    const pendingStops: StopInput[] = JSON.parse(loadWithPending.pendingStopsJson);
    if (pendingStops.length > 0) {
        await persistStops(orgId, id, data.dispatchId, pendingStops);
        // Clear the pending JSON now that stops are persisted
        await prisma.carrierLoad.update({
            where: { id },
            data: { pendingStopsJson: null },
        });
        logger.info('updateLoad: persisted pending stops from JSON on dispatch attach', {
            orgId,
            loadId: id,
            dispatchId: data.dispatchId,
            stopCount: pendingStops.length,
        });
    }
}
```

Also in `updateLoad`, when `data.stops` is provided and there's no dispatchId (load being edited without a dispatch), store/update `pendingStopsJson` instead of calling `persistStops`. Update the stops persistence block (around line 433-439) to:
```typescript
if (data.stops !== undefined) {
    const effectiveDispatchId =
        data.dispatchId !== undefined ? data.dispatchId : existing.dispatchId;
    if (effectiveDispatchId) {
        await persistStops(orgId, id, effectiveDispatchId, data.stops);
        // Clear pending JSON since stops are now persisted as CarrierStop records
        if (existing.pendingStopsJson) {
            await prisma.carrierLoad.update({
                where: { id },
                data: { pendingStopsJson: null },
            });
        }
    } else {
        // No dispatch — store/update pending stops JSON
        await prisma.carrierLoad.update({
            where: { id },
            data: { pendingStopsJson: JSON.stringify(data.stops) },
        });
        logger.info('updateLoad: updated pending stops JSON (no dispatchId)', {
            orgId,
            loadId: id,
            stopCount: data.stops.length,
        });
    }
}
```

**Important:** The `existing` variable in `updateLoad` is fetched at line 346 with `findFirst`. It needs to include `pendingStopsJson` in the select. Currently it uses default select (all fields), so `existing.pendingStopsJson` will be available automatically after the migration.
  </action>
  <verify>
1. `cd apps/web && npx prisma migrate dev --name add-pending-stops-json` succeeds
2. `npx tsc --noEmit` from project root — zero new errors
3. Trace the code path: createLoad without dispatchId + stops -> pendingStopsJson is set. Then updateLoad with dispatchId -> pendingStopsJson is parsed and persistStops is called -> CarrierStop records created with correct dispatchId and loadId -> getDispatch includes these stops -> StopTimeline renders them.
  </verify>
  <done>
- CarrierLoad has `pending_stops_json` text column
- `createLoad` stores stops as JSON when no dispatchId
- `updateLoad` persists pending stops as CarrierStop records when dispatchId is newly set
- `updateLoad` stores stops as JSON when editing a load without a dispatchId
- Existing flows (load created with dispatchId) unchanged
- TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
1. Create a load with stops but no dispatch — verify `pending_stops_json` is populated in DB
2. Attach that load to a dispatch from the dispatch detail page — verify CarrierStop records are created
3. Visit dispatch detail page — verify Stop Timeline shows the stops
4. Create a load with stops AND a dispatchId — verify stops are persisted as CarrierStop immediately (existing behavior preserved)
5. Edit a load that has no dispatch and add/change stops — verify `pending_stops_json` updates
</verification>

<success_criteria>
- Stops defined during load creation without a dispatch are preserved in pendingStopsJson
- Attaching a load to a dispatch auto-creates CarrierStop records from pendingStopsJson
- Dispatch detail Stop Timeline renders the newly created stops
- No regression in existing load/dispatch/stop flows
</success_criteria>
