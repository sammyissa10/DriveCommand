---
phase: quick-142
plan: 01
subsystem: mobile-owner-portal
tags: [mobile, owner, profit-predictor, fuel-log, api, react-native]
dependency_graph:
  requires:
    - apps/web/src/app/api/mobile/owner/compliance/route.ts (auth pattern)
    - apps/web/src/app/(owner)/actions/profit-predictor.ts (prediction logic)
    - apps/web/src/app/(owner)/actions/lane-analytics.ts (lane query logic)
    - apps/web/src/app/(owner)/actions/route-analytics.ts (fleet avg logic)
    - apps/mobile/app/(owner)/more/compliance.tsx (screen pattern)
  provides:
    - POST /api/mobile/owner/profit-predictor
    - GET /api/mobile/owner/fuel
    - POST /api/mobile/owner/fuel
    - Profit Predictor mobile screen
    - Fuel Log mobile screen
  affects:
    - packages/api-client/src/owner.ts (new types + methods)
    - packages/api-client/src/index.ts (new exports)
    - apps/mobile/app/(owner)/more/index.tsx (new menu entries)
tech_stack:
  added: []
  patterns:
    - mobile-bearer-token-auth via validateMobileToken + bypass_rls transaction
    - useMutation for prediction form submit
    - useQuery + FlashList + pull-to-refresh for fuel list
    - React Native Modal with slide-from-bottom for AddFuelModal
    - Decimal arithmetic (Prisma.Decimal) for all money calculations
key_files:
  created:
    - apps/web/src/app/api/mobile/owner/profit-predictor/route.ts
    - apps/web/src/app/api/mobile/owner/fuel/route.ts
    - apps/mobile/app/(owner)/more/profit-predictor.tsx
    - apps/mobile/app/(owner)/more/fuel.tsx
    - apps/mobile/components/skeletons/FuelRowSkeleton.tsx
  modified:
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
    - apps/mobile/app/(owner)/more/index.tsx
decisions:
  - Replicated lane analytics and fleet avg cost-per-mile queries directly in the profit-predictor route (inline) rather than calling server actions, because server actions use cookie-based requireRole which is incompatible with mobile Bearer token auth
  - Added Fuel Log to FLEET section and Profit Predictor to BUSINESS section in More menu to match logical grouping of existing items
  - Used React Native Modal (slide-from-bottom) for fuel entry FAB bottom sheet, consistent with the approach used in other mobile screens
metrics:
  duration: ~40 minutes
  completed: "2026-03-31"
  tasks_completed: 2
  files_created: 5
  files_modified: 3
---

# Quick Task 142: Mobile Owner Portal — Profit Predictor + Fuel Log

**One-liner:** Profit Predictor with lane-matched or fleet-avg cost-per-mile prediction and Fuel Log with FAB entry form added to mobile owner portal More menu.

## What Was Built

### Task 1: API Endpoints + API Client Types

**POST /api/mobile/owner/profit-predictor**
- Authenticates via `validateMobileToken`, enforces OWNER role
- Replicates `predictLoadProfitability` logic from the web server action, adapted for mobile Bearer token auth (no cookie-based `requireRole`)
- Lane analytics query: last 365 days of COMPLETED routes, groups by origin-destination pair
- Fleet avg fallback: last 90 days of routes with odometer data
- All money arithmetic uses `Prisma.Decimal` (no JS number math for money)
- Returns `PredictionResult`: predictedExpenses, predictedProfit, predictedMarginPercent, costPerMileUsed, dataSource, laneRouteCount, recommendation (accept/caution/reject)

**GET /api/mobile/owner/fuel**
- Returns 50 most recent `FuelRecord` rows for the tenant, ordered by timestamp DESC
- Joins with Truck to include make/model/licensePlate

**POST /api/mobile/owner/fuel**
- Creates a `FuelRecord` for the tenant
- Validates `truckId` belongs to tenant (tenant-scoped lookup before create)
- Computes `totalCost = quantity * unitCost` using Decimal arithmetic
- Defaults `fuelType` to DIESEL, `timestamp` to now

**API Client (packages/api-client)**
- New types: `PredictProfitPayload`, `PredictProfitResult`, `FuelEntry`, `CreateFuelEntryPayload`
- New methods: `ownerApi.predictProfit`, `ownerApi.getFuelLog`, `ownerApi.createFuelEntry`
- All types exported from `packages/api-client/src/index.ts`

### Task 2: Mobile Screens

**Profit Predictor Screen** (`apps/mobile/app/(owner)/more/profit-predictor.tsx`)
- Form: Origin, Destination, Distance (numeric), Offered Rate (numeric)
- "Predict" button calls `ownerApi.predictProfit` via `useMutation`, disabled when form invalid or loading
- Results: recommendation banner (accept=green, caution=amber, reject=red) with icon, 2x2 stat grid (Offered Rate, Predicted Expenses, Predicted Profit, Margin %), data source note explaining cost-per-mile origin
- Error state shown below form on mutation failure

**Fuel Log Screen** (`apps/mobile/app/(owner)/more/fuel.tsx`)
- FlashList of fuel entries with pull-to-refresh (`ownerApi.getFuelLog`)
- FuelRow: date, truck name/plate on left; gallons + total cost + location on right
- Loading state: 3x FuelRowSkeleton
- Error state with Retry button
- Empty state: Droplets icon + explanatory text
- FAB (sky-500, bottom-right, 56x56 rounded-full): opens `AddFuelModal`
- `AddFuelModal`: truck picker (horizontal chip list), Gallons/Cost per Gallon/Odometer/Location fields, Date field, Save button calls `ownerApi.createFuelEntry`, on success invalidates `['owner-fuel-log']` query

**FuelRowSkeleton** (`apps/mobile/components/skeletons/FuelRowSkeleton.tsx`)
- Follows existing skeleton pattern; matches FuelRow shape

**More Menu** (`apps/mobile/app/(owner)/more/index.tsx`)
- FLEET section: added "Fuel Log" (Droplets icon, orange)
- BUSINESS section: added "Profit Predictor" (TrendingUp icon, green)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

The pre-existing `estimatedItemSize` TypeScript error on FlashList (TS2322) affects 15+ screens across the codebase including the reference `compliance.tsx` screen. My new `fuel.tsx` screen follows the identical pattern and has the same pre-existing error. This is not introduced by this task.

## Self-Check

### Files Created
- `apps/web/src/app/api/mobile/owner/profit-predictor/route.ts` — FOUND
- `apps/web/src/app/api/mobile/owner/fuel/route.ts` — FOUND
- `apps/mobile/app/(owner)/more/profit-predictor.tsx` — FOUND
- `apps/mobile/app/(owner)/more/fuel.tsx` — FOUND
- `apps/mobile/components/skeletons/FuelRowSkeleton.tsx` — FOUND

### Commits
- `6a77c09` feat(quick-142): add profit predictor and fuel mobile API endpoints + api-client types
- `be5a30f` feat(quick-142): add Profit Predictor and Fuel Log mobile screens + More menu entries

## Self-Check: PASSED
