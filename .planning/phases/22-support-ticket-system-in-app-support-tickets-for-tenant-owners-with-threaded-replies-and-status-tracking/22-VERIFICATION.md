---
phase: 22-support-ticket-system-in-app-support-tickets-for-tenant-owners-with-threaded-replies-and-status-tracking
verified: 2026-03-09T16:54:13Z
status: gaps_found
score: 9/10 must-haves verified
gaps:
  - truth: Admin can post a reply from admin-support dashboard (TicketMessage with senderType=ADMIN)
    status: partial
    reason: addAdminReply action and admin reply form UI are wired correctly but ticket-list.tsx renders ticket.type (undefined at runtime -- DB type column was dropped in migration 22-01) with stale enum helpers (FEATURE_REQUEST, QUESTION, ACCOUNT_ISSUE). RawTicket TypeScript type in getAllTickets declares type string instead of category/priority. Admin ticket list display is broken even though reply submission itself works.
    artifacts:
      - path: src/actions/support-tickets.ts
        issue: RawTicket type (line 157-162) declares type string instead of category string and priority string. SELECT star returns actual DB columns (category, priority) but TS type misnames the field.
      - path: src/app/(admin)/admin-support/ticket-list.tsx
        issue: Lines 19-42 define getTypeBadgeClass/getTypeLabel with old enum values (FEATURE_REQUEST, QUESTION, ACCOUNT_ISSUE). Lines 161-162 render ticket.type which is undefined at runtime since DB type column was dropped.
    missing:
      - Update RawTicket type in getAllTickets to use category string and priority string instead of type string
      - Replace getTypeBadgeClass/getTypeLabel in ticket-list.tsx with getCategoryBadgeClass/getCategoryLabel using values BILLING BUG FEATURE GENERAL
      - Replace ticket.type references in ticket-list.tsx JSX with ticket.category
---

# Phase 22: Support Ticket System -- Verification Report

**Phase Goal:** Tenant owners can submit support tickets (category, priority), view ticket history, receive replies in-thread. DriveCommand team receives email on new tickets and owner replies. Owners receive email when admin replies.
**Verified:** 2026-03-09T16:54:13Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TicketMessage table exists with correct columns | VERIFIED | Migration 20260309000001 creates TicketMessage with all required columns and FK to SupportTicket. schema.prisma has model TicketMessage. |
| 2 | SupportTicket has category and priority; type column dropped | VERIFIED | Migration drops type, adds category (SupportTicketCategory) and priority (SupportTicketPriority). schema.prisma reflects this. |
| 3 | SupportTicketStatus includes WAITING_ON_CUSTOMER | VERIFIED | Both migration SQL and schema.prisma include WAITING_ON_CUSTOMER. |
| 4 | Owner submits ticket with category and priority dropdowns (type gone) | VERIFIED | support-ticket-modal.tsx has TICKET_CATEGORIES and TICKET_PRIORITIES, category/priority state, calls createSupportTicket with both. No type field anywhere. |
| 5 | Owner sees ticket list with category/priority/status badges and links to detail | VERIFIED | /support/page.tsx renders all three badge types with WAITING_ON_CUSTOMER case, wraps cards in Link to /support/[ticket.id]. |
| 6 | Owner sees full ticket at /support/[id] with message thread and reply form | VERIFIED | 207-line page calls getTicketById, renders ticket header, OWNER/ADMIN message bubbles, imports OwnerReplyForm with textarea and char counter. |
| 7 | Owner reply creates TicketMessage(senderType=OWNER) and sets status=WAITING_ON_CUSTOMER | VERIFIED | addOwnerReply creates ticketMessage with senderType=OWNER and updates status in same transaction. |
| 8 | DriveCommand team receives email on new ticket and on owner reply | VERIFIED | sendNewTicketNotification in createSupportTicket. sendOwnerReplyNotification in addOwnerReply. Both fire-and-forget with substantive email templates. |
| 9 | Owner receives email when admin replies | VERIFIED | addAdminReply calls sendAdminReplyNotification with owner email (raw query). SupportTicketReplyToOwnerEmail exists with ticket details, message preview, CTA. |
| 10 | Admin can post reply from admin-support dashboard (TicketMessage senderType=ADMIN) | PARTIAL | addAdminReply wired and reply form UI present. But ticket list renders ticket.type (undefined at runtime) with stale enum helpers. Display broken. |

**Score:** 9/10 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| prisma/migrations/20260309000001_extend_support_ticket_add_messages/migration.sql | VERIFIED | All 9 steps: enums, category/priority add, type column drop, TicketMessage table, indexes. |
| prisma/schema.prisma | VERIFIED | model TicketMessage present. All new enums. SupportTicket has category and priority, no type field. |
| src/actions/support-tickets.ts | VERIFIED (caveat) | 8 exported actions, all substantive. RawTicket type at line 157 still declares type string -- DB mismatch. |
| src/app/(owner)/support/page.tsx | VERIFIED | Category/priority/status badges including WAITING_ON_CUSTOMER. Cards link to detail page. |
| src/app/(owner)/support/[id]/page.tsx | VERIFIED | 207 lines. Ticket header, OWNER/ADMIN message thread, OwnerReplyForm, closed notice. |
| src/app/(owner)/support/[id]/owner-reply-form.tsx | VERIFIED | Client component. Textarea, char counter, loading state, addOwnerReply call, toast, clears on success. |
| src/emails/support-ticket-created.tsx | VERIFIED | SupportTicketCreatedEmail with ticketNumber, title, category, priority, submitterEmail, CTA button. |
| src/emails/support-ticket-reply-to-admin.tsx | VERIFIED | SupportTicketReplyToAdminEmail with 300-char truncated message preview. |
| src/emails/support-ticket-reply-to-owner.tsx | VERIFIED | SupportTicketReplyToOwnerEmail with ticket details, message preview, View Full Thread CTA. |
| src/lib/email/send-support-notifications.ts | VERIFIED | Three exported functions. All call sendEmail with correct templates and recipients. |
| src/app/(admin)/admin-support/ticket-list.tsx | PARTIAL | addAdminReply and getTicketMessages wired. Reply form present. ticket.type access and stale enum helpers break category badge display. |
| src/app/api/cron/auto-close-tickets/route.ts | VERIFIED | CRON_SECRET auth, queries RESOLVED tickets older than 7 days, closes via updateMany, returns JSON. |
| src/components/navigation/support-badge.tsx | VERIFIED | Server component. Calls getUnreadAdminReplyCount, renders red badge, role-gated to OWNER in sidebar. |
| vercel.json | VERIFIED | 3 cron entries: send-reminders, warmup, auto-close-tickets at schedule 0 2 * * *. |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| support-ticket-modal.tsx | support-tickets.ts | createSupportTicket(category, priority) | WIRED |
| /support/[id]/page.tsx | support-tickets.ts | getTicketById | WIRED |
| owner-reply-form.tsx | support-tickets.ts | addOwnerReply | WIRED |
| support-tickets.ts | send-support-notifications.ts | sendNewTicketNotification + sendOwnerReplyNotification + sendAdminReplyNotification imported and called | WIRED |
| ticket-list.tsx | support-tickets.ts | addAdminReply and getTicketMessages imported and called | WIRED |
| vercel.json | auto-close-tickets/route.ts | cron schedule entry present | WIRED |
| support-badge.tsx | support-tickets.ts | getUnreadAdminReplyCount imported and called | WIRED |
| owner layout.tsx | support-badge.tsx | SupportBadge in Suspense passed as supportBadge prop to AppSidebar role-gated to OWNER | WIRED |

---

### Anti-Patterns Found

| File | Lines | Pattern | Severity | Impact |
|------|-------|---------|----------|--------|
| src/app/(admin)/admin-support/ticket-list.tsx | 19-42 | getTypeBadgeClass/getTypeLabel with stale old enum values (FEATURE_REQUEST, QUESTION, ACCOUNT_ISSUE) | Blocker | Admin sees blank/wrong category badges for all tickets |
| src/app/(admin)/admin-support/ticket-list.tsx | 161-162 | ticket.type in JSX -- column dropped from DB undefined at runtime | Blocker | Admin cannot see ticket categories in the dashboard |
| src/actions/support-tickets.ts | 157-162 | RawTicket TypeScript type declares type string (stale) instead of category/priority | Warning | TypeScript does not catch ticket.type access; propagates via TicketWithDetails export |

---

### Human Verification Required

#### 1. Reply form thread refresh

**Test:** Submit a reply on /support/[id] as an owner. Check whether the new message appears in the thread without a manual page reload.
**Expected:** Thread shows new OWNER message and status badge changes to Waiting on You.
**Why human:** OwnerReplyForm calls revalidatePath but thread is server-rendered. Cache invalidation behavior needs confirmation in running app.

#### 2. Email delivery end-to-end

**Test:** Submit a ticket and verify DRIVECOMMAND_SUPPORT_EMAIL inbox receives the notification. Have admin reply and verify owner inbox receives the reply notification.
**Expected:** Both emails arrive with correct ticket details.
**Why human:** Fire-and-forget; actual delivery depends on Gmail SMTP config and env vars.

#### 3. Sidebar badge lifecycle

**Test:** As owner with an unread admin reply, check sidebar My Tickets badge count. Reply to the ticket, then verify badge disappears.
**Expected:** Badge shows correct count, clears after owner responds.
**Why human:** Requires live session and DB state.

---

## Gaps Summary

One gap was found that blocks admin-support dashboard usability. The DB migration (Plan 22-01) correctly dropped the type column and added category and priority. All owner-facing code (Plan 22-02: modal, list page, detail page, reply form) was fully updated to use category/priority. Two files were not fully updated on the admin side.

In getAllTickets (src/actions/support-tickets.ts line 157), the RawTicket TypeScript type still declares type: string instead of category/priority. The SELECT * query returns the actual DB columns (category, priority) but TypeScript believes the field is named type. This propagates into the exported TicketWithDetails type.

In ticket-list.tsx (src/app/(admin)/admin-support/ticket-list.tsx lines 19-42 and 161-162), getTypeBadgeClass and getTypeLabel were never updated to use the new category field. At runtime ticket.type is undefined, resulting in blank badge output for all tickets in the admin dashboard. The reply form and thread loading in the same component work correctly.

The fix requires updating three locations: the RawTicket type definition, the two helper functions, and the two JSX lines that render ticket.type.

---

_Verified: 2026-03-09T16:54:13Z_
_Verifier: Claude (gsd-verifier)_