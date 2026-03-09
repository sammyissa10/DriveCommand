---
phase: 22-support-ticket-system-in-app-support-tickets-for-tenant-owners-with-threaded-replies-and-status-tracking
plan: "03"
subsystem: ui, api, infra
tags: [support-tickets, server-actions, email, cron, sidebar, next-js, prisma]

requires:
  - phase: 22-01
    provides: SupportTicket + TicketMessage schema, createSupportTicket/getAllTickets/updateTicketStatus actions, admin dashboard
  - phase: 22-02
    provides: getTicketById/addOwnerReply actions, owner support portal pages (/support, /support/[id]), email notifications to team

provides:
  - addAdminReply server action (TicketMessage senderType=ADMIN + owner email notification)
  - getTicketMessages server action (admin thread loading)
  - getUnreadAdminReplyCount server action (sidebar badge for owners)
  - SupportTicketReplyToOwnerEmail template
  - sendAdminReplyNotification in send-support-notifications.ts
  - /api/cron/auto-close-tickets cron endpoint (RESOLVED -> CLOSED after 7 days)
  - Admin reply UI inline in ticket-list.tsx (message thread + reply form)
  - SupportBadge server component + owner sidebar integration

affects: [phase 23-system-admin, sidebar modifications, email pipeline]

tech-stack:
  added: []
  patterns:
    - SupportBadge as isolated server component imported via Suspense wrapper from layout (client sidebar cannot call server actions directly)
    - Fire-and-forget email in addAdminReply via inner try/catch (email failures never block ticket operations)
    - useTransition for reply submission (React 18 concurrent pattern, no custom loading state needed)
    - Messages refreshed client-side after successful reply (clear + re-call getTicketMessages)

key-files:
  created:
    - src/emails/support-ticket-reply-to-owner.tsx
    - src/app/api/cron/auto-close-tickets/route.ts
    - src/components/navigation/support-badge.tsx
  modified:
    - src/actions/support-tickets.ts
    - src/lib/email/send-support-notifications.ts
    - src/app/(admin)/admin-support/ticket-list.tsx
    - src/components/navigation/sidebar.tsx
    - src/components/navigation/owner-shell.tsx
    - src/app/(owner)/layout.tsx
    - vercel.json

key-decisions:
  - "SupportBadge as isolated server component passed via Suspense from OwnerLayout — sidebar is 'use client', server actions cannot be called in component body; props-as-children pattern maintains correct server/client boundary"
  - "useTransition for reply submission — avoids separate isSending state, integrates with React 18 concurrent features"
  - "Messages cleared and re-fetched after successful reply — simpler than optimistic append which would need full TicketMessage shape"
  - "WAITING_ON_CUSTOMER included in IN_PROGRESS tab count — both statuses represent active in-flight conversations from admin perspective"

patterns-established:
  - "Server component badge pattern: SupportBadge server component → passed as Suspense child from layout → forwarded via props to client sidebar"

duration: 5min
completed: 2026-03-09
---

# Phase 22 Plan 03: Admin Reply UI and Auto-Close Cron Summary

**addAdminReply server action with owner email notification, threaded message view in admin dashboard, auto-close cron for stale RESOLVED tickets, and sidebar unread badge for owners via SupportBadge server component**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-09T00:06:02Z
- **Completed:** 2026-03-09T00:10:38Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Admin can reply to tickets from the admin-support dashboard with a full message thread view and inline reply form; reply creates TicketMessage(senderType=ADMIN) and sets ticket to IN_PROGRESS
- Owner receives an email with message preview and "View Full Thread" CTA when admin replies (fire-and-forget via SupportTicketReplyToOwnerEmail)
- /api/cron/auto-close-tickets closes RESOLVED tickets older than 7 days with no owner reply — scheduled daily at 02:00 UTC in vercel.json
- Sidebar "My Tickets" link shows a red numeric badge for owners when admin has replied and ticket is pending owner response, implemented via SupportBadge server component with Suspense

## Task Commits

1. **Task 1: Admin reply action + owner email notification + auto-close cron** - `35e4f00` (feat)
2. **Task 2: Admin reply UI + sidebar unread badge** - `141bde1` (feat)

## Files Created/Modified

- `src/actions/support-tickets.ts` - Added addAdminReply, getTicketMessages, getUnreadAdminReplyCount server actions
- `src/emails/support-ticket-reply-to-owner.tsx` - New email template: "Support Ticket Update" with preview + View Full Thread button
- `src/lib/email/send-support-notifications.ts` - Added sendAdminReplyNotification function
- `src/app/api/cron/auto-close-tickets/route.ts` - New cron endpoint: closes RESOLVED tickets >7 days old, CRON_SECRET auth
- `vercel.json` - Added /api/cron/auto-close-tickets entry (daily 02:00 UTC), now 3 cron entries total
- `src/app/(admin)/admin-support/ticket-list.tsx` - Added message thread display and inline reply form to TicketRow; WAITING_ON_CUSTOMER in IN_PROGRESS tab
- `src/components/navigation/support-badge.tsx` - New server component wrapping getUnreadAdminReplyCount
- `src/components/navigation/sidebar.tsx` - AppSidebar accepts supportBadge prop, renders it in My Tickets link for OWNER role
- `src/components/navigation/owner-shell.tsx` - OwnerShell forwards supportBadge prop to AppSidebar
- `src/app/(owner)/layout.tsx` - OwnerLayout passes Suspense-wrapped SupportBadge to OwnerShell

## Decisions Made

- **SupportBadge server component pattern**: The sidebar is `'use client'` and cannot call server actions directly in the component body. Created an isolated `SupportBadge` server component that calls `getUnreadAdminReplyCount`, passed as a Suspense-wrapped prop from the server `OwnerLayout` down through `OwnerShell` to `AppSidebar`. This maintains the correct Next.js server/client boundary without converting the entire sidebar to a server component.
- **useTransition for reply submission**: Avoids a separate `isSending` useState, integrates with React 18 concurrent rendering model.
- **Messages cleared and re-fetched after successful reply**: Simpler than optimistic append which would require constructing a full TicketMessage shape client-side.
- **WAITING_ON_CUSTOMER counted in IN_PROGRESS tab**: From an admin perspective, both IN_PROGRESS and WAITING_ON_CUSTOMER represent active in-flight conversations — combining them in one tab avoids confusion.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 22 (Support Ticket System) is fully complete — all 3 plans shipped
- Ticket lifecycle: owner submits → admin sees in dashboard → admin replies (owner emailed) → owner replies (admin emailed) → admin resolves → auto-closes after 7 days
- Ready for Phase 23 (System Admin Portal) which will include cross-tenant support management

---
*Phase: 22-support-ticket-system*
*Completed: 2026-03-09*

## Self-Check: PASSED

All files verified present. Both task commits (35e4f00, 141bde1) confirmed in git log. vercel.json has 3 cron entries. TypeScript compiles clean. Production build succeeds.
