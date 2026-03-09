---
phase: 22-support-ticket-system-in-app-support-tickets-for-tenant-owners-with-threaded-replies-and-status-tracking
plan: "02"
subsystem: owner-portal
tags: [support-tickets, threaded-replies, email-notifications, server-actions, next-js]

requires:
  - phase: 22-01
    provides: TicketMessage table, SupportTicketPriority/Category/TicketMessageSenderType enums, WAITING_ON_CUSTOMER status

provides:
  - createSupportTicket with category+priority fields and team email notification
  - getTicketById: scoped ticket+messages retrieval for authenticated owner
  - addOwnerReply: creates TicketMessage(OWNER), sets WAITING_ON_CUSTOMER, fires email notification
  - SupportTicketCreatedEmail template for new ticket team notification
  - SupportTicketReplyToAdminEmail template for owner-reply team notification
  - sendNewTicketNotification + sendOwnerReplyNotification helpers
  - /support list page with category/priority/status badges and clickable links to detail
  - /support/[id] ticket detail page with header, message thread, and reply form

affects:
  - 22-03 (admin portal plan — same TicketMessage/addAdminReply pattern)

tech-stack:
  added: []
  patterns:
    - "Fire-and-forget email: try/await sendNotification() in outer try/catch; failures logged, never thrown"
    - "OwnerReplyForm as 'use client' sub-component in server page directory"
    - "Right/left message bubble alignment by senderType (OWNER=right/blue, ADMIN=left/gray)"
    - "bypass_rls transaction for all TicketMessage operations (no RLS on table)"

key-files:
  created:
    - src/emails/support-ticket-created.tsx
    - src/emails/support-ticket-reply-to-admin.tsx
    - src/lib/email/send-support-notifications.ts
    - src/app/(owner)/support/[id]/page.tsx
    - src/app/(owner)/support/[id]/owner-reply-form.tsx
  modified:
    - src/actions/support-tickets.ts
    - src/components/support/support-ticket-modal.tsx
    - src/app/(owner)/support/page.tsx

key-decisions:
  - "Fire-and-forget email pattern for team notifications: await inside try/catch, failure logs console.error but never propagates to block ticket creation/reply"
  - "OwnerReplyForm in separate file owner-reply-form.tsx with 'use client' — clean separation from server detail page, same directory co-location"
  - "getSupportRecipient() checks DRIVECOMMAND_SUPPORT_EMAIL first, falls back to GMAIL_USER — single inbox until dedicated support email is configured"
  - "params is Promise<{id}> in Next.js App Router (async params pattern)"
  - "isClosed check covers both CLOSED and RESOLVED — both are terminal; hide reply form for both"

duration: 285
completed: 2026-03-09
---

# Phase 22 Plan 02: Support Ticket System — Owner Portal UI + Server Actions Summary

**Owner-facing ticket thread experience: priority/category modal form, list with priority badges, /support/[id] detail with chronological message thread, OwnerReplyForm, and fire-and-forget email notifications to DriveCommand team on new tickets and owner replies**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-09T16:38:50Z
- **Completed:** 2026-03-09T16:43:35Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extended `createSupportTicket` to accept `priority` field; fires `sendNewTicketNotification` after creation
- Added `getTicketById`: returns ticket+messages scoped to authenticated owner's tenant (bypass_rls transaction)
- Added `addOwnerReply`: creates TicketMessage(senderType=OWNER), auto-sets ticket status to WAITING_ON_CUSTOMER, fires `sendOwnerReplyNotification`
- Created `SupportTicketCreatedEmail` template: blue header, ticket detail table (ticketNumber/title/category/priority/from), CTA button
- Created `SupportTicketReplyToAdminEmail` template: owner details, 300-char quoted preview, View Thread CTA
- Created `send-support-notifications.ts` with two fire-and-forget helpers; recipient via DRIVECOMMAND_SUPPORT_EMAIL or GMAIL_USER
- Updated support modal to add Priority dropdown (NORMAL default, four values)
- Updated /support list page: BILLING=amber, GENERAL=blue category colors; priority badges; WAITING_ON_CUSTOMER status; cards wrapped in Link to /support/[id]
- Created /support/[id] server page: ticket header card (ticketNumber, badges, title, date, original description), chronological thread (OWNER=right blue, ADMIN=left gray), OwnerReplyForm or closed notice
- Production build passes, TypeScript compiles clean

## Task Commits

1. **Task 1: Server actions + email templates** - `1987ee7` (feat)
2. **Task 2: List page + detail page + reply form** - `9084770` (feat)

## Files Created/Modified

- `src/actions/support-tickets.ts` - Added SupportTicketPriority import, priority to schema+createSupportTicket, getTicketById, addOwnerReply, email helper imports
- `src/components/support/support-ticket-modal.tsx` - Added TICKET_PRIORITIES constant, priority state, Priority Select dropdown, passed priority to createSupportTicket
- `src/emails/support-ticket-created.tsx` - New email template for team on new ticket (blue header, detail table, CTA)
- `src/emails/support-ticket-reply-to-admin.tsx` - New email template for team on owner reply (300-char preview, quoted box, View Thread CTA)
- `src/lib/email/send-support-notifications.ts` - sendNewTicketNotification + sendOwnerReplyNotification wrappers over sendEmail
- `src/app/(owner)/support/page.tsx` - Priority badges, updated category colors, WAITING_ON_CUSTOMER status, Link wrapper on cards
- `src/app/(owner)/support/[id]/page.tsx` - New ticket detail page: header card, thread bubbles, OwnerReplyForm or closed notice
- `src/app/(owner)/support/[id]/owner-reply-form.tsx` - Client component: textarea + char counter + loading state + sonner toasts

## Decisions Made

- Fire-and-forget email for team notifications: await inside separate try/catch block so failures are logged but never block ticket operations
- OwnerReplyForm in dedicated file with 'use client' — colocated with server page, clean module boundary
- DRIVECOMMAND_SUPPORT_EMAIL env var with GMAIL_USER fallback: no breakage until dedicated email is provisioned
- params typed as `Promise<{id: string}>` — required by Next.js 15 App Router async params
- Both CLOSED and RESOLVED hide reply form (both terminal statuses; no further owner action needed)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files verified:
- FOUND: src/actions/support-tickets.ts
- FOUND: src/emails/support-ticket-created.tsx
- FOUND: src/emails/support-ticket-reply-to-admin.tsx
- FOUND: src/lib/email/send-support-notifications.ts
- FOUND: src/app/(owner)/support/[id]/page.tsx
- FOUND: src/app/(owner)/support/[id]/owner-reply-form.tsx

All commits verified:
- FOUND: 1987ee7 — feat(22-02-01)
- FOUND: 9084770 — feat(22-02-02)

Production build: PASSED (both /support and /support/[id] listed as dynamic routes)
TypeScript: PASSED (zero errors)
