---
phase: 32-driver-hos-incidents
plan: 02
subsystem: api
tags: [hos, rest-api, prisma, mobile, api-client, typescript]

# Dependency graph
requires:
  - phase: 32-01
    provides: DriverHOSEntry + DriverIncident Prisma models, HOSDutyStatus enum, HOSData + CreateIncidentPayload types

provides:
  - GET /api/mobile/driver/hos — today's HOS entries with 14h/11h clock calculations
  - POST /api/mobile/driver/hos — status change endpoint (closes open entry, creates new)
  - driverApi.getHOS, updateHOSStatus, createIncident methods in api-client
  - HOSData, HOSEntry, HOSStatus, IncidentCategory, IncidentSeverity re-exported from api-client

affects: [32-03-hos-screen, 32-04-incidents, mobile-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HOS clock math: sum DRIVING/ON_DUTY durations for today, 14h window from first non-rest entry"
    - "Duplicate-status guard: transaction returns null → 400 outside transaction"
    - "Packages with expo/tsconfig.base inheritance need standalone tsconfig (module: CommonJS, moduleResolution: node)"

key-files:
  created:
    - apps/web/src/app/api/mobile/driver/hos/route.ts
  modified:
    - packages/api-client/src/driver.ts
    - packages/api-client/tsconfig.json
    - packages/types/tsconfig.json

key-decisions:
  - "Clock calculations use today's UTC boundaries (setUTCHours) — open entry (endTime=null) uses now as effective end"
  - "14h window starts from first non-OFF_DUTY/non-SLEEPER_BERTH entry, not midnight"
  - "Duplicate status check happens inside transaction, returns null to signal 400 outside transaction scope"
  - "Fixed packages/types and packages/api-client tsconfigs: removed expo/tsconfig.base inheritance which prevented dist emit"

patterns-established:
  - "Mobile HOS endpoint: same validateMobileToken + RLS bypass pattern as loads/route.ts"
  - "packages/api-client re-exports types from @drivecommand/types for single import point in mobile app"

# Metrics
duration: 12min
completed: 2026-03-23
---

# Phase 32 Plan 02: HOS REST Endpoints Summary

**GET + POST /api/mobile/driver/hos with 14h/11h HOS clock calculations, plus driverApi.getHOS, updateHOSStatus, createIncident methods in api-client**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-23T04:58:13Z
- **Completed:** 2026-03-23T05:10:00Z
- **Tasks:** 3 (Tasks 1 + 2 in one file, Task 3 separately)
- **Files modified:** 4

## Accomplishments
- GET /api/mobile/driver/hos returns today's DriverHOSEntry records with calculated clocks (drivingMinutesToday, onDutyMinutesToday, hoursUntil14Limit, hoursUntil11DriveLimit, timeInCurrentStatus)
- POST /api/mobile/driver/hos closes the open entry, creates a new one, guards against duplicate status (400)
- api-client extended with getHOS, updateHOSStatus, createIncident + type re-exports for mobile consumption
- Fixed stale packages/types and packages/api-client dist by correcting tsconfig inheritance

## Task Commits

Each task was committed atomically:

1. **Tasks 1 + 2: GET + POST HOS endpoints** - `45f318e` (feat)
2. **Task 3: api-client HOS methods** - `4ad1989` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `apps/web/src/app/api/mobile/driver/hos/route.ts` - GET + POST handlers with clock math and RLS bypass
- `packages/api-client/src/driver.ts` - Added getHOS, updateHOSStatus, createIncident + type re-exports
- `packages/api-client/tsconfig.json` - Fixed: standalone tsconfig (removed expo inheritance)
- `packages/types/tsconfig.json` - Fixed: standalone tsconfig (removed expo inheritance)

## Decisions Made
- 14-hour window calculation uses first non-OFF_DUTY/non-SLEEPER_BERTH entry as window start, not midnight — matches FMCSA HOS rules more accurately
- Open entry (endTime = null) uses `now` as effective end time for duration math
- Duplicate status guard: transaction returns `null` (not thrown error) so the 400 response can be returned cleanly outside the transaction
- api-client re-exports all HOS/Incident types so mobile can `import { HOSData } from '@drivecommand/api-client'` without a separate types import

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed packages/types tsconfig preventing dist emit**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** `packages/types/tsconfig.json` extended `../../tsconfig.json` which inherits `"extends": "expo/tsconfig.base"`. The root tsconfig uses `moduleResolution: bundler` which silently skips emission. The `dist/` hadn't been rebuilt since new types (HOSData, CreateIncidentPayload) were added in Plan 01.
- **Fix:** Replaced with standalone tsconfig (target: ES2020, module: CommonJS, moduleResolution: node) to enable proper dist emission
- **Files modified:** packages/types/tsconfig.json
- **Verification:** `npx tsc` in packages/types now emits dist/ with all new types
- **Committed in:** 45f318e (Task 1+2 commit)

**2. [Rule 3 - Blocking] Fixed packages/api-client tsconfig preventing build**
- **Found during:** Task 3 (api-client build verification)
- **Issue:** Same expo/tsconfig.base inheritance pattern in api-client tsconfig
- **Fix:** Same standalone tsconfig fix as packages/types
- **Files modified:** packages/api-client/tsconfig.json
- **Verification:** `npx tsc` in packages/api-client emits dist/ with getHOS, updateHOSStatus, createIncident
- **Committed in:** 4ad1989 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both fixes were essential for TypeScript compilation. No scope creep — root cause was stale/broken tsconfig inheritance in shared packages.

## Issues Encountered
- The root `tsconfig.json` uses `moduleResolution: bundler` (for Expo/Next.js bundler compatibility) but shared packages need `moduleResolution: node` for CommonJS output. Future packages should use standalone tsconfigs from the start.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GET + POST HOS endpoints live and type-safe
- api-client methods ready for mobile HOS screen (Phase 32-03)
- createIncident method ready for incident reporting screen (Phase 32-04)
- No blockers

---
*Phase: 32-driver-hos-incidents*
*Completed: 2026-03-23*
