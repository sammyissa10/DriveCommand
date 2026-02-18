---
phase: quick-6
plan: 01
subsystem: api
tags: [prisma, error-handling, nextjs, server-actions, try-catch]

# Dependency graph
requires: []
provides:
  - Error-safe createTruck and updateTruck server actions with P2002 VIN duplicate handling
  - Truck detail page that renders even when S3/document listing fails
  - Route new page driver/truck queries that degrade gracefully on DB errors
  - Route detail page document listing that does not crash the page on failure
  - Sorted driver/truck dropdowns (firstName asc, year desc) on all route forms
affects: [trucks, routes]

# Tech tracking
tech-stack:
  added: []
  patterns: [try-catch wrapping of DB operations with redirect outside, .catch on non-critical Promise.all slots]

key-files:
  created: []
  modified:
    - src/app/(owner)/actions/trucks.ts
    - src/app/(owner)/trucks/[id]/page.tsx
    - src/app/(owner)/routes/new/page.tsx
    - src/app/(owner)/routes/[id]/page.tsx

key-decisions:
  - "Keep revalidatePath/redirect outside try/catch blocks — Next.js redirect throws NEXT_REDIRECT internally and must not be caught"
  - "Handle Prisma P2002 unique constraint violation with field-level error for VIN duplicates, generic error for other constraint violations"
  - "Use .catch on listDocuments within Promise.all to isolate S3 failures without breaking other data fetches"
  - "Wrap edit-mode driver/truck queries in try/catch so route edit still renders with empty dropdowns if DB query fails"
  - "Add orderBy to driver (firstName asc) and truck (year desc) queries for consistent UX"

patterns-established:
  - "DB operation pattern: wrap prisma calls in try/catch, keep redirect/revalidatePath outside"
  - "Non-critical data pattern: use .catch on Promise.all slots for optional data (documents), use try/catch for whole query blocks"

# Metrics
duration: 2m 13s
completed: 2026-02-18
---

# Quick Task 6: Fix Truck Save/View Errors and Improve Route Driver Dropdown Summary

**Error-safe truck CRUD actions with P2002 VIN handling plus graceful degradation for document listing and route driver/truck queries**

## Performance

- **Duration:** 2m 13s
- **Started:** 2026-02-18T04:40:25Z
- **Completed:** 2026-02-18T04:42:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- createTruck and updateTruck now return user-friendly errors for duplicate VINs and other DB failures instead of throwing unhandled exceptions
- Truck detail page wraps listDocuments in try/catch so the page renders even when S3 is unavailable
- Route new page driver/truck queries now wrapped in try/catch with orderBy for sorted, graceful empty-state behavior
- Route detail edit mode driver/truck queries wrapped in try/catch with orderBy
- Route detail listDocuments uses .catch within Promise.all to isolate S3 failures from the rest of the data fetch

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix truck save and view errors with proper error handling** - `b7604f7` (fix)
2. **Task 2: Fix routes driver dropdown and add error resilience** - `ae7797b` (fix)

**Plan metadata:** (to be committed with this summary)

## Files Created/Modified
- `src/app/(owner)/actions/trucks.ts` - Added try/catch to createTruck and updateTruck with P2002 VIN duplicate detection; redirect/revalidatePath remain outside try/catch
- `src/app/(owner)/trucks/[id]/page.tsx` - Wrapped listDocuments in try/catch so truck detail page renders even if S3 fails
- `src/app/(owner)/routes/new/page.tsx` - Wrapped driver+truck queries in try/catch with orderBy; uses empty arrays as graceful fallback
- `src/app/(owner)/routes/[id]/page.tsx` - Wrapped edit-mode driver/truck queries in try/catch with orderBy; added .catch on listDocuments in Promise.all

## Decisions Made
- Keep `redirect()` and `revalidatePath()` outside try/catch blocks — Next.js redirect throws a special `NEXT_REDIRECT` error internally which must not be caught
- Return `{ error: { vin: [...] } }` (field-level) for P2002 VIN violations, generic string for other constraint violations
- Use `.catch` on `listDocuments` within `Promise.all` (not wrapping the whole Promise.all) to keep document failure isolated
- `requireRole()` auth errors intentionally not caught — those are security guards handled by the error boundary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Truck save flows are now production-safe with proper error feedback to users
- Route forms will load gracefully even if the DB returns no drivers or throws an error
- No blockers for next work
