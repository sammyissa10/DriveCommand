---
phase: quick-102
plan: 01
subsystem: fleet-messaging
tags: [messaging, loads, mobile-api, schema-migration]
dependency_graph:
  requires: [FleetMessage schema, Load model, mobile driver auth]
  provides: [load-scoped messaging, LoadMessagesSection component, load-aware mobile messages API]
  affects: [apps/web/prisma/schema.prisma, apps/web/src/app/(owner)/loads/[id]/, apps/web/src/app/api/mobile/driver/messages/route.ts, packages/api-client]
tech_stack:
  added: []
  patterns: [Server Actions (useActionState), Prisma schema migration, load-scoped API filtering]
key_files:
  created:
    - apps/web/src/app/(owner)/loads/[id]/load-messages-section.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/(owner)/actions/fleet-messages.ts
    - apps/web/src/app/(owner)/loads/[id]/page.tsx
    - apps/web/src/app/api/mobile/driver/messages/route.ts
    - packages/api-client/src/driver.ts
    - packages/types/src/index.ts
decisions:
  - "Kept existing route-based messaging functions untouched for backward compatibility"
  - "GET messages: return load-scoped messages OR legacy unscoped messages sent by the driver (OR clause) to avoid breaking existing driver message history"
  - "POST validation: null return from transaction triggers 403 — avoids throwing inside transaction block"
metrics:
  duration: ~15 minutes
  completed: 2026-03-24
  tasks_completed: 3
  files_modified: 7
  files_created: 1
---

# Quick Task 102: Move Fleet Messaging from Routes to Loads — Summary

One-liner: Load-centric fleet messaging with optional loadId on FleetMessage, owner chat on load detail page, and load-scoped driver mobile API.

## What Was Done

Moved fleet messaging from route-centric to load-centric. Loads are the primary operational unit drivers interact with on mobile, so messaging now attaches to loads rather than routes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add loadId to FleetMessage schema and update server actions | d3f7ecc | schema.prisma, fleet-messages.ts, types/index.ts, generated/prisma |
| 2 | Add messages section to Load detail page | 455d495 | load-messages-section.tsx (new), loads/[id]/page.tsx |
| 3 | Update mobile driver messages API to be load-aware | ea7a953 | messages/route.ts, api-client/driver.ts |

## Changes by File

**apps/web/prisma/schema.prisma** — Added `loadId String? @db.Uuid` to FleetMessage model with `@@index([loadId])`. Schema pushed via `prisma db push`, client regenerated.

**apps/web/src/app/(owner)/actions/fleet-messages.ts** — Added `loadId: string | null` to `FleetMessageWithSender` type. Added `getLoadMessages(loadId)` and `sendOwnerLoadReply(prevState, formData)` mirroring route-based counterparts. Existing route functions unchanged.

**apps/web/src/app/(owner)/loads/[id]/load-messages-section.tsx** — New client component with chat bubble UI, auto-scroll, relative time formatting. Disabled state when `driverId` is null with "No driver assigned — dispatch this load to enable messaging." note.

**apps/web/src/app/(owner)/loads/[id]/page.tsx** — Imports `LoadMessagesSection` and `getLoadMessages`, fetches messages server-side, renders section after Invoices and before Rate Confirmations.

**apps/web/src/app/api/mobile/driver/messages/route.ts** — GET now finds driver's load IDs then filters messages by `{ loadId: { in: loadIds } } OR { loadId: null, senderId: driverId }`. POST accepts optional `loadId`, verifies load is assigned to driver before creating message.

**packages/api-client/src/driver.ts** — Added `loadId: string | null` to `FleetMessage` interface. Updated `sendMessage()` to accept optional `loadId` parameter, included in request body when provided.

**packages/types/src/index.ts** — Added `routeId?: string | null` and `loadId?: string | null` to the `FleetMessage` interface.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Created
- [x] `apps/web/src/app/(owner)/loads/[id]/load-messages-section.tsx` — exists

### Files Modified
- [x] `apps/web/prisma/schema.prisma` — loadId added
- [x] `apps/web/src/app/(owner)/actions/fleet-messages.ts` — new functions added
- [x] `apps/web/src/app/(owner)/loads/[id]/page.tsx` — messages section rendered
- [x] `apps/web/src/app/api/mobile/driver/messages/route.ts` — load-aware filtering
- [x] `packages/api-client/src/driver.ts` — loadId support added
- [x] `packages/types/src/index.ts` — loadId field added

### Commits
- [x] d3f7ecc — Task 1
- [x] 455d495 — Task 2
- [x] ea7a953 — Task 3

## Self-Check: PASSED
