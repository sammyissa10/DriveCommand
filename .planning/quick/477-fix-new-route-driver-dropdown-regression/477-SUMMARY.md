# Quick Task 477: Fix New Route Driver Dropdown Regression — Summary

**One-liner:** Restored route saving by re-sourcing driver/co-driver pickers from DRIVER-role `User` accounts (not the CarrierDriver fleet), then unified Origin/Destination/Stops into one ordered waypoint list on both desktop and mobile-web create/edit paths.

## What was broken (Part A)

TKT-0074 repointed the New Route primary-driver dropdown at `tenantPrisma.carrierDriver.findMany(...)`. `Route.driverId` is an FK to a **DRIVER-role `User`**, not a `CarrierDriver` — so every route save failed server-side with `"Driver not found"` / `"Selected user is not a driver"` because the submitted id never matched a `User.id`.

## What changed

### Task 1 — Re-source driver pickers from DRIVER-role Users (commit `eab0e9c8`)
- `apps/web/src/app/(owner)/routes/new/page.tsx`: driver source switched from `tenantPrisma.carrierDriver.findMany()` to `listDrivers()` (from `@/app/(owner)/actions/drivers`), filtered `!d.isSample`, mapped to `{ id, firstName, lastName }`. Dropped the now-unused `getTenantPrisma` import/binding.
- `apps/web/src/app/(owner)/routes/new/new-route-client.tsx`: dropped `userId` from the local `Driver` interface.
- `apps/web/src/app/(owner)/routes/[id]/page.tsx`: removed the `driversForEdit` block that mapped `userId: d.id` onto each driver — `listDrivers()` already returns the correct `User.id`, passed straight through.
- `apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx` and `apps/web/src/components/routes/route-edit-section.tsx`: dropped `userId` from the `drivers` prop types.
- `apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx` and `apps/web/src/components/routes/route-form.tsx`: verified only — both already had no `userId` gating (pre-dated by the quick-476 facility work), no change needed.
- `apps/web/e2e/routes.spec.ts`: rewrote the test to assert DRIVER-role User sourcing (placeholder option present, zero disabled options) instead of the reverted carrier-fleet-gating behavior (no more hard-coded "Michael Jordan"/"Carlos Rivera" assertions, which depended on carrier-fleet seed data not present via `TEST_DRIVER_EMAIL`/env-based e2e accounts).

This task alone restores route saving and was committed standalone.

### Task 2 — Desktop unified waypoint list (commit `b39c823b`)
`apps/web/src/components/routes/route-form.tsx`: replaced the separate Origin/Destination fields and separate Stops section with one ordered "Route Stops" waypoint list (`Waypoint[]` state, replacing the old `stops`/`originCoords`/`destCoords` state trio):
- First row = origin (fixed label "Origin (Pickup)", `name="origin"`, required).
- Last row = destination (fixed label "Destination (Delivery)", `name="destination"`, required).
- Middle rows = user-typed stops with a Pickup/Delivery `<select>`, `name={\`stops_${k}_address\`}` (0-indexed contiguous, recomputed every render from array position) plus hidden `stops_${k}_type/_scheduledAt/_notes/_lat/_lng`.
- Reordering clamped: `moveUp` disabled at `idx <= 1`, `moveDown` disabled at `idx >= length - 2` — origin/destination positions can never be displaced by a swap.
- "Add Stop" inserts a new middle row immediately before the last (destination) row.
- Remove disabled once `waypoints.length <= 2`.
- Edit round-trip: initializes from `initialData.origin` (first row) + `initialStops` sorted by `position` (middle rows) + `initialData.destination` (last row).
- Coordinates tracked in a single `Map<clientId, Coords>`; origin/dest coords derived from the first/last row on every render, feeding the existing OSRM distance effect (dependency array switched to primitive `lat`/`lng` values to avoid object-identity effect-skip bugs).
- Hidden `distanceMiles`, `coDriverIds`, `stops_submitted` sentinel unchanged.

### Task 3 — Mobile-web unified waypoint list (commit `d839f563`)
`apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx`: same restructure as Task 2, applied to the mobile-web create-only path (no edit round-trip needed — component has no `initialData`). Styled with the existing `ds*` token classes and `SectionHeader`'s `action` prop (Add) instead of a bespoke button; removed an unused `Plus` icon import in the process.

## Verification

- `git diff --stat 'apps/web/src/app/(owner)/actions/routes.ts'` — empty at every checkpoint (Task 1, Task 2, Task 3, and final). The `createRoute`/`updateRoute` FormData contract is completely unchanged.
- `cd apps/web && npx tsc --noEmit` — **0 errors** (both after each task and on the final combined diff). No baseline-vs-new-error comparison was needed since the run was clean throughout.
- Confirmed `User.isSample` exists in `prisma/schema.prisma` (line 252) before relying on it in the `page.tsx` filter.
- Grepped all six driver-prop files post-edit: no remaining `userId` on driver shapes (one harmless comment mention only).
- Grepped both waypoint-list files for the FormData contract field names (`origin`, `destination`, `stops_${k}_*`, `distanceMiles`, `coDriverIds`, `stops_submitted`) — all present and correctly derived from waypoint array position.

## Deviations from plan

None — plan executed exactly as written. `route-form.tsx` and `RouteCreateMobile.tsx` already lacked the old userId gating by the time this task ran (post quick-476), matching the plan's "verify only" expectation for Task 1 items 3–4.

## Commits

| Commit | Task | Files |
|---|---|---|
| `eab0e9c8` | Task 1 — P0 driver-picker fix | 6 files |
| `b39c823b` | Task 2 — Desktop unified waypoint list | `route-form.tsx` |
| `d839f563` | Task 3 — Mobile-web unified waypoint list | `RouteCreateMobile.tsx` |

Not pushed and not deployed — per constraints, the orchestrator handles typecheck confirmation, push, and `vercel --prod` after review.

## Self-Check: PASSED

- `eab0e9c8` — FOUND in `git log --oneline`
- `b39c823b` — FOUND in `git log --oneline`
- `d839f563` — FOUND in `git log --oneline`
- `apps/web/src/app/(owner)/routes/new/page.tsx` — FOUND
- `apps/web/src/components/routes/route-form.tsx` — FOUND
- `apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx` — FOUND
- `apps/web/e2e/routes.spec.ts` — FOUND
- `apps/web/src/app/(owner)/actions/routes.ts` — zero-diff confirmed (`git diff --stat` empty)
