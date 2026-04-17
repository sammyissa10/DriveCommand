---
phase: quick-240
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/dispatches.ts
autonomous: true
must_haves:
  truths:
    - "When owner starts a trip, the assigned driver sees an unread notification in the web driver portal bell"
    - "Notification displays 'Trip Started' with the dispatch number"
    - "Start Trip action is never blocked by notification failure"
  artifacts:
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "In-app notification creation on dispatch status transition to in_progress"
      contains: "createNotification"
  key_links:
    - from: "apps/web/src/lib/carrier/dispatches.ts"
      to: "apps/web/src/lib/carrier/in-app-notifications.ts"
      via: "import createNotification"
      pattern: "createNotification"
---

<objective>
Add an in-app notification record when an owner/dispatcher starts a trip (dispatch transitions to in_progress), so the driver sees it in the web driver portal notification bell.

Purpose: The push notification (task 229) already fires for the native app. This adds the InAppNotification DB record so the web driver portal bell also shows the alert.
Output: Modified dispatches.ts with createNotification call inside the existing after() block.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/in-app-notifications.ts
@apps/web/prisma/schema.prisma (InAppNotificationType enum, InAppNotification model)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add in-app notification on dispatch start</name>
  <files>apps/web/src/lib/carrier/dispatches.ts</files>
  <action>
In the `transitionDispatchStatus` function (around line 334-361), inside the
`if (currentStatus === 'planned' && newStatus === 'in_progress')` block:

1. Add import at top of file:
   `import { createNotification } from '@/lib/carrier/in-app-notifications';`

2. Inside the existing `if (driver?.userId)` block (line 351), add a second
   `after()` call right after the existing `sendPushToUser` after() call (line 352-358).
   The new after() should call createNotification with:
   - orgId: dispatch.org_id (the dispatch record's orgId field — check exact field name, likely `orgId` on the Prisma model)
   - userId: driver.userId
   - type: 'dispatch_assigned' (reuse existing enum value — no schema migration needed)
   - title: 'Trip Started'
   - message: `Your dispatch ${dispatchNumber} has been started. Head to your first stop.`
   - entityType: 'dispatch'
   - entityId: id (the dispatch id parameter)

   Pattern — add right after the sendPushToUser after() block:
   ```typescript
   after(() =>
     createNotification({
       orgId: dispatch.orgId,
       userId: driver.userId!,
       type: 'dispatch_assigned',
       title: 'Trip Started',
       message: `Your dispatch ${dispatchNumber} has been started. Head to your first stop.`,
       entityType: 'dispatch',
       entityId: id,
     })
   );
   ```

   Note: createNotification already has internal try/catch and never throws,
   so the after() wrapper alone is sufficient. No extra try/catch needed around
   the after() call itself.

3. Do NOT modify the existing sendPushToUser logic from task 229.
4. Do NOT add a new enum value — reuse `dispatch_assigned`.
  </action>
  <verify>
Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit` — no TypeScript errors.
Grep dispatches.ts for createNotification to confirm the call exists.
  </verify>
  <done>
When dispatch transitions to in_progress, an InAppNotification record is created
for the primary driver with type dispatch_assigned, title "Trip Started", and the
dispatch number in the message. The Start Trip action is never blocked by notification
failure.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `grep -n "createNotification" apps/web/src/lib/carrier/dispatches.ts` shows the import and call
3. The createNotification call is inside an `after()` wrapper and within the `if (driver?.userId)` guard
4. The existing sendPushToUser call is unchanged
</verification>

<success_criteria>
- dispatches.ts imports createNotification from in-app-notifications.ts
- When dispatch status transitions to in_progress, createNotification is called via after()
- Notification uses dispatch_assigned type (existing enum), dispatch entityType, correct orgId and userId
- No TypeScript errors
- Push notification logic from task 229 is untouched
</success_criteria>

<output>
After completion, create `.planning/quick/240-add-in-app-notification-to-driver-when-o/240-SUMMARY.md`
</output>
