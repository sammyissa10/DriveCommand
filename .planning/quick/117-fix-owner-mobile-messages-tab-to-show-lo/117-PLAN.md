---
phase: quick-117
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
  - apps/mobile/app/(owner)/more/fleet.tsx
  - packages/api-client/src/owner.ts
autonomous: true
must_haves:
  truths:
    - "Load-scoped FleetMessages (loadId set, recipientId null) appear as conversations in the owner Messages tab"
    - "Route-scoped FleetMessages (routeId set, recipientId null) appear as conversations in the owner Messages tab"
    - "Tapping a load or route conversation opens the thread showing all messages for that load/route"
    - "Existing direct-message and broadcast conversations continue to work unchanged"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      provides: "Conversation list including load/route scoped messages"
      contains: "loadId"
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts"
      provides: "Thread endpoint supporting load: and route: prefixed IDs"
      contains: "load:"
    - path: "apps/mobile/app/(owner)/more/fleet.tsx"
      provides: "Mobile UI that opens load/route threads correctly"
    - path: "packages/api-client/src/owner.ts"
      provides: "ConversationSummary type unchanged (recipientId string covers prefixed IDs)"
  key_links:
    - from: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      to: "FleetMessage with loadId/routeId"
      via: "Prisma query includes load/route scoped messages"
      pattern: "loadId.*isNot.*null|routeId.*isNot.*null"
    - from: "apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts"
      to: "FleetMessage"
      via: "Parse load:/route: prefix to query by loadId/routeId"
      pattern: "startsWith.*load:"
    - from: "apps/mobile/app/(owner)/more/fleet.tsx"
      to: "/api/mobile/owner/fleet/messages/[recipientId]"
      via: "ActiveConversation.recipientId carries prefixed ID"
---

<objective>
Fix the owner mobile Messages tab to display load-scoped and route-scoped FleetMessages as conversations, and enable opening threads for those conversations.

Purpose: FleetMessages created from the web Load/Route Messages UI have loadId/routeId set but recipientId null. The mobile API ignores these, so they either show as broken "Driver" entries or don't appear at all. This fix surfaces them properly using a `load:{uuid}` / `route:{uuid}` prefixed recipientId convention.

Output: Working conversations list and thread view for load-scoped, route-scoped, direct, and broadcast messages.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
@apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
@apps/mobile/app/(owner)/more/fleet.tsx
@packages/api-client/src/owner.ts
@apps/web/src/app/(owner)/actions/fleet-messages.ts
@apps/web/prisma/schema.prisma (FleetMessage model, Load model with loadNumber, Route model with name)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand conversations GET to include load/route scoped messages</name>
  <files>apps/web/src/app/api/mobile/owner/fleet/messages/route.ts</files>
  <action>
Modify the GET handler to also fetch FleetMessages where `loadId IS NOT NULL` or `routeId IS NOT NULL` for the tenant, in addition to the existing sender/recipient/broadcast queries.

1. Expand the `where` clause OR conditions to include:
   - `{ loadId: { not: null } }` (load-scoped messages for this tenant)
   - `{ routeId: { not: null } }` (route-scoped messages for this tenant)

2. Also select `loadId` and `routeId` in the findMany select clause.

3. After fetching messages, collect all unique loadIds and routeIds from messages. Do two additional lookups:
   - `prisma.load.findMany({ where: { id: { in: loadIds } }, select: { id: true, loadNumber: true } })` to get load numbers
   - `prisma.route.findMany({ where: { id: { in: routeIds } }, select: { id: true, name: true, origin: true, destination: true } })` to get route names
   Build maps: `loadNameMap` (loadId -> "Load #LD-XXXX") and `routeNameMap` (routeId -> route.name or "Route: origin -> destination").

4. In the conversation grouping loop, BEFORE the existing broadcast/direct logic, add checks:
   - If `m.loadId` is set and `!m.recipientId` and `!m.isBroadcast`: key = `load:${m.loadId}`, recipientId = `load:${m.loadId}`, recipientName = loadNameMap value, isBroadcast = false
   - If `m.routeId` is set and `!m.recipientId` and `!m.isBroadcast`: key = `route:${m.routeId}`, recipientId = `route:${m.routeId}`, recipientName = routeNameMap value, isBroadcast = false
   - Messages with BOTH a recipientId AND a loadId/routeId should still group by recipientId (direct messages stay direct)

5. The POST handler remains unchanged -- owners compose new messages to drivers or broadcast, not to loads/routes from mobile.
  </action>
  <verify>
Build the web app with `cd apps/web && npx next build 2>&1 | tail -5` -- no TypeScript errors. Then manually verify by checking the API response shape includes load/route conversations.
  </verify>
  <done>GET /api/mobile/owner/fleet/messages returns load-scoped conversations with recipientId="load:{uuid}" and recipientName="Load #LD-XXXX", and route-scoped conversations with recipientId="route:{uuid}" and recipientName matching the route name or origin/destination.</done>
</task>

<task type="auto">
  <name>Task 2: Support load/route prefixed IDs in thread endpoint</name>
  <files>apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts</files>
  <action>
Modify the GET handler to detect and handle `load:` and `route:` prefixed recipientId values.

1. After extracting `recipientId` from params, add prefix detection:
   ```
   const isLoadThread = recipientId.startsWith('load:')
   const isRouteThread = recipientId.startsWith('route:')
   ```

2. For load threads (`isLoadThread`):
   - Extract the loadId: `recipientId.slice(5)` (after "load:")
   - Query: `fleetMessage.findMany({ where: { tenantId, loadId: extractedLoadId }, orderBy: { createdAt: 'asc' }, select: { id, senderId, senderRole, body, isBroadcast, createdAt } })`
   - Look up the load: `prisma.load.findUnique({ where: { id: extractedLoadId }, select: { loadNumber: true } })`
   - Set `recipientName` to `"Load #${load.loadNumber}"` or `"Load Thread"` if not found

3. For route threads (`isRouteThread`):
   - Extract the routeId: `recipientId.slice(6)` (after "route:")
   - Query: `fleetMessage.findMany({ where: { tenantId, routeId: extractedRouteId }, orderBy: { createdAt: 'asc' }, select: { id, senderId, senderRole, body, isBroadcast, createdAt } })`
   - Look up the route: `prisma.route.findUnique({ where: { id: extractedRouteId }, select: { name: true, origin: true, destination: true } })`
   - Set `recipientName` to `route.name || "Route: origin -> destination"` or `"Route Thread"` if not found

4. The sender name resolution logic (collecting senderIds, looking up users, building nameMap) stays the same -- reuse it for load/route threads too.

5. The POST handler also needs updating: when recipientId starts with `load:` or `route:`, create the FleetMessage with the appropriate loadId/routeId instead of recipientId. Extract the UUID, set loadId or routeId on the create data, and set recipientId to null. Skip push notification for load/route threads (no single recipient). Keep the existing broadcast and direct message POST logic unchanged.
  </action>
  <verify>
Build the web app with `cd apps/web && npx next build 2>&1 | tail -5` -- no TypeScript errors.
  </verify>
  <done>GET /api/mobile/owner/fleet/messages/load:{uuid} returns all messages for that load. GET /api/mobile/owner/fleet/messages/route:{uuid} returns all messages for that route. POST to load:/route: prefixed IDs creates messages with loadId/routeId set correctly.</done>
</task>

<task type="auto">
  <name>Task 3: Update mobile fleet.tsx to handle load/route conversations</name>
  <files>apps/mobile/app/(owner)/more/fleet.tsx</files>
  <action>
The mobile code mostly works already since it passes `recipientId` as a string. The key fixes:

1. In `ConversationRow`, update the avatar logic: if `recipientId` starts with `load:` or `route:`, show a different icon or color to distinguish from driver conversations. Use a package/truck icon from lucide-react-native (e.g., `Package` for loads, `MapPin` for routes) with a distinct bg color (e.g., `bg-emerald-600` for loads, `bg-amber-600` for routes). Import these icons at the top.

2. In the `FlashList` `keyExtractor`, the current fallback `item.recipientId ?? 'unknown'` already works since load/route IDs are non-null strings.

3. In the `setActiveConversation` call within ConversationRow onPress (line ~366-370): the current fallback `item.recipientId ?? 'broadcast'` already works for load/route conversations since `recipientId` will be `"load:{uuid}"` or `"route:{uuid}"` (non-null).

4. The `fetchThread` and `sendMessage` functions already pass `activeConversation.recipientId` directly to the API, so they work without changes.

5. Remove or guard the `isThreadLoading` state: currently `const isThreadLoading = threadMessages.length === 0` shows loading skeleton permanently when a thread genuinely has no messages. Change to track actual loading state: add a `threadLoading` boolean state, set it true before fetchThread, false after. Use that instead of checking message count.

6. No changes needed to `RecipientSelector` -- it only shows drivers and broadcast for composing new messages, which is correct.
  </action>
  <verify>
Run `cd apps/mobile && npx expo export --platform android 2>&1 | tail -10` to verify the mobile app compiles without errors.
  </verify>
  <done>Owner Messages tab shows load and route conversations with distinct icons. Tapping opens the thread correctly. Direct messages and broadcasts continue working. Thread loading state is accurate.</done>
</task>

</tasks>

<verification>
1. Create a FleetMessage via web with loadId set and recipientId null (simulating web Load Messages). Verify it appears in GET /api/mobile/owner/fleet/messages as a "Load #..." conversation.
2. Tap the load conversation on mobile -- verify the thread loads with all messages for that load.
3. Send a reply from the thread -- verify it creates a FleetMessage with the correct loadId.
4. Verify existing direct-message conversations still work (driver-to-owner threads).
5. Verify broadcast conversations still work.
</verification>

<success_criteria>
- Load-scoped messages appear as distinct conversations named "Load #LD-XXXX"
- Route-scoped messages appear as distinct conversations named by route name or origin/destination
- Thread view works for load, route, direct, and broadcast conversations
- Sending a reply in a load/route thread creates the message with correct loadId/routeId
- No regressions to existing direct and broadcast messaging
</success_criteria>

<output>
After completion, create `.planning/quick/117-fix-owner-mobile-messages-tab-to-show-lo/117-SUMMARY.md`
</output>
