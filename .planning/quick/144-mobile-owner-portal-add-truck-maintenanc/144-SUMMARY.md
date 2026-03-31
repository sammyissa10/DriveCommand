---
phase: quick-144
plan: 01
subsystem: mobile-owner-portal
tags: [mobile, owner, maintenance, safety, api, react-native]
dependency_graph:
  requires:
    - apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts (pattern reference)
    - apps/web/src/app/api/mobile/owner/compliance/route.ts (pattern reference)
    - packages/api-client/src/owner.ts (extended)
    - apps/mobile/app/(owner)/more/trucks/[id].tsx (extended)
    - apps/mobile/app/(owner)/more/index.tsx (extended)
  provides:
    - GET /api/mobile/owner/trucks/{id}/maintenance
    - POST /api/mobile/owner/trucks/{id}/maintenance
    - GET /api/mobile/owner/safety
    - ownerApi.getTruckMaintenance
    - ownerApi.logMaintenanceEvent
    - ownerApi.getSafetyAlerts
    - /(owner)/more/safety screen
  affects:
    - Truck detail screen (new maintenance section)
    - More menu (new Safety entry)
tech_stack:
  added: []
  patterns:
    - bypass_rls transaction pattern (same as existing mobile owner routes)
    - useQuery + useMutation with invalidation
    - BottomSheet form pattern (matching EditTruckSheet)
    - SafeAreaView + AnimatedScreen + ScrollView + RefreshControl pattern
key_files:
  created:
    - apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts
    - apps/web/src/app/api/mobile/owner/safety/route.ts
    - apps/mobile/app/(owner)/more/safety.tsx
  modified:
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
    - apps/mobile/app/(owner)/more/trucks/[id].tsx
    - apps/mobile/app/(owner)/more/index.tsx
decisions:
  - BottomSheet snap point capped at 80% (component supports 40%/60%/80%/full only; 85% from plan was adjusted)
  - Safety route aggregates document alerts, overdue scheduled services, and recent incidents (last 30 days) in a single GET
  - Overdue service detection uses both date-based and mileage-based criteria independently
metrics:
  duration: "~7 minutes"
  completed_date: "2026-03-31"
  tasks_completed: 3
  files_changed: 7
---

# Quick Task 144: Mobile Owner Portal — Truck Maintenance + Safety Alerts

**One-liner:** GET/POST maintenance API with bypass_rls, safety aggregation across docs/services/incidents, maintenance section on truck detail with log-maintenance bottom sheet, and new safety alerts screen with severity summary cards.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | API endpoints + api-client | 13f0010 | trucks/[id]/maintenance/route.ts, safety/route.ts, packages/api-client/src/owner.ts |
| 2 | Maintenance section on truck detail | 5e272a1 | apps/mobile/app/(owner)/more/trucks/[id].tsx, packages/api-client/src/index.ts |
| 3 | Safety alerts screen + More menu entry | fd2aabb | apps/mobile/app/(owner)/more/safety.tsx, more/index.tsx |

## What Was Built

### API: Maintenance Endpoints
- `GET /api/mobile/owner/trucks/{id}/maintenance` — returns last 50 maintenance events ordered by service date desc
- `POST /api/mobile/owner/trucks/{id}/maintenance` — creates a maintenance event with full validation (serviceType, serviceDate, odometerAtService required; cost/provider/notes optional)
- Both handlers use bypass_rls transaction pattern, rate limiting, and tenant isolation

### API: Safety Alerts Endpoint
- `GET /api/mobile/owner/safety` — aggregates from 3 sources in parallel:
  1. Driver documents expiring within 30 days or already expired
  2. Truck documentMetadata (registration/insurance) expiring within 30 days
  3. Overdue scheduled services (date-based + mileage-based)
  4. Driver incidents from the last 30 days
- Returns `{ alerts: SafetyAlert[], summary: { highCount, mediumCount, lowCount, totalCount } }`
- Sorted: high severity first, then most recent within same severity

### api-client: New Types + Methods
- Types: `MaintenanceEventSummary`, `LogMaintenancePayload`, `SafetyAlert`, `SafetyAlertsResponse`
- Methods: `ownerApi.getTruckMaintenance`, `ownerApi.logMaintenanceEvent`, `ownerApi.getSafetyAlerts`
- All types exported from packages/api-client/src/index.ts

### Mobile: Truck Detail — Service History Section
- New card between Document Information and Record History
- Shows latest 5 maintenance events: service type (bold), date (right), cost + odometer on second line
- "Log" button opens `LogMaintenanceSheet` bottom sheet (80% snap point)
- Bottom sheet fields: service type, service date (YYYY-MM-DD, defaults to today), odometer (pre-filled from truck), cost ($), notes (multiline)
- On success: haptic.success() + Toast + query invalidation; on error: haptic.error() + Toast
- Empty state: "No maintenance records"

### Mobile: Safety Alerts Screen (`/(owner)/more/safety`)
- Header with back button
- Summary row: 3 cards (High/Medium/Low) with colored backgrounds and counts
- Alert list: each card has severity dot, category icon (FileText/Wrench/AlertCircle), description, affected entity, date
- Pull to refresh, loading/error/empty states
- Empty state: Shield icon + "No alerts" + "Your fleet is in good shape"

### Mobile: More Menu
- Added "Safety" entry to FLEET section (after Fuel Log)
- AlertTriangle icon with red coloring (rgba(239,68,68,0.15) bg, #ef4444 icon)
- Added `AlertTriangle` import to more/index.tsx

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BottomSheet snapPoint "85%" not valid**
- **Found during:** Task 2
- **Issue:** Plan specified `snapPoint="85%"` but the BottomSheet component only accepts `'40%' | '60%' | '80%' | 'full'`
- **Fix:** Changed to `"80%"` which gives adequate height for the log maintenance form
- **Files modified:** apps/mobile/app/(owner)/more/trucks/[id].tsx
- **Commit:** 5e272a1

**2. [Rule 3 - Blocking] New types not exported from api-client index**
- **Found during:** Task 2 TypeScript check
- **Issue:** `MaintenanceEventSummary`, `LogMaintenancePayload` (and `SafetyAlert`, `SafetyAlertsResponse`) were added to owner.ts but not re-exported from packages/api-client/src/index.ts, causing TS2305 errors in mobile
- **Fix:** Added all 4 new types to the export type line in index.ts; rebuilt the package
- **Files modified:** packages/api-client/src/index.ts
- **Commit:** 5e272a1

**3. [Rule 1 - Bug] AlertTriangle not imported in More menu**
- **Found during:** Task 3 TypeScript check
- **Issue:** Plan noted "AlertTriangle is already imported" but the import was not present in more/index.tsx
- **Fix:** Added `AlertTriangle` to the lucide-react-native import block
- **Files modified:** apps/mobile/app/(owner)/more/index.tsx
- **Commit:** fd2aabb

## Verification

- `cd apps/web && npx tsc --noEmit` — PASSED (no errors)
- `cd packages/api-client && npx tsc --noEmit` — PASSED (no errors)
- `cd apps/mobile && npx tsc --noEmit` — PASSED for all new/modified files (pre-existing FlashList and _layout errors unrelated to this task)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts | FOUND |
| apps/web/src/app/api/mobile/owner/safety/route.ts | FOUND |
| apps/mobile/app/(owner)/more/safety.tsx | FOUND |
| Commit 13f0010 | FOUND |
| Commit 5e272a1 | FOUND |
| Commit fd2aabb | FOUND |
