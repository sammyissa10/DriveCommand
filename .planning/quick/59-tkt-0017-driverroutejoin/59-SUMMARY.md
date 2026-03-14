---
phase: quick-59
plan: 01
subsystem: database, ui, api
tags: [prisma, postgresql, react, nextjs, tailwind, decimal, server-actions, zod]

# Dependency graph
requires: []
provides:
  - DriverRouteJoin Prisma model with DriverPaymentMethod enum
  - CRUD server actions for driver-route join records
  - Route detail page: Driver Assignments section with add/edit/delete
  - Driver detail page: Route Assignments section with read + delete
affects: [payroll, dispatch, route-management, driver-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-method null logic for monetary fields: only persist fields relevant to the active paymentMethod, null others"
    - "Controlled form state (useState) for checkbox + select fields alongside server action submission"
    - "router.refresh() after server action success to rehydrate server component data"

key-files:
  created:
    - prisma/schema.prisma (DriverPaymentMethod enum + DriverRouteJoin model + back-relations)
    - src/lib/validations/driver-route-join.schemas.ts
    - src/app/(owner)/actions/driver-route-joins.ts
    - src/app/(owner)/routes/[id]/driver-assignments-section.tsx
    - src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx
  modified:
    - src/app/(owner)/routes/[id]/page.tsx
    - src/app/(owner)/routes/[id]/route-page-client.tsx
    - src/app/(owner)/drivers/[id]/page.tsx

key-decisions:
  - "Hard delete (not soft delete) for DriverRouteJoin — no deletedAt field; confirmed no soft-delete requirement"
  - "Controlled useState form instead of useActionState for the assignment form — allows dynamic checkbox + payment method select without requiring form re-mount"
  - "Per-method null logic enforced at server action level, not just schema level — fields irrelevant to the chosen method are explicitly set to null on create and update"

patterns-established:
  - "Payment method conditional fields: show/hide via useState paymentMethod, submit all fields but server sets irrelevant ones to null"
  - "Route detail drivers prop extended to include email for assignment form driver display"

# Metrics
duration: 6min
completed: 2026-03-14
---

# Quick Task 59: TKT-0017 DriverRouteJoin Summary

**DriverRouteJoin rich join table with FIXED_AMOUNT/HOURLY/PER_MILE payment methods, full CRUD on route detail page, read+delete on driver detail page**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-14T05:08:51Z
- **Completed:** 2026-03-14T05:15:06Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added `DriverRouteJoin` Prisma model and `DriverPaymentMethod` enum; schema pushed to DB and Prisma client regenerated
- Route detail page now shows a Driver Assignments section with inline add/edit/delete forms, payment method conditional fields, Main Driver badge, and computed totals
- Driver detail page now shows a Route Assignments section with route links, status badges, payment summaries, and delete capability

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema + Server Actions** - `b9fd958` (feat)
2. **Task 2: Route Detail Page — Driver Assignments Section** - `ca056fb` (feat)
3. **Task 3: Driver Detail Page — Route Assignments Section** - `5efaf2b` (feat)

## Files Created/Modified

- `prisma/schema.prisma` - Added DriverPaymentMethod enum, DriverRouteJoin model, back-relations on Tenant/Route/User
- `src/lib/validations/driver-route-join.schemas.ts` - Zod create/update schemas with superRefine per-method validation
- `src/app/(owner)/actions/driver-route-joins.ts` - Five server actions: listByRoute, listByDriver, create, update, delete
- `src/app/(owner)/routes/[id]/driver-assignments-section.tsx` - Route-scoped add/edit/delete UI component
- `src/app/(owner)/routes/[id]/page.tsx` - Added listDriverRouteJoinsByRoute to Promise.all; passes driverAssignments to client
- `src/app/(owner)/routes/[id]/route-page-client.tsx` - Added driverAssignments prop; added email to drivers type; renders DriverAssignmentsSection in both view/edit modes
- `src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx` - Driver-scoped read+delete UI component
- `src/app/(owner)/drivers/[id]/page.tsx` - Added listDriverRouteJoinsByDriver to Promise.all; renders DriverRouteAssignmentsSection

## Decisions Made
- **Hard delete**: DriverRouteJoin has no `deletedAt` field, so plain `delete` is used (no soft delete)
- **Controlled form state**: Used `useState` for checkbox and payment method select rather than uncontrolled `useActionState` to allow dynamic conditional field rendering
- **Per-method null logic at server level**: Monetary fields outside the selected payment method are explicitly set to `null` on every create/update, preventing stale data

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- Prisma client was not auto-regenerated after `db push` (custom output path `src/generated/prisma`). Ran `npx prisma generate` explicitly. TypeScript errors resolved immediately.

## User Setup Required

None — no external service configuration required.

## Self-Check: PASSED

All created files verified present on disk. All task commits verified in git log.

## Next Phase Readiness
- DriverRouteJoin is ready for use in payroll computation (link join records to PayrollRecord)
- Route detail page driver assignments section is live alongside expenses and payments sections
- Driver detail page shows full route assignment history with payment details
