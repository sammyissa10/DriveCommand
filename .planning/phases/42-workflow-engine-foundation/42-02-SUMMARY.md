---
phase: 42-workflow-engine-foundation
plan: 02
subsystem: validation
tags: [zod, workflow-engine, playbook, step-template, typescript, shared-packages]

# Dependency graph
requires:
  - phase: 42-01
    provides: "StepTemplate, Playbook, PlaybookStep Prisma models and 5 enums (StepType, AssigneeRole, PlaybookEntityType, PlaybookCategory, PhaseType)"
provides:
  - "Zod validation schemas for all Workflow Engine inputs (enums, StepTemplate CRUD, Playbook CRUD, PlaybookStep operations)"
  - "updatePlaybookStepSchema — the contract for Plan 04 workflows.playbook.updateStep tRPC procedure"
  - "reorderStepsSchema — complete ordered steps list for Playbook step reordering"
  - "Barrel export from @drivecommand/validation root"
affects:
  - 42-03-trpc-router
  - 42-04-trpc-procedures
  - 42-06-playbook-builder-ui

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Workflow schemas in packages/validation/src/workflows/ subdirectory with barrel export"
    - "z.record(z.string(), z.any()) for freeform JSON config fields (Zod v4 signature)"
    - "createSchema.partial().extend({ id }) pattern for update schemas"

key-files:
  created:
    - packages/validation/src/workflows/enums.ts
    - packages/validation/src/workflows/stepTemplate.ts
    - packages/validation/src/workflows/playbook.ts
    - packages/validation/src/workflows/index.ts
  modified:
    - packages/validation/src/index.ts

key-decisions:
  - "defaultConfig and overrideConfig are validated as z.record(z.string(), z.any()) — shape validation deferred to service/editor layer since it depends on stepType"
  - "updatePlaybookStepSchema does NOT include sequence — sequence changes go through reorderStepsSchema only"
  - "playbookPhase is optional in updatePlaybookStepSchema — only sent when the step's phase changes"
  - "reorderStepsSchema requires min(1) steps and the client sends the complete final ordered list"

patterns-established:
  - "Workflow Zod schema pattern: group by domain in src/workflows/ subdirectory, barrel-export from index.ts, re-export from package root"

# Metrics
duration: 4min
completed: 2026-04-24
---

# Phase 42 Plan 02: Workflow Engine Validation Schemas Summary

**Five Zod enum schemas + createStepTemplateSchema + updateStepTemplateSchema + six Playbook/PlaybookStep schemas added to @drivecommand/validation, mirroring Prisma enums exactly and establishing the tRPC/REST input contract for the Workflow Engine**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-24T02:28:51Z
- **Completed:** 2026-04-24T02:32:22Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 updated)

## Accomplishments
- Created `packages/validation/src/workflows/enums.ts` with 5 Zod enum schemas mirroring Prisma enums (StepType 8 values, AssigneeRole 5, PlaybookEntityType 5, PlaybookCategory 6, PhaseType 5)
- Created `packages/validation/src/workflows/stepTemplate.ts` with createStepTemplateSchema + updateStepTemplateSchema and inferred types
- Created `packages/validation/src/workflows/playbook.ts` with 6 schemas: createPlaybookSchema, updatePlaybookSchema, addStepSchema, removeStepSchema, updatePlaybookStepSchema, reorderStepsSchema and all inferred types
- Created barrel `packages/validation/src/workflows/index.ts` and re-exported from package root `src/index.ts`
- All TypeScript checks clean for both `packages/validation` and `apps/web`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create workflow enum schemas** - `6b2dce8` (feat)
2. **Task 2: Create stepTemplate and playbook schemas + barrel export** - `ebd210e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/validation/src/workflows/enums.ts` - Zod enums for StepType, AssigneeRole, PlaybookEntityType, PlaybookCategory, PhaseType
- `packages/validation/src/workflows/stepTemplate.ts` - createStepTemplateSchema + updateStepTemplateSchema with types
- `packages/validation/src/workflows/playbook.ts` - createPlaybookSchema, updatePlaybookSchema, addStepSchema, removeStepSchema, updatePlaybookStepSchema, reorderStepsSchema with types
- `packages/validation/src/workflows/index.ts` - Barrel export for workflows subdirectory
- `packages/validation/src/index.ts` - Added `export * from './workflows'`

## Decisions Made
- `defaultConfig` and `overrideConfig` validated as `z.record(z.string(), z.any())` — shape validation deferred to service/editor layer since structure depends on stepType
- `updatePlaybookStepSchema` intentionally excludes sequence — sequence changes go exclusively through `reorderStepsSchema`
- `playbookPhase` is optional in `updatePlaybookStepSchema` — only sent when the step's phase changes via the editor
- `reorderStepsSchema` requires `min(1)` steps and expects the client to send the complete final ordered list (not deltas)

## Deviations from Plan

None — plan executed exactly as written. The `node -e require(...)` verification step in the plan is not applicable to this project's ESM-bundler setup (dist is gitignored and bare specifiers work only through a bundler). Both `tsc --noEmit` checks (the authoritative verification) passed cleanly.

## Issues Encountered
- The plan's verify step included a `node -e require()` command that cannot work with this package's ESM output format and bundler-only consumption model. Verified instead via `tsc --noEmit` for both `packages/validation` and `apps/web`, which is the correct check for a Next.js monorepo.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All Workflow Engine Zod schemas are defined and exported from `@drivecommand/validation`
- Ready for Plan 03 (tRPC router registration) and Plan 04 (tRPC procedures) which will import these schemas
- `updatePlaybookStepSchema` is the exact contract the Plan 04 `workflows.playbook.updateStep` procedure expects
- `reorderStepsSchema` is the contract for `workflows.playbook.reorderSteps`

---
*Phase: 42-workflow-engine-foundation*
*Completed: 2026-04-24*
