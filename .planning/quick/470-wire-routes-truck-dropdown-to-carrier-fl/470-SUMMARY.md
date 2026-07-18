---
phase: quick-470
plan: 470
subsystem: routes
tags: [prisma, migration, carrier-fleet, route-form, validation]
dependency-graph:
  requires: []
  provides:
    - "Route.carrierTruckId FK to carrier_trucks(id)"
    - "routeCreateSchema.carrierTruckId (required)"
    - "createRoute/updateRoute persist carrierTruckId, org-scoped ownership check"
    - "route-form.tsx Truck select bound to CarrierTruck fleet"
  affects:
    - "apps/web/src/app/(owner)/routes/**"
    - "apps/web/src/components/routes/**"
tech-stack:
  added: []
  patterns:
    - "Nullable dual-FK migration (legacy truckId + new carrierTruckId) — same pattern as GPSLocation.carrierTruckId (20260417)"
    - "CarrierTruck is EXEMPT_MODELS for tenant-RLS — always filter by orgId explicitly in queries"
key-files:
  created:
    - apps/web/prisma/migrations/20260717_route_carrier_truck/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - packages/validation/src/route.ts
    - apps/web/src/app/(owner)/actions/routes.ts
    - apps/web/src/app/(owner)/actions/notifications.ts
    - apps/web/src/app/(owner)/routes/new/page.tsx
    - apps/web/src/app/(owner)/routes/new/new-route-client.tsx
    - apps/web/src/app/(owner)/routes/[id]/page.tsx
    - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
    - apps/web/src/app/(owner)/routes/[id]/edit/edit-route-client.tsx
    - apps/web/src/components/routes/route-edit-section.tsx
    - apps/web/src/components/routes/route-form.tsx
    - apps/web/src/components/routes/route-detail.tsx
decisions:
  - "Applied migration via manual `npx prisma migrate deploy` — the auto-deploy hook did not fire on migration.sql write"
  - "Linked carrier truck 'View Truck Details' to /carrier/fleet/trucks/{id} (the actual CarrierTruck detail route), not /trucks/{id} (which renders the legacy Truck model and would 404/mismatch for a carrierTruckId)"
  - "route-list.tsx (legacy, unused — only referenced from apps/web/src/legacy/2026-05-21/route-list-wrapper.tsx which is not imported by any active page) left unguarded; not a reachable crash path"
  - "/routes main list grid (_grid/columns.tsx) already null-guards truckId (renders '—' when absent) — left as-is; new carrier routes will show '—' in that list until a future pass wires carrierTruckId/carrierTruckUnit into RouteRow (out of this plan's declared file scope)"
metrics:
  duration: ~35min
  completed: 2026-07-17
---

# Quick Task 470: Wire Routes Truck Dropdown to Carrier Fleet Summary

Wired the Routes create/edit Truck dropdown to the carrier fleet (`CarrierTruck` / `carrier_trucks`, orgId-scoped) instead of the empty legacy `Truck` table, via a new nullable `Route.carrierTruckId` FK.

## What Was Built

**Schema + migration (Task 1):**
- `Route.carrierTruckId` — nullable UUID FK to `carrier_trucks(id)`, `ON DELETE SET NULL`, indexed (`Route_carrierTruckId_idx`)
- `Route.truckId` / `truck` relation made nullable (legacy routes keep working; new carrier routes leave it null)
- `CarrierTruck.routes` reverse relation added
- Migration `20260717_route_carrier_truck` — copied the shipped GPSLocation precedent's identifier style (quoted PascalCase `"Route"`, quoted camelCase columns). Applied to Supabase via manual `npx prisma migrate deploy` (see Deviations).

**Validation + server actions (Task 2):**
- `routeCreateSchema.carrierTruckId` required (UUID); `truckId` now optional/legacy
- `createRoute` / `updateRoute` validate the carrier truck belongs to the caller's org (`carrierTruck.findFirst({ where: { id, orgId: tenantId, deletedAt: null } })` — explicit org filter because `CarrierTruck` is in `EXEMPT_MODELS` for tenant-RLS) and persist `carrierTruckId` on the Route row instead of the legacy `truckId`
- `getRoute` now includes `carrierTruck` (id/unitNumber/displayName/year/make/model/vin/licensePlate) alongside the existing legacy `truck` include

**UI (Task 3):**
- `route-form.tsx` — Truck `<select>` renamed `truckId` → `carrierTruckId`, options render `displayName || unitNumber`, disabled + "Add trucks to your fleet first..." hint when the fleet is empty (mirrors the existing drivers empty-state pattern)
- `/routes/new` and `/routes/[id]` pages now call `listCarrierTrucks(orgId)` (via `requireTenantId()`) instead of the empty legacy `listTrucks()`
- `new-route-client.tsx`, `route-page-client.tsx`, `route-edit-section.tsx` — `trucks` prop retyped to the carrier shape `{ id, unitNumber, displayName }`; `route-edit-section.tsx` prefills the form from `route.carrierTruckId` (not the relation object)
- `route-detail.tsx` "Assigned Truck" section: renders the carrier truck when present (label = `displayName || unitNumber`, optional year/make/model/plate/VIN, link to `/carrier/fleet/trucks/{id}`), falls back to the legacy truck for old routes, and shows "No truck assigned" instead of crashing when neither is present

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Auto-deploy hook did not fire on migration.sql write**
- **Found during:** Task 1
- **Issue:** `prisma migrate status` still showed the new migration as pending after writing the file
- **Fix:** Ran `npx prisma migrate deploy` manually; confirmed with `prisma migrate status` → "Database schema is up to date!"
- **Files modified:** none (DB-only)
- **Commit:** cd92ffc5

**2. [Rule 3 - Blocking] `@drivecommand/validation` dist was stale after editing `src/route.ts`**
- **Found during:** Task 2 verification
- **Issue:** `tsc --noEmit` reported `carrierTruckId` missing from the schema-inferred type because the package resolves `./dist`, not `src`
- **Fix:** Ran `npx tsc` inside `packages/validation` to rebuild `dist/` (gitignored, not committed)
- **Files modified:** none (build output, gitignored)

**3. [Rule 1 - Bug] `notifications.ts` `sendETANotification` would crash on `route.truck` for carrier routes**
- **Found during:** Task 3 tsc pass (`route.truck` now optional)
- **Issue:** `${route.truck.make} ${route.truck.model} (${route.truck.licensePlate})` dereferenced a possibly-null `truck`
- **Fix:** Added `carrierTruck: true` to the query include and a `truckLabel` fallback (`carrierTruck.displayName/unitNumber` → legacy truck string → `'Unassigned'`)
- **Files modified:** `apps/web/src/app/(owner)/actions/notifications.ts`
- **Commit:** ebc681d5

**4. [Rule 3 - Blocking] `edit-route-client.tsx` (not in the plan's file list) failed tsc after `RouteForm`'s `trucks`/`initialData` shape changed**
- **Found during:** Task 3 tsc pass
- **Issue:** This file is the client component behind `/routes/[id]/edit/page.tsx`, which is a redirect-only stub (`redirect('/routes/{id}?mode=edit')`) — dead code today, but still type-checked and would fail the build
- **Fix:** Updated its `Truck` interface and `initialData.truckId → carrierTruckId` to match the new `RouteForm` props
- **Files modified:** `apps/web/src/app/(owner)/routes/[id]/edit/edit-route-client.tsx`
- **Commit:** 8238c761

None of these required an architectural decision (Rule 4) — all were type-safety/build fixes or straightforward null-guard additions consistent with the plan's stated null-safety audit.

## Verification

- `cd apps/web && npx tsc --noEmit` → **0 errors** (repo baseline is ~35 pre-existing errors in unrelated packages; this run returned none, so no regressions)
- `npx prisma migrate status` → "Database schema is up to date!" after manual `migrate deploy`
- Null-safety audit (`grep -rn "\.truck\." apps/web/src`) reviewed across all 26 matching files; only `route-detail.tsx` (now branch-guarded) and `notifications.ts` (fixed above) were reachable Route→truck dereferences. `route-list.tsx` matched but is dead/legacy code (only referenced from an unused `apps/web/src/legacy/2026-05-21/` wrapper) and was left untouched.
- Did not run the dev server / manual browser click-through (no interactive session in this execution) — the functional verification steps in the plan (open `/routes/new`, create a route, check detail page) are recommended as a follow-up smoke test before relying on this in production.

## Self-Check

- FOUND: apps/web/prisma/migrations/20260717_route_carrier_truck/migration.sql
- FOUND: apps/web/prisma/schema.prisma (carrierTruckId present)
- FOUND: apps/web/src/components/routes/route-form.tsx (carrierTruckId select)
- FOUND: apps/web/src/components/routes/route-detail.tsx (carrierTruck branch)
- Commits cd92ffc5, ebc681d5, 8238c761 all present in `git log --oneline`

## Self-Check: PASSED
