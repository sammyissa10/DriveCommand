---
phase: quick-282
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/YYYYMMDD_add_stop_id_to_fleet_message/migration.sql
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
  - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
  - apps/web/src/components/carrier/stops/StopDetailMessages.tsx
  - apps/web/src/app/api/v1/carrier/stops/[stopId]/messages/route.ts
  - apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  - apps/web/src/components/carrier/dispatches/StopTimeline.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/components/driver/route-detail-readonly.tsx
  - apps/web/src/components/driver/stop-messages.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can navigate from dispatch detail to a stop overview table listing all stops"
    - "Owner can click a stop row to view full stop detail page with info grid, documents, and messages"
    - "Owner can send stop-scoped messages to the assigned driver from stop detail"
    - "Driver sees stop-scoped messages on their stop card in the Route tab and can reply"
    - "Stop timeline cards have a View Details link to the stop detail page"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx"
      provides: "Stop overview table page"
    - path: "apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx"
      provides: "Stop detail page with info grid, documents, messages"
    - path: "apps/web/src/app/api/v1/carrier/stops/[stopId]/messages/route.ts"
      provides: "GET/POST stop messages for owner"
    - path: "apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts"
      provides: "GET/POST stop messages for driver"
    - path: "apps/web/src/components/driver/stop-messages.tsx"
      provides: "Driver stop messages collapsible section"
  key_links:
    - from: "StopDetailMessages.tsx"
      to: "/api/v1/carrier/stops/[stopId]/messages"
      via: "fetch with 10s polling"
      pattern: "fetch.*api/v1/carrier/stops.*messages"
    - from: "stop-messages.tsx"
      to: "/api/driver/stops/[stopId]/messages"
      via: "fetch with 10s polling"
      pattern: "fetch.*api/driver/stops.*messages"
    - from: "FleetMessage model"
      to: "CarrierStop model"
      via: "stopId FK"
      pattern: "stopId.*String.*@db.Uuid"
---

<objective>
Add stop overview page, stop detail page with document upload and stop-scoped messaging, and driver-side stop messages.

Purpose: Enables granular stop-level visibility and communication between owner/dispatcher and driver at each stop.
Output: Stop overview table, stop detail page, stop message API endpoints (owner + driver), driver stop message UI, View Details links on stop cards.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (FleetMessage model at line 1162, CarrierStop model at line 1616)
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx (dispatch detail page — reference for patterns)
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx (stop card — add View Details link)
@apps/web/src/components/carrier/dispatches/StopTimeline.tsx (stop timeline — pass dispatchId)
@apps/web/src/components/carrier/dispatches/DispatchMessages.tsx (messaging pattern — reuse for stop messages)
@apps/web/src/app/api/v1/messages/send/route.ts (message send API — pattern for stop message send)
@apps/web/src/app/api/v1/messages/thread/route.ts (message thread API — pattern for stop message GET)
@apps/web/src/app/api/v1/carrier/stops/[id]/route.ts (existing stop GET/PATCH API)
@apps/web/src/lib/carrier/stops.ts (stop lib functions)
@apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts (driver stop doc API — auth pattern for driver stop access)
@apps/web/src/components/driver/route-detail-readonly.tsx (driver route detail — add stop messages section)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + Stop message API endpoints + Stop overview page</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/YYYYMMDD_add_stop_id_to_fleet_message/migration.sql
    apps/web/src/app/api/v1/carrier/stops/[stopId]/messages/route.ts
    apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts
    apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
  </files>
  <action>
**1a. Add stopId to FleetMessage model in schema.prisma:**
- Add `stopId String? @map("stop_id") @db.Uuid` field to FleetMessage (after dispatchId line 1167)
- Add relation: `stop CarrierStop? @relation(fields: [stopId], references: [id], onDelete: SetNull)`
- Add `@@index([stopId])` to FleetMessage
- Add `messages FleetMessage[]` to CarrierStop model (after `expenses CarrierExpense[]` at line 1650)
- Create migration SQL: `ALTER TABLE "FleetMessage" ADD COLUMN "stop_id" UUID REFERENCES "CarrierStop"("id") ON DELETE SET NULL; CREATE INDEX "FleetMessage_stopId_idx" ON "FleetMessage"("stop_id");`
- Run `npx prisma migrate deploy` then `npx prisma generate`

**1b. Owner stop message API at `/api/v1/carrier/stops/[stopId]/messages/route.ts`:**

GET handler:
- Auth: `getSession()`, require OWNER or MANAGER role
- Validate stopId belongs to tenant (join through CarrierStop -> CarrierDispatch where orgId = tenantId)
- Query FleetMessage WHERE tenantId AND stopId, ordered by createdAt ASC
- Mark unread messages (recipientId = userId, readAt = null) as read
- Resolve sender names from User table
- Return `{ messages: [{ id, senderId, senderName, senderRole, body, isBroadcast, stopId, dispatchId, readAt, createdAt, isOwn }] }`

POST handler:
- Auth: same OWNER/MANAGER check
- Body: `{ body: string }` (recipientId auto-resolved from stop's dispatch's primaryDriver's userId)
- Validate body non-empty, max 2000 chars
- Look up stop -> dispatch -> primaryDriverId -> carrierDriver.userId to get recipientId
- Create FleetMessage with: tenantId, senderId=userId, senderRole=role, body, recipientId, stopId, dispatchId=stop.dispatchId
- Use `after()` to send push notification and in-app notification (same pattern as `/api/v1/messages/send`)
- Return 201 with created message

Use `@bypass_rls` pattern with `prisma.$transaction` + `set_config('app.bypass_rls', 'on', TRUE)` as in existing message APIs.

**1c. Driver stop message API at `/api/driver/stops/[stopId]/messages/route.ts`:**

GET handler:
- Auth: `requireRole([UserRole.DRIVER])` + `getSession()`
- Verify stop ownership: carrierDriver where userId=session.userId + orgId=tenantId, then carrierStop where dispatch.primaryDriverId = carrierDriver.id
- Query FleetMessage WHERE stopId, ordered by createdAt ASC
- Mark unread messages (recipientId = userId) as read
- Resolve sender names
- Return messages array

POST handler:
- Auth: same driver check
- Body: `{ body: string }`
- Resolve recipientId: find any OWNER/MANAGER user in tenant (use dispatch owner or first owner user)
- Actually, look at existing driver message patterns: for stop messages, the recipientId should be the dispatch creator or the first owner. Simplest: find the first User with role OWNER in tenant.
- Create FleetMessage with stopId, dispatchId=stop.dispatchId, senderId=userId, senderRole='DRIVER', recipientId
- Use `after()` for push + in-app notification
- Return 201

**1d. Stop overview page at `/carrier/dispatches/[id]/stops/page.tsx`:**
- `export const dynamic = 'force-dynamic'`
- Auth: `getSession()`, redirect if not session, check tenantId
- Fetch dispatch with stops (use `getDispatch(orgId, id)`)
- Fetch facility names for all stops (same pattern as dispatch detail page)
- Fetch document counts per stop (groupBy carrierDocument on stopId)
- Fetch message counts per stop (groupBy FleetMessage on stopId WHERE stopId in stopIds)
- Back link to `/carrier/dispatches/${id}`
- Header: "Stops - DC-{dispatchNumber}" with dispatch status badge
- Table (use `<table>` with Tailwind, not shadcn DataTable for simplicity):
  - Columns: #, Type (badge), Facility (name + city), Appointment, Status (badge), Arrived, Departed, Dwell (computed min), Docs, Messages
  - Each row clickable -> `/carrier/stops/${stop.id}`
  - Dwell = Math.floor((departedAt - arrivedAt) / 60000) if both exist, else "---"
  - Doc count and message count as small badges
- Use the same STOP_TYPE_BADGE and STOP_STATUS_BADGE color maps from StopTimelineCard
  </action>
  <verify>
- `cd apps/web && npx prisma generate` succeeds
- `cd apps/web && npx tsc --noEmit` passes
- Visit `/carrier/dispatches/[id]/stops` shows table with all stops
- `curl /api/v1/carrier/stops/[stopId]/messages` returns empty messages array
  </verify>
  <done>
FleetMessage has stopId FK, both owner and driver stop message APIs work, stop overview page renders a table with all stop data.
  </done>
</task>

<task type="auto">
  <name>Task 2: Stop detail page with info grid, documents, and messages</name>
  <files>
    apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
    apps/web/src/components/carrier/stops/StopDetailMessages.tsx
  </files>
  <action>
**2a. Create stop detail page at `/carrier/stops/[id]/page.tsx`:**
- `export const dynamic = 'force-dynamic'`
- Auth: `getSession()`, require session, check tenantId
- Require OWNER or MANAGER role (redirect or 403 if not)
- Fetch stop via `getStop(orgId, id)` from `@/lib/carrier/stops`
- Also fetch: facility details, dispatch details (for back link, dispatch number, primaryDriverId), load details (if stop.loadId), driver userId (for messaging)
- Fetch documents: `prisma.carrierDocument.findMany({ where: { stopId: id } })` with uploader name join

**Header section:**
- Back link -> `/carrier/dispatches/${stop.dispatchId}` with ArrowLeft icon
- Stop type badge (Pickup/Delivery/Fuel/Rest) + "Stop #{sequenceOrder}"
- Status badge (Pending/Arrived/Completed/Skipped)
- Facility name (text-xl font-bold) + full address below

**Info grid** (2-col on md+, 1-col on mobile, using `<dl>` in a card):
- Appointment Start (formatted datetime or "---")
- Appointment End (formatted datetime or "---")
- Arrived At (formatted datetime or "---") — if OWNER/MANAGER, show a small "Edit" button that triggers inline edit via PATCH `/api/v1/carrier/stops/[id]` (only if the stop schema supports updating arrivedAt — check StopUpdateSchema; if not, add arrivedAt/departedAt to StopUpdateSchema in `stops.ts` and the route.ts)
- Departed At (same edit pattern)
- Dwell Time: computed (departedAt - arrivedAt) in minutes, or "---"
- BOL Required: Yes/No + Uploaded/Not Uploaded status
- POD Required: Yes/No + Uploaded/Not Uploaded status  
- Commodity Description (or "---")
- Pieces + Weight (e.g., "24 pcs / 12,500 lbs" or "---")
- Special Instructions (or "---")
- Contact Name + Phone (if present)

**Linked entity chips** (row of link badges):
- Dispatch: `DC-{number}` linking to `/carrier/dispatches/${dispatchId}`
- Load: `LD-{loadNumber}` linking to `/carrier/loads/${loadId}` (if loadId exists)
- Facility: facility name (text only or link to facilities page)

**Documents section:**
- Card with "Documents" header + document count badge
- List existing documents: type badge (bol/pod/weight_ticket/etc), filename, uploader name, date, view/download link (use existing presigned URL pattern from StopDocumentList)
- "Upload Document" button using `<DocumentUploadModal parentType="stop" parentId={stop.id} />` imported from `@/components/carrier/documents/DocumentUploadModal`
- On upload success, `router.refresh()`

**Messages section:**
- Use new `<StopDetailMessages>` client component (pattern from DispatchMessages.tsx)

**2b. Create `StopDetailMessages.tsx` client component:**
- Props: `{ stopId: string, driverUserId: string | null }`
- Fetch messages via GET `/api/v1/carrier/stops/${stopId}/messages` with 10s polling interval
- Send messages via POST `/api/v1/carrier/stops/${stopId}/messages` with `{ body }`
- iMessage-style bubble layout (same as DispatchMessages)
- Empty state: "No messages for this stop yet"
- If no driverUserId: show "Driver does not have an app account -- messaging unavailable"
- Use the same relative time formatting, auto-scroll to bottom, Enter to send

**2c. Update StopUpdateSchema** in both `apps/web/src/lib/carrier/stops.ts` and `apps/web/src/app/api/v1/carrier/stops/[id]/route.ts`:
- Add `arrivedAt: z.string().datetime().optional()` and `departedAt: z.string().datetime().optional()` to StopUpdateSchema
- Update `updateStop()` function in stops.ts to handle arrivedAt/departedAt fields (convert ISO string to Date for Prisma)
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` passes
- Visit `/carrier/stops/[id]` shows full stop detail with info grid
- Documents section shows existing docs with upload button working
- Messages section polls every 10s, can send a message to driver
  </verify>
  <done>
Stop detail page renders with complete info grid, document list + upload, stop-scoped message thread with 10s polling, and edit buttons for arrived/departed timestamps.
  </done>
</task>

<task type="auto">
  <name>Task 3: View Details links on stop cards + driver stop messages</name>
  <files>
    apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    apps/web/src/components/carrier/dispatches/StopTimeline.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/components/driver/route-detail-readonly.tsx
    apps/web/src/components/driver/stop-messages.tsx
  </files>
  <action>
**3a. Add "View Details" link to StopTimelineCard.tsx:**
- Import `Link` from `next/link` and `ExternalLink` from `lucide-react`
- At the bottom-right of the card (after the document compliance section, inside the card div), add:
  ```
  <div className="flex justify-end pt-2">
    <Link href={`/carrier/stops/${stop.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
      View Details <ExternalLink className="h-3 w-3" />
    </Link>
  </div>
  ```
- Also add message count and doc count badges next to existing info. To do this:
  - Add `messageCount?: number` and `docCount?: number` props to StopTimelineCardProps
  - Show small badge pills near the facility name or in the top row: e.g., `{docCount > 0 && <span className="...">N docs</span>}` and `{messageCount > 0 && <span className="...">N msgs</span>}`

**3b. Update StopTimeline.tsx to pass new props:**
- Add `messageCountMap?: Record<string, number>` to StopTimelineProps
- Pass `messageCount={messageCountMap?.[stop.id] ?? 0}` and `docCount={(stopDocCounts[stop.id]?.bolCount ?? 0) + (stopDocCounts[stop.id]?.podCount ?? 0)}` to each StopTimelineCard

**3c. Update dispatch detail page to fetch message counts and pass to StopTimeline:**
- In `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx`:
- After the document counts query (~line 72), add a message count query:
  ```
  const msgCounts = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.fleetMessage.groupBy({
      by: ['stopId'],
      where: { stopId: { in: stopIds }, tenantId: orgId },
      _count: { id: true },
    });
  }, TX_OPTIONS);
  const messageCountMap: Record<string, number> = {};
  for (const m of msgCounts) {
    if (m.stopId) messageCountMap[m.stopId] = m._count.id;
  }
  ```
- Pass `messageCountMap={messageCountMap}` to `<StopTimeline>`

**3d. Add "View All Stops" link to dispatch detail page:**
- In the dispatch detail page, in the "Stop Timeline" section header (line ~243), add a link:
  ```
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold text-foreground">Stop Timeline</h2>
    <Link href={`/carrier/dispatches/${id}/stops`} className="text-sm text-primary hover:underline flex items-center gap-1">
      View All Stops <ExternalLink className="h-3 w-3" />
    </Link>
  </div>
  ```
  Remove the existing `<h2>` with mb-4 since it's now in the flex container.

**3e. Create driver stop messages component at `apps/web/src/components/driver/stop-messages.tsx`:**
- Client component: `'use client'`
- Props: `{ stopId: string, dispatchId: string }`
- Collapsible section (use `useState` for expanded/collapsed, default collapsed)
- Header: "Messages" with unread count badge (from initial fetch)
- When expanded: fetch GET `/api/driver/stops/${stopId}/messages`, poll every 10s
- Message list: sender name, body, relative timestamp (same bubble style or simpler list style)
- Reply input: text input + send button, POST `/api/driver/stops/${stopId}/messages` with `{ body }`
- When collapsed: clear polling interval
- Styling: rounded border, muted background, fits within the stop card layout

**3f. Integrate stop messages into driver route detail (route-detail-readonly.tsx):**
- Import `StopMessages` from `./stop-messages`
- After `<StopDocumentUpload>` (line ~487), add:
  ```
  <StopMessages stopId={stop.id} dispatchId={dispatch.id} />
  ```
- This goes inside the stop `<li>` content area, after documents and before action buttons
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` passes
- Dispatch detail page shows "View All Stops" link in timeline header
- Each stop card has "View Details" link at bottom-right
- Each stop card shows doc count and message count badges when non-zero
- Driver route tab shows collapsible "Messages" section on each stop card
- Driver can expand messages, see stop-scoped messages, and reply
  </verify>
  <done>
Stop timeline cards have View Details links and count badges, dispatch detail has View All Stops link, driver sees collapsible stop-scoped messages on each stop card with polling and reply capability.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx prisma generate && npx tsc --noEmit` — no errors
2. Navigate to a dispatch detail page — see "View All Stops" link, stop cards have "View Details" links
3. Click "View All Stops" — stop overview table renders with all columns
4. Click a stop row — stop detail page renders with info grid, documents, messages
5. Send a stop message from owner — appears in thread
6. Driver route tab — each stop has collapsible messages section
7. Driver expands messages — sees owner's message, can reply
8. All queries use tenantId isolation
</verification>

<success_criteria>
- FleetMessage.stopId FK exists and is indexed
- Stop overview table at /carrier/dispatches/[id]/stops shows all stop data
- Stop detail page at /carrier/stops/[id] shows info grid, docs, messages
- Owner can send/receive stop-scoped messages via 10s polling
- Driver can see/reply to stop-scoped messages in collapsible UI
- View Details links on all stop timeline cards
- Document upload works on stop detail via existing DocumentUploadModal
- ArrivedAt/DepartedAt editable by owner on stop detail
- TypeScript compiles with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/282-stop-overview-detail-page-document-uploa/282-SUMMARY.md`
</output>
