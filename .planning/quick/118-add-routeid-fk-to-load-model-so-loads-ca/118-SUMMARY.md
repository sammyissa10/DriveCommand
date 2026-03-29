---
phase: quick-118
plan: "01"
subsystem: loads
tags: [loads, routes, web, mobile-api, validation]
dependency_graph:
  requires: []
  provides: [routeId on load create/edit web form, routeId on mobile load create API]
  affects: [load-form, loads-new-page, loads-edit-page, load-server-actions, mobile-loads-api, validation-schema]
tech_stack:
  added: []
  patterns: [optional FK dropdown pattern (same as driverId/truckId), tenant ownership validation on mobile]
key_files:
  created: []
  modified:
    - packages/validation/src/load.ts
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/components/loads/load-form.tsx
    - apps/web/src/app/(owner)/loads/new/page.tsx
    - apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
    - apps/web/src/app/api/mobile/owner/loads/route.ts
decisions:
  - "Used listRoutes() server action (already existed) to fetch routes rather than a direct prisma query in page, keeping data access consistent with rest of owner portal"
  - "Route dropdown placed after Truck dropdown — logical order: who is driving, what vehicle, which route"
  - "Mobile API validates routeId belongs to tenant with archivedAt: null guard before persisting"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-29"
  tasks_completed: 2
  files_modified: 6
---

# Quick 118: Add routeId FK to Load — Load-Route Assignment

**One-liner:** Route dropdown added to web load create/edit form with `listRoutes` data fetch, and mobile POST API accepts validated `routeId` to close the load-route linking loop.

## What Was Built

The `routeId` FK already existed on the `Load` model and route/driver detail screens already displayed linked loads. The missing piece was allowing owners to actually SET `routeId` when creating or editing loads. This task closes that loop.

### Changes Made

**Validation schema** (`packages/validation/src/load.ts`):
- Added `routeId: z.string().uuid().optional().or(z.literal(''))` to `loadCreateSchema`
- `loadUpdateSchema` is an alias so it inherits automatically

**Server actions** (`apps/web/src/app/(owner)/actions/loads.ts`):
- `createLoad`: extracts `routeId` from formData, includes in rawData, persists `routeId: result.data.routeId || null` in `prisma.load.create`
- `updateLoad`: same pattern — extracts and persists routeId

**Load form component** (`apps/web/src/components/loads/load-form.tsx`):
- Added `routes` prop and `routeId` to `initialData`
- Route `<select>` dropdown rendered after Truck dropdown with "No route assigned" default option
- Route label displays `r.name` or falls back to `origin → destination`

**New load page** (`apps/web/src/app/(owner)/loads/new/page.tsx`):
- Imports `listRoutes` from routes actions
- Added to `Promise.all` with `.catch(() => [])` guard
- Passes `routes={routes}` to `<LoadForm>`

**Edit load page** (`apps/web/src/app/(owner)/loads/[id]/edit/page.tsx`):
- Same as new page — fetches routes, passes to form
- Passes `routeId: load.routeId` in `initialData` so dropdown pre-selects current route

**Mobile API** (`apps/web/src/app/api/mobile/owner/loads/route.ts`):
- Added `routeId?: string` to body type
- Validates routeId belongs to tenant with `archivedAt: null` check before creating load
- Includes `routeId: routeId ?? null` in `tx.load.create` data

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | fcd332e | feat(quick-118): add routeId to load schema, server actions, and mobile API |
| 2 | 5001517 | feat(quick-118): add Route dropdown to load create/edit form |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `packages/validation/src/load.ts` — routeId field present
- `apps/web/src/app/(owner)/actions/loads.ts` — routeId extracted and persisted in createLoad and updateLoad
- `apps/web/src/components/loads/load-form.tsx` — routes prop and routeId dropdown present
- `apps/web/src/app/(owner)/loads/new/page.tsx` — listRoutes imported and passed to form
- `apps/web/src/app/(owner)/loads/[id]/edit/page.tsx` — listRoutes imported, routeId in initialData
- `apps/web/src/app/api/mobile/owner/loads/route.ts` — routeId validated and persisted
- Both `npx tsc --noEmit` checks pass with zero errors
- Both task commits exist: fcd332e, 5001517
