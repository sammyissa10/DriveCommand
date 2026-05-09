---
phase: 44-workflow-engine-3-inspection-mode
plan: "02"
subsystem: api
tags: [trpc, workflow-engine, inspection-mode, push-notifications, prisma, zod, validation]

# Dependency graph
requires:
  - phase: 44-workflow-engine-3-inspection-mode
    plan: "01"
    provides: VEHICLE_INSPECTION enum value + nullable StepInstance.stepTemplateId
  - phase: 43-workflow-engine-2-execution
    provides: completeStep service, stepInstance tRPC router, computeDispatchReadiness service
provides:
  - INSPECTION_ITEM pass flow through completeStep (passOrFail='pass' allowed)
  - failInspectionItem service (FAIL recording, ad-hoc APPROVAL step, blocking, push notifications)
  - failInspectionItemSchema and approveStepSchema in packages/validation
  - fail/requestApproval/approve tRPC procedures on stepInstanceRouter
affects:
  - 44-03 (REST endpoints for mobile — calls failInspectionItem service)
  - 44-04 (UI components — uses fail/approve tRPC procedures)
  - Any mobile or web code completing INSPECTION_ITEM steps

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INSPECTION_ITEM dual-path: pass via completeStep, fail via failInspectionItem — enforced by passOrFail guard"
    - "Ad-hoc step creation: stepTemplateId: null with inline stepSnapshot for mechanic APPROVAL steps"
    - "Best-effort notifications: push + PlatoookNotification log inside try/catch, never block main operation"

key-files:
  created:
    - apps/web/src/server/services/workflows/failInspectionItem.ts
  modified:
    - apps/web/src/server/services/workflows/completeStep.ts
    - apps/web/src/server/api/routers/workflows/stepInstance.ts
    - packages/validation/src/workflows/stepInstance.ts

key-decisions:
  - "INSPECTION_ITEM pass flows through completeStep; fail is redirected to failInspectionItem via USE_FAIL_ENDPOINT error — clean separation of concerns"
  - "Ad-hoc APPROVAL step created with stepTemplateId: null only when playbookCategory === VEHICLE_INSPECTION (spec Section 6.4 — not for every inspection fail)"
  - "MECHANIC role does not exist as a user role — OWNER/MANAGER dispatchers receive both STEP_FAILED and APPROVAL_NEEDED notifications"
  - "SMS delivery stubbed with TODO(phase-5) — Twilio not in scope for Phase 44"

patterns-established:
  - "Dual-path step completion: guard on input field (passOrFail) routes to correct endpoint"
  - "Ad-hoc step pattern: stepTemplateId: null + stepSnapshot with full inline config"
  - "Notification best-effort wrap: entire notify block in try/catch, errors logged but never propagated"

# Metrics
duration: 10min
completed: 2026-04-24
---

# Phase 44 Plan 02: INSPECTION_ITEM Execution Path Summary

**failInspectionItem service with VEHICLE_INSPECTION-gated mechanic APPROVAL step creation, instance blocking, dispatcher push notifications, and fail/requestApproval/approve tRPC procedures wired to stepInstance router**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-24T18:09:00Z
- **Completed:** 2026-04-24T18:15:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Fixed completeStep to allow `passOrFail='pass'` through for INSPECTION_ITEM steps (was blanket-rejecting all)
- Created `failInspectionItem.ts`: validates photo requirement from stepSnapshot, marks step FAILED, creates ad-hoc mechanic APPROVAL step (VEHICLE_INSPECTION only), blocks PlaybookInstance, fires STEP_FAILED + APPROVAL_NEEDED push notifications with PlaookNotification log entries, calls computeDispatchReadiness
- Added `failInspectionItemSchema` and `approveStepSchema` to packages/validation and rebuilt dist
- Wired `fail`, `requestApproval`, and `approve` tRPC procedures onto stepInstanceRouter

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix INSPECTION_ITEM pass bug + failInspectionItemSchema** - `861b473` (feat)
2. **Task 2: failInspectionItem service + tRPC fail/requestApproval/approve** - `05dbd2d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/server/services/workflows/failInspectionItem.ts` - Core fail service: photo validation, FAILED status update, ad-hoc APPROVAL step creation (VEHICLE_INSPECTION), instance blocking, dispatcher push notifications + PlaybookNotification log, computeDispatchReadiness call
- `apps/web/src/server/services/workflows/completeStep.ts` - Fixed INSPECTION_ITEM case: allow pass, reject fail with USE_FAIL_ENDPOINT; updated header comment
- `apps/web/src/server/api/routers/workflows/stepInstance.ts` - Added fail/requestApproval/approve procedures + updated imports (z, TRPCError, failInspectionItem, computeDispatchReadiness, sendPushToUser)
- `packages/validation/src/workflows/stepInstance.ts` - Added failInspectionItemSchema, FailInspectionItemInput, approveStepSchema, ApproveStepInput

## Decisions Made
- `passOrFail='pass'` flows through completeStep; `passOrFail='fail'` (or missing) throws USE_FAIL_ENDPOINT — clean enforcement without duplicating INSPECTION_ITEM logic
- Ad-hoc APPROVAL step only created when `playbookCategory === 'VEHICLE_INSPECTION'` per spec Section 6.4 — other inspection categories do not get mechanic steps
- No MECHANIC user role exists in the schema — both STEP_FAILED and APPROVAL_NEEDED notifications go to OWNER/MANAGER dispatchers
- SMS delivery left as TODO(phase-5) stubs — Twilio not in scope here

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- packages/validation `dist/` is gitignored (build artifact) — `npm run build` was run locally to make new exports available for tsc but not committed. This is the correct behavior for the monorepo.
- Pre-existing `.next/types/validator.ts` TypeScript error (deleted route `[stopId]/messages`) continues to appear — confirmed pre-existing from 44-01, unrelated to this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `failInspectionItem` service is complete and test-ready
- `stepInstance.fail`, `stepInstance.requestApproval`, `stepInstance.approve` tRPC procedures are exposed and ready for web UI consumption (Plan 04)
- REST endpoint wrappers for mobile (Plan 03) can now call `failInspectionItem` directly
- All TypeScript compiles cleanly (excluding pre-existing .next/types error)

---
*Phase: 44-workflow-engine-3-inspection-mode*
*Completed: 2026-04-24*
