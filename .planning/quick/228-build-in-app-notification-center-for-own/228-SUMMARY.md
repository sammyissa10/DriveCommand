---
phase: quick-228
plan: "01"
subsystem: carrier-ops-notifications
tags: [notifications, owner-portal, real-time, database, api, ui]
dependency_graph:
  requires:
    - Carrier Ops notification system (notifications.ts send* functions)
    - Prisma schema (Tenant + User models)
    - Owner shell layout (owner-shell.tsx)
  provides:
    - in_app_notifications DB table with RLS
    - createNotification() helper (fire-and-forget)
    - GET /api/v1/carrier/notifications
    - PATCH /api/v1/carrier/notifications/mark-read
    - NotificationBell component (owner portal header)
    - NotificationCenter dropdown component
  affects:
    - Owner portal header layout
    - All 5 existing send* notification functions
tech_stack:
  added: []
  patterns:
    - Polling (60s setInterval with cleanup)
    - Fire-and-forget DB writes with try/catch
    - Tenant isolation via orgId on every query
    - RLS with Supabase JWT org_id claim
key_files:
  created:
    - apps/web/prisma/migrations/20260416000001_in_app_notifications/migration.sql
    - apps/web/src/lib/carrier/in-app-notifications.ts
    - apps/web/src/app/api/v1/carrier/notifications/route.ts
    - apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts
    - apps/web/src/components/navigation/notification-bell.tsx
    - apps/web/src/components/navigation/notification-center.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/notifications.ts
    - apps/web/src/components/navigation/owner-shell.tsx
decisions:
  - "RLS INSERT policy uses WITH CHECK (true) — app always writes via service role key, not JWT claims"
  - "Compliance alerts create one in-app notification per alert (not one batch row) for individual actionability"
  - "entityId for compliance alerts defaults to orgId when no specific entity UUID can be extracted from the link"
  - "Mark-all-read uses optimistic local state update to avoid a second fetch round-trip"
metrics:
  duration: "~75 minutes"
  completed: "2026-04-17"
  tasks_completed: 4
  files_changed: 9
---

# Phase quick-228: In-App Notification Center for Owner Portal Summary

Real-time in-app notification center for the owner portal backed by a Postgres table, RLS, REST API, and a polling bell icon in the header.

## What Was Built

**Database (Task 1):** Added `InAppNotificationType` enum (6 values) and `InAppNotification` model to schema.prisma. Wrote and applied migration SQL that creates the table with FK constraints to Tenant and User, two composite indexes for efficient tenant-scoped queries, and three RLS policies (SELECT/INSERT/UPDATE). Ran `prisma migrate deploy` and `prisma generate`.

**Notification writer (Task 2):** Created `in-app-notifications.ts` with `createNotification()` that wraps the Prisma insert in try/catch (never throws). Wired it into all 5 existing `send*` functions in `notifications.ts` — after each email send/markNotificationSent so email idempotency is unaffected:
- `sendDispatchAssignedNotification` — resolves driver full name before writing
- `sendLoadDeliveredNotification` — writes load number + client name
- `sendPayRecordReadyNotification` — writes driver name + dispatch number + net pay
- `sendInvoiceGeneratedNotification` — writes load number + total + payment terms days
- `sendComplianceAlertNotifications` — loops per-alert, routes entityType/entityId from the alert link

**API routes (Task 3):**
- `GET /api/v1/carrier/notifications` — returns `{ notifications, unreadCount }`, supports `?unread=true` and `?limit=N` (capped at 50). Users see org-wide (userId null) and their own targeted notifications.
- `PATCH /api/v1/carrier/notifications/mark-read` — accepts `{ all: true }` or `{ ids: [...] }`, validated via Zod. orgId filter on `ids` path ensures tenant isolation.

**UI (Task 4):**
- `NotificationBell` — client component in owner shell header. Polls `/api/v1/carrier/notifications?unread=true&limit=1` every 60s. Shows red badge with count (9+ cap). Closes dropdown on click-outside via useRef + mousedown listener.
- `NotificationCenter` — dropdown (380px wide, max-h 480px, overflow-y-auto). Sticky header with "Mark all read". Each row: type icon (colored by type), title, message (line-clamp-2), relative timestamp, left border stripe for unread state. Clicking a row marks it read + deep-links to entity + closes dropdown. Empty state with muted Bell icon.
- `owner-shell.tsx` — `<NotificationBell />` added to header before `<UserMenu />` in an `items-center gap-2` flex container.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files created:
- apps/web/prisma/migrations/20260416000001_in_app_notifications/migration.sql — FOUND
- apps/web/src/lib/carrier/in-app-notifications.ts — FOUND
- apps/web/src/app/api/v1/carrier/notifications/route.ts — FOUND
- apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts — FOUND
- apps/web/src/components/navigation/notification-bell.tsx — FOUND
- apps/web/src/components/navigation/notification-center.tsx — FOUND

Commits:
- 8e21869 feat(quick-228): add in_app_notifications table + RLS + Prisma model
- a9bd69e feat(quick-228): add createNotification helper + wire into 5 send* functions
- 6373d59 feat(quick-228): add GET /notifications and PATCH /notifications/mark-read API routes
- 51c0a94 feat(quick-228): add NotificationBell + NotificationCenter UI to owner shell header

TypeScript: zero errors in modified/created files (pre-existing e2e errors unrelated to this work).
