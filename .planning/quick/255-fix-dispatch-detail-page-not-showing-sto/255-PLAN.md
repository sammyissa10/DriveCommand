---
phase: quick-255
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts
autonomous: true
must_haves:
  truths:
    - "After attaching a load to a dispatch, the dispatch detail page Stop Timeline shows the load's stops"
    - "After removing a load from a dispatch, re-attaching it to another dispatch shows stops under the new dispatch"
    - "Stops that were completed or skipped on a previous dispatch are not migrated (only pending stops)"
  artifacts:
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "Stop migration when dispatchId changes on a load"
    - path: "apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts"
      provides: "Stop cleanup when load is removed from dispatch"
  key_links:
    - from: "DispatchLoadsPanel.handleAttach"
      to: "updateLoad"
      via: "PATCH /api/v1/carrier/loads/[id] with { dispatchId }"
      pattern: "data\\.dispatchId"
    - from: "getDispatch"
      to: "CarrierStop"
      via: "Prisma include stops"
      pattern: "stops.*orderBy.*sequenceOrder"
---

<objective>
Fix dispatch detail page Stop Timeline showing empty after attaching loads.

Purpose: Two bugs prevent stops from appearing on a dispatch after loads are attached via the Loads panel.
Output: Stops correctly appear in the dispatch Stop Timeline after attaching loads.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/dispatches.ts (getDispatch fetches stops via Prisma include on dispatchId)
@apps/web/src/lib/carrier/loads.ts (updateLoad sets dispatchId but does NOT migrate existing stops)
@apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts (detaches load but does NOT clean up orphaned stops)
@apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx (attach sends PATCH with only { dispatchId })
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx (dispatch detail page)
@apps/web/prisma/schema.prisma (CarrierStop: dispatchId is required, loadId is optional)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate stops when load is attached to a dispatch and clean up stops on detach</name>
  <files>
    apps/web/src/lib/carrier/loads.ts
    apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts
  </files>
  <action>
## Bug Analysis

There are two bugs causing the empty Stop Timeline:

**Bug 1 — `updateLoad` in `apps/web/src/lib/carrier/loads.ts` (line ~386-393):**
When a load is attached to a dispatch via `PATCH { dispatchId }`, the `updateLoad` function updates the load's `dispatchId` FK but does NOT update existing `CarrierStop` records. The stops still point to the old `dispatchId` (or were never created if the load was originally created without a dispatch). The `getDispatch` function fetches stops via the Prisma relation `dispatch.stops` which queries by `dispatchId`, so mismatched stops are invisible.

**Bug 2 — `remove-load/route.ts`:**
When a load is removed from a dispatch, `dispatchId` is set to null on the load, but the `CarrierStop` records with `loadId` still reference the old dispatch. These orphaned stops remain visible on the old dispatch and won't follow the load to a new dispatch.

## Fix for `apps/web/src/lib/carrier/loads.ts`

In the `updateLoad` function, AFTER the `prisma.carrierLoad.update()` call (around line 373) and BEFORE the "Persist stops when load has a dispatchId" block (line 386), add stop migration logic:

```typescript
// When dispatchId changes, migrate existing stops for this load to the new dispatch
if (data.dispatchId !== undefined && data.dispatchId !== existing.dispatchId) {
  if (data.dispatchId !== null) {
    // Attaching to a dispatch: move all pending stops for this load to the new dispatch
    await prisma.carrierStop.updateMany({
      where: {
        loadId: id,
        status: 'pending',
      },
      data: {
        dispatchId: data.dispatchId,
      },
    });
    logger.info('updateLoad: migrated pending stops to new dispatch', {
      orgId,
      loadId: id,
      newDispatchId: data.dispatchId,
    });
  } else {
    // Detaching from a dispatch: delete pending stops for this load
    // (completed/skipped stops are preserved as historical records)
    await prisma.carrierStop.deleteMany({
      where: {
        loadId: id,
        dispatchId: existing.dispatchId!,
        status: 'pending',
      },
    });
    logger.info('updateLoad: deleted pending stops on detach', {
      orgId,
      loadId: id,
      oldDispatchId: existing.dispatchId,
    });
  }
}
```

This handles:
- Load attached to dispatch: pending stops follow the load
- Load detached from dispatch: pending stops are cleaned up
- Completed/skipped stops are never touched (preserves history)

## Fix for `apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts`

After the `prisma.carrierLoad.update()` call (line 77-79) that sets `dispatchId: null`, add stop cleanup:

```typescript
// Delete pending stops linked to this load on this dispatch
// Completed/skipped stops are preserved as historical records
await prisma.carrierStop.deleteMany({
  where: {
    dispatchId: id,
    loadId,
    status: 'pending',
  },
});
```

This ensures that when a load is removed from a dispatch via the remove-load endpoint, its pending stops are cleaned up from that dispatch.

## Important constraints:
- Do NOT modify stop completion logic
- Do NOT touch any driver portal code
- Only delete/migrate stops with status 'pending' — never touch 'completed', 'skipped', or 'arrived' stops
- The `CarrierStop` table does NOT have an `orgId` column, but tenant isolation is maintained because we only operate on stops via validated `loadId` and `dispatchId` that were already tenant-checked
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — no TypeScript errors
2. Verify the logic by tracing the flow:
   - `DispatchLoadsPanel.handleAttach` sends `PATCH /api/v1/carrier/loads/{loadId}` with `{ dispatchId }`
   - `updateLoad` sets `load.dispatchId = dispatchId` AND runs `updateMany` to migrate pending stops
   - `getDispatch` includes `stops: { orderBy: { sequenceOrder: 'asc' } }` — now returns the migrated stops
   - StopTimeline renders the stops
3. Verify remove-load cleanup: pending stops are deleted when load is detached
  </verify>
  <done>
- Attaching a load to a dispatch migrates all pending CarrierStop records (with matching loadId) to the new dispatchId
- Removing a load from a dispatch deletes pending CarrierStop records for that load on that dispatch
- Completed/skipped stops are never modified or deleted
- No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. Manual test flow: Create a load with stops -> Create a dispatch -> Attach load to dispatch via Loads panel -> Refresh dispatch detail page -> Stop Timeline shows the load's stops
3. Manual test flow: Remove load from dispatch -> Stops disappear from dispatch timeline -> Re-attach to another dispatch -> Stops appear on new dispatch
</verification>

<success_criteria>
- Dispatch detail Stop Timeline displays stops from attached loads
- Stop records correctly follow loads when moved between dispatches
- Orphaned stops are cleaned up when loads are removed from dispatches
- No TypeScript errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/255-fix-dispatch-detail-page-not-showing-sto/255-SUMMARY.md`
</output>
