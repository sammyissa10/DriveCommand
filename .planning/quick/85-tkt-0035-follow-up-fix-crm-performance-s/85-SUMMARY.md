---
phase: quick-85
plan: 01
subsystem: ui
tags: [crm, prisma, aggregate, performance-stats]

requires:
  - phase: quick-84
    provides: CRM customer detail page with Performance section (stale stored fields)

provides:
  - Live aggregate query computing Total Loads, Total Revenue, Last Load Date from INVOICED loads

affects: [crm, customer-detail]

tech-stack:
  added: []
  patterns:
    - "prisma.load.aggregate with Promise.all parallel fetch alongside primary entity query"

key-files:
  created: []
  modified:
    - src/app/(owner)/crm/[id]/page.tsx

key-decisions:
  - "Compute performance stats live via prisma.load.aggregate instead of relying on stored fields that were never backfilled"
  - "Filter aggregate to status: INVOICED only — matches the business definition of a completed load"
  - "Run customer findUnique and load.aggregate in parallel via Promise.all to avoid sequential awaits"

patterns-established:
  - "Parallel data fetching: Promise.all([prisma.entity.findUnique, prisma.related.aggregate]) for detail pages with computed stats"

duration: 3min
completed: 2026-03-19
---

# Quick Task 85: TKT-0035 Follow-up — Fix CRM Performance Stats

**Live prisma.load.aggregate replaces stale stored fields; Performance section now shows accurate Total Loads, Total Revenue, and Last Load Date from INVOICED loads**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-19T00:00:00Z
- **Completed:** 2026-03-19T00:03:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced `customer.totalLoads`, `customer.totalRevenue`, `customer.lastLoadDate` (stale, never backfilled) with a live `prisma.load.aggregate` query
- Customer findUnique and load aggregate now run in parallel via `Promise.all`, avoiding sequential awaits
- Aggregate filters to `status: 'INVOICED'` so only completed loads count toward revenue and load totals
- Existing customers with historical loads now display accurate stats instead of zeros

## Task Commits

1. **Task 1: Replace stored performance fields with live aggregate query** - `e13b9c4` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/app/(owner)/crm/[id]/page.tsx` - Parallel Promise.all fetch; derived totalLoads/totalRevenue/lastLoadDate from aggregate result; Performance JSX updated to use local variables

## Decisions Made

- Compute stats live from Load table rather than attempting backfill migration — simpler, always accurate, no data integrity risk
- Use `_max.updatedAt` for Last Load date — `updatedAt` is set when a load transitions to INVOICED, making it a reliable proxy for load completion date

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CRM Performance section is now accurate for all customers
- No follow-up work needed; fix is self-contained

## Self-Check: PASSED

- `src/app/(owner)/crm/[id]/page.tsx` — FOUND
- commit `e13b9c4` — FOUND

---
*Phase: quick-85*
*Completed: 2026-03-19*
