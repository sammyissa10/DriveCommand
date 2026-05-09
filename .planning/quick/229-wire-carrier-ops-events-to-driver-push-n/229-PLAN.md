---
phase: quick-229
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/send-push.ts
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
  - apps/web/src/app/(owner)/actions/fleet-messages.ts
autonomous: true
must_haves:
  truths:
    - "Driver receives push notification when assigned to a new dispatch"
    - "Driver receives push notification when their dispatch transitions to in_progress"
    - "Driver(s) receive push notification when owner sends a fleet message (broadcast or targeted)"
    - "All push sends use after() pattern, never fire-and-forget void"
    - "Invalid/expired push tokens are cleaned up on DeviceNotRegistered error"
  artifacts:
    - path: "apps/web/src/lib/notifications/send-push.ts"
      provides: "Enhanced push helper with DeviceNotRegistered cleanup and sendPushToOrg"
      exports: ["sendPushToUser", "sendPushToOrg"]
    - path: "apps/web/src/lib/carrier/notifications.ts"
      provides: "Push notification alongside email in sendDispatchAssignedNotification"
      contains: "sendPushToUser"
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "Push notification on planned->in_progress transition"
      contains: "sendPushToUser"
  key_links:
    - from: "apps/web/src/lib/carrier/notifications.ts"
      to: "apps/web/src/lib/notifications/send-push.ts"
      via: "import sendPushToUser"
      pattern: "sendPushToUser"
    - from: "apps/web/src/lib/carrier/dispatches.ts"
      to: "apps/web/src/lib/notifications/send-push.ts"
      via: "import sendPushToUser, after() wrapper"
      pattern: "after.*sendPushToUser"
---

<objective>
Wire Carrier Ops events to driver push notifications on mobile.

Purpose: Drivers currently only receive email notifications for carrier events. This adds push notifications via Expo so drivers get instant mobile alerts for dispatch assignments, trip starts, and fleet messages.

Output: Enhanced send-push.ts with token cleanup + sendPushToOrg, push sends wired into 3 carrier event trigger points using after() pattern.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/notifications/send-push.ts
@apps/web/src/lib/carrier/notifications.ts
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
@apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
@apps/web/src/app/(owner)/actions/fleet-messages.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enhance send-push.ts with DeviceNotRegistered cleanup and sendPushToOrg</name>
  <files>apps/web/src/lib/notifications/send-push.ts</files>
  <action>
Modify the existing `sendPushToUser` function in `apps/web/src/lib/notifications/send-push.ts`:

1. **Add DeviceNotRegistered token cleanup.** After `expo.sendPushNotificationsAsync(chunk)` returns receipts, check each receipt. When `receipt.status === 'error'` and `receipt.details?.error === 'DeviceNotRegistered'`, delete that PushToken record from the database. The receipt index corresponds to the message index in the chunk, so track which token maps to which message. Use a try/catch around the delete so cleanup failures never propagate. Log the cleanup at info level: `[send-push] removed invalid token for userId`.

2. To map receipts back to tokens: change the chunk iteration to track `(token, receiptIndex)` pairs. Before chunking, build an array of `{ token, pushToken }` objects. When iterating receipts, use the index to find the corresponding token string, then delete from PushToken where `token = thatToken`.

3. **Add a new exported function `sendPushToOrg`:**
```typescript
export async function sendPushToOrg(
  orgId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  },
  options?: { role?: string }
): Promise<void>
```
Implementation:
- Query PushToken joined through User where `user.tenantId = orgId` and `user.isActive = true`
- If `options.role` provided, also filter `user.role = options.role`
- Use the same RLS bypass pattern already in the file: `tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\``
- Build ExpoPushMessages for all valid tokens, chunk and send via `expo.chunkPushNotifications` + `expo.sendPushNotificationsAsync`
- Apply same DeviceNotRegistered cleanup logic
- Wrap entire function in try/catch, log errors, never throw

Keep all existing behavior intact. The `sendPushToUser` signature and behavior remain the same, just with added cleanup.
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web` — no type errors in send-push.ts. Confirm both `sendPushToUser` and `sendPushToOrg` are exported.</verify>
  <done>send-push.ts exports sendPushToUser (with DeviceNotRegistered cleanup) and sendPushToOrg (org-wide push with tenant isolation via User join).</done>
</task>

<task type="auto">
  <name>Task 2: Wire push notifications into dispatch-assigned and dispatch in_progress</name>
  <files>apps/web/src/lib/carrier/notifications.ts, apps/web/src/lib/carrier/dispatches.ts</files>
  <action>
**In `apps/web/src/lib/carrier/notifications.ts` — sendDispatchAssignedNotification:**

1. Add import: `import { sendPushToUser } from '@/lib/notifications/send-push';`
2. After the existing in-app notification block (line ~175, after `createNotification(...)` call), add push notification send. The CarrierDriver `driverId` is what we have, but `sendPushToUser` needs the User `userId`. The driver's userId is already queryable:
```typescript
// Send mobile push notification to the driver
const driverRecord = await prisma.carrierDriver.findFirst({
  where: { id: driverId },
  select: { userId: true },
});
if (driverRecord?.userId) {
  await sendPushToUser(driverRecord.userId, {
    title: 'New Dispatch Assigned',
    body: `${dispatchNumber} — ${dispatchRaw._count.stops} stops — Departs ${scheduledDeparture}`,
    data: { type: 'dispatch_assigned', dispatchId },
  });
}
```
Place this INSIDE the existing try/catch block, before the final logger.info. The entire function already catches errors and never throws, so push failure is handled.

Note: We do NOT need to add `after()` here because `sendDispatchAssignedNotification` itself is ALREADY called inside `after()` in dispatches.ts (lines 228-230 and 296-297). The push call runs within that same after() context.

**In `apps/web/src/lib/carrier/dispatches.ts` — transitionDispatchStatus:**

1. `import { sendPushToUser } from '@/lib/notifications/send-push';` (after() is already imported)
2. In the `planned` -> `in_progress` block (line 333-343), after the `prisma.carrierDispatch.update` and before the `return`, add:
```typescript
// Notify driver that trip has started
const driver = await prisma.carrierDriver.findFirst({
  where: { id: dispatch.primaryDriverId },
  select: { userId: true },
});
const dispatchNumberMatch = dispatch.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
const dispatchNumber = dispatchNumberMatch ? dispatchNumberMatch[1] : id.slice(0, 8);
if (driver?.userId) {
  after(() =>
    sendPushToUser(driver.userId!, {
      title: 'Trip Started',
      body: `${dispatchNumber} is now in progress`,
      data: { type: 'dispatch_in_progress', dispatchId: id },
    })
  );
}
```
Use `after()` here because `transitionDispatchStatus` is called directly from API routes/actions, not from within an existing `after()`.
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web` — no type errors. Grep for `sendPushToUser` in both files to confirm it appears in the expected locations.</verify>
  <done>Dispatch-assigned sends push to driver (title: "New Dispatch Assigned", body includes dispatch number + stop count + departure). Dispatch in_progress sends push to driver (title: "Trip Started", body includes dispatch number). Both use after() pattern (dispatch-assigned inherits it from caller, in_progress wraps explicitly).</done>
</task>

<task type="auto">
  <name>Task 3: Convert fleet message push sends from void fire-and-forget to after() pattern</name>
  <files>apps/web/src/app/api/mobile/owner/fleet/messages/route.ts, apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts, apps/web/src/app/(owner)/actions/fleet-messages.ts</files>
  <action>
All 4 fleet message creation points already send push notifications via `void sendPushToUser(...)`. Convert all to use `after()` and improve the notification content.

**In `apps/web/src/app/api/mobile/owner/fleet/messages/route.ts` (POST handler):**

1. Add import: `import { after } from 'next/server';` and `import { sendPushToOrg } from '@/lib/notifications/send-push';`
2. Replace the push notification block (lines 314-333). Change:
   - Title from `'Fleet Message'` to `'New Message from Dispatcher'`
   - For broadcast: replace the inline driver query + void loop with:
     ```typescript
     after(() =>
       sendPushToOrg(tenantId, {
         title: 'New Message from Dispatcher',
         body: pushBodyText,
         data: { type: 'fleet_message', messageId: created.id },
       }, { role: 'DRIVER' })
     );
     ```
   - For targeted (recipientId): replace `void sendPushToUser(...)` with:
     ```typescript
     after(() =>
       sendPushToUser(recipientId, {
         title: 'New Message from Dispatcher',
         body: pushBodyText,
         data: { type: 'fleet_message', messageId: created.id },
       })
     );
     ```

**In `apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts` (POST handler):**

1. Add import: `import { after } from 'next/server';` and `import { sendPushToOrg } from '@/lib/notifications/send-push';`
2. Replace push block (lines 301-320). Same pattern:
   - For broadcast: `after(() => sendPushToOrg(tenantId, { title: 'New Message from Dispatcher', body: pushBodyText, data: { type: 'fleet_message', messageId: created.id } }, { role: 'DRIVER' }));`
   - For targeted (non-load, non-route): `after(() => sendPushToUser(recipientId, { title: 'New Message from Dispatcher', body: pushBodyText, data: { type: 'fleet_message', messageId: created.id } }));`
   - Load/route threads: still skip push (no single recipient)

**In `apps/web/src/app/(owner)/actions/fleet-messages.ts`:**

1. Add import: `import { after } from 'next/server';`
2. In `sendOwnerLoadReply` (line ~154): replace `void sendPushToUser(load.driverId, ...)` with:
   ```typescript
   after(() =>
     sendPushToUser(load.driverId!, {
       title: 'New Message from Dispatcher',
       body: message.trim().slice(0, 100),
       data: { type: 'fleet_message', messageId: 'load-reply' },
     })
   );
   ```
3. In `sendOwnerReply` (line ~219): replace `void sendPushToUser(route.driverId, ...)` with:
   ```typescript
   after(() =>
     sendPushToUser(route.driverId!, {
       title: 'New Message from Dispatcher',
       body: message.trim().slice(0, 100),
       data: { type: 'fleet_message', messageId: 'route-reply' },
     })
   );
   ```

In all cases: remove any `void sendPushToUser(...)` calls and replace with `after(() => sendPushToUser(...))`. The `after()` pattern ensures the push send survives serverless execution context freezing.
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web` — no type errors. Grep for `void sendPushToUser` across the codebase — should return zero results in the modified files. Grep for `after.*sendPushToUser\|after.*sendPushToOrg` to confirm all push sends are wrapped in after().</verify>
  <done>All 4 fleet message creation points use after() for push sends. Broadcast messages use sendPushToOrg with role=DRIVER filter. Targeted messages use sendPushToUser. Title standardized to "New Message from Dispatcher". No fire-and-forget void calls remain.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors
2. `grep -rn "void sendPushToUser" apps/web/src/` — zero matches (all converted to after())
3. `grep -rn "sendPushToUser\|sendPushToOrg" apps/web/src/lib/carrier/notifications.ts apps/web/src/lib/carrier/dispatches.ts apps/web/src/app/api/mobile/owner/fleet/messages/ apps/web/src/app/\(owner\)/actions/fleet-messages.ts` — confirms push calls in all 3 trigger points
4. `grep -rn "DeviceNotRegistered" apps/web/src/lib/notifications/send-push.ts` — confirms token cleanup exists
5. `grep -rn "after(" apps/web/src/app/api/mobile/owner/fleet/messages/` — confirms after() wrapping in mobile routes
</verification>

<success_criteria>
- sendPushToUser enhanced with DeviceNotRegistered token cleanup (deletes stale PushToken rows)
- sendPushToOrg created for org-wide push with tenant isolation (joins PushToken through User.tenantId)
- Dispatch assigned: driver gets push with title "New Dispatch Assigned" and dispatch details
- Dispatch in_progress: driver gets push with title "Trip Started" and dispatch number
- Fleet messages (all 4 creation points): driver(s) get push with title "New Message from Dispatcher"
- All push sends use after() pattern — zero void fire-and-forget calls remain
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/229-wire-carrier-ops-events-to-driver-push-n/229-SUMMARY.md`
</output>
