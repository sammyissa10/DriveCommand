---
phase: quick-110
plan: 01
subsystem: ui
tags: [prisma, server-actions, fleet-messaging, driver-portal, next.js]

requires: []
provides:
  - Route-free fleet messaging for web driver portal
  - getDriverMessages queries across loads, routes, and unscoped messages
  - sendDriverMessage creates messages without requiring any route or load assignment
affects: [driver-portal, fleet-messaging]

tech-stack:
  added: []
  patterns:
    - "OR-clause message fetch: load-scoped OR route-scoped OR unscoped-by-sender"

key-files:
  created: []
  modified:
    - apps/web/src/app/(driver)/actions/driver-messages.ts
    - apps/web/src/components/driver/messaging-panel.tsx

key-decisions:
  - "Messages created with routeId: null and loadId: null — general unscoped messages visible to dispatch"
  - "getDriverMessages uses OR clause to surface legacy route-scoped and load-scoped messages in addition to new unscoped ones"
  - "FleetMessage local type updated with routeId and loadId as optional/nullable to match Prisma schema"

patterns-established: []

duration: 8min
completed: 2026-03-25
---

# Quick-110: Remove Route Requirement for Fleet Messaging Summary

**Route-free fleet messaging on web driver portal: drivers can send and view messages without an active route or load, aligned with mobile API (quick-102)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-25T00:00:00Z
- **Completed:** 2026-03-25T00:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed "No active route found" hard block from `sendDriverMessage` — any authenticated driver can now send fleet messages
- Rewrote `getDriverMessages` to use OR-clause fetch across load-scoped, route-scoped (legacy), and unscoped messages
- Updated `FleetMessage` type in `MessagingPanel` to make `routeId` and `loadId` optional/nullable
- TypeScript compiles cleanly with no errors

## Task Commits

1. **Tasks 1 + 2: Remove route requirement from server actions and update MessagingPanel type** - `b4ec1b4` (fix)

## Files Created/Modified
- `apps/web/src/app/(driver)/actions/driver-messages.ts` - Rewrote both server actions to be route/load independent
- `apps/web/src/components/driver/messaging-panel.tsx` - Updated local FleetMessage type (routeId/loadId now optional/nullable)

## Decisions Made
- Messages sent from web portal are now unscoped (no routeId, no loadId). This matches the "general message" concept from the mobile API and allows dispatch to see them in the owner portal.
- Legacy load-scoped and route-scoped messages still surface in `getDriverMessages` via OR clause — no data loss.
- `routeName: undefined` passed to the email notification helper since there is no route context; helper already supports this.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Web driver portal messaging is now fully aligned with the mobile API (quick-102)
- Owner portal dispatch messaging (if scoped) may also benefit from a similar audit, but is out of scope here
