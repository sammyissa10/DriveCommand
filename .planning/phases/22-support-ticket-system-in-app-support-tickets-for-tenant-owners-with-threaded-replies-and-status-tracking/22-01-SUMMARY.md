---
phase: 22-support-ticket-system-in-app-support-tickets-for-tenant-owners-with-threaded-replies-and-status-tracking
plan: "01"
subsystem: database
tags: [prisma, postgres, migration, enums, support-tickets, threaded-replies]

requires:
  - phase: quick-41
    provides: SupportTicket table with no-RLS pattern and bypass_rls transaction approach

provides:
  - TicketMessage table in PostgreSQL (id, ticketId FK with CASCADE, senderType, senderLabel, body, createdAt)
  - SupportTicketCategory enum (BILLING, BUG, FEATURE, GENERAL) replacing old SupportTicketType
  - SupportTicketPriority enum (LOW, NORMAL, HIGH, URGENT)
  - TicketMessageSenderType enum (OWNER, ADMIN)
  - WAITING_ON_CUSTOMER value added to SupportTicketStatus enum
  - SupportTicket.category and SupportTicket.priority columns

affects:
  - 22-02 (server actions plan — depends on TicketMessage model and new enums)
  - 22-03 (UI plan — depends on threaded reply data model)

tech-stack:
  added: []
  patterns:
    - "Idempotent enum addition via DO/EXCEPTION WHEN duplicate_object blocks"
    - "Nullable column backfill pattern: ADD COLUMN nullable → UPDATE to set default → leave nullable (no NOT NULL constraint in SQL to maintain idempotency)"
    - "No RLS on TicketMessage — admin needs cross-tenant visibility, consistent with SupportTicket"
    - "No Prisma @relation on TicketMessage — FK enforced at SQL level only, keeps models clean"

key-files:
  created:
    - prisma/migrations/20260309000001_extend_support_ticket_add_messages/migration.sql
  modified:
    - prisma/schema.prisma
    - src/actions/support-tickets.ts
    - src/components/support/support-ticket-modal.tsx
    - src/app/(driver)/my-tickets/page.tsx
    - src/app/(owner)/support/page.tsx

key-decisions:
  - "No RLS on TicketMessage — admin needs cross-tenant visibility; matches SupportTicket pattern from quick-41"
  - "No @relation decorators on TicketMessage — FK constraint is SQL-only, avoids polluting Tenant/User model relation arrays"
  - "SupportTicketType enum removed from schema.prisma only (not dropped in SQL) — may be referenced by DB catalog; safe to leave as unused SQL type"
  - "Category replaces type with cleaner 4-value set: BILLING, BUG, FEATURE, GENERAL (replaces 5-value BUG/FEATURE_REQUEST/QUESTION/ACCOUNT_ISSUE/OTHER)"
  - "WAITING_ON_CUSTOMER added to SupportTicketStatus to support reply workflow in Plan 02"

patterns-established:
  - "Idempotent migration pattern: DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$"

duration: 5min
completed: 2026-03-09
---

# Phase 22 Plan 01: Support Ticket System — Database Foundation Summary

**Additive PostgreSQL migration adding TicketMessage table, 3 new enums (Category/Priority/SenderType), WAITING_ON_CUSTOMER status, and category/priority columns to SupportTicket via idempotent SQL**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-09T00:11:53Z
- **Completed:** 2026-03-09T00:16:14Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created TicketMessage table with ticketId FK (CASCADE), senderType, senderLabel, body, createdAt and two indexes
- Added SupportTicketCategory (replaces SupportTicketType), SupportTicketPriority, TicketMessageSenderType enums via idempotent DO blocks
- Added WAITING_ON_CUSTOMER to SupportTicketStatus, added category and priority columns to SupportTicket, dropped old type column
- Regenerated Prisma client with all new types; TypeScript compiles clean

## Task Commits

1. **Task 1: Write extension migration SQL** - `843dddc` (feat)
2. **Task 2: Update prisma/schema.prisma and downstream files** - `87774b1` (feat)

## Files Created/Modified

- `prisma/migrations/20260309000001_extend_support_ticket_add_messages/migration.sql` - Idempotent extension migration: new enums, TicketMessage table, alter SupportTicket
- `prisma/schema.prisma` - Removed SupportTicketType, added SupportTicketCategory/Priority/TicketMessageSenderType enums, updated SupportTicket model, added TicketMessage model
- `src/actions/support-tickets.ts` - Replaced SupportTicketType import with SupportTicketCategory; updated createTicketSchema and createSupportTicket to use category field
- `src/components/support/support-ticket-modal.tsx` - Updated TICKET_TYPES to TICKET_CATEGORIES with new category values; type->category state
- `src/app/(driver)/my-tickets/page.tsx` - Updated getTypeBadgeClass/getTypeLabel helpers to getCategoryBadgeClass/getCategoryLabel for new category enum
- `src/app/(owner)/support/page.tsx` - Same category helper updates as driver my-tickets page

## Decisions Made

- No RLS on TicketMessage — admin needs cross-tenant visibility; consistent with SupportTicket pattern established in quick-41
- No `@relation` on TicketMessage to SupportTicket — FK enforced at SQL level only, avoids polluting SupportTicket model with relation array (same pattern as quick-41)
- SupportTicketType enum removed from schema.prisma only, not dropped via SQL — DB system catalog may reference it; safe to leave as unused SQL type
- Category enum has 4 values (BILLING, BUG, FEATURE, GENERAL) vs old type's 5 values — cleaner and covers the same user needs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed downstream TypeScript errors from SupportTicketType removal**
- **Found during:** Task 2 (Update prisma/schema.prisma)
- **Issue:** Three files still referenced the deleted SupportTicketType and the old `type` field on SupportTicket: support-ticket-modal.tsx, my-tickets/page.tsx (driver), support/page.tsx (owner)
- **Fix:** Updated all three files to use `category` field and new SupportTicketCategory values; updated helper functions getCategoryBadgeClass/getCategoryLabel replacing old type-based helpers
- **Files modified:** src/components/support/support-ticket-modal.tsx, src/app/(driver)/my-tickets/page.tsx, src/app/(owner)/support/page.tsx
- **Verification:** `npx tsc --noEmit` — zero errors
- **Committed in:** 87774b1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - downstream bug from schema change)
**Impact on plan:** Required for TypeScript compilation — all files that rendered ticket type are now on the new category field. No scope creep.

## Issues Encountered

None — migration ran cleanly on first attempt, prisma generate succeeded, TypeScript clean.

## Next Phase Readiness

- TicketMessage table exists in PostgreSQL with correct schema and FK constraint
- All new enums exported from @/generated/prisma (TicketMessage, SupportTicketCategory, SupportTicketPriority, TicketMessageSenderType)
- Plan 02 (server actions) can now implement addTicketMessage, getTicketWithMessages, and other reply actions
- Plan 03 (UI) can build the threaded reply interface against the data model

---
*Phase: 22-support-ticket-system*
*Completed: 2026-03-09*
