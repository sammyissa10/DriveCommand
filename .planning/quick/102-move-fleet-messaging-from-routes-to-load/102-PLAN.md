---
phase: quick-102
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/app/(owner)/actions/fleet-messages.ts
  - apps/web/src/app/(owner)/loads/[id]/page.tsx
  - apps/web/src/app/(owner)/loads/[id]/load-messages-section.tsx
  - apps/web/src/app/api/mobile/driver/messages/route.ts
  - packages/api-client/src/driver.ts
  - packages/types/src/index.ts
autonomous: true
must_haves:
  truths:
    - "FleetMessage schema has optional loadId column with index"
    - "Owner can send/view messages on a Load detail page"
    - "Mobile driver GET /messages returns messages filtered by loads assigned to the driver"
    - "Mobile driver POST /messages accepts optional loadId"
    - "Driver mobile Messages tab shows all messages across their loads"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "loadId optional field on FleetMessage with index"
      contains: "loadId"
    - path: "apps/web/src/app/(owner)/loads/[id]/load-messages-section.tsx"
      provides: "Messages UI section on load detail page"
    - path: "apps/web/src/app/api/mobile/driver/messages/route.ts"
      provides: "Load-aware driver messaging API"
  key_links:
    - from: "apps/web/src/app/(owner)/loads/[id]/page.tsx"
      to: "load-messages-section.tsx"
      via: "import and render with loadId + driverId props"
    - from: "apps/web/src/app/api/mobile/driver/messages/route.ts"
      to: "prisma.load + prisma.fleetMessage"
      via: "find driver loads then filter messages by loadId"
---

<objective>
Move fleet messaging from Routes to Loads. Add loadId to FleetMessage, create a messages section on the Load detail page for owner-driver communication, and update the mobile driver messages API to filter by the driver's assigned loads.

Purpose: Messaging should be load-centric (not route-centric) since loads are the primary operational unit drivers interact with.
Output: Schema migration, Load detail messages UI, updated mobile API endpoints.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (FleetMessage model at line ~1068, Load model at line ~868)
@apps/web/src/app/(owner)/actions/fleet-messages.ts (existing route-based owner messaging actions)
@apps/web/src/app/(owner)/loads/[id]/page.tsx (load detail page to add messages section)
@apps/web/src/app/(owner)/routes/[id]/route-messages-section.tsx (reference UI pattern for messages)
@apps/web/src/app/api/mobile/driver/messages/route.ts (mobile driver messages API)
@packages/api-client/src/driver.ts (getMessages/sendMessage client functions)
@packages/types/src/index.ts (FleetMessage type)
@apps/mobile/app/(driver)/messages.tsx (driver mobile messages screen)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add loadId to FleetMessage schema and update server actions</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/src/app/(owner)/actions/fleet-messages.ts
    packages/types/src/index.ts
  </files>
  <action>
1. In `apps/web/prisma/schema.prisma`, add `loadId String? @db.Uuid` to the FleetMessage model (after routeId line ~1071). Add `@@index([loadId])` to the indexes.

2. Run `cd apps/web && npx prisma db push` to apply the schema change. Then run `npx prisma generate` to regenerate the client.

3. In `packages/types/src/index.ts`, add `loadId?: string | null` to the FleetMessage interface (after the existing fields).

4. In `apps/web/src/app/(owner)/actions/fleet-messages.ts`:
   - Update the `FleetMessageWithSender` type to include `loadId: string | null`.
   - Add a new function `getLoadMessages(loadId: string)` that mirrors `getRouteMessages` but filters by loadId instead of routeId. Same sender name resolution pattern.
   - Add a new function `sendOwnerLoadReply(prevState: any, formData: FormData)` that mirrors `sendOwnerReply` but:
     - Reads `loadId` from formData instead of `routeId`
     - Verifies the load exists via `prisma.load.findFirst({ where: { id: loadId } })`
     - Creates FleetMessage with `loadId` set (and routeId null)
     - Sends push/email notification to `load.driverId` (if assigned) — same pattern as existing sendOwnerReply
   - Keep existing route-based functions untouched (backward compatible).
   - Include `loadId` in the return mapping of both new and existing functions.
  </action>
  <verify>
    Run `cd apps/web && npx prisma generate` succeeds without errors. Run `npx tsc --noEmit` from repo root to confirm no type errors.
  </verify>
  <done>FleetMessage has loadId column in DB, types updated, new load-scoped server actions exist alongside route-scoped ones.</done>
</task>

<task type="auto">
  <name>Task 2: Add messages section to Load detail page</name>
  <files>
    apps/web/src/app/(owner)/loads/[id]/load-messages-section.tsx
    apps/web/src/app/(owner)/loads/[id]/page.tsx
  </files>
  <action>
1. Create `apps/web/src/app/(owner)/loads/[id]/load-messages-section.tsx` — a client component modeled closely on `route-messages-section.tsx` but for loads:
   - Props: `{ loadId: string; driverId: string | null; initialMessages: FleetMessageWithSender[] }`
   - Import `sendOwnerLoadReply` and `getLoadMessages` from fleet-messages actions
   - Use `useActionState(sendOwnerLoadReply, null)` for the form
   - Hidden input: `loadId` (not routeId)
   - Header text: "Load Messages" (not "Route Messages")
   - Empty state text: "Drivers can send messages from their mobile app."
   - If `driverId` is null, show a note: "No driver assigned — dispatch this load to enable messaging." and disable the reply input.
   - Same chat bubble styling, auto-scroll, and relative time formatting as route-messages-section.

2. In `apps/web/src/app/(owner)/loads/[id]/page.tsx`:
   - Import `LoadMessagesSection` and `getLoadMessages` from the new files/actions
   - After the existing `load` query, fetch messages: `const loadMessages = await getLoadMessages(id);`
   - Render `<LoadMessagesSection loadId={id} driverId={load.driverId} initialMessages={loadMessages} />` AFTER the Invoices section and BEFORE the Rate Confirmations section (between lines ~373 and ~377).
   - Add `MessageSquare` to the lucide imports if not already there.
  </action>
  <verify>
    Run `cd apps/web && npx next build` or `npx tsc --noEmit` to confirm no build errors. Visually: navigate to a load detail page and confirm the messages section renders (empty state if no messages).
  </verify>
  <done>Load detail page shows a messages section where owner can view and send messages scoped to that load. Disabled state shown when no driver assigned.</done>
</task>

<task type="auto">
  <name>Task 3: Update mobile driver messages API to be load-aware</name>
  <files>
    apps/web/src/app/api/mobile/driver/messages/route.ts
    packages/api-client/src/driver.ts
  </files>
  <action>
1. In `apps/web/src/app/api/mobile/driver/messages/route.ts` — update the GET handler:
   - After auth validation, query the driver's assigned loads: `const driverLoads = await tx.load.findMany({ where: { driverId: auth.driverId, tenantId }, select: { id: true } })`
   - Extract loadIds: `const loadIds = driverLoads.map(l => l.id)`
   - Change the fleetMessage query to filter by: `where: { tenantId, OR: [{ loadId: { in: loadIds } }, { loadId: null, senderId: auth.driverId }] }` — this returns messages for the driver's loads PLUS any legacy messages the driver sent without a loadId.
   - Keep orderBy createdAt asc.

2. In the same file, update the POST handler:
   - Parse optional `loadId` from the request body alongside `body`: `const { body, loadId } = payload`
   - If `loadId` is provided, verify the load exists and is assigned to this driver: `const load = await tx.load.findFirst({ where: { id: loadId, driverId } })`. Return 403 if not found/not assigned.
   - Include `loadId: loadId || null` in the fleetMessage.create data.

3. In `packages/api-client/src/driver.ts`:
   - Update `sendMessage` to accept an optional second parameter `loadId?: string`
   - Update the JSON.stringify to include loadId when provided: `JSON.stringify({ body, ...(loadId && { loadId }) })`
   - No changes needed to `getMessages` — it returns whatever the API returns.

Note: The mobile driver messages.tsx screen does NOT need changes for this task. It already shows all messages returned by the API. The API change transparently shifts from tenant-wide to load-scoped filtering. Future enhancement can group messages by load in the UI.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` to confirm no type errors. Test with curl:
    - `curl -H "Authorization: Bearer <token>" https://localhost:3000/api/mobile/driver/messages` returns messages filtered by driver's loads.
    - `curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"body":"test","loadId":"<valid-load-id>"}' https://localhost:3000/api/mobile/driver/messages` returns 201 with loadId set.
  </verify>
  <done>Mobile driver messages API filters by driver's assigned loads on GET, accepts optional loadId on POST. api-client updated to pass loadId.</done>
</task>

</tasks>

<verification>
1. `npx prisma generate` succeeds — schema valid with new loadId field
2. `npx tsc --noEmit` from repo root — no type errors across web, api-client, types packages
3. Load detail page renders messages section with send capability
4. Mobile API GET returns load-scoped messages for the authenticated driver
5. Mobile API POST accepts and persists loadId
</verification>

<success_criteria>
- FleetMessage table has loadId column (nullable UUID with index)
- Owner can send and view messages on any Load detail page
- Messages are scoped to the specific load (not route, not tenant-wide)
- Driver mobile API returns messages only for loads assigned to that driver
- Driver can send messages with an optional loadId
- Existing route-based messaging continues to work (backward compatible)
</success_criteria>

<output>
After completion, create `.planning/quick/102-move-fleet-messaging-from-routes-to-load/102-SUMMARY.md`
</output>
