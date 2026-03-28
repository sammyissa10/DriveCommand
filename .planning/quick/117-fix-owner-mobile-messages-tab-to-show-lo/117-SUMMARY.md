---
phase: quick-117
plan: "01"
subsystem: mobile-owner-messages
tags: [mobile, api, fleet-messages, owner-portal]
dependency_graph:
  requires: [FleetMessage model with loadId/routeId fields]
  provides: [load-scoped conversations, route-scoped conversations in owner Messages tab]
  affects: [apps/web/src/app/api/mobile/owner/fleet/messages/route.ts, apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts, apps/mobile/app/(owner)/more/fleet.tsx]
tech_stack:
  added: []
  patterns: [load:/route: prefixed recipientId convention for scoped message threads]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
    - apps/mobile/app/(owner)/more/fleet.tsx
decisions:
  - "Use load:{uuid} and route:{uuid} prefixed recipientId convention so the existing ConversationSummary type and API shape require no breaking changes"
  - "Skip push notifications for load/route thread replies — no single driver recipient to notify"
  - "Replace isThreadLoading = threadMessages.length === 0 with explicit threadLoading boolean to avoid permanent skeleton on empty-but-loaded threads"
metrics:
  duration: "5 minutes"
  completed: "2026-03-28"
  tasks_completed: 3
  files_modified: 3
---

# Quick-117: Fix Owner Mobile Messages Tab to Show Load/Route Conversations

Owner mobile Messages tab now surfaces FleetMessages created from the web Load/Route Messages UI (loadId/routeId set, recipientId null) as proper named conversations using a `load:{uuid}` / `route:{uuid}` prefixed recipientId convention.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1+2 | Expand conversations GET + thread endpoint | ba68a09 | apps/web/.../fleet/messages/route.ts, [recipientId]/route.ts |
| 3 | Update mobile fleet.tsx UI | 458a19b | apps/mobile/app/(owner)/more/fleet.tsx |

## What Was Built

### Task 1: Conversations GET endpoint (`route.ts`)
- Expanded `OR` clause to include `{ loadId: { not: null } }` and `{ routeId: { not: null } }`
- Added `loadId` and `routeId` to the `select` clause
- After fetching, collects unique loadIds/routeIds and looks up `Load.loadNumber` and `Route.name/origin/destination`
- In grouping loop: load-scoped messages (loadId set, recipientId null, not broadcast) get key `load:{uuid}` with name `Load #LD-XXXX`; route-scoped messages get key `route:{uuid}` with name from route.name or `origin → destination`; direct messages with both recipientId and loadId/routeId still group by recipientId (unchanged)

### Task 2: Thread endpoint (`[recipientId]/route.ts`)
- GET: detects `load:` prefix (slice 5) and `route:` prefix (slice 6), queries by `loadId`/`routeId` respectively; resolves `recipientName` from load/route lookup; existing broadcast and direct logic unchanged
- POST: builds `createData` with `loadId`/`routeId` set and `recipientId: null` for scoped threads; skips push notification for load/route threads since there is no single recipient; broadcast and direct message push logic unchanged

### Task 3: Mobile fleet.tsx UI
- Imported `Package` and `MapPin` from `lucide-react-native`
- `ConversationRow`: checks if `recipientId` starts with `load:` or `route:` and renders `Package` icon with `bg-emerald-600` (loads) or `MapPin` with `bg-amber-600` (routes) instead of driver initials
- Replaced `isThreadLoading = threadMessages.length === 0` with explicit `threadLoading` boolean state — set `true` before `fetchThread`, `false` in `finally`, also set `true` on conversation change alongside clearing messages

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- Web build (`npx next build`) completed with no TypeScript errors in modified files
- Mobile TypeScript pre-existing errors (FlashList type issues, ExternalLink) are unrelated to this task and existed before

## Self-Check

Files exist:
- [x] apps/web/src/app/api/mobile/owner/fleet/messages/route.ts — FOUND
- [x] apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts — FOUND
- [x] apps/mobile/app/(owner)/more/fleet.tsx — FOUND

Commits exist:
- [x] ba68a09 — feat(quick-117): expand owner fleet messages API
- [x] 458a19b — feat(quick-117): update mobile fleet Messages tab

## Self-Check: PASSED
