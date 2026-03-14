---
phase: quick-61
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(driver)/my-tickets/[id]/page.tsx
  - src/app/(driver)/my-tickets/[id]/driver-reply-form.tsx
  - src/app/(driver)/my-tickets/page.tsx
autonomous: true

must_haves:
  truths:
    - "Driver can click a ticket card on /my-tickets and navigate to /my-tickets/[id]"
    - "Driver sees ticket header with number, category, priority, status badges, title, and description"
    - "Driver sees message thread with bubble-style layout (Support Team on left, driver messages on right)"
    - "Driver can type and submit a reply on open tickets"
    - "Closed/resolved tickets show a closed notice instead of reply form"
  artifacts:
    - path: "src/app/(driver)/my-tickets/[id]/page.tsx"
      provides: "Server component rendering ticket detail with thread"
    - path: "src/app/(driver)/my-tickets/[id]/driver-reply-form.tsx"
      provides: "Client component for submitting driver replies"
    - path: "src/app/(driver)/my-tickets/page.tsx"
      provides: "Ticket list with clickable card links"
  key_links:
    - from: "src/app/(driver)/my-tickets/page.tsx"
      to: "/my-tickets/[id]"
      via: "Next.js Link on each ticket card"
      pattern: "Link.*href.*my-tickets"
    - from: "src/app/(driver)/my-tickets/[id]/page.tsx"
      to: "getTicketById"
      via: "server action import"
      pattern: "getTicketById"
    - from: "src/app/(driver)/my-tickets/[id]/driver-reply-form.tsx"
      to: "addOwnerReply"
      via: "server action import"
      pattern: "addOwnerReply"
---

<objective>
Add a driver ticket detail page at /driver/my-tickets/[id] so drivers can view their support ticket thread and reply.

Purpose: Drivers currently see a list of tickets but cannot click into them to see the message thread or reply. This completes the driver support ticket flow.
Output: Detail page with thread view and reply form, plus clickable cards on the list page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/support/[id]/page.tsx (reference implementation for ticket detail)
@src/app/(owner)/support/[id]/owner-reply-form.tsx (reference implementation for reply form)
@src/app/(driver)/my-tickets/page.tsx (list page to add links to)
@src/actions/support-tickets.ts (getTicketById, addOwnerReply -- already exist, already secure)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create driver ticket detail page and reply form</name>
  <files>src/app/(driver)/my-tickets/[id]/page.tsx, src/app/(driver)/my-tickets/[id]/driver-reply-form.tsx</files>
  <action>
Create `src/app/(driver)/my-tickets/[id]/page.tsx` as a server component. Mirror the owner detail page at `src/app/(owner)/support/[id]/page.tsx` with these adjustments:

1. Back link href should be `/my-tickets` (not `/support`), text "Back to My Tickets".
2. Import `DriverReplyForm` (not `OwnerReplyForm`).
3. In the message thread, determine sender alignment: messages with `senderType === 'OWNER'` go on the RIGHT (this is the driver's own messages -- the action stores them as OWNER senderType). Messages with `senderType === 'ADMIN'` go on the LEFT as "Support Team". Use `message.senderLabel || 'You'` for right-side messages.
4. Include dark mode classes on badges (match the driver list page patterns with `dark:` variants).
5. Call `getTicketById(id)` and `notFound()` if ticket is null -- identical pattern to owner page.
6. Closed notice text: "This ticket is closed -- you can open a new ticket using the support button in the bottom-right corner."

Create `src/app/(driver)/my-tickets/[id]/driver-reply-form.tsx` as a client component. This is functionally identical to `src/app/(owner)/support/[id]/owner-reply-form.tsx`:
- 'use client' directive
- Import and call `addOwnerReply` from `@/actions/support-tickets` (same action, it checks `submittedBy` so it works for drivers)
- Same textarea with 4000 char limit, same validation, same toast notifications
- After successful reply, also call `router.refresh()` from `next/navigation` to reload the server component and show the new message in the thread (the owner form lacks this -- improve it here)
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Verify the files exist at the correct paths.
  </verify>
  <done>
Driver detail page renders ticket header, message thread with bubble alignment, and reply form. Reply form submits via addOwnerReply and refreshes the page to show new messages. Closed tickets show closed notice.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add clickable links to driver ticket list cards</name>
  <files>src/app/(driver)/my-tickets/page.tsx</files>
  <action>
Modify `src/app/(driver)/my-tickets/page.tsx`:

1. Add `import Link from 'next/link';` at the top.
2. Wrap each `<Card>` element inside a `<Link href={/my-tickets/${ticket.id}}}>` with `className="block"`.
3. Keep the existing `hover:shadow-sm transition-shadow` on the Card. Add `cursor-pointer` if not already implied by the Link wrapper.
4. Do NOT change anything else about the card layout, badges, or content.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Visually confirm the cards are wrapped in links by checking the source.
  </verify>
  <done>
Each ticket card on /my-tickets is a clickable link that navigates to /my-tickets/[id].
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Navigate to /my-tickets -- cards are clickable links
3. Click a ticket -- detail page loads with header, thread, and reply form
4. Submit a reply -- message appears in thread after page refresh
5. View a closed ticket -- shows closed notice instead of reply form
</verification>

<success_criteria>
- Driver can navigate from ticket list to ticket detail and back
- Ticket detail shows header with badges, description, message thread, and reply form
- Reply form successfully submits and new message appears in thread
- Closed/resolved tickets show closed notice instead of reply form
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/61-tkt-0020-add-driver-ticket-detail-page-a/61-SUMMARY.md`
</output>
