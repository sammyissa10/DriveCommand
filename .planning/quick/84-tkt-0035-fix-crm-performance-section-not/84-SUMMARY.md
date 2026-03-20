---
phase: quick-84
plan: 01
subsystem: crm
tags: [prisma, crm, loads, revalidatePath, customer-stats]

requires:
  - phase: quick (CRM module)
    provides: Customer model with totalLoads, totalRevenue, lastLoadDate fields
provides:
  - Customer performance stats (totalLoads, totalRevenue, lastLoadDate) updated on INVOICED load transition
  - CRM customer detail page cache invalidation on invoicing
affects: [crm, loads]

tech-stack:
  added: []
  patterns:
    - "Fire-and-forget prisma update with .catch() for non-blocking side-effects"
    - "Hoist variable before try block to make it accessible in post-catch revalidatePath calls"

key-files:
  created: []
  modified:
    - src/app/(owner)/actions/loads.ts

key-decisions:
  - "Fire-and-forget pattern for customer stats update — never blocks the load status transition"
  - "Hoist invoicedCustomerId before try block to allow revalidatePath after catch block"

patterns-established:
  - "Post-transition side-effects use fire-and-forget with .catch() for error resilience"

duration: 5min
completed: 2026-03-19
---

# Quick Task 84: TKT-0035 Fix CRM Performance Section Not Updating Summary

**CRM customer stats (totalLoads, totalRevenue, lastLoadDate) now update via fire-and-forget prisma.customer.update when a load transitions to INVOICED, with cache invalidation for the CRM detail page.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-19T00:00:00Z
- **Completed:** 2026-03-19T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Expanded `findUnique` select in `updateLoadStatus` to include `customerId` and `rate`
- Added fire-and-forget `prisma.customer.update` on INVOICED transition incrementing `totalLoads` by 1, `totalRevenue` by `load.rate`, and setting `lastLoadDate` to now
- Hoisted `invoicedCustomerId` variable before try block to enable `revalidatePath` after the catch
- Added `revalidatePath('/crm/:id')` so the CRM customer detail page reflects updated stats immediately

## Task Commits

1. **Task 1: Update customer stats on INVOICED transition** - `caf2da3` (fix)

## Files Created/Modified
- `src/app/(owner)/actions/loads.ts` - Added customer stats update and CRM revalidatePath in updateLoadStatus

## Decisions Made
- Fire-and-forget pattern used (no await) so customer stats update never blocks or throws from the load status transition
- `invoicedCustomerId` hoisted to a `let` before the try block — the only safe way to access it for `revalidatePath` outside the catch, without restructuring the function

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- IDE flagged `invoicedCustomerId` as declared but never read after initial declaration — resolved by assigning it inside the try block and consuming it in the post-catch revalidatePath block.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CRM performance stats now stay in sync as loads are invoiced
- No further work needed for TKT-0035
