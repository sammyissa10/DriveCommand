---
phase: quick-112
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
  - packages/api-client/src/owner.ts
  - packages/api-client/src/index.ts
  - apps/mobile/app/(owner)/more/fleet.tsx
  - apps/mobile/components/owner/RecipientSelector.tsx
autonomous: true
must_haves:
  truths:
    - "Owner sees a conversation list showing each driver (and broadcast) as a thread with last message preview and timestamp"
    - "Tapping a conversation opens a chat view with message bubbles (sent=right/sky-blue, received=left/slate-gray)"
    - "Owner can type and send a message from the chat view input bar at the bottom"
    - "Owner can start a new conversation via a compose button that opens the RecipientSelector"
    - "Owner can navigate back from chat view to conversation list"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      provides: "GET returns conversations grouped by recipient with last message preview"
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts"
      provides: "GET returns full message thread for a specific recipient, POST sends message to that recipient"
    - path: "apps/mobile/app/(owner)/more/fleet.tsx"
      provides: "Conversation list view + chat detail view with iMessage-style bubbles"
  key_links:
    - from: "apps/mobile/app/(owner)/more/fleet.tsx"
      to: "/api/mobile/owner/fleet/messages"
      via: "useQuery for conversation list"
      pattern: "ownerApi\\.getFleetConversations"
    - from: "apps/mobile/app/(owner)/more/fleet.tsx"
      to: "/api/mobile/owner/fleet/messages/[recipientId]"
      via: "useQuery for thread detail + useMutation for send"
      pattern: "ownerApi\\.getConversationThread"
---

<objective>
Redesign the Owner Fleet Messages screen from a Compose/History tab layout into a modern iMessage/WhatsApp-style messaging experience. Add backend conversation threading APIs, then rebuild the mobile UI with a conversation list view and a per-recipient chat view with bubbles.

Purpose: Replace the form-based messaging UI with an intuitive chat experience that matches modern messaging app patterns.
Output: Working conversation list + chat detail screens on the owner mobile portal.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
@apps/web/prisma/schema.prisma (FleetMessage model, lines 1068-1085)
@packages/api-client/src/owner.ts (FleetMessageSummary type, ownerApi methods)
@packages/api-client/src/driver.ts (FleetMessage type for reference)
@apps/mobile/app/(owner)/more/fleet.tsx (current screen to rewrite)
@apps/mobile/app/(driver)/messages.tsx (reference for chat bubble pattern)
@apps/mobile/components/owner/RecipientSelector.tsx (keep and reuse)
@apps/mobile/components/skeletons/MessageSkeleton.tsx (reuse for loading states)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add conversation threading API endpoints</name>
  <files>
    apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
    packages/api-client/src/owner.ts
    packages/api-client/src/index.ts
  </files>
  <action>
**1. Modify GET `/api/mobile/owner/fleet/messages/route.ts`** to return conversations grouped by recipient instead of a flat message list.

Query all FleetMessages where `tenantId` matches AND (`senderId = userId` OR `recipientId = userId` OR `isBroadcast = true`). This captures both sent and received messages for the owner.

Group messages by conversation key:
- For broadcasts: key = "broadcast"
- For direct messages: key = the OTHER user's ID (if senderId is the owner, use recipientId; if recipientId is the owner, use senderId)

For each conversation, return:
```typescript
interface ConversationSummary {
  recipientId: string | null  // null for broadcast
  recipientName: string       // "All Drivers" for broadcast, driver name otherwise
  isBroadcast: boolean
  lastMessage: string         // body text, truncated to 100 chars
  lastMessageAt: string       // ISO timestamp
  unreadCount: number         // 0 for now (no read tracking per-convo yet)
}
```

Sort conversations by `lastMessageAt` descending (most recent first). Bulk-fetch user names for all participant IDs in a single query. Keep the existing POST handler unchanged.

Return `{ conversations: ConversationSummary[] }`.

**2. Create new route `apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts`**

GET handler: Accept `recipientId` param from URL. Special case: if recipientId is "broadcast", fetch all messages where `isBroadcast = true` for the tenant. Otherwise, fetch all messages where (`senderId = userId AND recipientId = param`) OR (`senderId = param AND recipientId = userId`) for the tenant. Also include messages where `isBroadcast = true` only if recipientId is "broadcast". Order by `createdAt ASC`. Return full FleetMessage objects with senderRole resolved.

Return type:
```typescript
interface ConversationMessage {
  id: string
  senderId: string
  senderRole: string
  senderName: string
  body: string
  isBroadcast: boolean
  createdAt: string
}
```

Return `{ messages: ConversationMessage[], recipientName: string }`.

POST handler: Accept `{ body: string }`. Create a FleetMessage with senderId = userId, senderRole = "OWNER", recipientId = param (or isBroadcast = true if param is "broadcast"). Send push notification to recipient (reuse pattern from existing POST). Return the created ConversationMessage.

**3. Update `packages/api-client/src/owner.ts`**:

Add types `ConversationSummary` and `ConversationMessage`. Add API methods:
- `getFleetConversations(token)` -> GET `/api/mobile/owner/fleet/messages`
- `getConversationThread(token, recipientId)` -> GET `/api/mobile/owner/fleet/messages/{recipientId}`
- `sendConversationMessage(token, recipientId, body)` -> POST `/api/mobile/owner/fleet/messages/{recipientId}`

Keep existing `getFleetMessages`, `sendFleetMessage` exports (they may be used by web app). Export the new types from `packages/api-client/src/index.ts`.
  </action>
  <verify>
Run `npx tsc --noEmit` from the `packages/api-client` directory to confirm types compile. Run `npx tsc --noEmit` from the `apps/web` directory to confirm API routes compile.
  </verify>
  <done>
New API endpoints exist and compile: GET /fleet/messages returns ConversationSummary[], GET /fleet/messages/[recipientId] returns thread messages, POST /fleet/messages/[recipientId] creates a message in the thread.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rebuild owner Fleet Messages screen as iMessage-style chat UI</name>
  <files>
    apps/mobile/app/(owner)/more/fleet.tsx
  </files>
  <action>
Completely rewrite `apps/mobile/app/(owner)/more/fleet.tsx` to replace the Compose/History tab layout with a two-view messaging experience. Use NativeWind (className) for all styling -- remove the StyleSheet.create block entirely. Follow the dark theme (bg-slate-900 base, slate-800 for cards/inputs).

**State management:** Use a single `activeConversation` state (null = list view, { recipientId, recipientName, isBroadcast } = chat view).

**View 1: Conversation List** (when `activeConversation` is null)

Header: "Messages" title (text-2xl font-bold text-white) with a compose button (PenSquare icon or similar from lucide-react-native) in the top-right that opens the existing RecipientSelector. When a recipient is selected from the selector, navigate to chat view for that recipient.

List: Use FlashList to render `ConversationSummary[]` from `ownerApi.getFleetConversations`. Each row shows:
- Left: Avatar circle (40x40, bg-sky-600 for broadcast with Megaphone icon, bg-slate-700 with initials for drivers)
- Middle: recipientName (text-sm font-semibold text-white) + lastMessage preview (text-xs text-slate-400, numberOfLines=1)
- Right: relative timestamp (text-xs text-slate-500)
- Bottom border: border-b border-slate-800

Tapping a row sets `activeConversation` to that conversation's details.

Empty state: MessageSquare icon + "No conversations yet" + "Tap the compose button to start messaging" text.

Loading state: Reuse MessageSkeleton components.

Pull-to-refresh support.

**View 2: Chat Detail** (when `activeConversation` is set)

Header bar: Back arrow (ChevronLeft) on left that sets `activeConversation` back to null. Recipient name centered (text-lg font-semibold text-white). Wrap in a View with bg-slate-900 border-b border-slate-800 py-3 px-4.

Message list: FlashList rendering `ConversationMessage[]` from `ownerApi.getConversationThread(token, recipientId)`. Use the same chat bubble pattern from the driver messages screen:
- Owner messages (senderRole === 'OWNER'): right-aligned, bg-sky-600, rounded-2xl rounded-br-sm
- Other messages: left-aligned, bg-slate-700, rounded-2xl rounded-bl-sm
- Show sender name above bubble in text-xs text-slate-400
- Show timestamp below bubble in text-xs text-slate-500
- Max width 80%

Auto-scroll to bottom on load and when new messages arrive. Use `inverted={false}` with scrollToEnd.

Input bar at bottom: Same pattern as driver messages screen:
- View with px-4 py-3 border-t border-slate-800 flex-row items-end gap-2
- TextInput: flex-1 bg-slate-800 text-white rounded-xl px-4 py-3, placeholder "Type a message...", multiline, maxLength 500
- Send button: rounded-xl p-3, bg-sky-500 when text present, bg-slate-700 when empty. Send icon from lucide-react-native.

On send: call `ownerApi.sendConversationMessage(token, recipientId, body)` via useMutation. On success, append returned message to local state, clear input, haptic.success(). On error, restore text, haptic.error(), show Alert.

Wrap the chat view in KeyboardAvoidingView with behavior="padding" on iOS.

Poll for new messages every 15 seconds when in chat view (useEffect with setInterval, clear on unmount or view change).

**Keep these imports/patterns:**
- useAuthContext for token
- useFocusEffect from expo-router
- @tanstack/react-query for data fetching
- haptic from lib/haptics
- AnimatedScreen wrapper
- SafeAreaView edges={['top']}
- RecipientSelector component (import and reuse as-is)

**Handle driverId search param:** If `useLocalSearchParams` has `driverId`, auto-open chat view for that driver (fetch driver name from the drivers query, same as current pre-select logic).
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/mobile` to confirm the screen compiles without type errors. Visually verify on Android emulator: conversation list renders, tapping opens chat view, back button returns to list, compose button opens recipient selector, send button works.
  </verify>
  <done>
Owner Fleet Messages screen shows a conversation list by default. Tapping a conversation opens an iMessage-style chat view with bubbles (sent=right/blue, received=left/gray), input bar at bottom with send button, and back navigation to return to the list. Compose button creates new conversations via the existing RecipientSelector.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in packages/api-client, apps/web, and apps/mobile
2. Owner messages screen shows conversation list on load
3. Tapping a conversation shows chat bubbles (owner=right/blue, driver=left/gray)
4. Sending a message from chat view appends it to the list
5. Back button returns to conversation list
6. Compose button opens RecipientSelector, selecting a recipient opens chat view
7. driverId search param pre-opens the correct conversation
</verification>

<success_criteria>
- Owner Fleet Messages screen displays as a modern chat app with conversation list and chat detail views
- No Compose/History tabs remain
- Chat bubbles follow iMessage pattern (sent right/blue, received left/gray)
- Input bar with send button at bottom of chat view
- All existing functionality preserved (send to individual driver, broadcast, pre-select via driverId param)
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/112-redesign-mobile-fleet-messages-screen-to/112-SUMMARY.md`
</output>
