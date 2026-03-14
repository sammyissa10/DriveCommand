---
phase: quick-64
plan: 01
subsystem: driver-portal, owner-portal, messaging
tags: [messaging, fleet-messages, driver, owner, database, rls]
dependency_graph:
  requires: []
  provides: [fleet-messaging, driver-send-message, owner-reply]
  affects: [driver-portal, owner-route-detail]
tech_stack:
  added: [FleetMessage (Prisma model)]
  patterns: [server-actions, useActionState, client-side-refetch, tenant-rls]
key_files:
  created:
    - prisma/migrations/20260314000001_add_fleet_message/migration.sql
    - src/app/(owner)/actions/fleet-messages.ts
    - src/app/(owner)/routes/[id]/route-messages-section.tsx
  modified:
    - prisma/schema.prisma
    - src/app/(driver)/actions/driver-messages.ts
    - src/components/driver/messaging-panel.tsx
    - src/app/(driver)/my-route/page.tsx
    - src/app/(owner)/routes/[id]/page.tsx
    - src/app/(owner)/routes/[id]/route-page-client.tsx
decisions:
  - No Prisma relations on FleetMessage — follows codebase pattern of manual joins for newer models
  - senderRole stored as TEXT ("DRIVER"/"OWNER") to avoid enum migration complexity
  - getRouteMessages batches sender lookups in a single query (Set of unique IDs) rather than N+1
  - MessagingPanel clears form on successful send using formRef.current.reset()
  - Messages section added to /my-route page and /routes/[id] owner page
metrics:
  duration: ~15 minutes
  completed: "2026-03-14"
  tasks: 3
  files_affected: 9
---

# Phase quick-64 Plan 01: TKT-0020 Fix Driver Portal Messaging Summary

Real bidirectional FleetMessage persistence with RLS-protected database table, driver send/display on /my-route and /messages, and owner view+reply on /routes/[id].

## What Was Built

**FleetMessage model** — New Prisma model and SQL migration adding a `FleetMessage` table with tenant RLS (`tenant_isolation_policy` + `bypass_rls_policy`). No Prisma relations — follows the codebase's manual-join pattern for newer models.

**Driver messaging (real persistence)** — Rewrote `driver-messages.ts`: `sendDriverMessage` now creates a `FleetMessage` record scoped to the driver's active route and tenant. `getDriverMessages` fetches all messages (driver + owner) for that route ordered chronologically.

**MessagingPanel (real display)** — Rewrote the component with actual message rendering: driver messages right-aligned in primary color, owner/dispatch messages left-aligned in muted. Auto-scrolls to bottom, re-fetches after successful send, clears the input field. Relative timestamps (e.g. "2m ago").

**Route Messages on /my-route** — Added a "Route Messages" card section to the driver's route page, rendering `<MessagingPanel />`.

**Owner-side fleet-messages.ts** — New server action file: `getRouteMessages` (fetches all messages for a route with sender names resolved in a single batched query) and `sendOwnerReply` (creates a FleetMessage with `senderRole: 'OWNER'`).

**RouteMessagesSection** — New client component on the owner route detail page: chat-like view, driver messages left-aligned with driver name, owner messages right-aligned as "You", reply form with hidden routeId input, empty state message.

**Owner route detail wired** — `page.tsx` adds `getRouteMessages` to the parallel `Promise.all` fetch. `RoutePageClient` accepts `messages: FleetMessageWithSender[]` prop and renders `<RouteMessagesSection>` after the Files section in view mode.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f77e359 | feat(quick-64): add FleetMessage model and migration |
| 2 | c7ee746 | feat(quick-64): wire driver messaging with real persistence and display |
| 3 | 427dda8 | feat(quick-64): add owner-side route messaging with reply capability |

## Verification

- `npx tsc --noEmit` — passed, no type errors
- `npx next build` — passed, all routes compiled
- `npx prisma migrate deploy` — applied migration, FleetMessage table created with RLS policies

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files created/modified:
- prisma/schema.prisma — FOUND
- prisma/migrations/20260314000001_add_fleet_message/migration.sql — FOUND
- src/app/(driver)/actions/driver-messages.ts — FOUND
- src/components/driver/messaging-panel.tsx — FOUND
- src/app/(driver)/my-route/page.tsx — FOUND
- src/app/(owner)/actions/fleet-messages.ts — FOUND
- src/app/(owner)/routes/[id]/route-messages-section.tsx — FOUND
- src/app/(owner)/routes/[id]/page.tsx — FOUND
- src/app/(owner)/routes/[id]/route-page-client.tsx — FOUND

Commits:
- f77e359 — FOUND
- c7ee746 — FOUND
- 427dda8 — FOUND
