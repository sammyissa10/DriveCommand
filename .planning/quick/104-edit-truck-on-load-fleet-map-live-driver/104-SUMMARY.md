---
phase: quick-104
plan: "01"
subsystem: loads-web, mobile-owner
tags: [loads, truck-reassignment, mobile, maps, gps, fleet]
dependency_graph:
  requires: [prisma GPSLocation model, react-native-maps installed, mobile auth]
  provides: [reassignTruck server action, ChangeTruckModal component, fleet-positions API, live owner map]
  affects: [web load detail page, mobile owner map tab, api-client package]
tech_stack:
  added: []
  patterns: [useActionState modal pattern, DISTINCT ON raw SQL, react-query polling with refetchInterval]
key_files:
  created:
    - apps/web/src/components/loads/change-truck-modal.tsx
    - apps/web/src/app/api/mobile/owner/fleet-positions/route.ts
  modified:
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/(owner)/loads/[id]/page.tsx
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
    - apps/mobile/app/(owner)/map.tsx
decisions:
  - Used DISTINCT ON truckId raw SQL (same pattern as web live-map actions) for latest GPS per truck
  - Change Truck modal only appears on DISPATCHED/PICKED_UP/IN_TRANSIT; PENDING uses dispatch modal; DELIVERED+ is locked
  - Mobile map uses plain MapView (not ClusteredMapView) since fleet size is small
  - Truck trucks list for reassignment fetched separately from dispatch drivers/routes to keep PENDING path unchanged
metrics:
  duration: "~15 minutes"
  completed: "2026-03-24"
  tasks_completed: 2
  files_modified: 7
---

# Quick Task 104: Edit Truck on Load + Fleet Map Live Driver Summary

**One-liner:** Change Truck modal on dispatched web loads via reassignTruck server action, plus live fleet map on mobile owner portal using react-native-maps with 30-second GPS polling.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Web — Change Truck modal and server action | b92fda5 | actions/loads.ts, change-truck-modal.tsx, loads/[id]/page.tsx |
| 2 | Mobile — Fleet positions API + live map | beaf249 | fleet-positions/route.ts, owner.ts, index.ts, map.tsx |

## What Was Built

### Task 1 — Change Truck Modal (Web)

Added `reassignTruck` server action to `apps/web/src/app/(owner)/actions/loads.ts`:
- Requires OWNER or MANAGER role
- Validates load status is DISPATCHED, PICKED_UP, or IN_TRANSIT before updating
- Updates `truckId` and `updatedById`, revalidates `/loads` and `/loads/[id]`

Created `apps/web/src/components/loads/change-truck-modal.tsx`:
- Client component following the exact `dispatch-modal.tsx` pattern (backdrop, Escape key, useActionState)
- Small outline "Change Truck" button in the Assignment card's truck section
- Single truck dropdown pre-selected to current truck
- Auto-closes on success

Updated `apps/web/src/app/(owner)/loads/[id]/page.tsx`:
- Fetches truck list for reassignable statuses (DISPATCHED/PICKED_UP/IN_TRANSIT) separately from PENDING dispatch flow
- Renders `ChangeTruckModal` below the truck plate when `canReassignTruck` is true

### Task 2 — Fleet Positions API + Mobile Map

Created `apps/web/src/app/api/mobile/owner/fleet-positions/route.ts`:
- GET endpoint authenticated via `validateMobileToken`, OWNER role required
- DISTINCT ON raw SQL query returns latest GPS ping per truck with truck info, driver name, and active load number
- Joins Load (status IN DISPATCHED/PICKED_UP/IN_TRANSIT) and User for driver name

Added to `packages/api-client/src/owner.ts`:
- `FleetPosition` interface matching the API response shape
- `getFleetPositions(token)` added to `ownerApi`

Added `FleetPosition` to `packages/api-client/src/index.ts` exports.

Replaced `apps/mobile/app/(owner)/map.tsx` stub with full implementation:
- SafeAreaView wrapper (no scroll, flex-1)
- `useQuery` with `queryKey: ['fleet-positions']`, `refetchInterval: 30_000` for 30-second polling
- `MapView` with `PROVIDER_GOOGLE`, fits bounds to markers when data present, falls back to US overview
- `Marker` + `Callout` per truck showing: plate (bold), make/model, driver name, load number, relative timestamp
- Loading spinner (ActivityIndicator) during initial fetch
- Empty state overlay "No active vehicles" when array is empty

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files created/modified verified:
- [x] apps/web/src/components/loads/change-truck-modal.tsx — FOUND
- [x] apps/web/src/app/api/mobile/owner/fleet-positions/route.ts — FOUND
- [x] apps/web/src/app/(owner)/actions/loads.ts — modified
- [x] apps/web/src/app/(owner)/loads/[id]/page.tsx — modified
- [x] packages/api-client/src/owner.ts — modified
- [x] packages/api-client/src/index.ts — modified
- [x] apps/mobile/app/(owner)/map.tsx — modified

### Commits verified:
- [x] b92fda5 — feat(quick-104): add Change Truck modal on web load detail
- [x] beaf249 — feat(quick-104): fleet positions API endpoint and live owner map screen

### TypeScript:
- [x] apps/web: `npx tsc --noEmit` — no errors
- [x] apps/mobile: `npx tsc --noEmit` — no new errors (two pre-existing issues in ExternalLink.tsx and SyncStatusBar.tsx unrelated to this task)

## Self-Check: PASSED
