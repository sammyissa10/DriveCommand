---
phase: quick-71
plan: "01"
subsystem: trucks
tags: [trucks, maintenance, status, toggle, server-action]
dependency_graph:
  requires: [prisma/schema.prisma, src/lib/trucks/compute-truck-status.ts, src/app/(owner)/actions/trucks.ts]
  provides: [toggleTruckMaintenance server action, MaintenanceToggleButton component]
  affects: [truck-detail-page, maintenance-page, truck-status-computation]
tech_stack:
  added: []
  patterns: [server-action-with-revalidation, client-component-with-useTransition]
key_files:
  created:
    - src/components/trucks/maintenance-toggle-button.tsx
  modified:
    - prisma/schema.prisma
    - src/lib/trucks/compute-truck-status.ts
    - src/app/(owner)/actions/trucks.ts
    - src/app/(owner)/trucks/[id]/page.tsx
    - src/app/(owner)/trucks/[id]/maintenance/page.tsx
decisions:
  - Used (truck as any).inMaintenance cast on detail/maintenance pages because getTruck returns Prisma type already containing inMaintenance — cast is a no-op safety measure, TypeScript confirmed no errors
  - revalidateTag called with 'max' argument to match existing pattern in trucks.ts
metrics:
  duration: "~8 minutes"
  completed: "2026-03-15"
  tasks_completed: 2
  files_modified: 5
  files_created: 1
---

# Quick Task 71: TKT-0024 — Add Manual In-Maintenance Toggle

**One-liner:** Manual `inMaintenance` boolean on Truck model with a two-state toggle button (amber/green) on truck detail and maintenance pages, taking priority over overdue-service check in status computation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add inMaintenance field, update computeTruckStatus, add server action | ab88b14 | prisma/schema.prisma, compute-truck-status.ts, actions/trucks.ts |
| 2 | Create toggle button component and add to truck detail and maintenance pages | 2780dd6 | maintenance-toggle-button.tsx, trucks/[id]/page.tsx, maintenance/page.tsx |

## What Was Built

**Schema:** Added `inMaintenance Boolean @default(false)` to the Truck model, after the `odometer` field. Ran `prisma db push` and `prisma generate` to sync the database and regenerate the client.

**Status computation:** Updated `computeTruckStatus` to check `truck.inMaintenance` as step 2a before the existing overdue-service check (now 2b). Also added `inMaintenance?: boolean` to `TruckWithRelations` interface and updated the header comment to reflect the new priority order.

**Server action:** Added `toggleTruckMaintenance(truckId, inMaintenance)` to `src/app/(owner)/actions/trucks.ts`. Enforces OWNER/MANAGER role, records `updatedById`, and revalidates `/trucks`, `/trucks/[id]`, `/trucks/[id]/maintenance`, and the `dashboard-metrics` tag.

**Toggle button:** `MaintenanceToggleButton` is a client component using `useTransition` for pending state and `router.refresh()` after toggle. Renders amber "Put in Maintenance" (with Wrench icon) when `inMaintenance` is false, and green outline "Mark Available" (with CheckCircle2 icon) when true. Shows Loader2 spinner during transition.

**Placement:**
- Truck detail page (`/trucks/[id]`): button added in header actions `flex gap-3` div, before the Maintenance link
- Maintenance page (`/trucks/[id]/maintenance`): button added after odometer `<p>` in a `mt-3` wrapper div

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma client needed regeneration after schema change**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** After running `prisma db push`, the generated Prisma client was stale and did not include `inMaintenance` in its type definitions, causing TS2353 (unknown property) and TS2554 (wrong argument count) errors
- **Fix:** Ran `npx prisma generate` to regenerate the client; also fixed `revalidateTag` call to include second `'max'` argument consistent with all other actions in the file
- **Files modified:** src/generated/prisma (auto-generated)
- **Commit:** ab88b14

## Self-Check

### Files created/modified

- [x] `prisma/schema.prisma` — contains `inMaintenance`
- [x] `src/lib/trucks/compute-truck-status.ts` — contains `inMaintenance` override check
- [x] `src/app/(owner)/actions/trucks.ts` — exports `toggleTruckMaintenance`
- [x] `src/components/trucks/maintenance-toggle-button.tsx` — created
- [x] `src/app/(owner)/trucks/[id]/page.tsx` — imports and uses `MaintenanceToggleButton`
- [x] `src/app/(owner)/trucks/[id]/maintenance/page.tsx` — imports and uses `MaintenanceToggleButton`

### Commits verified

- ab88b14 — Task 1
- 2780dd6 — Task 2

### Build result

`npm run build` passed with no errors. TypeScript clean (`npx tsc --noEmit` no errors).

## Self-Check: PASSED
