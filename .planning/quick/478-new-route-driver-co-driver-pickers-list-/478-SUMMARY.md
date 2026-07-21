---
phase: quick-478
plan: 478
subsystem: ui
tags: [prisma, nextjs, server-actions, routes, drivers]

# Dependency graph
requires:
  - phase: quick-477
    provides: Route create/edit driver pickers sourced from listDrivers() (DRIVER-role Users), not carrier fleet
provides:
  - "listDrivers() optional activeOnly filter (default behavior unchanged)"
  - "Route create page pickers list only active drivers"
  - "Route edit page pickers list active drivers, merged with any already-assigned now-inactive primary/co-drivers"
affects: [routes, drivers]

# Tech tracking
tech-stack:
  added: []
  patterns: ["optional-args filter param on server action to preserve default-behavior call sites"]

key-files:
  created: []
  modified:
    - "apps/web/src/app/(owner)/actions/drivers.ts"
    - "apps/web/src/app/(owner)/routes/new/page.tsx"
    - "apps/web/src/app/(owner)/routes/[id]/page.tsx"

key-decisions:
  - "listDrivers(opts?: { activeOnly?: boolean }) — no-arg call sites (drivers/page.tsx, tags/page.tsx) keep exact current behavior"
  - "Edit page re-fetches and merges any assigned-but-now-inactive driver ids by id, so an existing selection is never silently dropped from the picker"

patterns-established:
  - "When narrowing a shared list-fetching action for one caller, add an optional opts param with default-safe fallback rather than forking a new function"

# Metrics
duration: 6min
completed: 2026-07-21
---

# Quick Task 478: New Route driver/co-driver pickers list only active drivers Summary

**`listDrivers()` gained an optional `activeOnly` filter; New Route create/edit pages now exclude deactivated drivers from the primary/co-driver pickers while the edit page still preserves an already-assigned driver even if later deactivated.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-07-21T16:49:41-05:00
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- `listDrivers` now accepts `opts?: { activeOnly?: boolean }`; passing `{ activeOnly: true }` adds `isActive: true` to the Prisma `where` clause, default (no-arg) call unchanged
- Route create page (`routes/new/page.tsx`) now calls `listDrivers({ activeOnly: true })` so deactivated drivers no longer appear as assignable primary/co-drivers
- Route edit page (`routes/[id]/page.tsx`) calls `listDrivers({ activeOnly: true })`, then computes the set of currently-assigned driver ids (`route.driverId` + co-driver ids from `driverAssignments`), fetches any of those missing from the active list, and merges them in before building `driversForEdit` — so an existing assignment is never silently dropped from the edit form even if that driver was deactivated after being assigned

## Task Commits

Each task was committed atomically:

1. **Task 1: Add activeOnly filter to listDrivers and apply on route create + edit pages (with merge of existing assignments)** - `2cbecef2` (feat)

**Plan metadata:** (this summary + STATE.md update, committed by orchestrator)

## Files Created/Modified
- `apps/web/src/app/(owner)/actions/drivers.ts` - `listDrivers` signature gains optional `{ activeOnly? }` param; conditionally adds `isActive: true` to the where clause
- `apps/web/src/app/(owner)/routes/new/page.tsx` - single `listDrivers()` call changed to `listDrivers({ activeOnly: true })`
- `apps/web/src/app/(owner)/routes/[id]/page.tsx` - `listDrivers()` call changed to `listDrivers({ activeOnly: true })`; added assigned-id merge logic before building `driversForEdit`

## Decisions Made
- Reused the existing `prisma` instance already in scope (from `getTenantPrisma()` at top of the edit page) for the fallback fetch of missing assigned drivers, rather than creating a new client.
- Missing-id fallback fetch is wrapped in `.catch()` with `logger.error`, matching the file's existing error-handling convention for parallel fetches — a failure here degrades gracefully (assigned driver just won't be pre-populated) rather than breaking the whole edit page.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- No blockers. `apps/web/src/app/(owner)/actions/routes.ts` remains zero-diff (verified via `git diff --stat`).
- `drivers/page.tsx` and `tags/page.tsx` verified unchanged and still call `listDrivers()` with no args (grep-confirmed).
- `tsc --noEmit` in `apps/web` completed with 0 errors (clean exit code, no output) — no regressions introduced.

---
*Phase: quick-478*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 3 modified files found on disk, SUMMARY.md found, commit `2cbecef2` found in git log.
