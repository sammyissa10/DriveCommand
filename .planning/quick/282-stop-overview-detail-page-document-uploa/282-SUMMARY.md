---
phase: quick-282
plan: "01"
subsystem: carrier-ops
tags:
  - stops
  - messaging
  - dispatch
  - driver-portal
  - owner-portal
dependency_graph:
  requires:
    - FleetMessage model
    - CarrierStop model
    - /api/v1/carrier/stops/[id] (PATCH)
    - StopTimeline + StopTimelineCard
    - route-detail-readonly
  provides:
    - stop-scoped messaging (owner + driver)
    - stop overview table page
    - stop detail page
    - View Details navigation from dispatch
  affects:
    - dispatch detail page (View All Stops, message count badges)
    - driver route tab (stop messages section)
tech_stack:
  added:
    - StopDetailMessages (client component, 10s polling)
    - StopDetailTimestampEditor (inline datetime edit)
    - StopMessages (driver collapsible stop messages)
  patterns:
    - bypass_rls transaction pattern for all queries
    - after() for push + in-app notifications
    - 10s polling for message threads
key_files:
  created:
    - apps/web/prisma/migrations/20260422300001_add_stop_id_to_fleet_message/migration.sql
    - apps/web/src/app/api/v1/carrier/stops/[stopId]/messages/route.ts
    - apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
    - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
    - apps/web/src/components/carrier/stops/StopDetailMessages.tsx
    - apps/web/src/components/carrier/stops/StopDetailTimestampEditor.tsx
    - apps/web/src/components/driver/stop-messages.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/stops.ts
    - apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    - apps/web/src/components/carrier/dispatches/StopTimeline.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    - apps/web/src/components/driver/route-detail-readonly.tsx
decisions:
  - "Used referenceNumber/bolNumber as load display label since CarrierLoad has no loadNumber field"
  - "StopMessages driver component starts collapsed with unread count badge visible"
  - "arrivedAt/departedAt inline editing via StopDetailTimestampEditor uses datetime-local input"
  - "Owner stop message POST auto-resolves recipient from dispatch.primaryDriver.userId"
  - "Driver stop message POST sends to first OWNER user in tenant"
metrics:
  duration: "~35 minutes"
  completed: "2026-04-22"
  tasks_completed: 3
  files_changed: 15
---

# Quick Task 282: Stop Overview Detail Page, Document Upload, and Messaging Summary

Stop-level visibility and communication between owner/dispatcher and driver via stop-scoped messages, a stop overview table, and a comprehensive stop detail page.

## What Was Built

**Task 1: Schema migration + Stop message API endpoints + Stop overview page**

- Added `stopId` FK (UUID, nullable) to FleetMessage with SET NULL on delete + index
- Applied migration `20260422300001_add_stop_id_to_fleet_message`
- Created `GET/POST /api/v1/carrier/stops/[stopId]/messages` (OWNER/MANAGER auth, tenant isolation via dispatch.orgId check, mark-read on GET, push + in-app notifications on POST)
- Created `GET/POST /api/driver/stops/[stopId]/messages` (DRIVER auth, stop ownership via primaryDriverId check)
- Created stop overview table at `/carrier/dispatches/[id]/stops` with all stops, status/type badges, dwell calculation, doc/message counts

**Task 2: Stop detail page with info grid, documents, and messages**

- Created `/carrier/stops/[id]` page with: facility header, linked entity chips (dispatch/load/facility), full info grid (appointment, arrived/departed, dwell, BOL/POD status, commodity, pieces/weight, instructions, contact)
- Inline `arrivedAt`/`departedAt` editing via `StopDetailTimestampEditor` (datetime-local input + PATCH)
- Documents section listing all stop documents with type badges and upload via existing `DocumentUploadModal`
- `StopDetailMessages` client component (10s polling, iMessage-style bubbles, auto-scroll)
- Extended `StopUpdateInput` and `StopUpdateSchema` to accept `arrivedAt`/`departedAt`

**Task 3: View Details links + driver stop messages**

- Added `View Details` link to bottom-right of each `StopTimelineCard`
- Added `messageCount` and `docCount` count badges near facility name on stop cards
- Added `View All Stops` link to dispatch detail stop timeline header
- Message count query (groupBy stopId) added to dispatch detail page
- Created `StopMessages` driver component: collapsible, unread count badge, 10s polling when expanded, reply input
- Integrated `StopMessages` into `route-detail-readonly.tsx` after `StopDocumentUpload` on each stop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CarrierLoad has no loadNumber field**
- **Found during:** Task 2
- **Issue:** Plan referenced `load.loadNumber` but `CarrierLoad` model uses `referenceNumber` and `bolNumber`
- **Fix:** Used `load.referenceNumber ?? load.bolNumber ?? load.id.slice(0, 8)` as display label
- **Files modified:** `apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx`
- **Commit:** 431d8ad

**2. [Rule 3 - Blocking] TX_OPTIONS not imported in dispatch detail page**
- **Found during:** Task 3
- **Issue:** Message count query used `TX_OPTIONS` but only `prisma` was imported
- **Fix:** Added `TX_OPTIONS` to prisma import
- **Files modified:** `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx`
- **Commit:** 1d849a5

**3. [Rule 3 - Blocking] Previous migration (20260422200001) had drift conflict**
- **Found during:** Task 1
- **Issue:** `add_tenant_contact_email_plan` migration failed because column already existed in DB
- **Fix:** Ran `prisma migrate resolve --applied` to mark as applied before deploying new migration
- **Commit:** 45b991c

## Self-Check: PASSED

All 8 new files verified present. All 3 task commits verified in git log (45b991c, 431d8ad, 1d849a5). TypeScript compiles with zero errors.
