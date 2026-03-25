---
phase: 35-owner-core-screens
plan: 01
subsystem: ui, api
tags: [react-native, tanstack-query, prisma, nativewind, expo-router, fleet-dashboard]

# Dependency graph
requires:
  - phase: 30-mobile-auth-navigation
    provides: owner navigation shell, AuthContext, ScreenWrapper, Badge UI components
  - phase: 32-hos-incidents
    provides: DriverHOSEntry model, HOSDutyStatus enum for on-duty driver count
  - phase: 31-driver-core-screens
    provides: TanStack Query infrastructure, driverApi pattern for api-client

provides:
  - Owner dashboard REST endpoint with KPI aggregates
  - KPICard reusable component for metric display
  - DriverStatusChip reusable component for fleet status grid
  - Owner dashboard screen with 2x2 KPI grid, active loads list, driver status grid
  - ownerApi.getDashboard() method in api-client
  - OwnerDashboardData TypeScript type exported from api-client

affects:
  - 35-02 (owner loads screen — reuses OwnerDashboardData context)
  - 35-03 (owner drivers screen — reuses DriverStatusChip pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TanStack Query with 60s refetchInterval for owner polling (not manual only)"
    - "ownerApi namespace in api-client mirrors driverApi pattern"
    - "KPI aggregation via Prisma $transaction with bypass_rls"

key-files:
  created:
    - apps/web/src/app/api/mobile/owner/dashboard/route.ts
    - apps/mobile/components/owner/KPICard.tsx
    - apps/mobile/components/owner/DriverStatusChip.tsx
  modified:
    - apps/mobile/app/(owner)/index.tsx
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts

key-decisions:
  - "openAlertsCount = expiring documents (within 30 days) + trucks in maintenance, not a separate alerts model"
  - "driversOnDutyCount uses open HOS entries (endTime: null) with DRIVING or ON_DUTY status started today"
  - "revenueThisMonth filters by updatedAt on DELIVERED/INVOICED loads (proxy for completion date)"
  - "DriverStatusChip shows load number if active, otherwise HOS status label"

patterns-established:
  - "KPICard: reusable metric card for any numeric KPI with icon, trend, label"
  - "DriverStatusChip: compact status indicator chip for fleet-wide driver grid"

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 35 Plan 01: Owner Dashboard Summary

**Owner dashboard with KPI aggregation endpoint (active loads, on-duty drivers, MTD revenue, open alerts), KPICard + DriverStatusChip components, and full dashboard screen with 60s auto-refresh**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-24T02:39:29Z
- **Completed:** 2026-03-24T02:42:52Z
- **Tasks:** 5
- **Files modified:** 6

## Accomplishments
- REST endpoint aggregates 4 KPIs + top-5 active loads + full driver status grid in single transaction
- KPICard component with icon, trend direction, and value display
- DriverStatusChip with HOS-color dot (green/blue/grey), driver name, and load number or status
- Owner dashboard screen wired to TanStack Query with 60s polling and pull-to-refresh
- ownerApi.getDashboard() + OwnerDashboardData type added to api-client package

## Task Commits

1. **Task 1: REST endpoint GET /api/mobile/owner/dashboard** - `a44e5e8` (feat)
2. **Task 2: KPICard component** - `637e1ee` (feat)
3. **Task 3: DriverStatusChip component** - `1ae3c0d` (feat)
4. **Task 4: Owner dashboard screen** - `bf2ac3a` (feat)
5. **Task 5: api-client ownerApi.getDashboard** - `d39433e` (feat)

## Files Created/Modified
- `apps/web/src/app/api/mobile/owner/dashboard/route.ts` - Dashboard REST endpoint with KPI aggregates, active loads, driver statuses
- `apps/mobile/components/owner/KPICard.tsx` - Reusable KPI metric card with icon, value, label, trend
- `apps/mobile/components/owner/DriverStatusChip.tsx` - Compact driver status chip with HOS dot indicator
- `apps/mobile/app/(owner)/index.tsx` - Owner dashboard screen with 2x2 KPI grid and sections
- `packages/api-client/src/owner.ts` - Added OwnerDashboardData type + getDashboard method
- `packages/api-client/src/index.ts` - Export OwnerDashboardData from index

## Decisions Made
- openAlertsCount computed as sum of expiring documents (within 30 days) + trucks flagged inMaintenance — uses existing Document and Truck models without a separate alerts table
- driversOnDutyCount queries open HOS entries (endTime null) started today with DRIVING or ON_DUTY status
- revenueThisMonth uses updatedAt on DELIVERED/INVOICED loads as proxy for completion month (no explicit completedAt field on Load)
- DriverStatusChip shows active load number if driver has one, otherwise shows HOS status label

## Deviations from Plan

None - plan executed exactly as written. The owner.ts file already existed from quick-104 (fleet map work) — getDashboard was added to it rather than creating a new file, which matches the plan's intent.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Owner dashboard complete and ready for verification
- KPICard and DriverStatusChip components available for reuse in 35-03 (drivers screen)
- ownerApi namespace established for 35-02 (loads) and 35-03 (drivers) additions

## Self-Check: PASSED

All 6 files verified present. All 5 task commits verified in git log.

---
*Phase: 35-owner-core-screens*
*Completed: 2026-03-24*
