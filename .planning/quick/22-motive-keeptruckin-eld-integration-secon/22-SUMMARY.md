---
phase: quick-22
plan: 01
subsystem: integrations
tags: [eld, gps, motive, keeptruckin, fleet-tracking, integrations]
dependency_graph:
  requires: [quick-14, quick-17]
  provides: [motive-gps-sync, second-eld-provider]
  affects: [integrations-settings-page, gps-location-table]
tech_stack:
  added: []
  patterns: [eld-provider-pattern, per-provider-state-record, generic-config-panel]
key_files:
  created:
    - src/lib/integrations/motive.ts
    - src/app/api/integrations/motive/sync/route.ts
  modified:
    - src/app/(owner)/settings/integrations/integrations-manager.tsx
decisions:
  - "Motive API uses /v1/vehicles endpoint with lat/lon/speed/bearing/located_at fields (differs from Samsara's lat/longitude/speedMilesPerHour/heading/time)"
  - "Per-provider EldProviderState record replaces single Samsara state — scales to any number of ELD providers without JSX duplication"
  - "ELD_PROVIDERS constant drives generic config panel rendering — adding a third ELD provider requires only adding to the array and CATALOG"
  - "KEEP_TRUCKIN enum value (not MOTIVE) used as provider key — matches existing Prisma schema from quick-14"
  - "eldSyncPath helper maps provider key to API route — keeps fetch calls DRY"
metrics:
  duration: 149s
  completed: 2026-02-23
  tasks_completed: 2
  files_affected: 3
---

# Phase quick-22 Plan 01: Motive (KeepTruckin) ELD Integration Summary

**One-liner:** Motive GPS sync via keeptruckin.com/v1/vehicles API with paginated fetch, VIN matching, and generalized per-provider config panel supporting both Samsara and Motive.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create Motive GPS sync library and API endpoint | 456b2cb | src/lib/integrations/motive.ts, src/app/api/integrations/motive/sync/route.ts |
| 2 | Generalize integrations UI to support Motive config panel | 1344a36 | src/app/(owner)/settings/integrations/integrations-manager.tsx |

## What Was Built

### Task 1: Motive Sync Library + API Endpoint

**`src/lib/integrations/motive.ts`**
- `MotiveVehicle` interface: `id`, `number`, `vin`, `current_location` (`lat`, `lon`, `speed`, `bearing`, `located_at`)
- `MotiveVehiclesResponse`: `vehicles[]` + optional `pagination` (`per_page`, `page_no`, `total`)
- `fetchMotiveLocations(apiToken)`: fetches `https://api.keeptruckin.com/v1/vehicles?per_page=100`, handles numeric pagination (`total > page_no * per_page`)
- `syncMotiveLocations(tenantId, apiToken)`: RLS-bypass truck load, VIN normalization, bulk `gPSLocation.createMany` in transaction
- Field mapping: `lat`->`latitude`, `lon`->`longitude`, `speed` (already mph, rounded), `bearing`->`heading` (rounded), `located_at`->`timestamp`

**`src/app/api/integrations/motive/sync/route.ts`**
- POST handler with dual auth (CRON_SECRET bearer or OWNER session)
- Looks up `TenantIntegration` where `provider: 'KEEP_TRUCKIN'` and `enabled: true`
- Extracts `apiToken` from `configJson`, calls `syncMotiveLocations`
- Error prefix: `[Motive Sync]`

### Task 2: Generalized Integrations UI

**`integrations-manager.tsx`** refactored to support N ELD providers:
- `EldProviderKey = 'SAMSARA' | 'KEEP_TRUCKIN'`
- `ELD_PROVIDERS: EldProviderKey[] = ['SAMSARA', 'KEEP_TRUCKIN']`
- `EldProviderState`: per-provider `{ token, isEditing, isSaving, isSyncing }`
- `handleSaveToken(provider, name)` and `handleSyncNow(provider, name)` accept provider parameter
- `eldSyncPath(provider)` maps to correct API route
- Single generic config panel renders for any provider in `ELD_PROVIDERS` when enabled
- CATALOG: KEEP_TRUCKIN updated to `name='Motive (KeepTruckin)'`, `logoPlaceholder='MO'`, `comingSoon=false`

## Decisions Made

1. **Motive API field names differ from Samsara** — Motive uses `lat`/`lon`/`bearing`/`located_at` vs Samsara's `latitude`/`longitude`/`heading`/`time`. Mapped explicitly in `syncMotiveLocations`.

2. **Per-provider state record pattern** — Replaces the four single-provider state variables (`samsaraToken`, `isEditingToken`, `isSaving`, `isSyncing`) with a `Record<EldProviderKey, EldProviderState>`. Scales to future ELD providers (Verizon Connect, Geotab, etc.) without JSX duplication.

3. **KEEP_TRUCKIN enum value preserved** — The existing Prisma `IntegrationProvider` enum uses `KEEP_TRUCKIN` (not `MOTIVE`). The display name changed to "Motive (KeepTruckin)" but the DB key is unchanged to avoid migration.

4. **Generic config panel driven by `ELD_PROVIDERS` list** — One JSX block handles all ELD providers. Adding a third ELD provider only requires: adding to `ELD_PROVIDERS`, adding to `CATALOG`, adding to `eldSyncPath`, and creating the API route.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with zero errors
- All 9 key patterns verified (file existence, exports, imports, provider constants, fetch URL, createMany)
- Motive sync library mirrors Samsara pattern (fetch, VIN match, bulk insert)
- `POST /api/integrations/motive/sync` returns `{ synced, unmatched }` JSON
- Integrations page shows Motive as active (not "Coming Soon") with token input and Sync Now
- Samsara continues working unchanged

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/lib/integrations/motive.ts | FOUND |
| src/app/api/integrations/motive/sync/route.ts | FOUND |
| src/app/(owner)/settings/integrations/integrations-manager.tsx | FOUND |
| Commit 456b2cb (Task 1) | FOUND |
| Commit 1344a36 (Task 2) | FOUND |
