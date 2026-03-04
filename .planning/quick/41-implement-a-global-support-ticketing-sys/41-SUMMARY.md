---
phase: quick-41
plan: 01
subsystem: support
tags: [support-tickets, admin-dashboard, global-modal, multi-tenant]
dependency_graph:
  requires: [prisma/schema.prisma, src/lib/auth/server.ts, src/lib/db/prisma.ts]
  provides: [SupportTicket table, global support modal, My Tickets pages, admin dashboard]
  affects: [src/app/layout.tsx, src/components/navigation/sidebar.tsx, src/components/driver/driver-nav.tsx]
tech_stack:
  added: []
  patterns: [bypass_rls cross-tenant queries, auto-incrementing ticket numbers, Sheet modal, server actions with Zod]
key_files:
  created:
    - prisma/migrations/20260303000001_add_support_ticket/migration.sql
    - src/actions/support-tickets.ts
    - src/components/support/support-ticket-modal.tsx
    - src/app/(owner)/support/page.tsx
    - src/app/(driver)/support/page.tsx
    - src/app/(admin)/support/page.tsx
    - src/app/(admin)/support/ticket-list.tsx
  modified:
    - prisma/schema.prisma
    - src/app/layout.tsx
    - src/components/navigation/sidebar.tsx
    - src/components/driver/driver-nav.tsx
    - src/app/(admin)/layout.tsx
decisions:
  - No RLS on SupportTicket — system admins need cross-tenant access; tenant-scoped queries use WHERE clauses
  - bypass_rls transaction for ticket number generation — ensures cross-tenant uniqueness (TKT-NNNN format)
  - SupportTicketModal in root layout — single instance covers owner, driver, and admin portals
  - Separate AdminTicketList client component for expandable rows + inline status update without page reload
  - Resolution textarea conditionally renders only for RESOLVED and CLOSED statuses
  - No Prisma relations to Tenant/User on SupportTicket — clean schema, avoids relation field clutter
metrics:
  duration: 321s
  completed: 2026-03-03
  tasks: 3
  files_affected: 12
---

# Phase quick-41 Plan 01: Support Ticketing System Summary

**One-liner:** Global support ticket system with TKT-NNNN auto-numbering, cross-portal floating modal, and admin cross-tenant dashboard.

## What Was Built

Full support ticketing system spanning all three portals (owner, driver, admin):

1. **Database layer** — `SupportTicket` model with `SupportTicketType` and `SupportTicketStatus` enums. No RLS intentionally — system admins need cross-tenant visibility. Idempotent SQL migration with FK constraints to Tenant and User.

2. **Server actions** (`src/actions/support-tickets.ts`):
   - `createSupportTicket` — Zod validation, bypass_rls ticket number generation (TKT-0001, TKT-0002...), insert with tenantId + submittedBy auto-populated
   - `getMyTickets` — returns current user's own tickets ordered by date
   - `getAllTickets` — admin-only, enriches tickets with submitter email/name and tenant name via parallel queries
   - `updateTicketStatus` — admin-only, sets resolvedAt based on status, validates with Zod

3. **Global support modal** (`src/components/support/support-ticket-modal.tsx`) — fixed bottom-right circular button (blue gradient, LifeBuoy icon), Sheet panel with type select, title input, description textarea, auto-captures pathname as fromPage. Renders only when user is authenticated.

4. **Root layout integration** — `SupportTicketModal` added alongside `Toaster` in `src/app/layout.tsx` — available on every authenticated page.

5. **My Tickets pages** — identical card-based list in both `(owner)/support/page.tsx` and `(driver)/support/page.tsx`. Color-coded type and status badges, empty state, resolution display when ticket is resolved.

6. **Admin Support Dashboard** (`(admin)/support/page.tsx` + `ticket-list.tsx`) — stats row (total/open/in-progress/resolved), expandable ticket rows showing full description, submitted-from page, tenant name, submitter email, inline status select + resolution textarea, Save Changes button with toast feedback.

7. **Navigation** — Support group added to owner sidebar (LifeBuoy, My Tickets), Support nav item added to driver bottom nav, Support link added to admin header nav.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 974c34d | SupportTicket model, enums, and idempotent migration |
| 2 | 361dcb0 | Server actions, global modal, My Tickets pages, nav links |
| 3 | a9cdab7 | Admin dashboard with stats, expandable rows, inline status update |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files verified present:
- prisma/schema.prisma (modified)
- prisma/migrations/20260303000001_add_support_ticket/migration.sql (created)
- src/actions/support-tickets.ts (created)
- src/components/support/support-ticket-modal.tsx (created)
- src/app/(owner)/support/page.tsx (created)
- src/app/(driver)/support/page.tsx (created)
- src/app/(admin)/support/page.tsx (created)
- src/app/(admin)/support/ticket-list.tsx (created)
- src/app/(admin)/layout.tsx (modified)
- src/components/navigation/sidebar.tsx (modified)
- src/components/driver/driver-nav.tsx (modified)
- src/app/layout.tsx (modified)

All commits verified: 974c34d, 361dcb0, a9cdab7
TypeScript: zero errors across all three tasks
