---
phase: quick-239
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/driver/route-detail-readonly.tsx
autonomous: true
must_haves:
  truths:
    - "First pending pickup stop shows Mark Arrived (driver is already there loading)"
    - "First pending non-pickup stop shows Begin Navigation"
    - "All other pending stops show Begin Navigation"
    - "Tapping Begin Navigation opens Google Maps and changes button to Mark Arrived"
    - "Tapping Mark Arrived calls arriveAtStop and shows Complete Stop / Start Route"
    - "Tapping Complete Stop marks completed and auto-opens Google Maps to next stop"
    - "Completed stops show green checkmark with arrived/departed timestamps"
  artifacts:
    - path: "apps/web/src/components/driver/route-detail-readonly.tsx"
      provides: "Stop state machine UI with navigatingStopId local state"
      contains: "navigatingStopId"
  key_links:
    - from: "StopActionButtons"
      to: "getStopAction"
      via: "state machine logic"
      pattern: "getStopAction"
---

<objective>
Fix the driver portal stop timeline to implement the correct state machine flow:
Begin Navigation -> Mark Arrived -> Complete Stop, instead of showing Mark Arrived on all pending stops.

Purpose: Drivers need a clear sequential workflow per stop — navigate first, then mark arrived, then complete.
Output: Updated route-detail-readonly.tsx with proper stop state machine.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/driver/route-detail-readonly.tsx
@apps/web/src/app/(driver)/my-route/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement stop state machine in route-detail-readonly.tsx</name>
  <files>apps/web/src/components/driver/route-detail-readonly.tsx</files>
  <action>
Refactor `StopActionButtons` and the `DispatchDetail` component to implement the 4-state stop machine. All changes are in this single file.

1. Add `useState` import alongside existing `useTransition` import from React.

2. In `DispatchDetail`, add local state for navigating stop:
   `const [navigatingStopId, setNavigatingStopId] = useState<string | null>(null)`

3. Add a `getStopAction` helper function:
```typescript
function getStopAction(
  stop: CarrierStopShape,
  allStops: CarrierStopShape[],
  navigatingStopId: string | null
): 'completed' | 'start_route' | 'complete_stop' | 'mark_arrived' | 'begin_navigation' {
  if (stop.status === 'completed') return 'completed';
  if (stop.status === 'arrived') return stop.stopType === 'pickup' ? 'start_route' : 'complete_stop';
  // status = pending
  const firstPendingStop = allStops
    .filter(s => s.status === 'pending')
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)[0];
  const isFirstPending = firstPendingStop?.id === stop.id;
  if (isFirstPending && stop.stopType === 'pickup') return 'mark_arrived';
  if (navigatingStopId === stop.id) return 'mark_arrived';
  return 'begin_navigation';
}
```

4. Refactor `StopActionButtons` to accept `navigatingStopId` and `setNavigatingStopId` props instead of computing actions itself. Update its interface:
```typescript
interface StopActionButtonsProps {
  stop: CarrierStopShape;
  allStops: CarrierStopShape[];
  navigatingStopId: string | null;
  setNavigatingStopId: (id: string | null) => void;
  arriveAction: (id: string) => Promise<unknown>;
  completeAction: (id: string) => Promise<unknown>;
}
```

5. Inside `StopActionButtons`, use `getStopAction` to determine which button to render:

   - `'completed'`: return null (no button, timestamps already shown by parent).
   
   - `'begin_navigation'`: render a blue full-width button with Navigation icon, text "Begin Navigation". On click: call `window.open(buildNavUrl(stop), '_blank')` and `setNavigatingStopId(stop.id)`. No server action call. No useTransition needed for this action.
   
   - `'mark_arrived'`: render a blue full-width button with Navigation icon, text "Mark Arrived". Show small text above: "You're on your way..." (only if navigatingStopId matches, NOT for first-pending-pickup). On click: call `arriveAction(stop.id)` via startTransition, then `setNavigatingStopId(null)`.
   
   - `'complete_stop'`: render a green full-width button with CheckCircle icon, text "Complete Stop". Show small text above: "You've arrived". On click: call `completeAction(stop.id)` via startTransition, then find next pending stop by sequence order, if exists call `window.open(buildNavUrl(nextStop), '_blank')` and `setNavigatingStopId(nextStop.id)`.
   
   - `'start_route'`: same as complete_stop but with Play icon and text "Start Route". Show small text above: "You've arrived".

6. Update the `stopCircleColor` function to handle the navigating state:
   - Add a parameter or check: if stop.status === 'pending' and navigatingStopId === stop.id, return a blue pulsing style: `'bg-blue-500 text-white animate-pulse'`
   - Keep existing colors for completed, arrived, skipped, and default pending.

7. In `DispatchDetail`, update the stops timeline rendering to pass `navigatingStopId` and `setNavigatingStopId` down to `StopActionButtons`. The stopCircleColor call also needs the navigating state — either pass navigatingStopId to the function or compute it inline.

8. Button styling: all action buttons should be full-width within their container. Use `w-full justify-center` classes. Keep existing min-h-[40px] touch target.

Do NOT modify the server actions file. Do NOT modify the page.tsx file (the existing props passed to DispatchDetail remain the same). The navigatingStopId state lives entirely within DispatchDetail.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` to confirm no TypeScript errors. Visually verify by loading the driver portal My Route page: first pickup stop shows "Mark Arrived", first delivery stop shows "Begin Navigation", all other pending stops show "Begin Navigation".
  </verify>
  <done>
(1) First pending pickup stop shows Mark Arrived directly (no Begin Navigation step needed since driver is already there).
(2) First pending non-pickup stop shows Begin Navigation.
(3) All other pending stops show Begin Navigation.
(4) Tapping Begin Navigation opens Google Maps and changes that stop's button to Mark Arrived with "You're on your way..." text.
(5) Tapping Mark Arrived calls arriveAtStop server action and shows Complete Stop (or Start Route for pickups).
(6) Tapping Complete Stop / Start Route completes the stop and auto-opens Google Maps to the next pending stop.
(7) Completed stops show green checkmark with arrived/departed timestamps.
(8) No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with zero errors
- Driver portal My Route page renders without crashes
- Stop state machine follows: Begin Navigation -> Mark Arrived -> Complete Stop
- First pickup stop skips Begin Navigation (shows Mark Arrived directly)
- Only one stop can be in navigating state at a time
- Completed stops show timestamps, no action buttons
</verification>

<success_criteria>
The driver portal stop timeline implements the correct 4-state machine (upcoming/navigating/arrived/completed) with proper button rendering and Google Maps integration. No TypeScript errors.
</success_criteria>

<output>
After completion, create `.planning/quick/239-fix-driver-portal-stop-state-machine-beg/239-SUMMARY.md`
</output>
