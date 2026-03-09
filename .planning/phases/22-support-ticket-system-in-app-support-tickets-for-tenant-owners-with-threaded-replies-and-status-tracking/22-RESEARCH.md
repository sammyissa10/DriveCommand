# Phase 22: Support Ticket System — Research

**Researched:** 2026-03-07
**Domain:** Support ticketing — threaded replies, email notifications, auto-close cron, owner portal UI
**Confidence:** HIGH

---

## Summary

Phase 22 is an extension of an already-implemented basic support ticket system (quick-41). The existing `SupportTicket` table, server actions, owner portal page, admin dashboard, and global modal all exist. The phase adds three net-new things: (1) a `TicketMessage` model for threaded replies, (2) richer schema fields (category enum, priority enum, the new status values WAITING_ON_CUSTOMER, and createdByUserId), and (3) email notifications + a cron-based auto-close job.

The key architectural delta from quick-41 to Phase 22 is the divergence between the existing enum values (quick-41 uses `SupportTicketType` with BUG/FEATURE_REQUEST/QUESTION/ACCOUNT_ISSUE/OTHER, and `SupportTicketStatus` with OPEN/IN_PROGRESS/RESOLVED/CLOSED) and what Phase 22 specifies (category enum BILLING/BUG/FEATURE/GENERAL, priority enum LOW/NORMAL/HIGH/URGENT, status adds WAITING_ON_CUSTOMER). These are **additive SQL migrations** — new enum values, new columns, new table — not destructive rewrites.

The project's full email and cron infrastructure is in place: Gmail SMTP via Nodemailer, `@react-email/components` for HTML templates, and Vercel Cron via `vercel.json`. The auto-close cron follows the same pattern as the existing `send-reminders` endpoint authenticated via `CRON_SECRET`.

**Primary recommendation:** Treat Phase 22 as three layered migrations: (1) SQL schema additions (new enums, new columns on SupportTicket, new TicketMessage table), (2) server actions + owner-portal UI for threaded replies, (3) email notifications + auto-close cron. Build each plan in that order with no plan skipping.

---

## What Already Exists (from quick-41)

This is critical for the planner — do not re-implement what is already built.

| Artifact | Location | Status |
|----------|----------|--------|
| `SupportTicket` DB table | `prisma/migrations/20260303000001_add_support_ticket/migration.sql` | EXISTS — no RLS, FK constraints to Tenant and User |
| `SupportTicket` Prisma model | `prisma/schema.prisma` (line 816) | EXISTS — no TicketMessage relation yet |
| `SupportTicketType` enum | schema.prisma (BUG, FEATURE_REQUEST, QUESTION, ACCOUNT_ISSUE, OTHER) | EXISTS — different from Phase 22 spec |
| `SupportTicketStatus` enum | schema.prisma (OPEN, IN_PROGRESS, RESOLVED, CLOSED) | EXISTS — missing WAITING_ON_CUSTOMER |
| Server actions | `src/actions/support-tickets.ts` | EXISTS — createSupportTicket, getMyTickets, getAllTickets, updateTicketStatus |
| Global support modal | `src/components/support/support-ticket-modal.tsx` | EXISTS — floating LifeBuoy button, Sheet form |
| Owner portal /support page | `src/app/(owner)/support/page.tsx` | EXISTS — card list, status/type badges |
| Admin support dashboard | `src/app/(admin)/admin-support/page.tsx` + `ticket-list.tsx` | EXISTS — stats, expandable rows, status update |
| Sidebar nav link | `src/components/navigation/sidebar.tsx` (line 391) | EXISTS — under "Support" group |
| Gmail SMTP email client | `src/lib/email/gmail-client.ts` | EXISTS — Nodemailer + `@react-email/render` |
| Cron infrastructure | `src/app/api/cron/send-reminders/route.ts` + `vercel.json` | EXISTS — CRON_SECRET pattern, Vercel Cron |
| Email templates | `src/emails/` | EXISTS — 7 templates using @react-email/components |

### Enum Conflict Resolution

The existing `SupportTicketType` uses `BUG, FEATURE_REQUEST, QUESTION, ACCOUNT_ISSUE, OTHER`. Phase 22 spec defines `category enum BILLING/BUG/FEATURE/GENERAL`. These are **different fields** — `type` vs `category`. The plan must:

- Keep the existing `type` field (or rename — planner decision, likely keep for backward compat)
- Add a new `category` column to SupportTicket with a new `SupportTicketCategory` enum
- Add a new `priority` column with a new `SupportTicketPriority` enum
- Add `WAITING_ON_CUSTOMER` to the existing `SupportTicketStatus` enum (ALTER TYPE ... ADD VALUE)
- Add `createdByUserId` column (Phase 22 uses this name; quick-41 uses `submittedBy`)

The safest migration approach: keep `submittedBy` as-is, add `createdByUserId` as an alias or add as required column that mirrors submittedBy. More likely: Phase 22 spec refers to the same field by a different name — use `submittedBy` (already exists) and just reference it as `createdByUserId` in the TicketMessage context.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.4.0 | ORM + migrations | Already in use throughout project |
| Next.js | 16.1.6 | App framework, Server Actions, API routes | Project standard |
| Nodemailer | 8.0.1 | Gmail SMTP email sending | Already in use (switched from Resend) |
| @react-email/components | 1.0.7 | React-based HTML email templates | Already in use for all email templates |
| @react-email/render | 2.0.4 | Render React email to HTML string | Already in use in gmail-client.ts |
| Zod | 4.3.6 | Input validation in server actions | Already in use in support-tickets.ts |
| shadcn/ui | (installed) | Sheet, Card, Badge, Select, Button | Used throughout; support modal uses these |
| sonner | (installed) | Toast notifications | Used in support modal and admin ticket-list |

### No New Packages Needed

Everything required for Phase 22 is already installed. No `npm install` required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── actions/
│   └── support-tickets.ts          # EXTEND — add getTicketMessages, addTicketMessage, getTicketById
├── app/
│   ├── (owner)/support/
│   │   ├── page.tsx                # EXTEND — add detail link to each ticket card
│   │   └── [id]/
│   │       └── page.tsx            # NEW — ticket detail page with message thread
│   ├── (admin)/admin-support/
│   │   ├── page.tsx                # EXISTS — no change needed for 22-02
│   │   └── ticket-list.tsx         # EXISTS — reply functionality added in 22-03
│   └── api/cron/
│       └── auto-close-tickets/
│           └── route.ts            # NEW — auto-close RESOLVED tickets after 7 days
├── emails/
│   ├── support-ticket-created.tsx  # NEW — email to DriveCommand team on new ticket
│   ├── support-ticket-reply.tsx    # NEW — email to owner when admin replies
│   └── support-owner-reply.tsx     # NEW — email to admin when owner replies
├── lib/email/
│   ├── send-support-ticket-created.ts  # NEW
│   ├── send-support-reply-to-owner.ts  # NEW
│   └── send-support-reply-to-admin.ts  # NEW
└── prisma/
    ├── schema.prisma               # EXTEND — add TicketMessage model, new enums
    └── migrations/
        └── 20260307000001_add_ticket_messages/migration.sql  # NEW
```

### Pattern 1: Adding Enum Values to PostgreSQL

Phase 22 needs `WAITING_ON_CUSTOMER` added to the existing `SupportTicketStatus` enum. PostgreSQL supports `ALTER TYPE ... ADD VALUE` which is idempotent via `DO ... EXCEPTION` block.

```sql
-- Source: existing migration pattern in this project
DO $$ BEGIN
  ALTER TYPE "SupportTicketStatus" ADD VALUE 'WAITING_ON_CUSTOMER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

Note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block with other DDL in PostgreSQL. The project's migrate.mjs wraps each migration in a transaction — this means `ADD VALUE` must be the ONLY statement in the migration OR the migration script must handle this. Check migrate.mjs behavior.

### Pattern 2: TicketMessage Model (No Prisma Relations)

Following the existing pattern: FK constraints in SQL only, no Prisma `@relation` decorators (keeps schema clean, no `supportTickets SupportTicket[]` cluttering the main models).

```prisma
// Source: existing SupportTicket pattern in prisma/schema.prisma
model TicketMessage {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId    String   @db.Uuid        // FK to SupportTicket.id (SQL only)
  senderType  TicketMessageSenderType  // OWNER | ADMIN
  senderLabel String                   // Display name (e.g. "Support Team", "John Smith")
  body        String
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@index([ticketId])
  @@index([createdAt])
}

enum TicketMessageSenderType {
  OWNER
  ADMIN
}
```

### Pattern 3: Email Notification Trigger in Server Actions

The existing pattern fires email after successful DB write. Follow the same approach for support ticket emails:

```typescript
// Source: src/lib/email/send-owner-invitation.ts pattern
// After createSupportTicket succeeds:
try {
  await sendSupportTicketCreated({
    ticketNumber,
    subject: title,
    category: data.category,
    priority: data.priority,
    submitterEmail: session.email,
    tenantName: tenant.name,
    ticketUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin-support`,
  });
} catch (emailError) {
  // Log but don't fail the ticket creation
  console.error('[createSupportTicket] email notification failed:', emailError);
}
```

**Critical:** Email failures must NOT fail the ticket creation. Always wrap in try/catch.

### Pattern 4: Auto-Close Cron

Follow the existing `/api/cron/send-reminders/route.ts` pattern exactly:

```typescript
// Source: src/app/api/cron/send-reminders/route.ts
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Find RESOLVED tickets older than 7 days with no owner reply
  // 3. Update status to CLOSED
  // 4. Return summary
}
```

Add to vercel.json crons array:
```json
{ "path": "/api/cron/auto-close-tickets", "schedule": "0 2 * * *" }
```

### Pattern 5: Threaded Message Timeline (Owner UI)

The ticket detail page is a new route at `/support/[id]`. It is a server component that:
1. Calls `getTicketById(id)` — returns ticket + messages
2. Renders ticket header (status badge, priority badge, category, original description)
3. Renders message thread in chronological order
4. Renders reply form (textarea + submit button) as a client component
5. Owner reply auto-sets ticket status to WAITING_ON_CUSTOMER via action

The reply form is a small client component embedded in the server page (same pattern as `AdminTicketList` inside `AdminSupportPage`).

### Pattern 6: Unread Reply Badge Count

Phase 22 spec requires a badge count on the sidebar "Help" section for unread admin replies. The simplest correct implementation: count TicketMessage records where senderType=ADMIN and the ticket's updatedAt is after the owner last viewed the ticket. However, tracking "last viewed" requires a separate column or session state.

**Recommended simplified approach:** Count tickets where the last message is from ADMIN and ticket status is NOT WAITING_ON_CUSTOMER (i.e., owner hasn't replied yet). This is a count query on TicketMessage, not a read-tracking system. The sidebar reads this count as a server component.

### Anti-Patterns to Avoid

- **Prisma relations on SupportTicket/TicketMessage to User/Tenant:** The existing decision is NO relations — FK constraints SQL-only. Do not add `@relation` decorators.
- **RLS on TicketMessage:** No RLS on TicketMessage (same as SupportTicket). Admin needs cross-tenant access. Use bypass_rls transaction pattern.
- **Failing ticket creation if email fails:** Email errors must be caught and logged; never propagate to the user.
- **Using ALTER TYPE ADD VALUE inside a transaction:** PostgreSQL 12+ allows this, but it cannot be rolled back. The project's migrate.mjs should handle this — verify before writing migration.
- **Tenant-scoping TicketMessage by tenantId:** TicketMessage has no tenantId — tenant scoping comes from joining to SupportTicket.tenantId. Don't add a redundant tenantId column to TicketMessage.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email sending | Custom SMTP client | `src/lib/email/gmail-client.ts` (sendEmail) | Already exists, battle-tested in project |
| HTML email templates | Inline HTML strings | `@react-email/components` + render() | All existing emails use this pattern |
| Cron authentication | Custom auth scheme | CRON_SECRET bearer token (existing pattern) | Matches Vercel's built-in cron header |
| Idempotency for emails | Custom dedup table | Can skip for support emails (low volume, no daily repetition) | Support notifications are event-driven, not daily batch |
| Toast notifications | Custom toast | sonner (already in root layout) | Imported as `toast` from `sonner` throughout app |
| Schema validation | Custom validators | Zod (already used in support-tickets.ts) | Consistent with existing actions |

**Key insight:** Phase 22 is pure extension work. The infrastructure is mature. The planner should reference existing files heavily, not build from scratch.

---

## Common Pitfalls

### Pitfall 1: ALTER TYPE ADD VALUE in Transactions
**What goes wrong:** PostgreSQL's `ALTER TYPE ... ADD VALUE` cannot be run inside a transaction block and then rolled back if something fails. If migrate.mjs wraps in BEGIN/COMMIT, this fails.
**Why it happens:** PostgreSQL restriction — enum value additions are not transactional before PG12, and even in PG12+ they can't be rolled back.
**How to avoid:** Put the `ALTER TYPE` migration in its own standalone migration file. The project's migrate.mjs applies each SQL file individually — verify this handles the restriction. Alternatively, create the new enums as entirely new types rather than adding to existing ones.
**Warning signs:** Migration error: "ALTER TYPE ... ADD VALUE cannot run inside a transaction block"

### Pitfall 2: Enum Value Mismatch Between quick-41 and Phase 22
**What goes wrong:** The phase spec defines `category enum BILLING/BUG/FEATURE/GENERAL` but the existing schema has `SupportTicketType enum BUG/FEATURE_REQUEST/QUESTION/ACCOUNT_ISSUE/OTHER`. These are different field names (`type` vs `category`). If the planner assumes `category` replaces `type`, existing data breaks.
**Why it happens:** Phase 22 was designed independently of quick-41's implementation details.
**How to avoid:** Add `category` as a NEW nullable column with a NEW `SupportTicketCategory` enum. Keep `type` unchanged. The existing modal uses `type`; new ticket creation can populate both `type` and `category`, or the modal can be updated to use `category` instead.
**Recommended resolution:** Replace the existing `type` field usage with `category` in the modal + actions, and add `priority` as new. Use a migration to: add `SupportTicketCategory` enum, add `SupportTicketPriority` enum, add `category` column (nullable initially), add `priority` column (nullable initially), backfill category from type where possible. Keep `type` for backward compat or drop it (no production data to worry about — this is fresh).

### Pitfall 3: Missing NEXT_PUBLIC_APP_URL in Email Links
**What goes wrong:** Email notification links to ticket detail URL use `process.env.NEXT_PUBLIC_APP_URL` — this may not be set in local dev.
**Why it happens:** env var is only set in Vercel production environment.
**How to avoid:** Follow the existing pattern: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/support/${ticketId}`
**Warning signs:** Emails work in prod but links are broken in local testing.

### Pitfall 4: Admin Reply Email Going to Wrong Address
**What goes wrong:** When an admin replies, the email goes to the ticket creator (owner). The owner's email must be looked up from the `submittedBy` UUID — requires a User lookup.
**Why it happens:** SupportTicket has no Prisma relation to User, so email address isn't automatically available.
**How to avoid:** In the `addAdminReply` server action, after inserting the TicketMessage, query `prisma.$queryRaw` to get the owner email by submittedBy UUID, then send email.

### Pitfall 5: Auto-Close Cron Finding Tickets by Last Message Date
**What goes wrong:** "Auto-close RESOLVED tickets after 7 days of no owner reply" requires knowing when the last owner reply was. If no TicketMessage exists for a ticket, the reference date is `updatedAt` on SupportTicket.
**Why it happens:** Closing logic needs a reliable "last activity by owner" timestamp.
**How to avoid:** Query: find SupportTicket WHERE status=RESOLVED AND (no TicketMessage with senderType=OWNER in last 7 days OR last message from OWNER was >7 days ago AND last status change to RESOLVED was >7 days ago). Simplest: check `SupportTicket.updatedAt` — when status is set to RESOLVED, `updatedAt` is set. If updatedAt is >7 days ago and no TicketMessage with senderType=OWNER after that date, close it.

### Pitfall 6: Ticket Detail Page Auth Scoping
**What goes wrong:** Owner accesses `/support/[id]` for a ticket belonging to a different tenant.
**Why it happens:** No RLS on SupportTicket — must enforce in server action.
**How to avoid:** `getTicketById(id)` must verify `ticket.submittedBy === userId` (for owners) or `ticket.tenantId === session.tenantId`. Never return a ticket to an owner that doesn't belong to their tenant.

---

## Code Examples

Verified patterns from existing project code:

### Email sending (from gmail-client.ts)
```typescript
// Source: src/lib/email/gmail-client.ts
import { sendEmail } from '@/lib/email/gmail-client';
import { SupportTicketCreatedEmail } from '@/emails/support-ticket-created';

await sendEmail({
  to: 'support@drivecommand.com', // DriveCommand team inbox
  subject: `New Support Ticket: ${ticketNumber} — ${subject}`,
  react: SupportTicketCreatedEmail({ ticketNumber, subject, tenantName, submitterEmail, ticketUrl }),
});
```

### bypass_rls transaction for cross-tenant reads
```typescript
// Source: src/actions/support-tickets.ts (existing getMyTickets pattern)
const messages = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  return tx.ticketMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  });
}, TX_OPTIONS);
```

### Cron endpoint authentication
```typescript
// Source: src/app/api/cron/send-reminders/route.ts
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ...
}
```

### Email template structure
```tsx
// Source: src/emails/owner-invitation.tsx pattern
import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components';

export function SupportTicketCreatedEmail({ ticketNumber, subject, tenantName, submitterEmail, ticketUrl }: Props) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* header, content, footer sections */}
        </Container>
      </Body>
    </Html>
  );
}
```

### Adding enum value via SQL migration (idempotent)
```sql
-- Source: project migration pattern
DO $$ BEGIN
  ALTER TYPE "SupportTicketStatus" ADD VALUE 'WAITING_ON_CUSTOMER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupportTicketCategory" AS ENUM ('BILLING', 'BUG', 'FEATURE', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Resend for emails | Gmail SMTP via Nodemailer 8.x | quick-43 area | All new email code uses `sendEmail()` from gmail-client.ts |
| Resend-style `{ id }` return | `sendEmail()` returns `{ id: nanoid() }` | quick-43 | Compatible with existing callers |

---

## Open Questions

1. **`type` vs `category` field collision**
   - What we know: existing `SupportTicket` has `type` (SupportTicketType enum), Phase 22 spec adds `category` (BILLING/BUG/FEATURE/GENERAL)
   - What's unclear: should `type` be renamed to `category`, or should both coexist? The existing modal uses `type`.
   - Recommendation: Drop `type` in favor of `category`. The migration adds `category` column, the modal switches to `category`. No production data exists to migrate (new feature). This keeps Phase 22 spec exact.

2. **`createdByUserId` vs `submittedBy` naming**
   - What we know: Phase 22 spec says `createdByUserId` but existing schema uses `submittedBy`
   - What's unclear: is `createdByUserId` a rename or a second column?
   - Recommendation: Keep `submittedBy` as the column name (it's the FK, already indexed). Reference it as `createdByUserId` only in TypeScript type aliases if needed. Don't add a duplicate column.

3. **Unread badge count implementation**
   - What we know: Phase 22 spec says "unread reply badge count" on sidebar nav
   - What's unclear: what defines "unread"? No read-tracking table exists.
   - Recommendation: Define "unread" as tickets where the most recent TicketMessage has senderType=ADMIN and ticket status is not WAITING_ON_CUSTOMER (meaning owner hasn't responded). Count these tickets. Simple query, no new table needed.

4. **CRON_SECRET env var**
   - What we know: existing cron uses `CRON_SECRET` bearer token, but it's not in .env.local
   - What's unclear: whether it's set in Vercel environment or needs to be added locally
   - Recommendation: The auto-close cron plan should note that CRON_SECRET must be set in Vercel env vars. Local testing can hardcode or set in .env.local.

5. **migrate.mjs and ALTER TYPE ADD VALUE**
   - What we know: migrate.mjs wraps each migration SQL file in a transaction
   - What's unclear: whether PostgreSQL 14+ (Supabase) allows ALTER TYPE ADD VALUE inside a transaction
   - Recommendation: PostgreSQL 12+ allows ALTER TYPE ADD VALUE inside a transaction block — it just can't be rolled back. Supabase uses PG15+, so this is safe. The migration can include ADD VALUE in the same file as other DDL.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `src/actions/support-tickets.ts` — existing server actions, bypass_rls pattern, TX_OPTIONS
- Direct code inspection of `prisma/schema.prisma` (lines 799-835) — existing SupportTicket model and enums
- Direct code inspection of `src/lib/email/gmail-client.ts` — email infrastructure
- Direct code inspection of `src/app/api/cron/send-reminders/route.ts` — cron pattern
- Direct code inspection of `src/emails/owner-invitation.tsx` — email template pattern
- Direct code inspection of `vercel.json` — cron schedule configuration

### Secondary (MEDIUM confidence)
- PostgreSQL documentation on ALTER TYPE ADD VALUE behavior in transactions (PG12+)
- Vercel Cron documentation pattern (consistent with existing vercel.json implementation)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified by direct package.json inspection
- Architecture: HIGH — patterns verified by reading existing implementation files
- Pitfalls: HIGH — derived from concrete code analysis, not speculation
- Enum conflict: HIGH — directly compared existing schema to Phase 22 spec

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable stack, main risk is schema migrations)
