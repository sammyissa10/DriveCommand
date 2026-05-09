---
phase: 43-workflow-engine-2-execution
plan: "05"
subsystem: ui, api
tags: [workflows, checklists, playbook-instances, mobile-api, dispatch-ready, driver, truck, crm]

# Dependency graph
requires:
  - phase: 43-03
    provides: completeStep + skipStep services, PlaybookInstance model, StepInstance model
  - phase: 43-04
    provides: /checklists/instances/[id] detail page that profile links resolve to

provides:
  - Driver profile page with Checklists section + isDispatchReady badge
  - Truck profile page with Checklists section
  - CRM/Customer profile page with Checklists section
  - GET /api/mobile/driver/tasks endpoint (open StepInstances for authenticated driver)
  - POST /api/mobile/driver/tasks/[id]/complete endpoint
  - POST /api/mobile/driver/tasks/[id]/skip endpoint
  - fireEvent TODO markers at driver/truck/customer create lifecycle points

affects:
  - 43-06 (My Tasks mobile screen — calls the task endpoints built here)
  - 44 (fireEvent implementation — uses the TODO markers added here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline StatusBadge helper component per page (avoids shared import complexity for simple display)"
    - "Non-blocking Prisma fetch with .catch(() => []) for checklist data in profile pages"
    - "URL path parsing for dynamic route ID in mobile API (withMobileAuth does not forward params)"

key-files:
  created:
    - apps/web/src/app/api/mobile/driver/tasks/route.ts
    - apps/web/src/app/api/mobile/driver/tasks/[id]/complete/route.ts
    - apps/web/src/app/api/mobile/driver/tasks/[id]/skip/route.ts
  modified:
    - apps/web/src/app/(owner)/drivers/[id]/page.tsx
    - apps/web/src/app/(owner)/trucks/[id]/page.tsx
    - apps/web/src/app/(owner)/crm/[id]/page.tsx
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/(owner)/actions/trucks.ts
    - apps/web/src/app/(owner)/actions/customers.ts

key-decisions:
  - "isDispatchReady badge is display-only in Phase 43 — no enforcement, no gating"
  - "fireEvent TODO added to inviteDriver (not accept-invitation route) because drivers action file is the owner-facing create lifecycle point"
  - "URL path parsing used for [id] extraction in mobile routes because withMobileAuth wrapper doesn't forward Next.js route params"
  - "StatusBadge helper added inline to each profile page rather than as a shared component (avoids premature abstraction)"

patterns-established:
  - "Mobile DRIVER-gated routes: withMobileAuth({ allowedRoles: ['DRIVER'] })"
  - "Profile pages load checklist instances with non-blocking catch fallback"

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 43 Plan 05: Profile Checklists Integration + Mobile Task API Summary

**Driver/Truck/CRM profiles gain Checklists sections showing linked PlaybookInstances with status badges; driver profile surfaces isDispatchReady badge; three mobile REST endpoints provide task fetch, complete, and skip for Plan 06's My Tasks screen**

## Performance

- **Duration:** 5 min (281s)
- **Started:** 2026-04-24T16:10:17Z
- **Completed:** 2026-04-24T16:15:00Z
- **Tasks:** 2 of 2
- **Files modified:** 9

## Accomplishments
- Driver profile shows Checklists section with status badge + completion % + link to detail; isDispatchReady badge (green/red) displayed next to driver name when active instances exist
- Truck and CRM/Customer profiles get the same Checklists section pattern using VEHICLE and PARTNER entityType filters
- Three mobile REST endpoints provide the task surface Plan 06's My Tasks tab needs: GET list, POST complete, POST skip — all using withMobileAuth DRIVER gating and delegating to existing service layer
- fireEvent TODO(phase-44) markers added to all three create lifecycle points (inviteDriver, createTruck, createCustomer)

## Task Commits

1. **Task 1: Add Checklists sections to Driver, Truck, and CRM profile pages + fireEvent TODOs** - `4b99955` (feat)
2. **Task 2: Create mobile REST API endpoints for driver task list + complete + skip** - `c212d23` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/app/(owner)/drivers/[id]/page.tsx` — Added Checklists section with isDispatchReady badge and DRIVER instance query
- `apps/web/src/app/(owner)/trucks/[id]/page.tsx` — Added Checklists section with VEHICLE instance query
- `apps/web/src/app/(owner)/crm/[id]/page.tsx` — Added Checklists section with PARTNER instance query
- `apps/web/src/app/(owner)/actions/drivers.ts` — Added TODO(phase-44) fireEvent comment after driverInvitation.create
- `apps/web/src/app/(owner)/actions/trucks.ts` — Added TODO(phase-44) fireEvent comment after truck.create
- `apps/web/src/app/(owner)/actions/customers.ts` — Added TODO(phase-44) fireEvent comment after customer.create
- `apps/web/src/app/api/mobile/driver/tasks/route.ts` — GET endpoint returning open StepInstances for authenticated driver
- `apps/web/src/app/api/mobile/driver/tasks/[id]/complete/route.ts` — POST endpoint calling completeStep service
- `apps/web/src/app/api/mobile/driver/tasks/[id]/skip/route.ts` — POST endpoint calling skipStep service

## Decisions Made
- isDispatchReady badge is display-only in Phase 43 — shown next to driver name when `instances.length > 0`, green if true, red if false
- fireEvent TODO placed in `inviteDriver` (drivers.ts) rather than `accept-invitation/route.ts` because the spec says driver create action; the invitation record is the owner-side lifecycle point
- URL path parsing (`req.url.split('/').indexOf(...)`) used for dynamic [id] extraction in mobile routes since `withMobileAuth` doesn't expose Next.js route params
- StatusBadge helper duplicated inline per page rather than extracted as a shared component (avoids import complexity for a 10-line helper)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 06 (My Tasks mobile screen) can now call GET /api/mobile/driver/tasks, POST complete, POST skip
- Profile pages are ready to show checklist data once instances are created via Plan 02/03 flows
- Phase 44 can implement fireEvent() at the three TODO markers in action files

---
*Phase: 43-workflow-engine-2-execution*
*Completed: 2026-04-24*
