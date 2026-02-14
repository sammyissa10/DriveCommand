---
phase: 05-route-management
plan: 01
subsystem: database
tags: [prisma, rls, zod, state-machine, timezone, intl]

# Dependency graph
requires:
  - phase: 03-truck-management
    provides: Truck model with tenant isolation
  - phase: 04-driver-management
    provides: User model with driver role and isActive flag
  - phase: 01-foundation
    provides: RLS pattern and tenant context utilities
provides:
  - Route model with foreign keys to User (driver) and Truck
  - RouteStatus enum with state machine validation
  - Timezone-aware date formatting using Intl.DateTimeFormat
  - Six route server actions with authorization and business rule validation
affects: [06-document-upload, 07-route-ui, 09-maintenance-reminders]

# Tech tracking
tech-stack:
  added: []
  patterns: [state-machine-transitions, timezone-aware-dates, business-rule-validation]

key-files:
  created:
    - prisma/schema.prisma (Route model, RouteStatus enum)
    - prisma/migrations/20260214000003_add_route_model/migration.sql
    - src/lib/validations/route.schemas.ts
    - src/lib/utils/date.ts
    - src/app/(owner)/actions/routes.ts
  modified:
    - prisma/schema.prisma (added reverse relations on Tenant, User, Truck)

key-decisions:
  - "RouteStatus enum enforces three-state lifecycle (PLANNED, IN_PROGRESS, COMPLETED) at database level"
  - "State machine with VALID_TRANSITIONS prevents invalid status changes (e.g., COMPLETED cannot transition back)"
  - "completedAt timestamp automatically set when route transitions to COMPLETED status"
  - "scheduledDate validated as string (not z.string().datetime()) because HTML datetime-local sends 'YYYY-MM-DDTHH:mm' without timezone offset"
  - "Date utilities use Intl.DateTimeFormat (no external libraries) for timezone-aware formatting to avoid hydration mismatches"
  - "Business rule validation before route creation: driver must be active, have DRIVER role, and truck must exist"
  - "Both OWNER and MANAGER can manage routes, but DRIVER can only view (list and get actions)"

patterns-established:
  - "State machine pattern: Define valid transitions in const object, validate before status updates"
  - "Timezone-aware dates: Use Intl.DateTimeFormat with tenant timezone for formatting, store as TIMESTAMPTZ in database"
  - "Business rule validation: Validate related entities (driver active, truck exists) before creating associations"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 5 Plan 1: Route Data Model Summary

**Route model with state machine status transitions, timezone-aware date formatting via Intl.DateTimeFormat, and six server actions enforcing driver/truck validation**

## Performance

- **Duration:** 3 min 3 sec
- **Started:** 2026-02-14T22:12:53Z
- **Completed:** 2026-02-14T22:15:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Route model with foreign keys to User (driver) and Truck, RLS policies for tenant isolation
- RouteStatus enum with state machine preventing invalid transitions (PLANNED→IN_PROGRESS→COMPLETED)
- Timezone-aware date formatting utilities using built-in Intl.DateTimeFormat (no external dependencies)
- Six server actions with authorization, business rule validation, and efficient related data fetching

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Route model with RouteStatus enum and RLS policies** - `08a8c06` (feat)
2. **Task 2: Create Zod schemas, date utilities, and route server actions** - `a521ab8` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added Route model with RouteStatus enum, foreign keys to User and Truck, reverse relations on Tenant/User/Truck
- `prisma/migrations/20260214000003_add_route_model/migration.sql` - CREATE TABLE with RLS policies, indexes, and foreign key constraints
- `src/lib/validations/route.schemas.ts` - Zod schemas for route create/update with validation for origin, destination, scheduledDate, driverId, truckId, notes
- `src/lib/utils/date.ts` - Timezone-aware date formatting utilities (formatDateInTenantTimezone, formatForDatetimeInput) using Intl.DateTimeFormat
- `src/app/(owner)/actions/routes.ts` - Six server actions (create, update, updateStatus, delete, list, get) with authorization, business rule validation, and state machine enforcement

## Decisions Made

1. **RouteStatus enum at database level** - Enforces three-state lifecycle (PLANNED, IN_PROGRESS, COMPLETED) with database-level type safety, preventing invalid status values.

2. **State machine with VALID_TRANSITIONS** - Defines allowed transitions in const object (`PLANNED -> IN_PROGRESS`, `IN_PROGRESS -> COMPLETED`). Prevents invalid transitions like COMPLETED→PLANNED or PLANNED→COMPLETED (skipping IN_PROGRESS).

3. **Automatic completedAt on COMPLETED transition** - When route status changes to COMPLETED, completedAt timestamp is automatically set. This creates an audit trail for route completion time.

4. **scheduledDate as string in Zod schema** - HTML datetime-local input sends "YYYY-MM-DDTHH:mm" format without timezone offset (not full ISO 8601). Validated as non-empty string, converted to Date in server action using `new Date(scheduledDate)`.

5. **Intl.DateTimeFormat for timezone-aware dates** - Uses built-in browser/Node API instead of external libraries (moment, date-fns, luxon). Formats dates in tenant timezone to avoid hydration mismatches between server and client.

6. **Business rule validation before creation** - createRoute validates driver is active (`isActive: true`), has DRIVER role, and truck exists before creating route. Returns field-level errors if validation fails.

7. **Role-based action authorization** - OWNER/MANAGER can create, update, delete routes. All roles (including DRIVER) can list and get routes for viewing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 5 Plan 2 (Route UI):**
- Route data model complete with all CRUD operations
- Server actions provide full route management API
- Date utilities ready for UI date formatting in tenant timezone
- State machine enforces valid status transitions for UI status badges

**Blockers:** None

**Considerations for next plan:**
- Route list page will need driver and truck select dropdowns (populated from listDrivers and listTrucks actions)
- Route detail page will display formatted dates using formatDateInTenantTimezone with tenant timezone from Tenant model
- Status update UI should only show valid next states based on VALID_TRANSITIONS (e.g., PLANNED route shows "Start Route" button, not "Complete Route")

## Self-Check

**Files verification:**
- FOUND: prisma/schema.prisma
- FOUND: prisma/migrations/20260214000003_add_route_model/migration.sql
- FOUND: src/lib/validations/route.schemas.ts
- FOUND: src/lib/utils/date.ts
- FOUND: src/app/(owner)/actions/routes.ts

**Commits verification:**
- FOUND: 08a8c06 (Task 1)
- FOUND: a521ab8 (Task 2)

**Self-Check: PASSED**

---
*Phase: 05-route-management*
*Completed: 2026-02-14*
