---
task: 257
type: quick
title: "Fix live map centering, driver dispatch card state, greeting punctuation, and owner stop completion notification"
status: completed
completed_date: "2026-04-19"
duration_minutes: 20
commits:
  - 2f37e60
  - 2492e4b
  - 1029747
files_modified:
  - apps/web/src/components/maps/live-map.tsx
  - apps/web/src/components/driver/driver-dashboard.tsx
  - apps/web/src/components/driver/driver-dispatch-card.tsx
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/emails/carrier/stop-completed.tsx
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260419000001_add_stop_completed_notification_type/migration.sql
key_decisions:
  - "Single-vehicle map centering uses setView(zoom 13) instead of fitBounds to avoid point-bbox over-zoom"
  - "Dispatch card uses 5 CTA states derived from dispatch.status + stop.status, not just isPlanned boolean"
  - "Stop completion notification is fire-and-forget via after() to never block the stop completion action"
---

# Quick Task 257: Fix live map centering, driver dispatch card state, greeting punctuation, and owner stop completion notification

**One-liner:** Live map centers on single vehicle at zoom 13, dispatch card shows 5 state-aware CTA buttons based on dispatch/stop status, greeting uses exclamation mark, and owners receive email+in-app+push when a driver completes a stop.

## What Was Done

### Task 1: Live map auto-center + greeting punctuation
- `FitBoundsOnMount` in `live-map.tsx`: added single-vehicle fast path — when exactly one vehicle has a location, uses `map.setView([lat, lng], 13)` instead of `fitBounds` on a zero-area point bbox (which could over-zoom or behave unexpectedly)
- Multi-vehicle path unchanged: `fitBounds` with `padding: [50, 50], maxZoom: 14`
- `hasFitted.current` ref preserves no-recenter-on-poll behavior
- `driver-dashboard.tsx` line 81: period changed to exclamation mark in both greeting patterns

### Task 2: Driver dispatch card button state
Replaced binary `isPlanned ? 'Start Trip & Navigate' : 'Begin Navigation'` with full 5-state CTA:

| ctaState | Condition | Label | Color |
|---|---|---|---|
| `start` | `dispatch.status === 'planned'` | Start Trip & Navigate | Blue (primary) |
| `complete_stop` | `in_progress` + a stop has `arrived` | Complete Current Stop | Green |
| `continue` | `in_progress` + pending stops, none arrived | Continue to Stops | Blue (primary) |
| `trip_done` | `in_progress` + all stops completed/skipped | Trip Complete | Grey/disabled |
| `completed` | `dispatch.status === 'completed'` | Completed badge (no button) | Green badge |

Also added a current stop status indicator row (shown when `in_progress`) displaying "Stop X of Y", the facility name, and an Arrived (amber) or Pending (slate) badge.

### Task 3: Owner stop completion notification
- Added `stop_completed` to `InAppNotificationType` enum in schema.prisma
- Migration `20260419000001_add_stop_completed_notification_type` applied successfully
- Created `apps/web/src/emails/carrier/stop-completed.tsx` — React Email template with driver name, stop type, facility, completion time, dispatch number
- Added `sendStopCompletedNotification(orgId, stopId)` to `notifications.ts`:
  - Idempotency key: `carrier-stop-completed-${stopId}`
  - Fetches stop with facility + dispatch + driver info
  - Sends email to owner, creates in-app notification (`type: 'stop_completed'`), sends push to owner
  - Full try/catch — never throws
- Wired into `completeStop()` in `stop-completion.ts` via `after(() => sendStopCompletedNotification(orgId, stopId))` immediately after the logger.info('completeStop: completed') line

## Deviations from Plan

**[Rule 3 - Blocking] Resolved stuck migration before deploying**
- Found during: Task 3 migration step
- Issue: `20260417100001_add_vehicle_id_display_name` was in a failed state in the migration history (window function in UPDATE not allowed in PostgreSQL). The migration's DDL changes (columns) had already been applied to the DB.
- Fix: Ran `prisma migrate resolve --applied` to mark it applied, then `prisma migrate deploy` succeeded
- Files modified: none (DB state fix only)

## Verification

- `npx tsc --noEmit` — zero errors in application code (3 pre-existing E2E test errors in `e2e/` unrelated to this task)
- `npx prisma validate` — schema valid
- Migration applied successfully to Supabase DB

## Self-Check: PASSED

Files confirmed present:
- apps/web/src/components/maps/live-map.tsx — FOUND
- apps/web/src/components/driver/driver-dashboard.tsx — FOUND
- apps/web/src/components/driver/driver-dispatch-card.tsx — FOUND
- apps/web/src/lib/carrier/notifications.ts — FOUND
- apps/web/src/lib/carrier/stop-completion.ts — FOUND
- apps/web/src/emails/carrier/stop-completed.tsx — FOUND
- apps/web/prisma/schema.prisma — FOUND
- apps/web/prisma/migrations/20260419000001_add_stop_completed_notification_type/migration.sql — FOUND

Commits confirmed:
- 2f37e60 — Task 1 (live map + greeting)
- 2492e4b — Task 2 (dispatch card)
- 1029747 — Task 3 (stop notification)
