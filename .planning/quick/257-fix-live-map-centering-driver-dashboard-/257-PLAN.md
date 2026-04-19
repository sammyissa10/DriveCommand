---
task: 257
type: quick
title: "Fix live map centering, driver dispatch card state, greeting punctuation, and owner stop completion notification"
files_modified:
  - apps/web/src/components/maps/live-map-wrapper.tsx
  - apps/web/src/components/maps/live-map.tsx
  - apps/web/src/components/driver/driver-dispatch-card.tsx
  - apps/web/src/components/driver/driver-dashboard.tsx
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/lib/carrier/in-app-notifications.ts
  - apps/web/src/emails/carrier/stop-completed.tsx
  - apps/web/prisma/schema.prisma
---

<objective>
Fix four issues: (1) live map auto-centering on initial load, (2) driver dispatch card showing correct button state based on dispatch/stop status, (3) greeting exclamation mark, and (4) owner notification when a driver completes a stop.
</objective>

<context>
@apps/web/src/components/maps/live-map-wrapper.tsx
@apps/web/src/components/maps/live-map.tsx
@apps/web/src/lib/maps/map-utils.ts
@apps/web/src/components/driver/driver-dispatch-card.tsx
@apps/web/src/components/driver/driver-dashboard.tsx
@apps/web/src/app/(driver)/home/page.tsx
@apps/web/src/app/(driver)/actions/driver-dashboard.ts
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/lib/carrier/notifications.ts
@apps/web/src/lib/carrier/in-app-notifications.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix live map auto-center and driver greeting punctuation</name>
  <files>
    apps/web/src/components/maps/live-map-wrapper.tsx
    apps/web/src/components/maps/live-map.tsx
    apps/web/src/components/driver/driver-dashboard.tsx
  </files>
  <action>
**Live map auto-center fix:**

The `FitBoundsOnMount` component in `live-map.tsx` already exists and handles multi-vehicle `fitBounds`. However, it may not fire correctly in edge cases (e.g., SSR returns vehicles but client poll replaces them before Leaflet mounts). Ensure the auto-center works reliably:

1. In `live-map.tsx`, verify `FitBoundsOnMount` handles the single-vehicle case properly. When `calculateBounds` returns a zero-area bbox (one vehicle), the `maxZoom: 14` cap should prevent over-zoom. If `fitBounds` on a point bbox behaves oddly, add a special case: if only 1 vehicle with location exists, use `map.setView([lat, lng], 13)` instead of `fitBounds`.

2. In `live-map-wrapper.tsx`, the `vehiclesForMap` is passed as `initialVehicles` to `LiveMapDynamic`. The issue could be timing — the immediate `fetchVehicles()` call on mount (line 91) may update `vehicles` state before Leaflet finishes loading (dynamic import), causing `filteredVehicles` to change but `FitBoundsOnMount.hasFitted` is still false while the component hasn't mounted yet. Then when it finally mounts, the vehicles array may differ.

   To fix robustly: In `FitBoundsOnMount`, instead of only checking the `vehicles` prop, also accept a callback or use a more resilient approach. The simplest fix: make `FitBoundsOnMount` watch `vehicles` changes until it successfully fits once. It already does this via the `useEffect` dependency on `[map, vehicles]` — but verify it works when `vehicles` transitions from empty to populated after client fetch.

3. Do NOT re-center on every 15-second poll refresh — the `hasFitted.current = true` ref already prevents this. Preserve that behavior.

**Greeting punctuation fix:**

In `driver-dashboard.tsx`, line 81, change the period to an exclamation mark in both greeting patterns:
- `${salutation}, ${firstName}.` -> `${salutation}, ${firstName}!`
- `${salutation}.` -> `${salutation}!`

This is a one-character change on line 81.
  </action>
  <verify>
- Build passes: `cd apps/web && npx tsc --noEmit`
- Verify in `live-map.tsx` that `FitBoundsOnMount` handles single-vehicle (setView zoom 13) and multi-vehicle (fitBounds with padding) cases
- Verify greeting string ends with `!` not `.`
  </verify>
  <done>
- Live map auto-centers to vehicle(s) on initial load (single vehicle: zoom 13 centered, multiple: fitBounds with padding)
- Map does NOT re-center on 15-second poll refreshes
- Driver dashboard greeting shows "Good morning, Sammy!" with exclamation mark
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix driver dispatch card button state to reflect actual dispatch/stop status</name>
  <files>
    apps/web/src/components/driver/driver-dispatch-card.tsx
  </files>
  <action>
Replace the simple `isPlanned ? 'Start Trip & Navigate' : 'Begin Navigation'` logic with full state-aware button rendering.

The dispatch card already receives `dispatch.status` and `dispatch.stops[]` with each stop having a `status` field. Use these to determine the correct button:

1. Compute derived state from existing props:
   ```
   const stops = dispatch.stops ?? [];
   const completedStops = stops.filter(s => s.status === 'completed' || s.status === 'skipped');
   const allStopsDone = stops.length > 0 && completedStops.length === stops.length;
   const currentStop = stops.find(s => s.status === 'arrived');
   const nextPendingStop = stops.find(s => s.status === 'pending');
   ```

2. Determine button state:
   - `dispatch.status === 'planned'` -> label: "Start Trip & Navigate", color: blue (`bg-primary`), action: `handleStartTrip`
   - `dispatch.status === 'in_progress' && currentStop` (a stop has status 'arrived') -> label: "Complete Current Stop", color: green (`bg-green-600 hover:bg-green-700 text-white`), action: navigate to `/my-route` tab (router.push('/my-route'))
   - `dispatch.status === 'in_progress' && !currentStop && nextPendingStop` (has pending stops but none arrived) -> label: "Continue to Stops", color: blue (`bg-primary`), action: `handleBeginNav`
   - `dispatch.status === 'in_progress' && allStopsDone` -> label: "Trip Complete", color: grey (`bg-muted text-muted-foreground`), disabled: true
   - `dispatch.status === 'completed'` -> show a "Completed" badge instead of a button (green badge, no click action)

3. Add current stop status display above the CTA button (below the next stop section):
   - Show "Stop X of Y" text (e.g., "Stop 2 of 3") where X = index of current/next active stop
   - Show current stop facility name
   - Show stop status badge: "Pending" (slate), "Arrived" (amber/yellow), "Completed" (green)
   - Only show this section when `dispatch.status === 'in_progress'`

4. Keep the existing `handleStartTrip` for planned status. For "Continue to Stops", reuse `handleBeginNav`. For "Complete Current Stop", just do `router.push('/my-route')`.
  </action>
  <verify>
- Build passes: `cd apps/web && npx tsc --noEmit`
- Inspect the component to verify all 5 button states are handled
- Verify the stop progress indicator shows when dispatch is in_progress
  </verify>
  <done>
- Dispatch card shows correct button label/color for all 5 states: planned (Start Trip & Navigate/blue), in_progress+arrived (Complete Current Stop/green), in_progress+pending (Continue to Stops/blue), in_progress+all done (Trip Complete/grey/disabled), completed (Completed badge)
- Current stop status indicator shows stop number, facility name, and status badge when dispatch is in_progress
  </done>
</task>

<task type="auto">
  <name>Task 3: Add owner notification when driver completes a stop</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/src/lib/carrier/stop-completion.ts
    apps/web/src/lib/carrier/notifications.ts
    apps/web/src/lib/carrier/in-app-notifications.ts
    apps/web/src/emails/carrier/stop-completed.tsx
  </files>
  <action>
**Step 1 — Add `stop_completed` to InAppNotificationType enum in schema.prisma:**

In the `enum InAppNotificationType` block (around line 106), add `stop_completed` after `compliance_alert`. Then run:
```bash
cd apps/web && npx prisma migrate dev --name add-stop-completed-notification-type
```

**Step 2 — Create stop-completed email template:**

Create `apps/web/src/emails/carrier/stop-completed.tsx` following the pattern of `load-delivered.tsx`:
- Props: `driverName`, `stopType` (pickup/delivery), `facilityName`, `completionTime`, `dispatchNumber`, `companyName`, `dispatchDetailUrl`
- Simple React Email template with the stop completion details
- Subject line pattern: "Stop Completed - [facilityName]"

**Step 3 — Add `sendStopCompletedNotification` to notifications.ts:**

Add a new exported function `sendStopCompletedNotification(orgId: string, stopId: string)` following the existing pattern from `sendLoadDeliveredNotification`:

1. Idempotency key: `carrier-stop-completed-${stopId}`
2. Check `wasNotificationAlreadySent` — return early if already sent
3. Look up the owner email via `getOwnerEmail(orgId)` (helper already exists in notifications.ts)
4. Fetch the stop with dispatch, facility, and driver info:
   ```
   prisma.carrierStop.findFirst({
     where: { id: stopId },
     include: {
       facility: { select: { name: true, city: true, state: true } },
       dispatch: {
         select: {
           id: true,
           notes: true,
           primaryDriverId: true,
           primaryDriver: { select: { firstName: true, lastName: true } },
         },
       },
     },
   })
   ```
5. Extract dispatch number from `dispatch.notes` using the `[DISPATCH_NUMBER=...]` regex pattern (same as other functions)
6. Build driver name from `dispatch.primaryDriver`
7. Build facility name from `stop.facility`
8. Record notification via `recordNotification`, send email via `sendEmail` with the `StopCompletedEmail` template, mark sent via `markNotificationSent`
9. Create in-app notification via `createNotification`:
   - type: `'stop_completed'`
   - title: `'Stop Completed'`
   - message: `"[Driver name] completed [stopType] at [facility name]"`
   - entityType: `'dispatch'`
   - entityId: `stop.dispatchId`
10. Send push notification to owner via `sendPushToUser` (look up owner userId from the owner User record)
11. Wrap entire function in try/catch, never throw — log errors only

**Step 4 — Wire into stop-completion.ts:**

In `completeStop()` function, after the stop is successfully updated (after line 148, after the `logger.info('completeStop: completed'...)` line), add:

```typescript
after(() => sendStopCompletedNotification(orgId, stopId));
```

Import `sendStopCompletedNotification` from `@/lib/carrier/notifications` at the top of the file.

This ensures the notification is fire-and-forget and never blocks the stop completion action.
  </action>
  <verify>
- Migration succeeds: `cd apps/web && npx prisma migrate dev --name add-stop-completed-notification-type`
- Build passes: `cd apps/web && npx tsc --noEmit`
- Verify `sendStopCompletedNotification` is called in `completeStop()` via `after()`
- Verify the function follows the same idempotency + error-swallowing pattern as other notification functions
- Verify the in-app notification uses type `'stop_completed'`
  </verify>
  <done>
- `stop_completed` enum value exists in InAppNotificationType
- Migration applied to database
- When a driver completes a stop, the owner receives: (a) an email with stop details, (b) an in-app notification, (c) a push notification
- Notification never blocks the stop completion action (fire-and-forget via `after()`)
- Notification is idempotent (won't send twice for the same stop)
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with zero errors
- `cd apps/web && npx prisma validate` passes
- All 4 fixes implemented: live map centering, dispatch card state, greeting punctuation, stop completion notification
</verification>

<success_criteria>
- Live map auto-centers to vehicle(s) on initial load, does not re-center on poll
- Driver dispatch card shows 5 distinct button states matching dispatch/stop status
- Driver greeting ends with "!" not "."
- Stop completion triggers owner email + in-app notification + push notification via fire-and-forget after()
</success_criteria>
