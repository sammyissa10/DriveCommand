---
phase: "80"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/email/send-support-notifications.ts
  - src/actions/support-tickets.ts
autonomous: true
must_haves:
  truths:
    - "Admin reply notification skips sending when submitter email is undeliverable (no-mailbox domains like @drivecommand.com)"
    - "Admin reply notification logs a clear warning when email is skipped so admins can diagnose"
    - "Admin reply notification still sends correctly to valid external email addresses"
  artifacts:
    - path: "src/lib/email/send-support-notifications.ts"
      provides: "Email validation guard in sendAdminReplyNotification"
    - path: "src/actions/support-tickets.ts"
      provides: "Improved logging when email cannot be sent"
  key_links:
    - from: "src/actions/support-tickets.ts"
      to: "src/lib/email/send-support-notifications.ts"
      via: "sendAdminReplyNotification call in addAdminReply"
      pattern: "sendAdminReplyNotification"
---

<objective>
Fix TKT-0018: Support ticket reply emails bouncing when sent to undeliverable addresses like demo@drivecommand.com.

Purpose: When an admin replies to a support ticket, the notification email is sent to the ticket submitter's email from the User table. For demo/test accounts whose email domain has no mailbox (e.g., demo@drivecommand.com), Gmail bounces the email with "Delivery incomplete". The fix adds email validation before sending and clear logging when emails are skipped.

Output: Updated email notification system that gracefully handles undeliverable emails.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/email/send-support-notifications.ts
@src/actions/support-tickets.ts
@src/lib/email/gmail-client.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add email validation guard to sendAdminReplyNotification and improve addAdminReply logging</name>
  <files>src/lib/email/send-support-notifications.ts, src/actions/support-tickets.ts</files>
  <action>
**Root cause:** The `addAdminReply` server action correctly queries `SELECT email FROM "User" WHERE id = ${ticket.submittedBy}` to get the submitter's email. The problem is NOT in the lookup logic -- it correctly resolves to `demo@drivecommand.com` because that IS the email in the database for the demo user. The domain `drivecommand.com` has no mail service, so Gmail bounces. This also affects any future test/internal accounts with non-deliverable emails.

**In `src/lib/email/send-support-notifications.ts`:**

1. Add a helper function `isDeliverableEmail(email: string): boolean` near the top of the file (after the `getSupportRecipient` helper). This function should:
   - Return `false` if the email is empty or falsy
   - Return `false` if the email matches known non-deliverable domains: `drivecommand.com`, `example.com`, `test.com`, `localhost`
   - Use a simple domain extraction: `email.split('@')[1]?.toLowerCase()`
   - Store the blocked domains in a `const UNDELIVERABLE_DOMAINS` Set for easy maintenance
   - Return `true` for all other emails

2. Update `sendAdminReplyNotification` to check `isDeliverableEmail(params.ownerEmail)` before sending:
   - If not deliverable, log a warning: `console.warn('[sendAdminReplyNotification] Skipping email to undeliverable address:', params.ownerEmail, 'for ticket', params.ticketNumber)`
   - Return early (do not throw -- this is fire-and-forget)
   - If deliverable, proceed with existing send logic unchanged

**In `src/actions/support-tickets.ts`:**

3. In `addAdminReply` (around line 433), update the `if (ownerEmail)` block to also log when `ownerEmail` is empty:
   - Add an `else` branch: `console.warn('[addAdminReply] No email found for ticket submitter, skipping notification for ticket:', ticketNumber)`
   - This helps diagnose cases where the User record has no email at all

Do NOT change any other email sending functions (sendNewTicketNotification, sendOwnerReplyNotification) -- those send to the DriveCommand team inbox, not to end users.
Do NOT change the email lookup query in addAdminReply -- it correctly resolves the submitter email from the User table.
  </action>
  <verify>
1. `npx tsc --noEmit` passes without type errors
2. `npm run build` succeeds
3. Manually verify: read the updated files and confirm the UNDELIVERABLE_DOMAINS Set contains `drivecommand.com`, `example.com`, `test.com`, `localhost`
4. Confirm `sendAdminReplyNotification` has the guard check before the sendEmail call
5. Confirm `addAdminReply` logs a warning when ownerEmail is empty
  </verify>
  <done>
- Emails to demo@drivecommand.com (and other non-deliverable domains) are silently skipped with a console warning instead of bouncing
- Emails to real external addresses (e.g., user@gmail.com) continue to be sent normally
- Empty ownerEmail produces a diagnostic log message
- No TypeScript or build errors introduced
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation passes: `npx tsc --noEmit`
- Build succeeds: `npm run build`
- The UNDELIVERABLE_DOMAINS set is easy to extend (just add domains)
- Existing email flows (new ticket notification, owner reply notification) are untouched
</verification>

<success_criteria>
- Admin reply to a ticket with demo@drivecommand.com submitter no longer causes bounced email
- Admin reply to a ticket with a real email (e.g., user@gmail.com) still sends the notification
- Warning logs make it clear when and why an email was skipped
</success_criteria>

<output>
After completion, create `.planning/quick/80-tkt-0018-fix-support-ticket-reply-emails/80-SUMMARY.md`
</output>
