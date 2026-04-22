---
phase: quick-265
plan: 01
subsystem: driver-portal
tags: [driver, ux, loading-skeletons, dispatch-history, document-upload, security]
dependency_graph:
  requires: [carrier-ops-schema, r2-storage, supabase-auth]
  provides: [driver-stop-document-upload-api, dispatch-history-ui, driver-loading-skeletons]
  affects: [driver-portal-pages, carrier-dispatch-server-actions]
tech_stack:
  added: []
  patterns: [animate-pulse-skeletons, active-history-tabs, per-stop-document-upload, force-dynamic-pages]
key_files:
  created:
    - apps/web/src/app/(driver)/my-route/loading.tsx
    - apps/web/src/app/(driver)/my-load/loading.tsx
    - apps/web/src/app/(driver)/messages/loading.tsx
    - apps/web/src/app/(driver)/hours/loading.tsx
    - apps/web/src/app/(driver)/incidents/loading.tsx
    - apps/web/src/components/driver/dispatch-history-list.tsx
    - apps/web/src/components/driver/route-tab-view.tsx
    - apps/web/src/components/driver/stop-document-upload.tsx
    - apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts
  modified:
    - apps/web/src/app/(driver)/my-route/page.tsx
    - apps/web/src/app/(driver)/my-load/page.tsx
    - apps/web/src/app/(driver)/messages/page.tsx
    - apps/web/src/app/(driver)/hours/page.tsx
    - apps/web/src/app/(driver)/incidents/page.tsx
    - apps/web/src/app/(driver)/actions/driver-routes.ts
    - apps/web/src/components/driver/completed-load-history.tsx
    - apps/web/src/components/driver/route-detail-readonly.tsx
decisions:
  - "RouteTabView is a dedicated client component so the Route page stays a server component (parallel data fetching)"
  - "StopDocumentUpload uses inline form (no modal) to minimize interaction complexity on mobile"
  - "Document upload does not check or modify stop status — deliberately permissive for completed stops"
  - "dispatch-history-list uses local state for drill-down navigation (no URL routing needed for simple list/detail)"
metrics:
  duration: ~35 minutes
  completed: 2026-04-21
  tasks: 3
  files: 17
---

# Phase quick-265 Plan 01: Driver Portal Enhancements Summary

**One-liner:** Loading skeletons for all driver pages, Active/History dispatch tabs with 20-dispatch history drill-down, rate fields removed from driver load view, and BOL/POD/Weight Ticket/Fuel Receipt/Other document upload on every stop.

## What Was Built

### Task 1: Loading Skeletons, force-dynamic, Hide Rate Fields
- Created `loading.tsx` skeleton files for all 5 driver portal pages (my-route, my-load, messages, hours, incidents) using `animate-pulse` + `bg-muted` shapes matching each page layout
- Added `export const dynamic = 'force-dynamic'` to my-load, messages, hours, and incidents pages (my-route already had it)
- Removed `rateAmount` and `rateType` fields from `completed-load-history.tsx` — drivers no longer see financial data on load cards

### Task 2: Completed Dispatch History with Active/History Tabs
- Updated `getMyDispatchHistory` server action: increased limit to 20, changed sort to `actualDeparture desc`, added `carrierLoads` (with client names) and stop `documents` to the include
- Created `DispatchHistoryList` component — list view shows dispatch ID, completion date, truck, stop count, client names; clicking drills into a full stop timeline with document upload per stop
- Created `RouteTabView` client component — manages Active/History tab state with badge indicators (green dot for active dispatch, count for history)
- Rewrote `my-route/page.tsx` to fetch active dispatch and history in parallel via `Promise.allSettled`, passing server components as children to `RouteTabView`

### Task 3: Per-Stop Document Upload
- Created `/api/driver/stops/[stopId]/documents` with POST (upload) and GET (list) handlers
  - Auth: `requireRole([DRIVER])` + `getSession()` (cookie-based Supabase auth)
  - Tenant isolation: verifies stop belongs to dispatch where `primaryDriverId` = authenticated driver's `carrierDriver.id` AND `orgId` = `session.tenantId`
  - Supports 5 document types: `bol`, `pod`, `weight_ticket`, `fuel_receipt`, `other`
  - Validates file type (pdf/jpeg/jpg/png/heic/webp), max 25MB, non-empty
  - Uploads to R2 via `generateUploadUrl` presigned flow, creates `CarrierDocument` record
  - Does NOT check or modify stop status (works on completed stops)
  - Rate limited with `uploadLimiter` (20/min per user)
- Created `StopDocumentUpload` client component — shows existing docs list, inline upload form with doc type dropdown and file input, success/error feedback
- Added `documents` include to `getMyActiveDispatch` stops query
- Updated `CarrierStopShape` interface to include `documents?: Array<...>`
- Integrated `StopDocumentUpload` into every stop in `DispatchDetail` (route-detail-readonly.tsx)
- `DispatchHistoryList` also renders `StopDocumentUpload` per stop in the detail drill-down view

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files confirmed to exist, all 3 commits verified, zero TypeScript errors in application code (3 pre-existing e2e Playwright spec errors in `e2e/carrier/` remain unchanged and are unrelated to this task).
