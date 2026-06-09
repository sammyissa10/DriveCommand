---
phase: quick-429
plan: 429
subsystem: carrier-routing-ui
tags: [routing, navigation, ux, rename, redirects]
dependency_graph:
  requires: []
  provides: [carrier/trips routes, dispatches->trips permanent redirects]
  affects: [sidebar, breadcrumb, next.config]
tech_stack:
  added: []
  patterns: [Next.js permanent redirects, page stub redirects]
key_files:
  created:
    - apps/web/src/app/(owner)/carrier/trips/_grid/types.ts
    - apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx
    - apps/web/src/app/(owner)/carrier/trips/_grid/DispatchesGrid.tsx
    - apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx
  modified:
    - apps/web/src/app/(owner)/carrier/trips/page.tsx
    - apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
    - apps/web/src/components/navigation/sidebar.tsx
    - apps/web/src/components/Sidebar/index.tsx
    - apps/web/src/components/carrier/CarrierBreadcrumb.tsx
    - apps/web/next.config.ts
  deleted:
    - apps/web/src/app/(owner)/carrier/dispatches/_grid/DispatchesGrid.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/_grid/columns.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/_grid/types.ts
decisions:
  - Kept DispatchesGrid export name and gridId="dispatches-overview" to avoid breaking any persisted grid state
  - Kept API fetch URL /api/v1/carrier/dispatches — only UI layer changed, no backend impact
  - Kept header "Dispatch #" column label — DC- number format and dispatch concept unchanged
  - Kept dispatches entry in CarrierBreadcrumb for safety during mid-redirect renders
  - trips/[id]/plan/page.tsx untouched per plan constraint
metrics:
  duration: 12 minutes
  completed: 2026-06-09T19:04:47Z
  tasks_completed: 2
  files_changed: 13
---

# Phase quick-429: Rename Dispatches to Trips (Routes + UI) Summary

**One-liner:** Moved real list/detail/stops pages from carrier/dispatches/ to carrier/trips/ with local _grid files, converted old dispatches routes to permanent redirect stubs, and updated sidebar links + breadcrumb labels to say "Trips".

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate real pages + _grid into trips/, convert dispatches/ to redirect stubs | af985916 | 9 changed (656 insertions, 649 deletions) |
| 2 | Update sidebars, breadcrumb, and add next.config redirects | 03b45614 | 4 changed (18 insertions, 3 deletions) |

## What Was Built

### Task 1 — Page Migration

- `trips/_grid/types.ts` — DispatchRow interface (copied verbatim, comment updated)
- `trips/_grid/columns.tsx` — Column defs with Link hrefs updated to `/carrier/trips/[id]`; header "Dispatch #" and export `dispatchesColumns` kept
- `trips/_grid/DispatchesGrid.tsx` — Grid component with all route hrefs updated to `/carrier/trips/*`; `searchPlaceholder` -> "Search trips...", `recordName` -> "Trip"; API fetch `/api/v1/carrier/dispatches` kept unchanged
- `trips/page.tsx` — Real list page, function `TripsPage`, heading "Trips", sub-heading "Daily trips view..."
- `trips/[id]/page.tsx` — Real detail page, back link -> `/carrier/trips`, View All Stops -> `/carrier/trips/${id}/stops`
- `trips/[id]/stops/page.tsx` — Real stops page, back link -> `/carrier/trips/${id}`, "Back to Trip", empty-state "No stops added to this trip yet."
- `dispatches/page.tsx` → redirect stub -> `/carrier/trips`
- `dispatches/[id]/page.tsx` → redirect stub -> `/carrier/trips/${id}`
- `dispatches/[id]/stops/page.tsx` → redirect stub -> `/carrier/trips/${id}/stops`
- Deleted `dispatches/_grid/` (3 files — now orphaned)

### Task 2 — Nav + Config

- `sidebar.tsx`: `isActive` check and `Link href` updated to `/carrier/trips`
- `Sidebar/index.tsx`: `href` updated to `/carrier/trips`
- `CarrierBreadcrumb.tsx`: added `trips: "Trips"` alongside `dispatches: "Dispatches"`
- `next.config.ts`: added `async redirects()` returning two permanent (308) rules: `/carrier/dispatches` -> `/carrier/trips` and `/carrier/dispatches/:path*` -> `/carrier/trips/:path*`

## Verification

- `tsc --noEmit`: 1 pre-existing error in `.next/types/validator.ts` (unrelated `help/[slug]` type). Zero new errors in any touched file.
- No `/carrier/dispatches` hrefs remain in `trips/` files (only `@/components/carrier/dispatches/*` import paths and the `/api/v1/carrier/dispatches` fetch URL, both intentionally preserved)
- `trips/[id]/plan/page.tsx` untouched

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files created/modified all exist and commits confirmed:
- af985916 present in git log
- 03b45614 present in git log
- trips/_grid/ directory with 3 files confirmed
- trips/[id]/stops/page.tsx confirmed
- dispatches/ stubs contain only redirect() calls confirmed
