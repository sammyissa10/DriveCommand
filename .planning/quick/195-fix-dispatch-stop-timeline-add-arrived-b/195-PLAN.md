---
phase: quick-195
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
autonomous: true
---

<objective>
Fix dispatch stop timeline to add a "Mark Arrived" button for pending stops and fix the
"Skip Stop" role guard to include MANAGER role alongside OWNER.

Currently the StopTimelineCard shows "Complete Stop" for both pending and arrived stops,
skipping the arrived state entirely. The fix splits the action buttons into a proper
two-step workflow: Mark Arrived (pending) -> Complete Stop (arrived). The Skip Stop button
already works but only checks for `owner` role — it needs to also allow `MANAGER`.

All three API endpoints already exist:
- PATCH /api/v1/carrier/stops/[id]/arrived
- PATCH /api/v1/carrier/stops/[id]/complete
- PATCH /api/v1/carrier/stops/[id]/skip
</objective>

<context>
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
@apps/web/src/components/carrier/dispatches/StopTimeline.tsx
@apps/web/src/app/api/v1/carrier/stops/[id]/arrived/route.ts
@apps/web/src/app/api/v1/carrier/stops/[id]/skip/route.ts
@apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Mark Arrived button and fix action button logic in StopTimelineCard</name>
  <files>apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx</files>
  <action>
Modify StopTimelineCard.tsx to implement a two-step stop workflow:

1. Add a `handleArrive` function (similar pattern to `handleComplete`):
   - Calls `PATCH /api/v1/carrier/stops/${stop.id}/arrived`
   - On success: `toast.success('Marked as arrived')` and `router.refresh()`
   - On error: toast the error message

2. Split the action button rendering based on stop status:
   - When `stop.status === 'pending'` AND `dispatchStatus === 'in_progress'`:
     Show "Mark Arrived" button (use `MapPin` icon, blue/outline variant, same h-7 text-xs sizing)
   - When `stop.status === 'arrived'` AND `dispatchStatus === 'in_progress'`:
     Show "Complete Stop" button (existing button, keep document compliance guard)
   - When `stop.status === 'completed'` or `stop.status === 'skipped'`:
     Show NO action buttons (already handled by `canAct` logic)

3. Fix the `canSkip` guard to include MANAGER role:
   - Change: `userRole === 'owner'` to `userRole === 'owner' || userRole === 'MANAGER'`
   - Note: check the actual role string casing used. The session.role from the dispatch
     detail page passes `session.role` directly. Look at the existing `canSkip` line and
     match the casing pattern. The auth system uses 'MANAGER' (uppercase) based on
     supabase.ts guards, but the existing code checks `userRole === 'owner'` (lowercase).
     Check both casings to be safe: `userRole === 'owner' || userRole === 'OWNER' || userRole === 'manager' || userRole === 'MANAGER'`

4. Remove the current `canAct` variable (lines 152-153) and replace with two separate
   boolean flags:
   - `const isPending = stop.status === 'pending' && dispatchStatus === 'in_progress';`
   - `const isArrived = stop.status === 'arrived' && dispatchStatus === 'in_progress';`
   - Update `canComplete` to use `isArrived` instead of `canAct`
   - Update `canSkip` to use `(isPending || isArrived)` instead of the status check

5. In the JSX action buttons area (around lines 235-290), render:
   ```
   {isPending && (
     <Button size="sm" variant="outline" disabled={isPending && false || isPending && isPending && false} ...>
       <MapPin className="h-3.5 w-3.5 mr-1" />
       {isPending ? 'Mark Arrived' : 'Saving...'}
     </Button>
   )}
   {isArrived && (
     // existing Complete Stop button, keep missingDocs guard
   )}
   ```
   Use the `isPending` flag to control the Mark Arrived button's disabled state
   (disabled only when `isPending` transition is running).

Keep the Skip button rendering as-is but with the updated `canSkip` guard.
  </action>
  <verify>
Run `npx tsc --noEmit` from the apps/web directory to confirm no type errors.
Visually verify:
- Pending stops show "Mark Arrived" + "Skip" (for owner/manager)
- Arrived stops show "Complete Stop" + "Skip" (for owner/manager)
- Completed/skipped stops show no action buttons
  </verify>
  <done>
- Pending stops display a "Mark Arrived" button that calls PATCH /arrived
- Arrived stops display a "Complete Stop" button (disabled if required docs missing)
- Skip Stop button visible for both owner and manager roles
- No TypeScript errors (`npx tsc --noEmit` passes)
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — no type errors
- Load a dispatch detail page with pending stops — "Mark Arrived" button visible
- Click "Mark Arrived" — stop status changes to arrived, timestamp shown
- After arrived — "Complete Stop" button appears (disabled if docs missing)
- Owner sees "Skip" button on pending and arrived stops
</verification>

<success_criteria>
Two-step stop workflow (Mark Arrived -> Complete Stop) works on dispatch detail page.
Skip Stop accessible to owner and manager roles. Zero TypeScript errors.
</success_criteria>
