---
phase: quick-41
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260303000001_add_support_ticket/migration.sql
  - src/actions/support-tickets.ts
  - src/components/support/support-ticket-modal.tsx
  - src/components/navigation/sidebar.tsx
  - src/components/driver/driver-nav.tsx
  - src/app/(owner)/support/page.tsx
  - src/app/(driver)/support/page.tsx
  - src/app/(admin)/support/page.tsx
  - src/app/(admin)/layout.tsx
autonomous: true
must_haves:
  truths:
    - "Any authenticated user (OWNER, MANAGER, DRIVER) can open a support modal from any page"
    - "User can submit a ticket with type, title, and description"
    - "Ticket auto-populates submitted_by, tenant_id, from_page, created_at"
    - "User can view their own submitted tickets on a My Tickets page"
    - "System admins can view ALL tickets across tenants on the admin support dashboard"
    - "System admins can update ticket status and add resolution notes"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "SupportTicket model with enums"
      contains: "model SupportTicket"
    - path: "prisma/migrations/20260303000001_add_support_ticket/migration.sql"
      provides: "Database migration for SupportTicket table"
      contains: "CREATE TABLE"
    - path: "src/actions/support-tickets.ts"
      provides: "Server actions for ticket CRUD"
      exports: ["createSupportTicket", "getMyTickets", "getAllTickets", "updateTicketStatus"]
    - path: "src/components/support/support-ticket-modal.tsx"
      provides: "Global support button + sheet modal"
    - path: "src/app/(owner)/support/page.tsx"
      provides: "My Tickets page for owner/manager portal"
    - path: "src/app/(driver)/support/page.tsx"
      provides: "My Tickets page for driver portal"
    - path: "src/app/(admin)/support/page.tsx"
      provides: "Admin support dashboard showing all tickets"
  key_links:
    - from: "src/components/support/support-ticket-modal.tsx"
      to: "src/actions/support-tickets.ts"
      via: "createSupportTicket server action"
      pattern: "createSupportTicket"
    - from: "src/app/(admin)/support/page.tsx"
      to: "src/actions/support-tickets.ts"
      via: "getAllTickets + updateTicketStatus"
      pattern: "getAllTickets|updateTicketStatus"
---

<objective>
Implement a global support ticketing system allowing any authenticated user to submit
support tickets from any page, view their own tickets, and enabling system admins to
manage all tickets across tenants.

Purpose: Provide a built-in support channel for DriveCommand users to report issues
and request help, with centralized ticket management for the DriveCommand team.

Output: SupportTicket DB table, global support button/modal, My Tickets pages
(owner + driver portals), Admin Support Dashboard.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma
@src/app/(owner)/layout.tsx
@src/app/(driver)/layout.tsx
@src/app/(admin)/layout.tsx
@src/app/(admin)/actions/tenants.ts
@src/components/navigation/sidebar.tsx
@src/components/navigation/owner-shell.tsx
@src/lib/auth/auth-context.tsx
@src/lib/auth/server.ts
@src/lib/auth/session.ts
@src/lib/db/prisma.ts
@src/app/layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Database schema — SupportTicket model + migration</name>
  <files>
    prisma/schema.prisma
    prisma/migrations/20260303000001_add_support_ticket/migration.sql
  </files>
  <action>
1. Add two enums to prisma/schema.prisma:

```
enum SupportTicketType {
  BUG
  FEATURE_REQUEST
  QUESTION
  ACCOUNT_ISSUE
  OTHER
}

enum SupportTicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}
```

2. Add SupportTicket model to prisma/schema.prisma:

```
model SupportTicket {
  id             String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketNumber   String              @unique    // Auto-generated: "TKT-0001"
  tenantId       String              @db.Uuid
  submittedBy    String              @db.Uuid
  fromPage       String              // URL path where ticket was submitted
  type           SupportTicketType
  title          String
  description    String
  status         SupportTicketStatus @default(OPEN)
  resolution     String?
  resolvedAt     DateTime?           @db.Timestamptz
  createdAt      DateTime            @default(now()) @db.Timestamptz
  updatedAt      DateTime            @updatedAt @db.Timestamptz

  @@index([tenantId])
  @@index([submittedBy])
  @@index([status])
  @@index([createdAt])
}
```

NOTE: No relations to Tenant/User — this table intentionally has NO RLS (system admins
need cross-tenant access). Use raw FKs in SQL migration only. Do NOT add `supportTickets`
relation fields on Tenant or User models to keep the schema clean.

3. Create SQL migration file at `prisma/migrations/20260303000001_add_support_ticket/migration.sql`:

Follow the idempotent pattern from existing migrations (DO/EXCEPTION blocks). Include:
- CREATE TYPE for SupportTicketType and SupportTicketStatus enums (idempotent)
- CREATE TABLE IF NOT EXISTS for SupportTicket with all columns
- Indexes on tenantId, submittedBy, status, createdAt
- Unique index on ticketNumber
- FK constraints to Tenant(id) and User(id) via DO/EXCEPTION blocks
- NO RLS on this table (system admins query across tenants; tenant-scoped queries
  use WHERE clauses in server actions instead)

4. Run `node scripts/migrate.mjs` to apply the migration.
5. Run `npx prisma generate` to regenerate the Prisma client.
  </action>
  <verify>
    - `node scripts/migrate.mjs` completes without errors
    - `npx prisma generate` completes without errors
    - `npx tsc --noEmit` passes (no type errors)
  </verify>
  <done>
    SupportTicket table exists in database with correct columns, indexes, and FK constraints.
    Prisma client types are regenerated and available.
  </done>
</task>

<task type="auto">
  <name>Task 2: Server actions + global support modal + My Tickets pages</name>
  <files>
    src/actions/support-tickets.ts
    src/components/support/support-ticket-modal.tsx
    src/app/(owner)/support/page.tsx
    src/app/(driver)/support/page.tsx
    src/components/navigation/sidebar.tsx
    src/app/layout.tsx
  </files>
  <action>
1. Create `src/actions/support-tickets.ts` with these server actions:

   a) `createSupportTicket(data: { type, title, description, fromPage })`:
      - Uses `requireAuth()` to get userId
      - Uses `getSession()` to get tenantId
      - Auto-generates ticketNumber: query max existing ticketNumber, parse number, increment
        (e.g., "TKT-0001", "TKT-0002"). Use `prisma` (base client, no RLS) with
        `bypass_rls` transaction pattern for cross-tenant uniqueness.
      - Validate with zod: title (3-200 chars), description (10-2000 chars), type (enum),
        fromPage (string, non-empty)
      - Insert using base `prisma` (NOT tenant-scoped) since no RLS on this table
      - Return { success: true, ticketNumber }

   b) `getMyTickets()`:
      - Uses `requireAuth()` to get userId
      - Query SupportTicket WHERE submittedBy = userId, ordered by createdAt desc
      - Uses base `prisma` client (no RLS on this table)
      - Return array of tickets

   c) `getAllTickets()` (admin only):
      - Call `requireAuth()` then `isSystemAdmin()`, throw if not admin
      - Query ALL SupportTicket records ordered by createdAt desc
      - Uses base `prisma` client
      - Also join/lookup user email and tenant name for display (use separate queries
        or raw SQL since no Prisma relations defined)
      - Return tickets with submitter email and tenant name

   d) `updateTicketStatus(ticketId, { status, resolution })`:
      - Call `requireAuth()` then `isSystemAdmin()`, throw if not admin
      - Validate with zod: status (enum), resolution (optional string, max 2000 chars)
      - If status is RESOLVED or CLOSED, set resolvedAt = now()
      - If status is OPEN or IN_PROGRESS, clear resolvedAt
      - Update using base `prisma` client

2. Create `src/components/support/support-ticket-modal.tsx`:
   - "use client" component
   - Renders a fixed-position support button (bottom-right corner): a circular button
     with a LifeBuoy or HelpCircle icon from lucide-react, blue gradient bg matching
     the app's brand (from-blue-500 to-blue-700)
   - On click, opens a shadcn Sheet (side="right") — Sheet component already exists at
     `src/components/ui/sheet.tsx`
   - Sheet contains a form with:
     - Type: shadcn Select dropdown (BUG, FEATURE_REQUEST, QUESTION, ACCOUNT_ISSUE, OTHER)
       with human-readable labels ("Bug Report", "Feature Request", "Question",
       "Account Issue", "Other")
     - Title: regular input (use existing `src/components/ui/input.tsx`)
     - Description: HTML textarea element styled with Tailwind (no shadcn Textarea component)
   - Auto-captures `fromPage` using `usePathname()` from next/navigation
   - On submit: calls `createSupportTicket` server action, shows success toast via
     `sonner` (already in root layout), closes sheet, resets form
   - Show loading state on submit button
   - The component reads `useAuth()` — only renders the button if user is authenticated
     (user !== null)

3. Add the SupportTicketModal to the ROOT layout (`src/app/layout.tsx`):
   - Import and render `<SupportTicketModal />` inside AuthProvider, alongside Toaster
   - This makes it available on ALL pages (owner, driver, admin portals)

4. Create `src/app/(owner)/support/page.tsx` — My Tickets page:
   - Server component that calls `getMyTickets()`
   - Displays tickets in a card-based list (use `src/components/ui/card.tsx`)
   - Each card shows: ticketNumber, type badge (color-coded using Badge component),
     title, status badge, created date (formatted), truncated description
   - Empty state: use the existing EmptyState component from `src/components/ui/empty-state.tsx`
     with message "No support tickets yet"
   - Page title: "My Support Tickets"

5. Create `src/app/(driver)/support/page.tsx` — same as owner version:
   - Identical logic to the owner support page (calls `getMyTickets()`)
   - Same card layout, badges, empty state
   - Page title: "My Support Tickets"

6. Add "Support" nav link to owner sidebar (`src/components/navigation/sidebar.tsx`):
   - Add `LifeBuoy` to the lucide-react imports
   - Add a new SidebarGroup at the bottom (before the SidebarFooter), labeled "Support",
     visible to ALL roles (no role gating)
   - Single item: "My Tickets" linking to `/support` with LifeBuoy icon
   - isActive when pathname.startsWith("/support")

7. Add "Support" nav link to driver portal:
   - Add to `src/components/driver/driver-nav.tsx` (check its structure first)
   - OR if driver-nav doesn't support easy additions, add a link in the driver layout header
   - Link to `/support` (within driver route group, so create driver support page at
     the correct path)

NOTE: Do NOT install any new npm packages. Use existing shadcn components (Sheet, Select,
Input, Button, Card, Badge) and standard HTML textarea.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - All new files exist and have no syntax errors
    - Support button renders on pages (visible in bottom-right)
    - My Tickets pages load at /support in both owner and driver portals
  </verify>
  <done>
    Users can open the support modal from any page, submit tickets with type/title/description,
    and view their submitted tickets on dedicated My Tickets pages in both portals.
    Sidebar has Support nav link.
  </done>
</task>

<task type="auto">
  <name>Task 3: Admin Support Dashboard for cross-tenant ticket management</name>
  <files>
    src/app/(admin)/support/page.tsx
    src/app/(admin)/layout.tsx
  </files>
  <action>
1. Create `src/app/(admin)/support/page.tsx`:
   - Server component with client sub-component for interactivity
   - Page title: "Support Dashboard"
   - Stats row at top: total tickets, open count, in-progress count, resolved count
     (derive from getAllTickets results)
   - Tickets table/card list showing ALL tickets across tenants:
     - Columns: Ticket #, Tenant Name, Submitted By (email), Type, Title, Status, Created
     - Color-coded status badges (OPEN=yellow, IN_PROGRESS=blue, RESOLVED=green, CLOSED=gray)
     - Color-coded type badges
   - Each ticket row is expandable or has a detail view showing full description
   - Status update: inline Select dropdown to change status (OPEN, IN_PROGRESS, RESOLVED, CLOSED)
   - Resolution textarea: appears when status is RESOLVED or CLOSED, allows admin to type
     resolution notes
   - Save button per ticket that calls `updateTicketStatus` server action
   - Use `sonner` toast for success/error feedback
   - Use `revalidatePath` in the server action to refresh data after updates

2. Update `src/app/(admin)/layout.tsx`:
   - Add a "Support" nav link in the header nav next to the existing "Tenants" link
   - Link to `/support` (resolves to `(admin)/support/page.tsx`)

NOTE: The admin layout already gates on `isSystemAdmin()`, so no additional auth needed
in the page itself — but the server actions (`getAllTickets`, `updateTicketStatus`) also
verify admin status independently for defense in depth.

Style the dashboard professionally: use Card components for stats, clean table layout
with proper spacing, responsive design. Follow the existing admin portal aesthetic
(gray-900 header, gray-50 background from admin layout).
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Admin support page loads at /support when accessed as system admin
    - Admin layout header shows "Support" nav link
    - Status updates work via the updateTicketStatus action
  </verify>
  <done>
    System admins can view all tickets across tenants, see ticket details including
    submitter email and tenant name, update ticket status, and add resolution notes.
    The admin support dashboard is accessible from the admin nav.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. `node scripts/migrate.mjs` — migration applied successfully
3. Support button visible on owner portal pages (bottom-right floating button)
4. Support button visible on driver portal pages
5. Clicking support button opens sheet with type/title/description form
6. Submitting a ticket creates a record in the database
7. /support page in owner portal shows submitted tickets
8. /support page in driver portal shows submitted tickets
9. /support page in admin portal shows ALL tickets with management controls
10. Admin can change ticket status and add resolution
</verification>

<success_criteria>
- SupportTicket table exists with correct schema (no RLS, FK constraints to User and Tenant)
- Global support button appears on all authenticated pages via root layout
- Users can submit tickets capturing type, title, description, fromPage, tenantId, submittedBy
- Ticket numbers auto-increment (TKT-0001, TKT-0002, etc.)
- My Tickets page accessible in both owner (/support) and driver (/support) portals
- Admin Support Dashboard at /support in admin portal shows cross-tenant tickets
- Admin can update status (OPEN, IN_PROGRESS, RESOLVED, CLOSED) and add resolution notes
- All server actions enforce proper auth (requireAuth for users, isSystemAdmin for admin actions)
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/41-implement-a-global-support-ticketing-sys/41-SUMMARY.md`
</output>
