---
phase: 44-workflow-engine-3-inspection-mode
plan: "05"
subsystem: ui
tags: [trpc, workflows, checklist, dispatch-readiness, react, nextjs]

# Dependency graph
requires:
  - phase: 44-02
    provides: stepInstance.approve tRPC procedure and ApproveDialog pattern reference (SkipDialog)
provides:
  - ApproveDialog component in ChecklistDetailClient for APPROVAL-type mechanic sign-off steps
  - isDispatchReady badge on truck profile page header
affects: [44-06, checklist-detail-ui, truck-profile-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "APPROVAL step detection via stepSnapshot.stepType field cast from StepSnap"
    - "isDispatchReady badge gated on truckInstances.length > 0 (same pattern as driver page)"

key-files:
  created: []
  modified:
    - apps/web/src/app/(owner)/checklists/instances/[id]/_components/ChecklistDetailClient.tsx
    - apps/web/src/app/(owner)/trucks/[id]/page.tsx

key-decisions:
  - "Show View Details button only for non-APPROVAL NOT_STARTED steps; APPROVAL steps show Approve button instead"
  - "Truck page uses (truck as any).isDispatchReady because getTruck returns all scalars via include (type inference doesn't expose it directly)"

patterns-established:
  - "ApproveDialog: modeled on SkipDialog — same Dialog+form+useMutation+onSuccess pattern, note optional, no required field"
  - "isApprovalStep: read from (step.stepSnapshot as StepSnap).stepType === 'APPROVAL'"

# Metrics
duration: 2min
completed: 2026-04-24
---

# Phase 44 Plan 05: Approval UI + Truck Dispatch Badge Summary

**ApproveDialog in ChecklistDetailClient for APPROVAL-type mechanic sign-off steps, and isDispatchReady badge on truck profile page header**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-24T18:44:09Z
- **Completed:** 2026-04-24T18:46:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added ApproveDialog component modeled on SkipDialog, calling trpc.workflows.stepInstance.approve with optional note
- Added approve dialog state and handleApproved query invalidation to ChecklistDetailClient
- Added isApprovalStep detection in StepRow using stepSnapshot.stepType
- APPROVAL-type steps with NOT_STARTED status render an Approve button (emerald) instead of View Details
- Threaded onApprove prop through PhaseSectionProps -> PhaseSection -> StepRow
- Added Dispatch Ready / Not Dispatch Ready badge to truck profile header, gated on truckInstances.length > 0

## Task Commits

Each task was committed atomically:

1. **Task 1: ApproveDialog + isDispatchReady badge** - `4cb1c3c` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `apps/web/src/app/(owner)/checklists/instances/[id]/_components/ChecklistDetailClient.tsx` - Added ApproveDialog, approve state, isApprovalStep detection, Approve button in StepRow
- `apps/web/src/app/(owner)/trucks/[id]/page.tsx` - Added isDispatchReady badge in truck header

## Decisions Made
- Show View Details only for non-APPROVAL NOT_STARTED steps; APPROVAL steps show Approve button exclusively (cleaner UX — the action is approval, not viewing details)
- Used `(truck as any).isDispatchReady` since getTruck uses `include` rather than `select`, meaning Prisma infers the type from the full model — the field is present at runtime but TypeScript's type narrowing doesn't surface it directly without a broader type change

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 06 (the final plan) can proceed — all approval UI is wired and the truck dispatch badge is surfaced
- TypeScript compiles clean (only pre-existing unrelated error for deleted carrier stops route)

## Self-Check: PASSED

All files exist. Commit 4cb1c3c verified in git log.

---
*Phase: 44-workflow-engine-3-inspection-mode*
*Completed: 2026-04-24*
