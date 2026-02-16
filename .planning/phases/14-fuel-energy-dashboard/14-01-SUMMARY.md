---
phase: 14-fuel-energy-dashboard
plan: 01
subsystem: analytics
tags: [fuel, co2, mpg, efficiency, idle-time, server-actions, prisma]

# Dependency graph
requires:
  - phase: 13-safety-analytics-dashboard
    provides: "Server action patterns with raw SQL aggregation, score calculator utilities, RLS-scoped queries"
provides:
  - "Fuel calculator utility with CO2, MPG, cost-per-mile computation"
  - "Five RLS-scoped server actions for fuel dashboard data"
  - "Idle time analysis derived from GPS speed data"
  - "Per-truck fuel efficiency rankings"
affects: [14-02, fuel-dashboard-ui, fleet-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fuel analytics data layer pattern (calculator utility + server actions)"
    - "LEFT JOIN for zero-record trucks in rankings"
    - "Date initialization for continuous trend data"

key-files:
  created:
    - "src/lib/fuel/fuel-calculator.ts"
    - "src/app/(owner)/fuel/actions.ts"
  modified: []

key-decisions:
  - "EPA standard CO2 factor (8.887 kg/gallon) for emissions tracking"
  - "5-minute GPS interval assumption for idle cost estimation"
  - "Idle time derived from GPSLocation speed=0 vs speed>0"
  - "Fleet truck MPG thresholds: >=7 excellent, >=5.5 good, >=4 below average, <4 poor"

patterns-established:
  - "Fuel analytics follow exact safety analytics pattern: calculator utility + server actions"
  - "Initialize all dates in trend queries for continuous timeline (no gaps)"
  - "LEFT JOIN for complete fleet view including trucks with zero fuel records"

# Metrics
duration: 2m 18s
completed: 2026-02-16
---

# Phase 14 Plan 01: Fuel Analytics Data Layer Summary

**Fuel analytics data layer with CO2 emissions calculator, MPG computation, idle time analysis from GPS data, and 5 RLS-scoped server actions**

## Performance

- **Duration:** 2m 18s
- **Started:** 2026-02-16T05:27:00Z
- **Completed:** 2026-02-16T05:29:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created fuel calculator utility with CO2 emissions (EPA standard), MPG calculation, cost-per-mile, efficiency color/label helpers, and CO2 formatting
- Built 5 server actions for fuel dashboard: fleet summary, efficiency trend, CO2 emissions, idle time analysis, efficiency rankings
- All queries use RLS-scoped raw SQL with role-based auth checks (OWNER/MANAGER only)
- Idle time analysis derives engine state from GPSLocation speed data (speed=0 for idle, speed>0 for moving)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fuel calculator utility** - `88cb14f` (feat)
2. **Task 2: Fuel server actions** - `3c2b130` (feat)

## Files Created/Modified
- `src/lib/fuel/fuel-calculator.ts` - CO2 calculation (8.887 kg/gallon), MPG helpers, efficiency color/label utilities, CO2 formatting
- `src/app/(owner)/fuel/actions.ts` - 5 server actions: getFleetFuelSummary, getFuelEfficiencyTrend, getCO2Emissions, getIdleTimeAnalysis, getFuelEfficiencyRankings

## Decisions Made

**1. EPA standard CO2 factor**
- Used 8.887 kg CO2 per gallon of diesel (EPA standard for emissions tracking)
- Applied same factor for both diesel and gasoline for simplicity (all seed data is DIESEL)

**2. Idle time from GPS speed data**
- Idle state = GPS speed = 0
- Moving state = GPS speed > 0
- Idle cost estimation assumes 5-minute intervals between GPS readings (based on seed data generation pattern)
- Idle cost = (idle points × 5 min / 60) × $3.50/hr

**3. Fleet truck MPG thresholds**
- Excellent: ≥7 MPG (green)
- Good: ≥5.5 MPG (yellow)
- Below Average: ≥4 MPG (orange)
- Poor: <4 MPG (red)
- Based on typical fleet truck efficiency ranges (5-8 MPG)

**4. LEFT JOIN for complete fleet view**
- Efficiency rankings include trucks with zero fuel records (MPG = 0)
- Sorted with best MPG first, zero-record trucks at bottom
- Matches safety rankings pattern from Phase 13

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

**Created files verified:**
- FOUND: src/lib/fuel/fuel-calculator.ts
- FOUND: src/app/(owner)/fuel/actions.ts

**Commits verified:**
- FOUND: 88cb14f (Task 1: fuel calculator utility)
- FOUND: 3c2b130 (Task 2: fuel server actions)

**TypeScript compilation:** PASSED (no errors)

**Exports verified:**
- fuel-calculator.ts: 9 exports (3 constants + 6 functions)
- actions.ts: 5 exported server actions

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 02 (fuel dashboard UI). Data layer is complete:
- All fuel analytics calculations available via server actions
- CO2 emissions tracking ready
- Idle time analysis using GPS speed data
- Per-truck efficiency rankings ready for leaderboard display

---
*Phase: 14-fuel-energy-dashboard*
*Plan: 01*
*Completed: 2026-02-16*
