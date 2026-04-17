---
phase: quick-232
plan: 01
subsystem: web-driver-portal
tags: [driver-portal, dashboard, gps, notifications, navigation, mobile-ui]
dependency_graph:
  requires:
    - apps/web/src/app/(driver)/actions/driver-routes.ts
    - apps/web/src/app/(driver)/actions/driver-hos.ts
    - apps/web/src/app/(driver)/actions/driver-messages.ts
    - apps/web/src/lib/carrier/in-app-notifications.ts
    - apps/web/src/lib/rate-limit.ts
  provides:
    - apps/web/src/app/(driver)/page.tsx (dashboard landing page)
    - apps/web/src/app/(driver)/more/page.tsx (more menu page)
    - apps/web/src/app/api/driver/gps-ping/route.ts (browser GPS endpoint)
    - apps/web/src/app/api/driver/notifications/route.ts (driver notifications)
    - apps/web/src/app/api/driver/notifications/mark-read/route.ts (mark read)
    - apps/web/src/app/(driver)/actions/driver-dashboard.ts (dashboard data action)
  affects:
    - apps/web/src/app/(driver)/layout.tsx (dark header, notifications, simplified)
    - apps/web/src/components/driver/driver-bottom-nav.tsx (5-tab structure)
    - apps/web/src/components/driver/driver-nav.tsx (5-tab desktop nav)
tech_stack:
  added:
    - useOptimistic (React 19 optimistic updates for HOS status)
    - navigator.geolocation.watchPosition (browser GPS API)
  patterns:
    - Server component → client component composition (page.tsx → DriverDashboard)
    - Polling with setInterval + cleanup on unmount (notification bell, 60s)
    - GPS watchPosition with throttled POSTs (30s minimum interval)
    - Optimistic UI for form actions (HOS status buttons)
key_files:
  created:
    - apps/web/src/app/(driver)/page.tsx
    - apps/web/src/app/(driver)/more/page.tsx
    - apps/web/src/app/(driver)/actions/driver-dashboard.ts
    - apps/web/src/app/api/driver/gps-ping/route.ts
    - apps/web/src/app/api/driver/notifications/route.ts
    - apps/web/src/app/api/driver/notifications/mark-read/route.ts
    - apps/web/src/components/driver/driver-dashboard.tsx
    - apps/web/src/components/driver/driver-dispatch-card.tsx
    - apps/web/src/components/driver/driver-gps-ping.tsx
    - apps/web/src/components/driver/driver-notification-bell.tsx
    - apps/web/src/components/driver/driver-notification-panel.tsx
    - apps/web/src/components/driver/driver-hos-widget.tsx
    - apps/web/src/components/driver/driver-quick-actions.tsx
    - apps/web/src/components/driver/driver-messages-preview.tsx
    - apps/web/src/components/driver/driver-sign-out-button.tsx
  modified:
    - apps/web/src/app/(driver)/layout.tsx
    - apps/web/src/components/driver/driver-bottom-nav.tsx
    - apps/web/src/components/driver/driver-nav.tsx
decisions:
  - GPS logging-only approach: GPSLocation table has FK to legacy Truck (not CarrierTruck), so web driver GPS pings are logged structured rather than persisted to DB; TODO added for when CarrierGPSLocation table exists
  - fleet_message not in InAppNotificationType enum: driver notification filter uses only dispatch_assigned type; fleet messages route through FleetMessage model separately
  - useOptimistic for HOS status: immediate UI feedback on status button taps before server action completes
metrics:
  duration: ~25 minutes
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_created: 18
  files_modified: 3
---

# Phase quick-232 Plan 01: Complete Driver Portal Redesign Summary

Full driver web portal redesign replacing the redirect-to-route page with a functional dashboard, browser GPS pinging, notification bell, 5-tab navigation (Dashboard/Route/Load/Messages/More), and a More menu with secondary navigation items.

## What Was Built

### Backend (Task 1)
- **POST /api/driver/gps-ping**: Accepts browser geolocation coords, rate-limited by userId (1 req/5s), logs via structured logger. Cannot persist to GPSLocation (FK incompatibility with CarrierTruck — see deviations).
- **GET /api/driver/notifications**: Returns `dispatch_assigned` notifications scoped to driver (userId or org-wide). Supports `?unread=true&limit=N` params.
- **PATCH /api/driver/notifications/mark-read**: Marks individual or all driver notifications read. `all: true` filters to driver types only, preventing cross-contamination with owner notifications.
- **`getDriverDashboardData()` server action**: Single call fetching active dispatch + HOS + recent messages (last 2 FleetMessages for driver). Returns typed object.

### Frontend (Task 2)
- **`DriverDashboard`**: Client component composing all dashboard sections. Time-aware greeting ("Good morning/afternoon/evening, {firstName}."), GPS indicator in header row.
- **`DriverDispatchCard`**: Full dispatch info with status badge (planned=slate, in_progress=blue), truck unit number, stop progress counter, next stop preview, primary CTA button ("Start Trip" or "Continue to Stops").
- **`DriverQuickActions`**: Horizontally scrollable tiles (5 items: My Route, Messages, Hours, Documents, Incidents) with color-coded backgrounds, edge-to-edge scroll via negative margin trick.
- **`DriverHosWidget`**: Current duty status badge + 4 tap buttons (OFF/SB/D/ON) with `useOptimistic` for instant feedback. Shows on-duty hours used in "Xh Ym" format.
- **`DriverMessagesPreview`**: Last 2 FleetMessages with sender label, 60-char truncation, relative timestamps. "View all messages →" link.
- **`DriverGpsPing`**: `watchPosition`-based GPS with 30s POST throttle. Shows green/yellow/grey dot indicator + "Location on/Locating.../Location off" text. Cleanup on unmount via `clearWatch`.
- **`DriverNotificationBell`**: Polls `/api/driver/notifications` every 60s. Red badge with count (9+ cap). Dropdown opens `DriverNotificationPanel`.
- **`DriverNotificationPanel`**: Lists notifications with Truck/MessageSquare icons, relative timestamps, unread stripe indicator, click-to-navigate + mark-read. "Mark all read" button.
- **`driver-bottom-nav`**: Rebuilt with 5 tabs (Dashboard/Route/Load/Messages/More), 60px min-height, Dashboard uses `exact: true` matching.
- **`driver-nav`**: Desktop 5-tab nav matching bottom nav structure.
- **`more/page.tsx`**: Full-screen menu with Hours, Documents, Incidents, Support Tickets, and Log Out (via `DriverSignOutButton` client component using `/api/auth/logout`).
- **`layout.tsx`**: Dark branded header (`bg-slate-900`), AppLogo `variant="light"`, `DriverNotificationBell` in header, removed GpsTracker and truckId transaction lookup, `pb-24` for taller bottom nav.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing validation] `fleet_message` not a valid InAppNotificationType enum value**
- **Found during:** Task 1 (writing notification GET endpoint)
- **Issue:** The plan specified filtering for `type IN ('dispatch_assigned', 'fleet_message')` but `fleet_message` is not in the InAppNotificationType enum (values: dispatch_assigned, load_delivered, pay_record_ready, invoice_generated, compliance_alert, needs_assignment).
- **Fix:** Changed driver notification filter to `dispatch_assigned` only. Fleet messages route through the FleetMessage model separately.
- **Files modified:** `apps/web/src/app/api/driver/notifications/route.ts`, `apps/web/src/app/api/driver/notifications/mark-read/route.ts`
- **Commit:** be7896c

**2. [Rule 1 - Bug] Nullable `city`/`state` fields on CarrierStop.facility**
- **Found during:** Task 2 TypeScript check
- **Issue:** The dispatch stop facility fields `city` and `state` are `string | null` in the Prisma schema, but DispatchStop interface declared them as `string`. TypeScript error TS2322.
- **Fix:** Updated interfaces in `driver-dispatch-card.tsx` and `driver-dashboard.tsx` to use `string | null` for facility city/state. Updated render code to use `.filter(Boolean).join(', ')`.
- **Files modified:** `driver-dispatch-card.tsx`, `driver-dashboard.tsx`
- **Commit:** db10552

**3. [Rule 1 - Bug] `ActionState.error` is `string | Record<string, string[]>`, not just `string`**
- **Found during:** Task 2 TypeScript check
- **Issue:** `state?.error` in HOS widget rendered directly as JSX, but `error` can be a `Record<string, string[]>` which is not a valid ReactNode. TS error TS2322.
- **Fix:** Added `typeof state.error === 'string'` guard before rendering error text.
- **Files modified:** `driver-hos-widget.tsx`
- **Commit:** db10552

**4. [Rule 2 - Missing feature] Added `DriverSignOutButton` client component**
- **Found during:** Task 2 (creating more/page.tsx)
- **Issue:** Plan specified sign-out in More page but `more/page.tsx` is a server component; sign-out requires a client-side fetch call.
- **Fix:** Created `apps/web/src/components/driver/driver-sign-out-button.tsx` as a 'use client' component using the same `/api/auth/logout` + `window.location.href = '/sign-in'` pattern as UserMenu.
- **Files modified:** (new file created)
- **Commit:** db10552

## Self-Check: PASSED

All 17 planned artifact files exist. Both commits (be7896c, db10552) verified in git log. TypeScript passes with zero errors (only 3 pre-existing e2e test errors unrelated to this task). Next.js build completes successfully.
