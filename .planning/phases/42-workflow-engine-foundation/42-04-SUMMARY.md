---
phase: 42-workflow-engine-foundation
plan: "04"
subsystem: api
tags: [trpc, workflow-engine, playbook, step-template, tenant-isolation, typescript]

# Dependency graph
requires:
  - phase: 42-workflow-engine-foundation-01
    provides: "StepTemplate, Playbook, PlaybookStep Prisma models with tenantId scoping"
  - phase: 42-workflow-engine-foundation-02
    provides: "Zod schemas: createStepTemplateSchema, updateStepTemplateSchema, createPlaybookSchema, updatePlaybookSchema, addStepSchema, removeStepSchema, updatePlaybookStepSchema, reorderStepsSchema"
  - phase: 42-workflow-engine-foundation-03
    provides: "tRPC server (router, adminProcedure, tenantMemberProcedure, createCallerFactory), /api/trpc route handler, TRPCReactProvider in owner layout"
provides:
  - "stepTemplateRouter: 5 procedures (list, getById, create, update, delete) all tenant-scoped"
  - "playbookRouter: 9 procedures (list, getById, create, update, delete, addStep, removeStep, updateStep, reorderSteps) all tenant-scoped"
  - "updateStep procedure: save path for Plan 06 StepDetailEditor — persists overrideConfig + optional playbookPhase"
  - "reorderPlaybookSteps service: transactional two-phase sequence rewrite avoiding UNIQUE constraint violations"
  - "workflowsRouter: merges stepTemplate + playbook under workflows namespace"
  - "appRouter: mounts workflowsRouter; AppRouter type exported end-to-end type-safe"
affects:
  - 42-workflow-engine-foundation-05
  - 42-workflow-engine-foundation-06

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tenant-scoped findFirst pattern: findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }) then throw NOT_FOUND if missing"
    - "Soft delete pattern: set isActive=false + deletedAt=new Date() for StepTemplate and Playbook"
    - "PlaybookStep tenant isolation via parent Playbook ownership (no direct tenantId on PlaybookStep)"
    - "Two-phase transactional reorder: first move to 10000+ temporary sequences, then final sequences (avoids UNIQUE violation)"
    - "adminProcedure for all mutations, tenantMemberProcedure for all queries"
    - "updateStep returns include: { stepTemplate: true } so client re-renders without extra refetch"
    - "addStep computes sequence as max(sequence)+1 via findFirst({ orderBy: { sequence: 'desc' } })"

key-files:
  created:
    - apps/web/src/server/api/routers/workflows/stepTemplate.ts
    - apps/web/src/server/api/routers/workflows/playbook.ts
    - apps/web/src/server/api/routers/workflows/index.ts
    - apps/web/src/server/services/workflows/playbookStepService.ts
  modified:
    - apps/web/src/server/api/root.ts

key-decisions:
  - "PlaybookStep tenant isolation via parent Playbook check — step-level queries use playbookId after the playbook's tenantId is verified"
  - "Two-phase transactional sequence rewrite kept in a service file (playbookStepService.ts) separate from the router — more than simple CRUD warrants its own file"
  - "reorderSteps returns the updated Playbook with all steps (same shape as getById) so clients don't need a follow-up query"
  - "removeStep is a hard delete of the PlaybookStep junction row — StepTemplate is retained (spec explicitly allows this)"

patterns-established:
  - "Pattern: All workflow router mutations gate on adminProcedure, queries on tenantMemberProcedure"
  - "Pattern: playbookStep mutations always verify playbook ownership before touching playbookStep rows"

# Metrics
duration: 10min
completed: 2026-04-24
---

# Phase 42 Plan 04: tRPC Workflow Engine Routers Summary

**14 tRPC procedures across stepTemplateRouter (5) and playbookRouter (9) with full tenant isolation, transactional reorder service, and type-safe AppRouter mounted end-to-end**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-24T02:51:50Z
- **Completed:** 2026-04-24T03:01:50Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 updated)

## Accomplishments
- Created `stepTemplateRouter` with 5 procedures: list (filtered by stepType/assigneeRole), getById, create, update, and soft delete — all scoped by `ctx.tenantId`
- Created `playbookStepService.ts` with `reorderPlaybookSteps()`: two-phase transactional sequence rewrite that temporarily moves steps to 10000+ sequence values to sidestep the UNIQUE(playbookId, sequence) constraint during mid-reorder state
- Created `playbookRouter` with 9 procedures including `updateStep` (the save path for the Plan 06 StepDetailEditor) and `reorderSteps` (delegates to service)
- Created `workflowsRouter` merging both routers under the `workflows` namespace
- Mounted `workflowsRouter` in `appRouter` (root.ts) — `AppRouter` type is exported and consumed end-to-end by client
- `tsc --noEmit` and `npm run build` both pass clean

## Task Commits

Each task was committed atomically:

1. **Task 1: stepTemplate router + playbookStepService reorder helper** - `5140f63` (feat)
2. **Task 2: playbook router (9 procedures) + workflowsRouter + mount on appRouter** - `1e3e94f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/server/api/routers/workflows/stepTemplate.ts` - 5 tRPC procedures for StepTemplate CRUD, all tenant-scoped
- `apps/web/src/server/services/workflows/playbookStepService.ts` - reorderPlaybookSteps() transactional sequence rewrite
- `apps/web/src/server/api/routers/workflows/playbook.ts` - 9 tRPC procedures for Playbook CRUD + step management
- `apps/web/src/server/api/routers/workflows/index.ts` - workflowsRouter merging stepTemplate + playbook
- `apps/web/src/server/api/root.ts` - appRouter now mounts workflowsRouter; AppRouter type exported

## Decisions Made
- PlaybookStep tenant isolation is enforced via parent Playbook ownership check — PlaybookStep has no direct tenantId column, so all mutations first verify `playbook.tenantId === ctx.tenantId` before touching step rows
- `reorderPlaybookSteps` service kept in a separate file from the router — the two-phase transaction logic warrants its own home rather than living inline in a procedure
- `reorderSteps` returns the full updated Playbook with steps (same shape as `getById`) — client avoids a follow-up query after reordering
- `removeStep` is a hard delete of the PlaybookStep junction row — the underlying StepTemplate is retained per spec

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Self-Check

Files created/modified:
- `apps/web/src/server/api/routers/workflows/stepTemplate.ts` — FOUND
- `apps/web/src/server/services/workflows/playbookStepService.ts` — FOUND
- `apps/web/src/server/api/routers/workflows/playbook.ts` — FOUND
- `apps/web/src/server/api/routers/workflows/index.ts` — FOUND
- `apps/web/src/server/api/root.ts` — FOUND (modified)

Commits:
- 5140f63: feat(42-04): create stepTemplate router and playbookStepService reorder helper — FOUND
- 1e3e94f: feat(42-04): create playbook router (9 procedures), workflowsRouter, mount on appRouter — FOUND

TypeScript: PASSED (tsc --noEmit clean)
Build: PASSED (npm run build exit code 0)

## Self-Check: PASSED

## Next Phase Readiness
- All 14 tRPC procedures are live on the /api/trpc endpoint
- `appRouter.workflows.stepTemplate` and `appRouter.workflows.playbook` are type-safe and accessible
- Owner portal client components can call procedures via `useTRPC()` from Plan 03
- `updatePlaybookStepSchema` contract is implemented — Plan 06 StepDetailEditor can use `workflows.playbook.updateStep` directly
- Ready for Plan 05 (Playbook Library dashboard) and Plan 06 (Playbook Builder UI)

---
*Phase: 42-workflow-engine-foundation*
*Completed: 2026-04-24*
