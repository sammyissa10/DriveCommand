---
phase: 43-workflow-engine-2-execution
plan: "02"
subsystem: validation
tags: [zod, trpc, validation, workflow-engine, playbook-instance, step-instance]

# Dependency graph
requires:
  - phase: 43-01
    provides: PlaybookInstance/StepInstance Prisma models and generated client types
provides:
  - Zod schemas for PlaybookInstance tRPC inputs (generateInstanceSchema, listInstancesSchema, getForEntitySchema, getInstanceSchema, computeReadinessSchema)
  - Zod schemas for StepInstance tRPC inputs (completeStepSchema, skipStepSchema, getForDriverSchema, stepResultSchema)
  - All schemas re-exported from @drivecommand/validation via workflows/index.ts
affects: [43-03, 43-04, 43-05, 43-06, 43-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod schema files per domain entity in packages/validation/src/workflows/"
    - "stepResultSchema uses permissive optional fields; service layer enforces type-specific rules"

key-files:
  created:
    - packages/validation/src/workflows/instance.ts
    - packages/validation/src/workflows/stepInstance.ts
  modified:
    - packages/validation/src/workflows/index.ts

key-decisions:
  - "stepResultSchema uses all-optional fields — service layer (completeStep.ts) validates type-specific requirements to avoid over-coupling schema to all 8 step types"
  - "Used z.record(z.string(), z.unknown()) for formData — Zod v4 requires two type arguments"

patterns-established:
  - "Instance schemas: import playbookEntityTypeSchema from ./enums (lowercase) not PlaybookEntityTypeSchema"
  - "New workflow schema files get added to workflows/index.ts with export * from pattern"

# Metrics
duration: 2min
completed: 2026-04-24
---

# Phase 43 Plan 02: Workflow Instance + StepInstance Zod Schemas Summary

**Five PlaybookInstance schemas and four StepInstance schemas added to @drivecommand/validation, enabling type-safe tRPC input validation for the workflow execution engine**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-24T05:05:32Z
- **Completed:** 2026-04-24T05:07:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `packages/validation/src/workflows/instance.ts` with 5 schemas covering the full PlaybookInstance tRPC surface (generate, list, get, getForEntity, computeReadiness)
- Created `packages/validation/src/workflows/stepInstance.ts` with 4 schemas (stepResult, completeStep, skipStep, getForDriver) using permissive result payload for type flexibility
- Updated `packages/validation/src/workflows/index.ts` to re-export both new files, making all schemas accessible from `@drivecommand/validation`

## Task Commits

Each task was committed atomically:

1. **Task 1 + 2: Create instance.ts, stepInstance.ts, update index.ts** - `0aef63f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/validation/src/workflows/instance.ts` - Zod schemas for PlaybookInstance tRPC inputs
- `packages/validation/src/workflows/stepInstance.ts` - Zod schemas for StepInstance tRPC inputs
- `packages/validation/src/workflows/index.ts` - Re-exports both new schema files

## Decisions Made
- `stepResultSchema` uses all-optional fields — service layer will enforce type-specific requirements in `completeStep.ts` to avoid binding the schema tightly to all 8 step types
- Used `z.record(z.string(), z.unknown())` for `formData` — Zod v4 requires two type arguments (deviation auto-fixed, Rule 1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed z.record() call signature for Zod v4**
- **Found during:** Task 1 (stepInstance.ts creation)
- **Issue:** Plan specified `z.record(z.unknown())` but Zod v4 requires two arguments; tsc exited with error TS2554
- **Fix:** Changed to `z.record(z.string(), z.unknown())` matching the pattern used in existing playbook.ts schemas
- **Files modified:** packages/validation/src/workflows/stepInstance.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 0aef63f (task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Single-line fix; no scope change.

## Issues Encountered
None beyond the z.record Zod v4 signature mismatch noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All instance and stepInstance schemas are exported from `@drivecommand/validation`
- Plan 03 (tRPC routers) can import `generateInstanceSchema`, `completeStepSchema`, `skipStepSchema`, `getForEntitySchema`, and all other new schemas directly
- No blockers

---
*Phase: 43-workflow-engine-2-execution*
*Completed: 2026-04-24*
