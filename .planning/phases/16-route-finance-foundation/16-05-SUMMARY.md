---
phase: 16-route-finance-foundation
plan: 05
subsystem: route-finance
tags: [cost-analysis, fleet-analytics, profit-margins, financial-reporting]

dependency_graph:
  requires:
    - "16-02 (expense CRUD operations and basic financial calculations)"
    - "16-03 (payment tracking and RouteFinancials interface)"
  provides:
    - "Cost-per-mile calculation with fleet comparison analytics"
    - "Profit margin alert system for low-margin routes"
    - "Fleet-wide financial benchmarking capabilities"
  affects:
    - "Route detail page (added cost-per-mile section and margin alerts)"
    - "Seed data (completed routes now include odometer readings)"

tech_stack:
  added:
    - "Decimal.js arithmetic for cost-per-mile calculations"
    - "Fleet-wide aggregation queries for benchmarking"
  patterns:
    - "Server-side analytics aggregation for fleet metrics"
    - "Conditional rendering for missing odometer data"
    - "Visual comparison indicators (trending up/down icons)"

key_files:
  created:
    - path: "src/app/(owner)/actions/route-analytics.ts"
      purpose: "Server actions for route and fleet financial analytics"
      lines: 193
    - path: "src/components/routes/route-cost-per-mile.tsx"
      purpose: "Display component for cost per mile with fleet comparison"
      lines: 115
    - path: "src/components/routes/profit-margin-alert.tsx"
      purpose: "Alert banner for low profit margin routes"
      lines: 27
  modified:
    - path: "src/lib/finance/route-calculator.ts"
      change: "Extended with calculateCostPerMile and compareToFleetAverage functions"
      additions: 101
    - path: "src/app/(owner)/routes/[id]/page.tsx"
      change: "Integrated cost-per-mile and profit margin alert components"
      additions: 17
    - path: "prisma/seed.ts"
      change: "Added odometer data to first 3 completed routes for fleet analytics"
      additions: 24

decisions:
  - "Fleet average calculated from COMPLETED routes in last 90 days (rolling window for relevance)"
  - "Used Prisma query + TypeScript iteration for fleet analytics (simpler than raw SQL aggregation)"
  - "Cost per mile returns null when odometer data missing (graceful degradation instead of errors)"
  - "Profit margin alert only renders when isLowMargin is true (conditional rendering, not hidden)"
  - "Comparison indicator uses trending icons (TrendingDown = good/green, TrendingUp = bad/red)"
  - "Fleet average requires MANAGER or OWNER role (DRIVER role cannot see fleet-wide data)"
  - "Zero-division protection for both fleet average and cost-per-mile calculations"

metrics:
  duration_seconds: 211
  tasks_completed: 2
  files_created: 3
  files_modified: 3
  commits: 2
  completed_at: "2026-02-16T23:13:43Z"
---

# Phase 16 Plan 05: Cost-Per-Mile Analysis & Profit Alerts Summary

**One-liner:** Cost-per-mile calculation with fleet benchmarking and profit margin alerts using Decimal-based analytics and conditional UI.

## What Was Built

Implemented FIN-09 (cost per mile with fleet comparison) and FIN-10 (profit margin alerts). Routes now display cost-per-mile analysis with fleet average comparison, and low-margin routes trigger visual warning banners.

### Key Features

1. **Cost-Per-Mile Calculation**
   - Calculates route cost per mile from total expenses ÷ (endOdometer - startOdometer)
   - Uses Decimal arithmetic for all calculations (no floating-point errors)
   - Gracefully handles missing odometer data (displays "N/A" with explanation)
   - Validates distance data (returns null for zero or negative miles)

2. **Fleet Average Analytics**
   - Aggregates completed routes from last 90 days with odometer data
   - Calculates average cost per mile across qualifying routes
   - Server-side action with OWNER/MANAGER role restriction
   - Shows route count used in calculation for transparency

3. **Fleet Comparison Display**
   - Visual indicators for above/below/equal to fleet average
   - Green TrendingDown icon for below average (good performance)
   - Red TrendingUp icon for above average (poor performance)
   - Gray Minus icon for routes at fleet average
   - Percentage difference displayed with comparison text

4. **Profit Margin Alerts**
   - Amber warning banner appears when margin < tenant's configured threshold
   - Shows actual margin percentage and threshold in alert message
   - Only renders when isLowMargin is true (conditional, not hidden)
   - AlertTriangle icon for visual prominence

5. **Route Detail Page Integration**
   - Fetches complete analytics via getRouteFinancialAnalytics action
   - ProfitMarginAlert banner appears above financial summary
   - Cost-Per-Mile section displays below financial summary
   - All financial data sourced from single analytics call (efficient)

## Implementation Details

### Server Actions (route-analytics.ts)

**getRouteFinancialAnalytics(routeId)**
- Fetches route with odometer data, expenses, payments, and tenant threshold
- Calculates basic financials using calculateRouteFinancials
- Calculates cost per mile using calculateCostPerMile
- Fetches fleet average using getFleetAverageCostPerMile
- Compares route to fleet average
- Returns complete analytics object
- OWNER/MANAGER/DRIVER read access

**getFleetAverageCostPerMile()**
- Queries completed routes from last 90 days with startOdometer and endOdometer
- Includes non-deleted expenses for each route
- Calculates cost per mile for each qualifying route
- Averages all cost-per-mile values using Decimal.div
- Returns null if no qualifying routes exist
- OWNER/MANAGER access only (not DRIVER)

### Calculator Functions (route-calculator.ts)

**calculateCostPerMile(totalExpenses, startOdometer, endOdometer)**
- Returns { costPerMile: null, miles: null } if odometer data missing
- Returns { costPerMile: null, miles: 0 } if miles <= 0
- Calculates costPerMile = totalExpenses.div(miles).toDecimalPlaces(2)
- Uses Decimal arithmetic throughout

**compareToFleetAverage(routeCostPerMile, fleetAverage)**
- Returns 'unknown' comparison if either value is null
- Calculates absolute difference (routeCost - fleetAvg)
- Calculates percentage difference ((routeCost - fleetAvg) / fleetAvg * 100)
- Handles zero-division for fleetAvg = 0 (returns 'unknown')
- Returns { comparison: 'above'|'below'|'equal', difference, differencePercent }

### UI Components

**RouteCostPerMile**
- Displays "N/A" with explanation when costPerMile is null
- Shows route cost per mile in large text with "$X.XX/mi" format
- Displays distance traveled below cost
- Shows fleet average with route count basis
- Renders comparison indicator with trending icons and percentage
- Handles all edge cases (no fleet data, no route data, insufficient data)

**ProfitMarginAlert**
- Returns null if isLowMargin is false (conditional rendering)
- Renders amber bg-amber-50 border-amber-200 banner
- Shows AlertTriangle icon from lucide-react
- Displays margin percentage and threshold in alert text
- Single-line design for non-intrusive visibility

### Seed Data Enhancement

Updated prisma/seed.ts to add odometer data to first 3 completed routes:
- Route 1: 45,000 to 45,380 (380 miles)
- Route 2: 52,000 to 52,290 (290 miles)
- Route 3: 61,000 to 61,450 (450 miles)

Uses bypass_rls pattern for seed script execution.

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

### Manual Verification (requires database running)

1. **Route with odometer data:**
   - Navigate to a completed route with startOdometer and endOdometer set
   - Should display cost per mile as "$X.XX/mi" with distance
   - Should show fleet average (if 3+ routes have odometer data)
   - Should show green/red comparison indicator

2. **Route without odometer data:**
   - Navigate to a completed route without odometer readings
   - Should display "Cost Per Mile: N/A"
   - Should show explanation: "Add start and end odometer readings to calculate cost per mile"

3. **Low margin route:**
   - Navigate to a route with profit margin < 10%
   - Should display amber alert banner at top of financial section
   - Alert should show actual margin percentage and threshold

4. **Healthy margin route:**
   - Navigate to a route with profit margin >= 10%
   - No alert banner should appear

5. **Fleet average display:**
   - Should show "based on X completed routes" below fleet average
   - If no completed routes with odometer data, should show "N/A — no completed routes with distance data"

### Build Verification

- TypeScript compilation: **PASSED** (no errors)
- Next.js build: **PASSED** (all routes compiled successfully)
- Seed script syntax: **VALIDATED** (execution blocked by database connection)

## Architecture Notes

### Role-Based Access

| Action | OWNER | MANAGER | DRIVER |
|--------|-------|---------|--------|
| View route cost per mile | ✅ | ✅ | ✅ |
| View fleet average | ✅ | ✅ | ❌ |

Drivers can see their own route's cost per mile but not fleet-wide benchmarks.

### Data Flow

```
Route Detail Page
  └─> getRouteFinancialAnalytics(routeId)
       ├─> calculateRouteFinancials(expenses, payments, threshold)
       ├─> calculateCostPerMile(totalExpenses, startOdometer, endOdometer)
       ├─> getFleetAverageCostPerMile()
       │    └─> Query completed routes (last 90 days, with odometer)
       │    └─> Calculate per-route cost per mile
       │    └─> Average all values
       └─> compareToFleetAverage(routeCostPerMile, fleetAverage)
```

### Graceful Degradation

System handles missing data elegantly at each level:
1. **No odometer data:** Cost per mile shows "N/A" with explanation
2. **No fleet routes:** Fleet average shows "N/A" with explanation
3. **No revenue:** Margin alert doesn't trigger (can't calculate margin from $0)
4. **Zero miles:** Cost per mile returns null (prevents division errors)
5. **Zero fleet average:** Comparison returns 'unknown' (prevents division errors)

## Requirements Completed

- [x] FIN-09: Cost per mile calculation with fleet average comparison
  - [x] Calculate cost per mile from expenses and distance
  - [x] Show fleet average from completed routes (90 days)
  - [x] Display visual comparison (above/below/equal)
  - [x] Handle missing odometer data gracefully
- [x] FIN-10: Profit margin alerts
  - [x] Display alert banner when margin < threshold
  - [x] Show margin percentage and threshold in alert
  - [x] Use tenant's configured profitMarginThreshold
  - [x] Only show alert when margin is actually low

## Self-Check: PASSED

**Files created exist:**
```
✅ FOUND: src/app/(owner)/actions/route-analytics.ts
✅ FOUND: src/components/routes/route-cost-per-mile.tsx
✅ FOUND: src/components/routes/profit-margin-alert.tsx
```

**Files modified exist:**
```
✅ FOUND: src/lib/finance/route-calculator.ts (extended)
✅ FOUND: src/app/(owner)/routes/[id]/page.tsx (integrated)
✅ FOUND: prisma/seed.ts (odometer data added)
```

**Commits exist:**
```
✅ FOUND: 34982b0 - feat(16-05): add cost-per-mile and fleet analytics functions
✅ FOUND: a4b3581 - feat(16-05): add cost-per-mile UI and profit margin alerts
```

## Next Steps

Phase 16 Plan 05 completes the Route Finance Foundation phase. All financial features (FIN-01 through FIN-10) are now implemented:
- ✅ Database schema with soft delete and optimistic locking
- ✅ Expense line-item CRUD with category management
- ✅ Payment tracking with PAID/PENDING status
- ✅ Route financial summary with profit/margin calculation
- ✅ Expense templates for common route types
- ✅ Cost-per-mile analysis with fleet benchmarking
- ✅ Profit margin alerts for optimization

Ready to proceed to Phase 17 or verify the complete finance workflow with end-to-end testing.
