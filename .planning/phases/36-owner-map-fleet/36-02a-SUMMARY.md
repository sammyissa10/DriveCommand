---
phase: 36-owner-map-fleet
plan: 02a
subsystem: mobile-api
tags: [fleet-messaging, push-notifications, prisma, api-client, owner-portal]
dependency_graph:
  requires: [33-02]
  provides: [36-02b]
  affects: [packages/api-client]
tech_stack:
  added: []
  patterns: [bearer-token-auth, fire-and-forget-push, prisma-db-push]
key_files:
  created:
    - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  modified:
    - apps/web/prisma/schema.prisma
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
decisions:
  - "Used db push instead of migrate dev due to persistent migration drift in this project — consistent with Phase 32+ pattern"
  - "Bulk-fetched recipient names in single query for GET endpoint efficiency"
  - "Push notifications fire-and-forget (void) to avoid blocking response"
metrics:
  duration: 184s
  completed: 2026-03-25
  tasks: 3
  files: 4
---

# Phase 36 Plan 02a: Fleet Messaging Backend Summary

**One-liner:** FleetMessage schema extended with recipientId/isBroadcast, REST GET/POST endpoints with push notification delivery, and typed api-client methods.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add recipientId and isBroadcast to FleetMessage | 4939044 | apps/web/prisma/schema.prisma |
| 2 | Create GET and POST fleet messages endpoints | b88b26c | apps/web/src/app/api/mobile/owner/fleet/messages/route.ts |
| 3 | Add fleet messaging methods to api-client | 877f2ae | packages/api-client/src/owner.ts, packages/api-client/src/index.ts |

## What Was Built

### Schema Changes (Task 1)
- Added `recipientId String? @db.Uuid` to FleetMessage — null for broadcasts, set for targeted messages
- Added `isBroadcast Boolean @default(false)` — true when sent to all active drivers
- Added `@@index([senderId])` for efficient sent-message history queries
- Applied via `db push` (migration drift workaround — consistent project pattern)

### Fleet Messages Endpoint (Task 2)
`GET /api/mobile/owner/fleet/messages`
- Returns sender's message history ordered by createdAt DESC
- Bulk-resolves recipient names from User table in a single query
- Returns "All Drivers" for broadcasts

`POST /api/mobile/owner/fleet/messages`
- Body: `{ recipientId?, body: string, isBroadcast? }`
- Validates: non-empty body, 500 char max, recipientId required when not broadcast
- Creates FleetMessage with senderRole='OWNER'
- Broadcasts: queries all active DRIVER users in tenant, sends push to each
- Targeted: sends push to recipientId only
- Push: title "Fleet Message", body = first 100 chars — fire-and-forget

### Api-Client Methods (Task 3)
- `FleetMessageSummary` interface: id, recipientName, body, isBroadcast, createdAt
- `SendFleetMessagePayload` interface: recipientId?, body, isBroadcast?
- `ownerApi.getFleetMessages(token)` — GET history
- `ownerApi.sendFleetMessage(token, payload)` — POST message
- Both types exported from package index

## Verification

- [x] Prisma schema validates (`npx prisma validate` passes)
- [x] Schema pushed to database (`db push` succeeded)
- [x] Prisma client regenerated with new fields
- [x] apps/web TypeScript compiles clean (`npx tsc --noEmit`)
- [x] packages/api-client TypeScript compiles clean (`npx tsc --noEmit`)
- [x] GET endpoint returns sent messages with recipient names
- [x] POST endpoint creates message and triggers push notification
- [x] Broadcast sends push to all active drivers
- [x] Targeted sends push to specific driver

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Migration drift — used db push instead of migrate dev**
- **Found during:** Task 1
- **Issue:** `prisma migrate dev` failed due to persistent drift between migration history files and actual DB schema (multiple migrations modified after apply, plus accumulated schema changes from Phases 32-33 applied via db push)
- **Fix:** Used `npx prisma db push` which syncs schema directly — consistent with this project's pattern across Phases 32+
- **Files modified:** No extra files; schema change was same
- **Commit:** 4939044

## Self-Check: PASSED

Files exist:
- apps/web/src/app/api/mobile/owner/fleet/messages/route.ts — FOUND
- apps/web/prisma/schema.prisma — FOUND (contains recipientId, isBroadcast)
- packages/api-client/src/owner.ts — FOUND (contains getFleetMessages, sendFleetMessage)

Commits exist:
- 4939044 — FOUND
- b88b26c — FOUND
- 877f2ae — FOUND
