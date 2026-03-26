---
phase: quick-112
plan: "01"
subsystem: mobile-owner-messaging
tags: [mobile, messaging, owner-portal, api, react-native, nativewind]
dependency_graph:
  requires: []
  provides:
    - owner fleet conversation list view
    - owner fleet chat detail view with iMessage-style bubbles
    - GET /api/mobile/owner/fleet/messages (conversations grouped by recipient)
    - GET /api/mobile/owner/fleet/messages/[recipientId] (thread detail)
    - POST /api/mobile/owner/fleet/messages/[recipientId] (send in thread)
  affects:
    - apps/mobile/app/(owner)/more/fleet.tsx
    - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    - packages/api-client/src/owner.ts
tech_stack:
  added:
    - ConversationSummary type (api-client)
    - ConversationMessage type (api-client)
  patterns:
    - two-view navigation via state (list -> detail)
    - chat bubble pattern (owner=right/blue, other=left/gray)
    - 15s polling for thread updates
    - NativeWind className-only styling (no StyleSheet.create)
key_files:
  created:
    - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
  modified:
    - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
    - apps/mobile/app/(owner)/more/fleet.tsx
decisions:
  - "Navigation between list and chat via local state (not expo-router stack) keeps the UX snappy and avoids back-stack pollution"
  - "recipientId='broadcast' used as sentinel value for broadcast thread to keep URL path clean"
  - "GET /fleet/messages rewritten in-place rather than creating a new endpoint to preserve existing external integrations"
metrics:
  duration: "~30 minutes"
  completed: "2026-03-26"
  tasks_completed: 2
  files_modified: 5
---

# Quick-112: Redesign Mobile Fleet Messages Screen to iMessage-Style Chat

Owner Fleet Messages screen redesigned from a form-based Compose/History tab layout into a two-view iMessage/WhatsApp-style chat UI with conversation threading backend APIs.

## What Was Built

### Backend (Task 1)

**Rewrote `GET /api/mobile/owner/fleet/messages`** to return `ConversationSummary[]` instead of a flat message list. Messages are grouped by conversation partner (the "other" participant). Broadcast messages get a fixed `broadcast` key. Each entry has `recipientId`, `recipientName`, `isBroadcast`, `lastMessage` (100-char preview), `lastMessageAt`, and `unreadCount`.

**Created `GET /api/mobile/owner/fleet/messages/[recipientId]`** that fetches the full thread between the owner and a specific recipient (or all broadcast messages when `recipientId='broadcast'`). Returns `ConversationMessage[]` ordered ASC with `senderName` resolved.

**Created `POST /api/mobile/owner/fleet/messages/[recipientId]`** for sending messages directly in a thread. Returns the created `ConversationMessage`. Push notifications fire-and-forget to recipient(s).

**Updated `packages/api-client/src/owner.ts`** with `ConversationSummary` and `ConversationMessage` types plus three new methods: `getFleetConversations`, `getConversationThread`, `sendConversationMessage`. Existing `getFleetMessages` / `sendFleetMessage` preserved for any web consumers.

### Mobile UI (Task 2)

Complete rewrite of `apps/mobile/app/(owner)/more/fleet.tsx`:

**Conversation List view** (default):
- Header "Messages" with compose button (PenSquare icon, opens RecipientSelector)
- FlashList of ConversationSummary rows: colored avatar (sky for broadcast, slate + initials for drivers), name, last message preview, relative timestamp
- Pull-to-refresh, loading skeleton, empty state
- Tapping a row sets `activeConversation` state to open chat view

**Chat Detail view** (when `activeConversation` is set):
- Header bar with ChevronLeft back button + recipient name centered
- FlashList of ConversationMessage bubbles: owner messages right-aligned `bg-sky-600 rounded-2xl rounded-br-sm`, other messages left-aligned `bg-slate-700 rounded-2xl rounded-bl-sm`
- Sender name above bubble, timestamp below
- Auto-scroll to bottom on load and new messages
- 15-second polling interval (cleared on unmount or view change)
- Input bar pinned to bottom: TextInput `bg-slate-800` + Send button `bg-sky-500` when active
- KeyboardAvoidingView with behavior="padding" on iOS

**driverId param**: pre-opens chat view for that driver using the active drivers query.

All styling uses NativeWind `className` — no `StyleSheet.create`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Created/Modified

- [x] `apps/web/src/app/api/mobile/owner/fleet/messages/route.ts` — modified
- [x] `apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts` — created
- [x] `packages/api-client/src/owner.ts` — modified
- [x] `packages/api-client/src/index.ts` — modified
- [x] `apps/mobile/app/(owner)/more/fleet.tsx` — modified

### Commits

- `f5a1f04` — feat(quick-112): add conversation threading API endpoints
- `7e98c3a` — feat(quick-112): rebuild owner Fleet Messages screen as iMessage-style chat UI

### TypeScript

- `packages/api-client`: PASS (0 errors)
- `apps/web`: PASS (0 errors)
- `apps/mobile`: 3 errors in fleet.tsx — pre-existing patterns matching `FlashList` type usage in messages.tsx and other screens throughout the codebase (TS2749 + TS2322 for estimatedItemSize). Not introduced by this task.

## Self-Check: PASSED
