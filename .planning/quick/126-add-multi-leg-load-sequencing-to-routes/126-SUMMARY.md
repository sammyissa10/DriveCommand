---
phase: quick-126
plan: "01"
subsystem: routes/loads
tags: [routes, loads, sequencing, mobile, driver-portal, owner-portal]
dependency_graph:
  requires: []
  provides: [load-sequence-field, route-leg-ordering, continuity-warnings]
  affects: [routes-detail-page, driver-my-route-screen, mobile-api]
tech_stack:
  added: []
  patterns: [prisma-nullable-int-field, server-action-onblur, iife-jsx-warnings]
key_files:
  created:
    - apps/web/prisma/migrations/20260329000001_add_load_sequence/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/(owner)/routes/[id]/page.tsx
    - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/api/mobile/driver/route/route.ts
    - packages/api-client/src/driver.ts
    - apps/mobile/components/driver/RouteLoadTimelineItem.tsx
    - apps/mobile/app/(driver)/loads/my-route.tsx
decisions:
  - "Used IIFE pattern inside JSX for continuity warning computation to avoid extracting a separate component"
  - "legNumber derived from load.sequence if not null, otherwise falls back to index+1 for unsequenced loads"
  - "Server action updateLoadSequence wired to onBlur on the sequence input for low-friction editing"
  - "Prisma sorts nulls last by default for asc Int? fields — no special handling needed"
metrics:
  duration: "5m 25s"
  completed: "2026-03-29T22:10:31Z"
  tasks_completed: 3
  files_changed: 8
---

# Quick Task 126: Add Multi-Leg Load Sequencing to Routes Summary

**One-liner:** `sequence Int?` field on Load with migration, web route detail shows ordered Leg N badges + continuity warnings with inline editing, driver mobile shows "Leg 1/2/3" progression on Route Legs screen.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Schema migration + API layer updates | `430ddc0` | schema.prisma, migration.sql, page.tsx, route/route.ts, driver.ts |
| 2 | Web UI sequence editing + continuity warnings | `995c39d` | route-page-client.tsx, actions/loads.ts |
| 3 | Mobile driver leg numbering | `bec599f` | RouteLoadTimelineItem.tsx, my-route.tsx |

## What Was Built

### Schema (Task 1)
- Added `sequence Int?` to the `Load` model, placed after `routeId`
- Added `@@index([routeId, sequence])` for efficient per-route ordered queries
- Migration SQL: `ALTER TABLE "Load" ADD COLUMN "sequence" INTEGER` + index

### API Layer (Task 1)
- Web route detail query (`routes/[id]/page.tsx`): adds `sequence: true` to select, changes `orderBy` to `[{ sequence: 'asc' }, { pickupDate: 'asc' }]`
- Mobile driver route API (`api/mobile/driver/route/route.ts`): adds `sequence: true` to loads select, adds `orderBy: [{ sequence: 'asc' }, { pickupDate: 'asc' }]`
- `DriverRouteLoad` interface: adds `sequence: number | null`

### Web Owner UI (Task 2)
- `updateLoadSequence(loadId, sequence)` server action added to `loads.ts` — OWNER/MANAGER only, calls `prisma.load.update`, revalidates `/routes`
- Edit mode: each load row shows a `w-16` numeric input labeled "Leg" — saves on `onBlur` via server action
- View mode: loads with `sequence !== null` show a `Leg N` pill badge in primary/10 color
- Both modes: IIFE in JSX computes continuity warnings — when `load[i].destination` (trimmed, lowercased) differs from `load[i+1].origin`, shows amber AlertTriangle warning: "Gap between Leg N and Leg M: Load #X delivers to Y but Load #Z picks up from W"

### Mobile Driver UI (Task 3)
- `RouteLoadTimelineItem` gains `legNumber: number` prop
- Displays "Leg N" in `text-sm font-bold text-sky-400` above the load number
- Load number now prefixed with `#` for consistency
- `my-route.tsx` passes `legNumber` = `load.sequence ?? index + 1`
- Section header renamed from "Loads on this Route" to "Route Legs"

## Deviations from Plan

**1. [Rule 2 - Missing] Rebuilt api-client dist before mobile TypeScript check**
- Found during: Task 3 verification
- Issue: `packages/api-client/dist/` is gitignored, so the built `.d.ts` was stale after adding `sequence` to the source interface. Mobile tsc couldn't find the field.
- Fix: Ran `npm run build` in `packages/api-client` to regenerate dist. Since dist is gitignored, not committed — the build step happens at install/build time in CI.
- Files modified: packages/api-client/dist/ (not tracked)

None of the plan tasks required architectural changes. All work was additive.

## Self-Check

### Files Exist
- `apps/web/prisma/migrations/20260329000001_add_load_sequence/migration.sql` — FOUND
- `apps/web/prisma/schema.prisma` contains `sequence` — FOUND
- `apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx` contains `updateLoadSequence` — FOUND
- `apps/mobile/components/driver/RouteLoadTimelineItem.tsx` contains `legNumber` prop — FOUND

### Commits Exist
- `430ddc0` feat(quick-126): schema migration + API layer for load sequence — FOUND
- `995c39d` feat(quick-126): web UI sequence editing + continuity warnings — FOUND
- `bec599f` feat(quick-126): mobile driver leg numbering — FOUND

## Self-Check: PASSED
