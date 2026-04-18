---
phase: quick-247
plan: 01
subsystem: live-map
tags: [bug-fix, gps, carrier-trucks, history-endpoint]
dependency_graph:
  requires: []
  provides: [live-map-history-carrier-trucks]
  affects: [live-map history tab]
tech_stack:
  added: []
  patterns: [dual-table-ownership-check, conditional-fk-query]
key_files:
  modified:
    - apps/web/src/app/api/v1/carrier/live-map/history/route.ts
decisions:
  - "Try Truck table first, fall back to CarrierTruck — preserves backward compat without schema changes"
metrics:
  duration: "5 minutes"
  completed: "2026-04-17"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 247: Fix Live Map History Tab for Carrier Trucks

## One-liner

History endpoint now handles both Truck and CarrierTruck IDs by trying legacy table first then falling back, and queries the correct FK (`truckId` vs `carrierTruckId`) accordingly.

## What Was Done

### Task 1: Fix history endpoint to handle both Truck and CarrierTruck IDs

**Commit:** b9882f7

The history endpoint at `GET /api/v1/carrier/live-map/history` had two bugs that caused it to return 404 for any carrier truck selected in the History tab dropdown:

**Bug 1 — Ownership check only queried Truck table:**
When a carrier truck ID was passed, `db.truck.findFirst({ where: { id: truckId } })` returned null and the endpoint short-circuited with 404 before ever querying GPS data.

**Fix:** After the Truck lookup returns null, fall back to `db.carrierTruck.findFirst({ where: { id: truckId, orgId } })`. Only return 404 if neither table matches. Set `isCarrierTruck = true` when the fallback succeeds.

**Bug 2 — GPS query used wrong FK for carrier trucks:**
Carrier truck GPS pings are stored with `carrierTruckId` on `GPSLocation`, not `truckId`. The endpoint was always querying `{ truckId }` which matched zero rows for carrier trucks.

**Fix:** Use spread to select the correct FK based on `isCarrierTruck`:
```typescript
...(isCarrierTruck ? { carrierTruckId: truckId } : { truckId })
```

Everything else (Decimal conversion, response shape, history-tab.tsx) was already correct and unchanged.

## Verification

- `npx tsc --noEmit` passes (only 3 pre-existing Playwright test errors unrelated to this change)
- Legacy truck path unchanged: still queries `db.truck` then `{ truckId }` FK
- Carrier truck path: queries `db.carrierTruck` then `{ carrierTruckId }` FK
- Speed values were already stored correctly by the gps-ping route — no changes needed there

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/app/api/v1/carrier/live-map/history/route.ts` — exists, modified
- Commit b9882f7 — exists
