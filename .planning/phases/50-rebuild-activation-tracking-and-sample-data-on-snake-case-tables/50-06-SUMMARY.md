---
phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables
plan: "06"
subsystem: ui
tags: [sample-data, carrier, onboarding, prisma, nextjs, tailwind]

# Dependency graph
requires:
  - phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables
    provides: "carrier snake_case tables with isSample field, SamplePill component, SampleDataBanner component"

provides:
  - SamplePill badge in CarrierTruckList Unit # cell for isSample=true trucks
  - SamplePill badge in CarrierDriverList Driver cell for isSample=true drivers
  - SamplePill badge in LoadList Load # cell for isSample=true loads
  - SamplePill badge in ClientList Name cell for isSample=true clients
  - dashboard hasSampleRecords queries carrier tables instead of PascalCase models
  - KPI route excludes sample records from all counts via isSample:false filter

affects: [carrier-dashboard, carrier-truck-list, carrier-driver-list, carrier-load-list, carrier-client-list]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isSample field threaded through page mapping -> component interface -> conditional render"
    - "KPI routes filter isSample:false to ensure accurate business metrics"
    - "hasSampleRecords queries carrier snake_case tables (orgId FK) not PascalCase (tenantId FK)"

key-files:
  created: []
  modified:
    - apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
    - apps/web/src/components/carrier/fleet/CarrierDriverList.tsx
    - apps/web/src/components/carrier/loads/LoadList.tsx
    - apps/web/src/components/carrier/clients/ClientList.tsx
    - apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx
    - apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx
    - apps/web/src/app/(owner)/carrier/clients/page.tsx
    - apps/web/src/app/(owner)/carrier/dashboard/page.tsx
    - apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts

key-decisions:
  - "loads API route (route.ts) required no changes — listLoads spreads ...load so isSample is already in response; only LoadList interface needed updating"
  - "carrier list pages use explicit mapping objects, so isSample: t.isSample must be added to each map call to flow through to the component"
  - "hasSampleRecords uses orgId (not tenantId) as FK name for carrier tables — consistent with carrier schema design"
  - "Phase 49 PascalCase SamplePill/Banner placements left untouched (Option Z)"

patterns-established:
  - "SamplePill render pattern: import at top, add isSample to interface, wrap link in flex div, add {x.isSample && <SamplePill />} after link"

# Metrics
duration: 3min
completed: 2026-05-03
---

# Phase 50 Plan 06: Carrier List SamplePill + Dashboard Fix Summary

**SAMPLE pill badges integrated into all four carrier list components and dashboard hasSampleRecords fixed to query carrier snake_case tables with isSample:false KPI exclusion**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-03T00:06:25Z
- **Completed:** 2026-05-03T00:09:25Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- SamplePill badge renders on sample rows in all four carrier list components (trucks, drivers, loads, clients)
- isSample field threaded from Prisma query through page mapping objects to component interfaces to JSX
- Dashboard hasSampleRecords block fully migrated from PascalCase models (Truck/User/Load/Customer) to carrier snake_case models (carrierTruck/carrierDriver/carrierLoad/carrierClient) with correct orgId FK
- KPI route now filters `isSample: false` on all three carrierLoad queries so counts/revenue reflect real production data only

## Task Commits

1. **Task 1: Add SamplePill to four carrier list components + pass isSample from parent pages** - `8fb0586` (feat)
2. **Task 2: Fix dashboard hasSampleRecords to query carrier tables + isSample:false on KPI route** - `cb25e97` (feat)

## Files Created/Modified

- `apps/web/src/components/carrier/fleet/CarrierTruckList.tsx` - Added isSample to interface, import SamplePill, render in Unit # cell
- `apps/web/src/components/carrier/fleet/CarrierDriverList.tsx` - Added isSample to interface, import SamplePill, render in Driver cell
- `apps/web/src/components/carrier/loads/LoadList.tsx` - Added isSample to interface, import SamplePill, render in Load # cell
- `apps/web/src/components/carrier/clients/ClientList.tsx` - Added isSample to interface, import SamplePill, render in Name cell
- `apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx` - Pass isSample: t.isSample in mapping to CarrierTruckList
- `apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx` - Pass isSample: d.isSample in mapping to CarrierDriverList
- `apps/web/src/app/(owner)/carrier/clients/page.tsx` - Pass isSample: c.isSample in mapping to ClientList
- `apps/web/src/app/(owner)/carrier/dashboard/page.tsx` - hasSampleRecords now queries carrierTruck/carrierDriver/carrierLoad/carrierClient
- `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts` - isSample: false on all three carrierLoad queries

## Decisions Made

- The loads API route (`apps/web/src/app/api/v1/carrier/loads/route.ts`) did not need modification. The `listLoads` library function uses `findMany` with `...load` spread in the return, so `isSample` was already included in the API response. Only the `LoadList` interface needed `isSample: boolean` added.
- The three parent pages (trucks, drivers, clients) use explicit mapping objects that omit `isSample`, so `isSample: t.isSample` had to be added to each map call to flow the field to the component.
- The carrier dashboard `hasSampleRecords` block was querying `tx.truck` / `tx.user` / `tx.load` / `tx.customer` (PascalCase models with `tenantId` FK). These were replaced with `tx.carrierTruck` / `tx.carrierDriver` / `tx.carrierLoad` / `tx.carrierClient` (snake_case models with `orgId` FK).
- Phase 49 PascalCase SamplePill and SampleDataBanner placements left untouched (Option Z) as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 50 is now complete. All six plans executed:
- Plan 01: Snake_case schema + migrations
- Plan 02: Sample data seeder
- Plan 03: Activation tracking API
- Plan 04: Activation tracking UI
- Plan 05: Phase 49 PascalCase SamplePill/Banner (Option Z)
- Plan 06: Carrier list SamplePill badges + dashboard fix (this plan)

The carrier onboarding flow is fully functional: sample data seeds into carrier tables, SAMPLE pills appear on sample rows, the dashboard banner shows when sample data exists, and KPIs report only real production data.

---
*Phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables*
*Completed: 2026-05-03*
