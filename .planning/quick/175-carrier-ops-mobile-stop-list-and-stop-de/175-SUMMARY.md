---
phase: quick-175
plan: 01
subsystem: mobile-carrier-ops
tags:
  - mobile
  - carrier-ops
  - driver-portal
  - stop-management
dependency_graph:
  requires:
    - quick-174 (carrier home screen + auth flow)
    - packages/api-client carrier-driver.ts
  provides:
    - dispatch detail screen with stop list
    - stop detail screen with status actions
    - StopListItem component
    - StopStatusButtons component
  affects:
    - apps/mobile/app/(driver)/carrier/dispatch/[id]/
    - apps/mobile/components/carrier/
    - packages/api-client types
    - apps/web API route for dispatch detail
    - apps/web prisma schema CarrierStop
tech_stack:
  added:
    - expo-haptics (notificationAsync on stop status changes)
    - expo-linking (tel: URL scheme for phone calls)
  patterns:
    - TanStack Query shared cache (dispatch detail re-used in stop detail via same queryKey)
    - Derived doc status from documents array (bolUploaded/podUploaded)
    - StopStatusButtons mutation with 422 error surfacing via Alert.alert
key_files:
  created:
    - apps/mobile/components/carrier/StopListItem.tsx
    - apps/mobile/components/carrier/StopStatusButtons.tsx
    - apps/mobile/app/(driver)/carrier/dispatch/[id]/index.tsx
    - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx
    - apps/web/prisma/migrations/20260405000001_carrier_stop_doc_required_flags/migration.sql
  modified:
    - packages/api-client/src/carrier-driver.ts (CarrierDispatchDetailStop type extended)
    - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts (bolRequired/podRequired/bolUploaded/podUploaded in response)
    - apps/web/prisma/schema.prisma (bolRequired/podRequired added to CarrierStop model)
    - apps/web/src/generated/prisma/* (regenerated client)
decisions:
  - "Use shared TanStack Query cache: stop detail reads from ['carrier-dispatch', id] — avoids extra API call and keeps data consistent"
  - "Add bolRequired/podRequired to CarrierStop schema — plan required doc enforcement but fields were missing from DB model. Added via migration with DEFAULT TRUE."
  - "Derive bolUploaded/podUploaded from documents array in API route — no separate tracking field needed"
metrics:
  duration: "7 minutes"
  completed: "2026-04-05"
  tasks: 2
  files: 9
---

# Phase quick-175 Plan 01: Carrier Ops Mobile Stop List and Stop Detail Summary

Stop list and detail screens for the driver carrier ops portal — drivers can view dispatch stops, navigate to facilities, mark arrived/completed with BOL/POD enforcement, open maps, call contacts, and view uploaded documents.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | StopListItem + dispatch detail screen | 66fa21b | StopListItem.tsx, dispatch/[id]/index.tsx, carrier-driver.ts, dispatches/[id]/route.ts |
| 2 | StopStatusButtons + stop detail screen | ab7de1a | StopStatusButtons.tsx, stop/[stopId].tsx, schema.prisma, migration.sql, prisma generated |

## What Was Built

**StopListItem** (`components/carrier/StopListItem.tsx`): Reusable row showing sequence badge, stop type icon (Package/MapPin/Fuel), facility name + city/state, appointment time, status badge with semantic colors (pending=gray, arrived=blue, completed=green, skipped=red), and doc indicator (red dot if BOL/POD missing, green check if all uploaded). Active stop gets brand left border + subtle background tint.

**Dispatch detail screen** (`dispatch/[id]/index.tsx`): Header with dispatch number + status badge, truck unit + scheduled departure, progress bar (X of Y stops completed), FlashList of stops sorted by sequenceOrder, active stop detection, pull-to-refresh via RefreshControl, skeleton loading state. Tap navigates to stop detail.

**StopStatusButtons** (`components/carrier/StopStatusButtons.tsx`): Conditional button rendering — Arrived button shown for `pending` status, Complete button shown for `arrived` status. Complete button disabled with warning text when BOL or POD required but not uploaded. Both mutations invalidate dispatch query on success, fire `Haptics.notificationAsync`. 422 errors surface API message via `Alert.alert`.

**Stop detail screen** (`dispatch/[id]/stop/[stopId].tsx`): Full facility info (name, address, Open in Maps via `openNavigation()`), contact section with tappable phone (`tel:` deep link), details section (appointment window, BOL/POD/seal numbers, special instructions), status buttons, documents list with compact rows, Upload Document and Log Expense placeholder buttons.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Fields] Added bolRequired/podRequired to CarrierStop schema**
- **Found during:** Task 2
- **Issue:** Plan required `stop.bolRequired` and `stop.podRequired` for Complete button disable logic and doc indicator, but `CarrierStop` DB model had no such fields (they existed on `RouteTemplateStop` only)
- **Fix:** Added `bolRequired Boolean @default(true)` and `podRequired Boolean @default(true)` to `CarrierStop` model in schema.prisma, created migration `20260405000001_carrier_stop_doc_required_flags`, regenerated Prisma client
- **Files modified:** `apps/web/prisma/schema.prisma`, `apps/web/prisma/migrations/20260405000001_carrier_stop_doc_required_flags/migration.sql`, `apps/web/src/generated/prisma/*`
- **Commit:** ab7de1a

**2. [Rule 2 - Missing API Response Fields] Added bolRequired/podRequired/bolUploaded/podUploaded to dispatch detail API response**
- **Found during:** Task 1
- **Issue:** API route mapped stop fields but omitted `bolRequired`/`podRequired`. `bolUploaded`/`podUploaded` were in `CarrierDispatchStop` summary type but not in `CarrierDispatchDetailStop` detail type.
- **Fix:** Extended `CarrierDispatchDetailStop` type with all 4 fields. Updated API route to include `bolRequired`/`podRequired` from DB and derive `bolUploaded`/`podUploaded` from `stop.documents` array (checks for `BOL`/`POD` document types)
- **Files modified:** `packages/api-client/src/carrier-driver.ts`, `apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts`
- **Commit:** 66fa21b

## Self-Check: PASSED

Files verified:
- FOUND: apps/mobile/components/carrier/StopListItem.tsx
- FOUND: apps/mobile/components/carrier/StopStatusButtons.tsx
- FOUND: apps/mobile/app/(driver)/carrier/dispatch/[id]/index.tsx
- FOUND: apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx

Commits verified:
- FOUND: 66fa21b (Task 1)
- FOUND: ab7de1a (Task 2)

TypeScript clean: `tsc --noEmit` passes on both `apps/mobile` and `apps/web`.
