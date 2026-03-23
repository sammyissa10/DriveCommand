---
phase: 31-driver-core-screens
plan: 01
subsystem: api
tags: [bearer-token, rest-api, prisma, mobile, driver-portal, aes-gcm, next-js]

requires:
  - phase: 30-mobile-auth-navigation
    provides: AES-256-GCM Bearer token issued by /api/auth/login, decrypt() function in session.ts

provides:
  - validateMobileToken(req) utility shared by all /api/mobile/* endpoints
  - unauthorizedResponse() and forbiddenResponse() helpers
  - GET /api/mobile/driver/dashboard — activeLoad, stopsCompleted, hosHoursRemaining, todayMiles, recentAlerts
  - GET /api/mobile/driver/loads?status=active|history — filtered load list with customer
  - GET /api/mobile/driver/loads/[id] — load detail with stops (via route), truck, customer
  - POST /api/mobile/driver/loads/[id]/status — status transition enforcement with driverId ownership check

affects: [31-driver-core-screens plan 02 (mobile screens), 32-owner-portal, any future /api/mobile/* routes]

tech-stack:
  added: []
  patterns:
    - Bearer token validation: validateMobileToken() decrypts AES-256-GCM token, verifies DB user active in bypass_rls transaction
    - All mobile endpoints use prisma.$transaction with bypass_rls + TX_OPTIONS
    - Driver ownership enforced via load.driverId === auth.driverId (403 on mismatch)
    - Status transitions map mobile labels (ACCEPTED/EN_ROUTE) to DB enum (DISPATCHED/IN_TRANSIT)

key-files:
  created:
    - apps/web/src/lib/auth/mobile-auth.ts
    - apps/web/src/app/api/mobile/driver/dashboard/route.ts
    - apps/web/src/app/api/mobile/driver/loads/route.ts
    - apps/web/src/app/api/mobile/driver/loads/[id]/route.ts
    - apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
  modified: []

key-decisions:
  - "No separate Driver model — driverId on Load/RouteStop equals User.id for DRIVER role users; validateMobileToken sets ctx.driverId = user.id for DRIVER role"
  - "Driver-facing status labels (ACCEPTED, EN_ROUTE) map to DB enum values (DISPATCHED, IN_TRANSIT) inside the status endpoint — mobile app uses friendly names, DB stores canonical values"
  - "Load stops come through route.stops (RouteStop[] on Route model) not directly on Load — endpoint flattens to top-level stops array for mobile convenience"
  - "Customer model uses companyName not name — corrected from plan spec"

patterns-established:
  - "Mobile API pattern: validateMobileToken → check driverId → bypass_rls transaction → return data"
  - "Status mapping layer: mobile labels translated to DB enum inside POST /status, enabling schema-agnostic mobile API contract"

duration: 3min
completed: 2026-03-23
---

# Phase 31 Plan 01: Driver REST API Endpoints Summary

**5-file mobile REST API layer: Bearer token validator utility + 4 driver endpoints (dashboard, loads list, load detail, status update) with full ownership enforcement and status transition validation**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-23T03:50:13Z
- **Completed:** 2026-03-23T03:53:14Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `validateMobileToken()` utility reuses existing AES-256-GCM decrypt() — no new JWT library needed, same token issued by login endpoint
- Dashboard endpoint queries active load + today's completed stops in a single bypass_rls transaction
- Status update endpoint enforces PENDING→ACCEPTED→EN_ROUTE→DELIVERED progression with 400 on invalid transitions and 403 on unauthorized access

## Task Commits

1. **Task 1: Create Bearer token validator utility** - `cbaf958` (feat)
2. **Task 2: Create dashboard and loads list REST endpoints** - `812952d` (feat)
3. **Task 3: Create load detail and status update REST endpoints** - `564a54d` (feat)

## Files Created/Modified

- `apps/web/src/lib/auth/mobile-auth.ts` — validateMobileToken, unauthorizedResponse, forbiddenResponse helpers
- `apps/web/src/app/api/mobile/driver/dashboard/route.ts` — dashboard data endpoint
- `apps/web/src/app/api/mobile/driver/loads/route.ts` — loads list with active/history filter
- `apps/web/src/app/api/mobile/driver/loads/[id]/route.ts` — load detail with stops via route
- `apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts` — status transition endpoint

## Decisions Made

- Reused existing AES-256-GCM decrypt() from session.ts for Bearer token validation — avoids adding a JWT library, consistent with Phase 30 auth approach
- Driver-facing status labels (ACCEPTED, EN_ROUTE) map to DB enum (DISPATCHED, IN_TRANSIT) inside the API — mobile app gets clean progressive labels independent of DB naming
- Load stops surfaced via `route.stops` since RouteStop belongs to Route, not Load — endpoint flattens for mobile convenience

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Status names ACCEPTED/EN_ROUTE don't exist in LoadStatus enum**
- **Found during:** Task 3 (status update endpoint)
- **Issue:** Plan specified status progression PENDING→ACCEPTED→EN_ROUTE→DELIVERED, but DB LoadStatus enum has PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED, INVOICED, CANCELLED — no ACCEPTED or EN_ROUTE
- **Fix:** Status update endpoint accepts mobile-friendly labels (ACCEPTED, EN_ROUTE) and translates to DB values (DISPATCHED, IN_TRANSIT) via a DRIVER_STATUS_TO_DB mapping. VALID_TRANSITIONS enforces correct progression from each DB state
- **Files modified:** apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
- **Verification:** TypeScript compiles clean; transition logic tested via code review
- **Committed in:** 564a54d (Task 3 commit)

**2. [Rule 1 - Bug] Customer model uses companyName not name**
- **Found during:** Task 2 (dashboard + loads list endpoints)
- **Issue:** Plan spec said include customer name — attempted `select: { id: true, name: true }` but Customer model has `companyName` not `name`
- **Fix:** Changed to `companyName` in all customer select clauses
- **Files modified:** dashboard/route.ts, loads/route.ts
- **Verification:** TypeScript compilation error resolved after fix
- **Committed in:** 812952d (Task 2 commit)

**3. [Rule 1 - Bug] Load stops come through Route relation, not directly on Load**
- **Found during:** Task 3 (load detail endpoint)
- **Issue:** Plan said "Query load by ID with Prisma includes: stops (RouteStop[]...)" but RouteStop belongs to Route, not Load. Load has a routeId FK to Route
- **Fix:** Load detail includes route.stops (ordered by position ASC), then flattens stops to top-level in the response JSON for mobile convenience
- **Files modified:** apps/web/src/app/api/mobile/driver/loads/[id]/route.ts
- **Verification:** TypeScript compiles clean; Prisma include structure matches schema
- **Committed in:** 564a54d (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 schema/model discrepancies between plan spec and actual DB)
**Impact on plan:** All fixes necessary for correctness. No scope creep. API contract for mobile app (plan 31-02) is cleaner as a result.

## Issues Encountered

None beyond the auto-fixed schema discrepancies above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 REST endpoints ready for the mobile screens (plan 31-02)
- Status update contract: mobile sends `{ status: "ACCEPTED" | "EN_ROUTE" | "DELIVERED" }` — plan 31-02 screens must use these labels
- Load detail response has top-level `stops[]` array (from route.stops) — mobile timeline component reads this directly

---
*Phase: 31-driver-core-screens*
*Completed: 2026-03-23*
