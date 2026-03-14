---
phase: quick-65
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/emails/fleet-message-notification.tsx
  - src/lib/email/send-fleet-message-notifications.ts
  - src/app/(driver)/actions/driver-messages.ts
  - src/app/(owner)/actions/fleet-messages.ts
autonomous: true
must_haves:
  truths:
    - "Owner receives email when driver sends a fleet message"
    - "Driver receives email when owner replies to a fleet message"
    - "Email failures never block message sending"
  artifacts:
    - path: "src/emails/fleet-message-notification.tsx"
      provides: "React Email template for fleet message notifications"
    - path: "src/lib/email/send-fleet-message-notifications.ts"
      provides: "Email sending functions for fleet messages"
      exports: ["sendDriverMessageNotification", "sendOwnerReplyNotification"]
  key_links:
    - from: "src/app/(driver)/actions/driver-messages.ts"
      to: "src/lib/email/send-fleet-message-notifications.ts"
      via: "fire-and-forget call after DB insert"
      pattern: "sendDriverMessageNotification"
    - from: "src/app/(owner)/actions/fleet-messages.ts"
      to: "src/lib/email/send-fleet-message-notifications.ts"
      via: "fire-and-forget call after DB insert"
      pattern: "sendOwnerReplyNotification"
---

<objective>
Add email notifications to the FleetMessage system built in quick-64. When a driver sends a message, the tenant owner gets an email. When an owner replies, the driver gets an email. Emails are fire-and-forget (never block the main operation).

Purpose: Keep owners and drivers informed of messages without requiring them to check the app constantly.
Output: One React Email template, one email sender module, two updated server actions.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/email/gmail-client.ts
@src/lib/email/send-support-notifications.ts
@src/emails/support-ticket-reply-to-owner.tsx
@src/app/(driver)/actions/driver-messages.ts
@src/app/(owner)/actions/fleet-messages.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create fleet message email template and sender</name>
  <files>src/emails/fleet-message-notification.tsx, src/lib/email/send-fleet-message-notifications.ts</files>
  <action>
Create a React Email template at src/emails/fleet-message-notification.tsx following the exact same structure and styling as src/emails/support-ticket-reply-to-owner.tsx (same header color #1e40af, same layout pattern, same style object structure). The template should accept props: { recipientName: string, senderName: string, senderRole: 'DRIVER' | 'OWNER', messagePreview: string, routeName?: string }. Header text: "New Fleet Message". Body: "{senderName} ({senderRole}) sent a message:" followed by a quote box with the message preview (truncated to 300 chars). No CTA button needed (drivers may not have easy web access). Footer: standard DriveCommand footer.

Create src/lib/email/send-fleet-message-notifications.ts with two exported async functions:

1. sendDriverMessageNotification({ driverName: string, messageBody: string, tenantId: string, routeName?: string }): Look up the tenant owner's email by querying User table where tenantId matches AND role is OWNER (use getTenantPrisma). Send email to owner using the template. If no owner found or no email, log warning and return silently.

2. sendOwnerReplyNotification({ ownerName: string, messageBody: string, driverId: string, routeName?: string }): Look up the driver's email by querying User table by driverId (use getTenantPrisma). Send email to driver using the template. If no driver found or no email, log warning and return silently.

Both functions import sendEmail from @/lib/email/gmail-client and use React.createElement (not JSX) since this is a .ts file not .tsx. Follow the same pattern as send-support-notifications.ts.

IMPORTANT: These functions must handle their own errors internally (try/catch wrapping the entire function body, logging errors with console.error, never throwing). This makes them safe for fire-and-forget usage.
  </action>
  <verify>npx tsc --noEmit --pretty 2>&1 | head -20 (no type errors in new files)</verify>
  <done>Fleet message email template renders with sender info and message preview. Two sender functions exist that look up recipient emails and send notifications, handling all errors internally.</done>
</task>

<task type="auto">
  <name>Task 2: Wire fire-and-forget emails into server actions</name>
  <files>src/app/(driver)/actions/driver-messages.ts, src/app/(owner)/actions/fleet-messages.ts</files>
  <action>
In src/app/(driver)/actions/driver-messages.ts, modify sendDriverMessage:
- After the successful prisma.fleetMessage.create call and before `return { success: true, message: 'Message sent.' }`, add a fire-and-forget email call following the exact pattern from support-tickets.ts (lines 432-444):
  ```
  // Fire-and-forget: notify owner
  try {
    await sendDriverMessageNotification({
      driverName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      messageBody: message.trim(),
      tenantId: user.tenantId,
    });
  } catch (emailError) {
    console.error('[sendDriverMessage] owner notification email failed:', emailError);
  }
  ```
- Import sendDriverMessageNotification from '@/lib/email/send-fleet-message-notifications'
- Need to expand the getCurrentUser select to include firstName, lastName, email if not already available. Check the getCurrentUser return type — if it already returns these fields, use them directly. If not, do a separate prisma.user.findUnique for the current user to get name/email.

In src/app/(owner)/actions/fleet-messages.ts, modify sendOwnerReply:
- After the successful prisma.fleetMessage.create call and before `return { success: true }`, add:
  ```
  // Fire-and-forget: notify driver
  try {
    // Look up driver assigned to route
    const routeWithDriver = await prisma.route.findFirst({
      where: { id: routeId },
      select: { driverId: true },
    });
    if (routeWithDriver?.driverId) {
      await sendOwnerReplyNotification({
        ownerName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
        messageBody: message.trim(),
        driverId: routeWithDriver.driverId,
      });
    }
  } catch (emailError) {
    console.error('[sendOwnerReply] driver notification email failed:', emailError);
  }
  ```
- Import sendOwnerReplyNotification from '@/lib/email/send-fleet-message-notifications'
- Same approach for user name resolution as driver-messages.ts.

CRITICAL: The try/catch around each email call ensures the main operation (message saved to DB) is NEVER affected by email failures. The return statement with success must be AFTER the email attempt (matching existing pattern).
  </action>
  <verify>npx tsc --noEmit --pretty 2>&1 | head -20 (no type errors). Then verify the fire-and-forget pattern by reading the modified files and confirming: (1) email call is after DB insert, (2) email call is wrapped in try/catch, (3) return { success } comes after email block.</verify>
  <done>sendDriverMessage notifies owner via email after saving. sendOwnerReply notifies driver via email after saving. Both use fire-and-forget pattern — email failures are caught and logged, never blocking the message operation.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npm run build` completes successfully
- New files exist: src/emails/fleet-message-notification.tsx, src/lib/email/send-fleet-message-notifications.ts
- Modified files have fire-and-forget email calls after DB insert
- No email failure can prevent message from being saved
</verification>

<success_criteria>
- React Email template created matching project email styling conventions
- Two email sender functions exist with internal error handling
- sendDriverMessage action sends owner notification after DB insert
- sendOwnerReply action sends driver notification after DB insert
- All email calls are fire-and-forget (try/catch wrapped, errors logged only)
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/65-tkt-0020-follow-up-send-email-notificati/65-SUMMARY.md`
</output>
