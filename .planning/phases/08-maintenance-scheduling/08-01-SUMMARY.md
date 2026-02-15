---
phase: 08-maintenance-scheduling
plan: 01
subsystem: database
tags: [prisma, rls, zod, maintenance, dual-trigger, server-actions]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Prisma schema structure, RLS pattern, tenant-scoped client"
  - phase: 02-auth
    provides: "requireRole authorization pattern"
  - phase: 03-truck-management
    provides: "Truck model with odometer field"
provides:
  - MaintenanceEvent and ScheduledService Prisma models with RLS
  - Dual-trigger calculation utility (whichever comes first: days or miles)
  - 6 server actions for maintenance CRUD with OWNER/MANAGER authorization
  - Zod schemas with "at least one trigger" validation
affects: [08-02-maintenance-ui, future-reporting, future-reminders]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-trigger scheduling (intervalDays OR intervalMiles, whichever comes first)"
    - "Date.setDate() for date math (avoids DST bugs vs millisecond arithmetic)"
    - "calculateNextDue utility augments server action responses with due status"

key-files:
  created:
    - prisma/migrations/20260214000005_add_maintenance_models/migration.sql
    - src/lib/validations/maintenance.schemas.ts
    - src/lib/utils/maintenance-utils.ts
    - src/app/(owner)/actions/maintenance.ts
  modified:
    - prisma/schema.prisma

key-decisions:
  - "@ts-ignore for Prisma 7 withTenantRLS extension - follows existing pattern from Phase 03"
  - "calculateNextDue uses Date.setDate() not millisecond math - avoids DST bugs per research"
  - "Zod .refine() enforces at least one trigger - prevents invalid schedules at validation layer"
  - "listScheduledServices augments results with dueStatus - UI gets computed isDue flag"
  - "Empty form fields converted to null for optional fields (cost, provider, notes, intervals)"

patterns-established:
  - "Pattern: Dual-trigger validation at Zod schema level with .refine() for cross-field constraints"
  - "Pattern: Server action augments query results with computed fields (calculateNextDue)"
  - "Pattern: Date manipulation uses setDate() for DST safety, not millisecond arithmetic"

# Metrics
duration: 5.1min
completed: 2026-02-15
---

# Phase 08 Plan 01: Maintenance Data Layer Summary

**Complete maintenance tracking foundation: MaintenanceEvent history log, ScheduledService with dual-trigger due calculation, and 6 server actions with RLS enforcement**

## Performance

- **Duration:** 5.1 min (307 seconds)
- **Started:** 2026-02-15T01:06:51Z
- **Completed:** 2026-02-15T01:11:58Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Two Prisma models (MaintenanceEvent for immutable history, ScheduledService for mutable plans) with full RLS setup
- Dual-trigger due status calculation utility that correctly handles "whichever comes first" logic
- Six server actions (create/list/delete for both models) with OWNER/MANAGER authorization enforcement
- Zod validation with cross-field constraint (at least one interval required)

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma models + migration with RLS** - `e3a1058` (feat)
2. **Task 2: Zod schemas + calculateNextDue utility + server actions** - `acb3ed2` (feat)

## Files Created/Modified

**Created:**
- `prisma/migrations/20260214000005_add_maintenance_models/migration.sql` - Database tables for MaintenanceEvent and ScheduledService with full RLS policies (tenant_isolation_policy, bypass_rls_policy)
- `src/lib/validations/maintenance.schemas.ts` - Zod schemas with "at least one trigger" validation for scheduled services
- `src/lib/utils/maintenance-utils.ts` - calculateNextDue function using Date.setDate() to avoid DST bugs
- `src/app/(owner)/actions/maintenance.ts` - Six server actions following requireRole → getTenantPrisma pattern

**Modified:**
- `prisma/schema.prisma` - Added MaintenanceEvent and ScheduledService models, reverse relations to Tenant and Truck

## Decisions Made

**@ts-ignore for Prisma 7 withTenantRLS extension type issue** - Extended Prisma client doesn't properly infer new model types. Followed existing pattern from Phase 03 (truck.repository.ts, document.repository.ts) using @ts-ignore comments with explanation.

**calculateNextDue uses Date.setDate() not millisecond math** - Per research (08-RESEARCH.md), DST transitions cause bugs with millisecond-based date arithmetic. Using setDate() method ensures correct day count across DST boundaries.

**Zod .refine() enforces at least one trigger** - Business rule validation at schema level prevents invalid schedules (neither intervalDays nor intervalMiles set). Error shown on intervalDays field for UX clarity.

**listScheduledServices augments results with dueStatus** - Server action computes isDue, isDueByDate, isDueByMileage for each schedule before returning to UI. UI components get pre-calculated boolean flags instead of raw intervals.

**Empty form fields converted to null for optional fields** - FormData returns empty strings for unfilled inputs. Used ternary pattern: `formData.get('cost') ? ... : null` for cost, provider, notes, intervalDays, intervalMiles.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Prisma client regeneration required** - After adding models to schema, TypeScript showed "Property 'maintenanceEvent' does not exist" errors. Fixed by running `npx prisma generate` to regenerate client with new models. This is expected behavior (not a deviation) - Prisma client must be regenerated after schema changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 08 Plan 02 (Maintenance UI):**
- Server actions available for form submission (createMaintenanceEvent, createScheduledService)
- List actions return properly typed data (listMaintenanceEvents with history, listScheduledServices with augmented dueStatus)
- Delete actions handle optimistic UI updates
- DueStatus interface exported for TypeScript type safety in UI components

**Foundation for future reminder system:**
- calculateNextDue provides isDue boolean for filtering overdue services
- Dual-trigger logic handles both time-based (intervalDays) and mileage-based (intervalMiles) schedules
- nextDueDate and nextDueMileage fields enable "X days until due" and "Y miles until due" display

## Self-Check: PASSED

**Created files verified:**
- prisma/migrations/20260214000005_add_maintenance_models/migration.sql - FOUND
- src/lib/validations/maintenance.schemas.ts - FOUND
- src/lib/utils/maintenance-utils.ts - FOUND
- src/app/(owner)/actions/maintenance.ts - FOUND

**Commits verified:**
- e3a1058 (Task 1) - FOUND
- acb3ed2 (Task 2) - FOUND

All claims in summary verified against actual codebase state.

---
*Phase: 08-maintenance-scheduling*
*Completed: 2026-02-15*
