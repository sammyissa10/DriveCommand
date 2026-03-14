---
phase: quick-64
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260314000001_add_fleet_message/migration.sql
  - src/app/(driver)/actions/driver-messages.ts
  - src/components/driver/messaging-panel.tsx
  - src/app/(driver)/my-route/page.tsx
  - src/app/(owner)/actions/fleet-messages.ts
  - src/app/(owner)/routes/[id]/route-messages-section.tsx
  - src/app/(owner)/routes/[id]/page.tsx
  - src/app/(owner)/routes/[id]/route-page-client.tsx
autonomous: true
must_haves:
  truths:
    - "Driver can send a message from /my-route page and it persists in the database"
    - "Driver can see their sent messages and owner replies in the messaging panel"
    - "Owner can see driver messages on the route detail page (/routes/[id])"
    - "Owner can reply to driver messages from the route detail page"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "FleetMessage model"
      contains: "model FleetMessage"
    - path: "src/app/(driver)/actions/driver-messages.ts"
      provides: "Real message CRUD (send + list)"
      exports: ["sendDriverMessage", "getDriverMessages"]
    - path: "src/app/(owner)/actions/fleet-messages.ts"
      provides: "Owner message actions (list by route, reply)"
      exports: ["getRouteMessages", "sendOwnerReply"]
    - path: "src/app/(owner)/routes/[id]/route-messages-section.tsx"
      provides: "Messages section on owner route detail"
  key_links:
    - from: "src/components/driver/messaging-panel.tsx"
      to: "src/app/(driver)/actions/driver-messages.ts"
      via: "useActionState for sendDriverMessage, fetch for getDriverMessages"
      pattern: "sendDriverMessage|getDriverMessages"
    - from: "src/app/(owner)/routes/[id]/route-messages-section.tsx"
      to: "src/app/(owner)/actions/fleet-messages.ts"
      via: "server action calls"
      pattern: "getRouteMessages|sendOwnerReply"
---

<objective>
TKT-0020: Fix driver portal messaging so sending messages from /my-route actually persists to the database, and messages are visible to the owner on the route detail page with reply capability.

Purpose: The current messaging system is a scaffold — sendDriverMessage is a no-op that returns success without saving anything, and there is no owner-side visibility. This task creates a real FleetMessage model and wires both driver and owner portals.

Output: Working bidirectional messaging between driver and owner, scoped to routes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma
@src/app/(driver)/actions/driver-messages.ts
@src/components/driver/messaging-panel.tsx
@src/app/(driver)/my-route/page.tsx
@src/app/(owner)/routes/[id]/page.tsx
@src/app/(owner)/routes/[id]/route-page-client.tsx
@src/lib/auth/server.ts
@src/lib/context/tenant-context.ts
@prisma/migrations/20260309000001_extend_support_ticket_add_messages/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create FleetMessage model and migration</name>
  <files>
    prisma/schema.prisma
    prisma/migrations/20260314000001_add_fleet_message/migration.sql
  </files>
  <action>
    1. Add a FleetMessage model to prisma/schema.prisma after TicketMessage:

    ```
    model FleetMessage {
      id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      tenantId  String   @db.Uuid
      routeId   String   @db.Uuid
      senderId  String   @db.Uuid
      senderRole String  // "DRIVER" or "OWNER"
      body      String
      createdAt DateTime @default(now()) @db.Timestamptz

      @@index([tenantId])
      @@index([routeId])
      @@index([createdAt])
    }
    ```

    Do NOT add Prisma relations (no `@relation` fields) — the codebase uses raw tenant-scoped queries via getTenantPrisma() and does not rely on Prisma relations for most models. Keep it simple.

    2. Add the relation arrays to Route model: `fleetMessages FleetMessage[]` — actually, do NOT add relation fields. The codebase pattern for newer models (TicketMessage, RouteStop, etc.) avoids explicit relations and uses manual joins. Follow that pattern.

    3. Create the migration SQL file at prisma/migrations/20260314000001_add_fleet_message/migration.sql:

    ```sql
    -- Migration: add_fleet_message
    -- Creates FleetMessage table for driver-owner messaging scoped to routes.

    CREATE TABLE IF NOT EXISTS "FleetMessage" (
      "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
      "tenantId"   UUID NOT NULL,
      "routeId"    UUID NOT NULL,
      "senderId"   UUID NOT NULL,
      "senderRole" TEXT NOT NULL,
      "body"       TEXT NOT NULL,
      "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "FleetMessage_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX IF NOT EXISTS "FleetMessage_tenantId_idx" ON "FleetMessage"("tenantId");
    CREATE INDEX IF NOT EXISTS "FleetMessage_routeId_idx" ON "FleetMessage"("routeId");
    CREATE INDEX IF NOT EXISTS "FleetMessage_createdAt_idx" ON "FleetMessage"("createdAt");

    -- RLS
    ALTER TABLE "FleetMessage" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "FleetMessage" FORCE ROW LEVEL SECURITY;

    CREATE POLICY tenant_isolation_policy ON "FleetMessage"
      FOR ALL
      USING ("tenantId" = current_tenant_id())
      WITH CHECK ("tenantId" = current_tenant_id());

    CREATE POLICY bypass_rls_policy ON "FleetMessage"
      FOR ALL
      USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
    ```

    4. Run `npx prisma db push` to sync the schema (this project uses db push, not migrate deploy — check by running it).

    Actually, check if the project uses `prisma migrate deploy` or `prisma db push`. Look at package.json scripts. If migrate is used, run `npx prisma migrate deploy`. If db push, use that. The migration file should exist either way for version control.

    Run: `npx prisma generate` after to update the Prisma client.
  </action>
  <verify>
    Run `npx prisma generate` — should complete without errors.
    Run `npx prisma migrate deploy` — should apply the migration.
    Confirm FleetMessage appears in the generated Prisma client types.
  </verify>
  <done>FleetMessage table exists in the database with RLS policies, Prisma client is regenerated with the FleetMessage model.</done>
</task>

<task type="auto">
  <name>Task 2: Wire driver messaging — real persistence and display</name>
  <files>
    src/app/(driver)/actions/driver-messages.ts
    src/components/driver/messaging-panel.tsx
    src/app/(driver)/my-route/page.tsx
  </files>
  <action>
    1. Rewrite `src/app/(driver)/actions/driver-messages.ts`:

    - Import `getCurrentUser` from `@/lib/auth/server`, `getTenantPrisma` from `@/lib/context/tenant-context`, `requireRole`, `UserRole`.

    - `getDriverMessages()`:
      - requireRole([UserRole.DRIVER])
      - Get current user via getCurrentUser()
      - Get tenant prisma via getTenantPrisma()
      - Find the driver's active route: `prisma.route.findFirst({ where: { driverId: user.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } }, select: { id: true } })`
      - If no route, return []
      - Query: `prisma.fleetMessage.findMany({ where: { routeId: route.id }, orderBy: { createdAt: 'asc' } })`
      - Return messages array

    - `sendDriverMessage(prevState, formData)`:
      - requireRole([UserRole.DRIVER])
      - Get current user, get tenant prisma
      - Extract message from formData, validate non-empty
      - Find driver's active route (same query as above)
      - If no route, return { error: 'No active route found. You must have an assigned route to send messages.' }
      - Create: `prisma.fleetMessage.create({ data: { tenantId: user.tenantId, routeId: route.id, senderId: user.id, senderRole: 'DRIVER', body: message.trim() } })`
      - Return { success: true, message: 'Message sent.' }

    2. Rewrite `src/components/driver/messaging-panel.tsx`:

    - Convert to a client component that fetches messages on mount and after sending.
    - Add a `messages` state array, fetched via `getDriverMessages()` on mount using useEffect.
    - Keep the useActionState pattern for sendDriverMessage, but after successful send, re-fetch messages.
    - Display messages in the messages area (replace the empty state):
      - Each message shows: body text, timestamp (relative like "2m ago" or formatted), and a visual indicator of sender role (driver messages right-aligned in primary color, owner messages left-aligned in muted/secondary color).
      - Auto-scroll to bottom on new messages.
    - Keep the compose input at bottom.
    - Import `getDriverMessages` as a server action call. Since this is a client component, wrap the fetch in a `startTransition` or just call it directly (server actions can be called from client components).
    - Note: `getDriverMessages` is a server action ('use server'), so it can be imported and called from client components directly.

    3. Update `src/app/(driver)/my-route/page.tsx`:

    - Add a "Messages" section below the truck documents section, using the same card styling pattern.
    - Import and render `<MessagingPanel />` inside a card wrapper with heading "Route Messages".
    - This gives drivers messaging access from /my-route in addition to /messages.
  </action>
  <verify>
    Run `npx next build` or `npx tsc --noEmit` — no type errors.
    The messaging panel should render on both /messages and /my-route pages.
  </verify>
  <done>Driver can send messages that persist to FleetMessage table, and see all messages (both driver-sent and owner-replies) in the messaging panel. MessagingPanel appears on /my-route page.</done>
</task>

<task type="auto">
  <name>Task 3: Add owner-side message visibility and reply on route detail</name>
  <files>
    src/app/(owner)/actions/fleet-messages.ts
    src/app/(owner)/routes/[id]/route-messages-section.tsx
    src/app/(owner)/routes/[id]/page.tsx
    src/app/(owner)/routes/[id]/route-page-client.tsx
  </files>
  <action>
    1. Create `src/app/(owner)/actions/fleet-messages.ts`:

    - 'use server' directive
    - Import requireRole, UserRole, getCurrentUser, getTenantPrisma

    - `getRouteMessages(routeId: string)`:
      - requireRole([UserRole.OWNER])
      - Get tenant prisma
      - Query: `prisma.fleetMessage.findMany({ where: { routeId }, orderBy: { createdAt: 'asc' } })`
      - For each message, look up the sender name: query `prisma.user.findUnique({ where: { id: msg.senderId }, select: { firstName: true, lastName: true, email: true } })` — or do a single query for all unique senderIds and map. Use the efficient approach.
      - Return messages with sender name attached.

    - `sendOwnerReply(prevState: any, formData: FormData)`:
      - requireRole([UserRole.OWNER])
      - Get current user, get tenant prisma
      - Extract routeId and message from formData, validate
      - Verify route exists and belongs to tenant: `prisma.route.findFirst({ where: { id: routeId } })`
      - If no route, return { error: 'Route not found.' }
      - Create: `prisma.fleetMessage.create({ data: { tenantId: user.tenantId, routeId, senderId: user.id, senderRole: 'OWNER', body: message.trim() } })`
      - Return { success: true }

    2. Create `src/app/(owner)/routes/[id]/route-messages-section.tsx`:

    - 'use client' component
    - Props: `routeId: string`, `initialMessages: Array<{ id, senderId, senderRole, senderName, body, createdAt }>`
    - Display messages in a chat-like view inside a card:
      - Header: "Route Messages" with MessageSquare icon
      - Message list: driver messages left-aligned (with driver name label), owner messages right-aligned (with "You" label)
      - Each message: sender name, body, relative timestamp
      - Empty state if no messages: "No messages yet. Drivers can send messages from their route view."
    - Reply form at bottom using useActionState with sendOwnerReply
      - Hidden input for routeId
      - Text input + send button (same pattern as driver messaging panel)
    - After successful send, re-fetch messages by calling getRouteMessages(routeId)

    3. Update `src/app/(owner)/routes/[id]/page.tsx`:

    - Import `getRouteMessages` from fleet-messages action
    - Add to the Promise.all: `getRouteMessages(id).catch(() => [] as any[])`
    - Pass `messages` to RoutePageClient

    4. Update `src/app/(owner)/routes/[id]/route-page-client.tsx`:

    - Add `messages` prop to RoutePageClientProps interface (array of message objects)
    - Import and render `<RouteMessagesSection routeId={route.id} initialMessages={messages} />` after the existing sections (before the Record History audit trail section that's in page.tsx, or at a logical spot within route-page-client — place it after documents/driver assignments sections).

    Style notes:
    - Use the same card styling pattern as other sections: `rounded-xl border border-border bg-card p-6 shadow-sm`
    - Messages container should have a max height with overflow-y-auto (similar to messaging-panel's 300px/400px)
    - Use dark-mode compatible colors: bg-primary/10 for driver messages, bg-muted for owner messages (avoid hardcoded bg-green-50/bg-blue-50 that break in dark mode)
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors.
    Visit /routes/[id] in owner portal — messages section visible.
    Owner can reply and message appears in list.
  </verify>
  <done>Owner can see all messages for a route on the route detail page, can reply, and both driver and owner messages display with correct sender attribution.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no type errors
2. `npx next build` completes successfully
3. FleetMessage table exists in database with RLS policies
4. Driver: Send message from /my-route -> message persists and appears in message list
5. Driver: Visit /messages -> same messages visible
6. Owner: Visit /routes/[id] -> messages section shows driver messages
7. Owner: Reply to driver -> reply appears in message list
8. Driver: After owner replies -> driver sees the reply in their messaging panel
</verification>

<success_criteria>
- FleetMessage model exists in schema with migration applied
- Driver messaging is fully functional (send + display) on both /my-route and /messages
- Owner can view route messages and reply on /routes/[id]
- All messages scoped to route and tenant (RLS enforced)
- No type errors, build passes
</success_criteria>

<output>
After completion, create `.planning/quick/64-tkt-0020-fix-driver-portal-messaging-sen/64-SUMMARY.md`
</output>
