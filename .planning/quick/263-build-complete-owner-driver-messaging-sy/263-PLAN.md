---
phase: quick-263
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/*/migration.sql
  - apps/web/src/app/api/v1/messages/conversations/route.ts
  - apps/web/src/app/api/v1/messages/thread/route.ts
  - apps/web/src/app/api/v1/messages/send/route.ts
  - apps/web/src/app/api/v1/messages/broadcast/route.ts
  - apps/web/src/app/(owner)/carrier/messages/page.tsx
  - apps/web/src/components/carrier/messages/ConversationList.tsx
  - apps/web/src/components/carrier/messages/MessageThread.tsx
  - apps/web/src/components/carrier/messages/ComposeModal.tsx
  - apps/web/src/components/carrier/messages/BroadcastModal.tsx
  - apps/web/src/components/carrier/dispatches/DispatchMessages.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/src/app/(driver)/actions/driver-messages.ts
  - apps/web/src/components/driver/messaging-panel.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can see all conversations grouped by driver with unread counts"
    - "Owner can open a conversation thread and see message bubbles with timestamps"
    - "Owner can send a message to a specific driver"
    - "Owner can broadcast a message to all drivers"
    - "Driver messages are sent with recipientId=owner and dispatchId=active dispatch"
    - "Dispatch detail page shows messages scoped to that dispatch"
    - "Messages sidebar link shows unread badge"
  artifacts:
    - path: "apps/web/src/app/api/v1/messages/conversations/route.ts"
      provides: "Conversation list API with unread counts"
      exports: ["GET"]
    - path: "apps/web/src/app/api/v1/messages/thread/route.ts"
      provides: "Thread messages API with mark-read"
      exports: ["GET"]
    - path: "apps/web/src/app/api/v1/messages/send/route.ts"
      provides: "Send message API with push notification"
      exports: ["POST"]
    - path: "apps/web/src/app/api/v1/messages/broadcast/route.ts"
      provides: "Broadcast message API"
      exports: ["POST"]
    - path: "apps/web/src/app/(owner)/carrier/messages/page.tsx"
      provides: "Owner messages page with conversation list + thread"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/messages/page.tsx"
      to: "/api/v1/messages/conversations"
      via: "fetch in ConversationList"
      pattern: "fetch.*api/v1/messages/conversations"
    - from: "apps/web/src/components/carrier/messages/MessageThread.tsx"
      to: "/api/v1/messages/thread"
      via: "fetch with driverId param"
      pattern: "fetch.*api/v1/messages/thread"
    - from: "apps/web/src/app/(driver)/actions/driver-messages.ts"
      to: "prisma.fleetMessage.create"
      via: "recipientId + dispatchId set on create"
      pattern: "recipientId.*dispatchId"
---

<objective>
Build a complete owner-driver messaging system with conversations list, threaded messages, dispatch context, broadcast, and unread badges.

Purpose: Enable real-time communication between owners and drivers with dispatch-scoped context and unified inbox.
Output: Full messaging UI for owner portal, fixed driver message sending, dispatch detail messages section, sidebar unread badge.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (FleetMessage model at line 1157, CarrierDispatch at line 1509)
@apps/web/src/app/(driver)/actions/driver-messages.ts (existing driver message actions to fix)
@apps/web/src/components/driver/messaging-panel.tsx (existing driver messaging UI)
@apps/web/src/components/navigation/sidebar.tsx (add Messages link under Carrier Ops)
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx (add messages section)
@apps/web/src/app/api/mobile/owner/fleet/messages/route.ts (reference for pattern: after(), sendPushToUser, bypass_rls)
@apps/web/src/lib/notifications/send-push.ts (sendPushToUser, sendPushToOrg)
@apps/web/src/lib/auth/supabase.ts (getSession, requireRole, getCurrentUser)
@apps/web/src/lib/db/prisma.ts (prisma, TX_OPTIONS)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + API routes</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/[timestamp]_add_dispatch_id_read_at_to_fleet_message/migration.sql
    apps/web/src/app/api/v1/messages/conversations/route.ts
    apps/web/src/app/api/v1/messages/thread/route.ts
    apps/web/src/app/api/v1/messages/send/route.ts
    apps/web/src/app/api/v1/messages/broadcast/route.ts
  </files>
  <action>
1. **Schema changes** — Add to FleetMessage model:
   - `dispatchId String? @db.Uuid` — nullable FK to CarrierDispatch(id) ON DELETE SET NULL
   - `readAt DateTime? @db.Timestamptz` — nullable, set when recipient reads
   - Add relation: `dispatch CarrierDispatch? @relation(fields: [dispatchId], references: [id], onDelete: SetNull)`
   - Add `@@index([dispatchId])` and `@@index([recipientId])` indexes
   - On CarrierDispatch model, add: `messages FleetMessage[]`
   - Run `npx prisma migrate dev --name add_dispatch_id_read_at_to_fleet_message`

2. **GET /api/v1/messages/conversations** — Auth via getSession(), require OWNER/MANAGER role. Tenant isolation via session.tenantId. Query logic:
   - Find all FleetMessages where tenantId=session.tenantId AND (senderId=session.userId OR recipientId=session.userId OR isBroadcast=true)
   - Group by the "other party" (if senderId=me then group by recipientId, else group by senderId)
   - For each conversation: last message body (truncated 60 chars), last message createdAt, unread count (readAt IS NULL AND recipientId=session.userId), driver info (query User for name/email)
   - If dispatchId present on last message, include dispatch number/status
   - Support `?tab=all|dispatches|drivers` filter: dispatches = conversations with dispatchId not null on any message, drivers = all
   - Return JSON array sorted by last message createdAt desc

3. **GET /api/v1/messages/thread** — Params: `driverId` (required), `dispatchId` (optional). Auth + tenant isolation.
   - Fetch messages between session.userId and driverId within tenant, optionally filtered by dispatchId
   - Also include broadcast messages
   - Order by createdAt asc
   - Mark unread messages as read: UPDATE FleetMessage SET readAt=NOW() WHERE recipientId=session.userId AND senderId=driverId AND readAt IS NULL AND tenantId=session.tenantId
   - Return messages array with id, senderId, senderRole, body, createdAt, dispatchId

4. **POST /api/v1/messages/send** — Body: `{ recipientId, body, dispatchId? }`. Auth + tenant isolation.
   - Validate body not empty, recipientId exists in tenant
   - Create FleetMessage with senderId=session.userId, senderRole=session.role, tenantId, recipientId, dispatchId, body
   - Use `after()` from next/server to send push notification via sendPushToUser(recipientId, { title: "New Message", body: truncated message, data: { type: "message", senderId } })
   - Return 201 with created message

5. **POST /api/v1/messages/broadcast** — Body: `{ body }`. Auth OWNER only + tenant isolation.
   - Create FleetMessage with isBroadcast=true, senderId=session.userId, senderRole='OWNER', tenantId, body
   - Use `after()` to call sendPushToOrg(tenantId, { title: "Broadcast", body: truncated }, { excludeUserId: session.userId })
   - Return 201

All routes: use `import { after } from 'next/server'` pattern. Use prisma.$transaction with bypass_rls for queries. No rate limiting needed for web routes (session-authed).
  </action>
  <verify>
    - `cd apps/web && npx prisma migrate status` shows no pending migrations
    - `cd apps/web && npx tsc --noEmit` passes with no errors
    - FleetMessage model has dispatchId and readAt fields
  </verify>
  <done>Four API routes exist and compile. Schema has dispatchId FK + readAt on FleetMessage. Migration applied to DB.</done>
</task>

<task type="auto">
  <name>Task 2: Owner messages page with conversation list and thread UI</name>
  <files>
    apps/web/src/app/(owner)/carrier/messages/page.tsx
    apps/web/src/components/carrier/messages/ConversationList.tsx
    apps/web/src/components/carrier/messages/MessageThread.tsx
    apps/web/src/components/carrier/messages/ComposeModal.tsx
    apps/web/src/components/carrier/messages/BroadcastModal.tsx
  </files>
  <action>
1. **Page layout** (`carrier/messages/page.tsx`) — Client component. Two-panel layout:
   - Left panel (w-[320px] border-r, full height): ConversationList
   - Right panel (flex-1): MessageThread (or empty state "Select a conversation")
   - State: selectedDriverId, selectedDispatchId

2. **ConversationList** — Client component. Fetches GET /api/v1/messages/conversations. Polls every 5s.
   - 3 tabs at top: All | Dispatches | Drivers (pass as `?tab=` param)
   - Each row: Avatar circle with driver initials (bg-primary/10), driver name bold, dispatch number if exists (text-muted-foreground text-xs), last message preview (60 char truncate, text-muted-foreground), relative timestamp (top-right), unread count badge (bg-primary text-primary-foreground rounded-full px-2 text-xs)
   - Click row: set selectedDriverId + selectedDispatchId
   - Active row: bg-accent
   - Top-right buttons: "Compose" (MessageSquarePlus icon) opens ComposeModal, "Broadcast" (Megaphone icon) opens BroadcastModal

3. **MessageThread** — Client component. Props: driverId, dispatchId?. Fetches GET /api/v1/messages/thread?driverId=X&dispatchId=Y. Polls every 5s.
   - Header: Driver name + if dispatchId present, link to `/carrier/dispatches/[dispatchId]`
   - Message bubbles: owner messages right-aligned (bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2), driver messages left-aligned (bg-muted rounded-2xl rounded-bl-sm px-4 py-2)
   - Timestamps below each bubble cluster (text-xs text-muted-foreground)
   - Auto-scroll to bottom on new messages (useRef + scrollIntoView)
   - Input bar at bottom: textarea (auto-resize, max 3 rows) + Send button (Send icon, bg-primary). On submit POST /api/v1/messages/send with recipientId=driverId, dispatchId if set

4. **ComposeModal** — Dialog with: driver dropdown (fetch drivers in tenant from /api/v1/messages/conversations or dedicated endpoint — use existing tenant drivers), optional dispatch dropdown (fetch active dispatches for selected driver), message textarea, Send button. On send: POST /api/v1/messages/send, close modal, refresh conversation list.

5. **BroadcastModal** — Dialog with: message textarea only, "Send to all drivers" button. On send: POST /api/v1/messages/broadcast, close modal, show toast.

Use shadcn/ui components: Dialog, Button, Tabs, Badge, ScrollArea. Use sonner for toast notifications. Use lucide-react icons: MessageSquarePlus, Megaphone, Send, ArrowLeft.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - Navigate to /carrier/messages — page renders without errors
    - Conversation list loads, clicking a conversation shows thread
  </verify>
  <done>Owner messages page renders with conversation list (3 tabs), message thread with bubbles, compose modal, and broadcast modal. Polling active at 5s intervals.</done>
</task>

<task type="auto">
  <name>Task 3: Sidebar link, dispatch messages section, and driver portal fix</name>
  <files>
    apps/web/src/components/navigation/sidebar.tsx
    apps/web/src/components/carrier/dispatches/DispatchMessages.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/app/(driver)/actions/driver-messages.ts
    apps/web/src/components/driver/messaging-panel.tsx
  </files>
  <action>
1. **Sidebar Messages link** — In sidebar.tsx, add a "Messages" item under the Carrier Ops section (after Carrier Loads, before Fleet sub-group around line 232). Use MessageSquare icon. Link to `/carrier/messages`. Add an unread badge component next to it that:
   - Fetches unread count from GET /api/v1/messages/conversations (sum all unread counts)
   - Polls every 30s
   - Shows badge only if count > 0 (same style as DispatchBadge)
   - Create a `MessagesBadge` component similar to DispatchBadge pattern (check `@/components/navigation/dispatch-badge.tsx` for reference)
   - Wrap in `<PermissionGuard permission="carrierDrivers">` (same permission as driver management)

2. **DispatchMessages component** — Client component for dispatch detail page. Props: dispatchId, tenantId.
   - Fetches GET /api/v1/messages/thread?driverId=primaryDriverId&dispatchId=X (need to pass driverId — get from dispatch data passed as prop or fetch within component)
   - Actually simpler: create a variant that fetches messages filtered by dispatchId only. Add support to thread API: if only `dispatchId` is passed (no driverId), return all messages for that dispatch.
   - Message bubble UI (same as MessageThread but compact — shorter max-height 300px with scroll)
   - Input + Send at bottom (POST /api/v1/messages/send with recipientId=dispatch.primaryDriver.userId, dispatchId)
   - Poll every 10s
   - "View all messages" link to /carrier/messages (with dispatch context)

3. **Dispatch detail page update** — In `dispatches/[id]/page.tsx`, add DispatchMessages section at the bottom after existing panels. Pass dispatchId and primaryDriver userId. Import and render `<DispatchMessages dispatchId={id} driverUserId={dispatch.primaryDriver.userId} />` — need to resolve CarrierDriver → User link. Check if CarrierDriver has userId field, otherwise use the driver's associated User. Pass as a prop from server component.

4. **Fix driver message sending** — In `driver-messages.ts` `sendDriverMessage`:
   - After getting user, query the owner: `const owner = await prisma.user.findFirst({ where: { tenantId: user.tenantId, role: 'OWNER' }, select: { id: true } })`
   - Query active dispatch for this driver: find CarrierDriver where userId=user.id, then find CarrierDispatch where primaryDriverId=carrierDriver.id AND status IN ('planned','in_progress'), order by scheduledDeparture desc, take 1
   - Set recipientId=owner.id and dispatchId=activeDispatch?.id on the FleetMessage create
   - Keep existing email notification

5. **Fix driver messaging panel** — In `messaging-panel.tsx`, update `getDriverMessages` call or create a new fetch that:
   - Returns messages where (senderId=user.id OR recipientId=user.id) within tenant — simpler than current load/route-based logic
   - Also show the driver's own messages and owner replies in correct bubble alignment
   - Update bubble alignment: if senderId === currentUserId → right (driver sent), else left (owner sent)
   - Add 5s polling interval via setInterval in useEffect
   - The component already has the bubble UI — just ensure alignment logic uses the authenticated user's ID (may need to pass it from a session fetch or make getDriverMessages return the userId alongside messages)
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - Sidebar shows Messages link with badge under Carrier Ops
    - Dispatch detail page shows messages section at bottom
    - Driver messages page sends with recipientId and dispatchId set
  </verify>
  <done>Sidebar has Messages link with unread badge polling 30s. Dispatch detail shows dispatch-scoped messages with 10s polling. Driver portal sends messages with recipientId=owner and dispatchId=active dispatch. Driver messaging panel shows bidirectional thread with 5s polling.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — zero TypeScript errors
- `cd apps/web && npx prisma validate` — schema valid
- Owner can navigate to /carrier/messages and see conversation list
- Owner can click a conversation and see message thread
- Owner can send a message (shows in thread)
- Owner can broadcast (creates isBroadcast message)
- Dispatch detail page shows messages section
- Sidebar badge shows unread count
- Driver messages include recipientId and dispatchId
</verification>

<success_criteria>
- All 4 API routes return correct data with tenant isolation
- Owner messages page: conversation list with tabs, message thread with bubbles, compose + broadcast modals
- Dispatch detail page has messages section with 10s polling
- Sidebar Messages link with unread badge (30s poll)
- Driver messages fixed: recipientId=owner, dispatchId=active dispatch
- Zero TypeScript errors across entire app
</success_criteria>

<output>
After completion, create `.planning/quick/263-build-complete-owner-driver-messaging-sy/263-SUMMARY.md`
</output>
