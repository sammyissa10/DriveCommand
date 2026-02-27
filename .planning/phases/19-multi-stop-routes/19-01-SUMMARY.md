---
phase: 19-multi-stop-routes
plan: 01
subsystem: database
tags: [prisma, migration, rls, server-actions, zod, route-stops]
dependency_graph:
  requires: []
  provides: [RouteStop table, routeStopSchema, stop CRUD in server actions]
  affects: [prisma/schema.prisma, routes.ts server actions, route.schemas.ts]
tech_stack:
  added: []
  patterns: [nested prisma create for stops, flat FormData keys for stop serialization, atomic delete+createMany for stop updates]
key_files:
  created:
    - prisma/migrations/20260226000003_add_route_stops/migration.sql
  modified:
    - prisma/schema.prisma
    - src/lib/validations/route.schemas.ts
    - src/app/(owner)/actions/routes.ts
decisions:
  - Keep Route.origin/destination fields unchanged — RouteStops are additive intermediate stops, not replacements
  - Use flat FormData keys (stops_N_address, stops_N_type) not JSON blob — idiomatic with Next.js useActionState + FormData
  - Use stops_submitted=true hidden field to distinguish "no stops section in form" from "stops cleared to zero"
  - Atomic stop replacement in updateRoute (deleteMany + createMany) — position gaps cannot occur
  - Include stops in getRoute (ordered by position asc) and _count.stops in listRoutes
metrics:
  duration: 185s
  completed: 2026-02-27
  tasks_completed: 2
  files_affected: 4
---

# Phase 19 Plan 01: RouteStop Data Model Summary

RouteStop table with RLS tenant isolation, Prisma model with PICKUP/DELIVERY/PENDING/ARRIVED/DEPARTED enums, routeStopSchema Zod validation, and full stop CRUD integration in createRoute/updateRoute/getRoute/listRoutes server actions.

## What Was Built

### Task 1: Migration SQL + Prisma Schema (commit 69ba861)

Created `prisma/migrations/20260226000003_add_route_stops/migration.sql` with:
- `RouteStopType` enum (PICKUP, DELIVERY) — idempotent DO/EXCEPTION block
- `RouteStopStatus` enum (PENDING, ARRIVED, DEPARTED) — idempotent DO/EXCEPTION block
- `RouteStop` table with all 16 columns (id, routeId, tenantId, position, type, address, lat, lng, scheduledAt, arrivedAt, departedAt, notes, status, geofenceHit, createdAt, updatedAt)
- 4 indexes: routeId, tenantId, (routeId, position) composite, status
- FK to Route(id) ON DELETE CASCADE — stops auto-delete when route is deleted
- FK to Tenant(id) ON DELETE RESTRICT
- RLS: ENABLE + FORCE ROW LEVEL SECURITY
- `tenant_isolation_policy` (USING tenantId = current_tenant_id())
- `bypass_rls_policy` (USING app.bypass_rls = 'on')

Updated `prisma/schema.prisma`:
- Added `RouteStopType` and `RouteStopStatus` enums
- Added `RouteStop` model with all fields, relations, and indexes
- Added `stops RouteStop[]` relation on Route model
- Added `routeStops RouteStop[]` relation on Tenant model
- Regenerated Prisma client — `RouteStop`, `RouteStopType`, `RouteStopStatus` now available in TypeScript types

### Task 2: Zod Validation + Server Actions (commit 45940d5)

Updated `src/lib/validations/route.schemas.ts`:
- Added `routeStopSchema` — validates type (PICKUP|DELIVERY), address (min 1, max 500), optional scheduledAt and notes (max 1000)
- Exported `RouteStopInput` TypeScript type

Updated `src/app/(owner)/actions/routes.ts`:
- `createRoute`: parses flat FormData stop fields via `stops_${si}_address` loop, validates each stop with routeStopSchema, creates stops as nested `stops: { create: [...] }` in prisma.route.create with correct position ordering (1-based)
- `updateRoute`: parses stops from FormData the same way, uses `stops_submitted=true` hidden field to gate atomic stop replacement (deleteMany + createMany), fetches `tenantId` via `requireTenantId()` for stop records
- `getRoute`: added `stops: { orderBy: { position: 'asc' } }` to include block
- `listRoutes`: added `_count: { select: { stops: true } }` to include block

## Verification Results

| Check | Result |
|-------|--------|
| `npx prisma validate` | PASSED — schema valid |
| `npx prisma generate` | PASSED — client generated in 330ms |
| `npx tsc --noEmit` | PASSED — no type errors |
| Migration contains `tenant_isolation_policy` | CONFIRMED |
| Migration contains `bypass_rls_policy` | CONFIRMED |
| `getRoute` includes stops ordered by position | CONFIRMED (line 504) |
| `createRoute` parses `stops_N_address` fields | CONFIRMED (line 61) |
| `updateRoute` parses `stops_N_address` fields | CONFIRMED (line 204) |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `prisma/migrations/20260226000003_add_route_stops/migration.sql` | FOUND |
| `prisma/schema.prisma` | FOUND |
| `src/lib/validations/route.schemas.ts` | FOUND |
| `src/app/(owner)/actions/routes.ts` | FOUND |
| Commit 69ba861 (migration + schema) | FOUND |
| Commit 45940d5 (Zod + server actions) | FOUND |
