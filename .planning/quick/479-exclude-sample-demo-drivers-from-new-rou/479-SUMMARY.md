---
phase: quick-479
plan: 479
subsystem: routes
tags: [prisma, server-actions, nextjs, sample-data, driver-picker]

# Dependency graph
requires:
  - phase: quick-478
    provides: listDrivers({ activeOnly }) opt for New/Edit Route driver pickers
provides:
  - listDrivers({ excludeSamples }) opt that filters out User.isSample = true DRIVER records
  - New Route driver + co-driver pickers excluding sample/demo drivers
  - Edit Route driver + co-driver pickers excluding sample/demo drivers for new selection
affects: [routes, drivers, sample-data-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [conditional-spread opt-in filter on shared server action, preserve-existing-assignment merge pattern]

key-files:
  created: []
  modified:
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/(owner)/routes/new/page.tsx
    - apps/web/src/app/(owner)/routes/[id]/page.tsx

key-decisions:
  - "excludeSamples implemented as a conditional spread (mirrors existing activeOnly pattern) so the default no-arg call stays byte-for-byte { role: 'DRIVER' }"
  - "Edit-page 'merge already-assigned drivers' fallback query left untouched — an existing route assignment to a sample or deactivated driver must still render in the dropdown"

patterns-established:
  - "Opt-in filters on shared list* server actions use conditional spread in the where clause so unrelated callers are unaffected by default"

# Metrics
duration: ~5min
completed: 2026-07-22
---

# Quick Task 479: Exclude Sample/Demo Drivers from Route Pickers Summary

**listDrivers() gained an `excludeSamples` opt-in filter (isSample: false); New Route and Edit Route driver/co-driver pickers now opt in, while the edit-page's already-assigned-driver merge fallback stays unfiltered so existing sample/deactivated assignments are never silently dropped.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-07-22
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- `listDrivers` now accepts `{ activeOnly?, excludeSamples? }`; default (no-arg) behavior is unchanged
- New Route page passes `excludeSamples: true` to its `listDrivers` call
- Edit Route page passes `excludeSamples: true` to its `listDrivers` call, while the separate "merge already-assigned drivers" fallback query (for deactivated/sample drivers already assigned to a route) is left untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Add excludeSamples opt to listDrivers and opt in the two route pickers** - `be99869b` (fix)

**Plan metadata:** (none — SUMMARY committed separately per orchestrator instructions)

## Files Created/Modified
- `apps/web/src/app/(owner)/actions/drivers.ts` - `listDrivers` signature extended with `excludeSamples?: boolean`; where clause adds conditional `isSample: false` spread
- `apps/web/src/app/(owner)/routes/new/page.tsx` - `listDrivers({ activeOnly: true })` → `listDrivers({ activeOnly: true, excludeSamples: true })`
- `apps/web/src/app/(owner)/routes/[id]/page.tsx` - `listDrivers({ activeOnly: true })` → `listDrivers({ activeOnly: true, excludeSamples: true })`

## Decisions Made
- Implemented `excludeSamples` as a conditional spread identical in shape to the existing `activeOnly` opt, guaranteeing the default (no-arg) call remains byte-for-byte `{ role: 'DRIVER' }` — verified `drivers/page.tsx` and `tags/page.tsx` still call `listDrivers()` with no args.
- Left the edit-page's "merge already-assigned drivers" `prisma.user.findMany({ where: { id: { in: missingIds }, role: 'DRIVER' } })` block completely unchanged — a route already assigned to a sample or deactivated driver must keep showing that driver in the dropdown; only NEW selection of sample drivers is blocked.

## Deviations from Plan

None - plan executed exactly as written. Note: `routes/new/page.tsx` already had a pre-existing client-side `.filter((d) => !d.isSample)` from quick-478 that is now redundant with the server-side `excludeSamples: true` filter; the plan's task scope was limited to exactly three edits and did not call for removing it, so it was left in place (harmless, not incorrect).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sample/demo drivers are now excluded from both New Route and Edit Route pickers at the server-action level.
- `apps/web/src/actions/routes.ts` confirmed zero-diff (`git diff --stat` empty).
- `npx tsc --noEmit` in apps/web: 0 errors (0 total, including the ~35-error baseline — appears already clean at time of this task).
- Not pushed, not deployed — orchestrator handles push/deploy after review.

---
*Phase: quick-479*
*Completed: 2026-07-22*
