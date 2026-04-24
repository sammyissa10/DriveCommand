---
phase: "43"
plan: "03"
subsystem: workflows
tags:
  - trpc
  - services
  - active-checklist
  - dispatch-readiness
  - step-completion
dependency_graph:
  requires:
    - 43-01 (Prisma schema: PlaybookInstance, StepInstance, PlaybookNotification models)
    - 43-02 (@drivecommand/validation: generateInstanceSchema, completeStepSchema, skipStepSchema, stepResultSchema, etc.)
  provides:
    - generatePlaybookInstance service (Active Checklist creation with immutable snapshot)
    - computeDispatchReadiness service (isDispatchBlocker from snapshot, entity-level readiness)
    - completeStep service (8 StepType validators, DOCUMENT_UPLOAD side-effect, notifications)
    - skipStep service (reason required, recomputes readiness)
    - workflowsRouter.instance (generate/list/get/getForEntity/computeReadiness)
    - workflowsRouter.stepInstance (complete/skip/getForDriver)
  affects:
    - AppRouter type (new workflows.instance and workflows.stepInstance sub-routers)
    - User.isDispatchReady (updated by computeDispatchReadiness for DRIVER entities)
    - Truck.isDispatchReady (updated by computeDispatchReadiness for VEHICLE entities)
tech_stack:
  added: []
  patterns:
    - Service layer (pure async functions) + thin tRPC router wrappers
    - Immutable JSON snapshot pattern (copy-at-create, never mutate)
    - Best-effort push notifications outside transaction
    - Client-side sort for BLOCKED→IN_PROGRESS→NOT_STARTED→COMPLETED ordering
key_files:
  created:
    - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
    - apps/web/src/server/services/workflows/computeDispatchReadiness.ts
    - apps/web/src/server/services/workflows/completeStep.ts
    - apps/web/src/server/services/workflows/skipStep.ts
    - apps/web/src/server/api/routers/workflows/instance.ts
    - apps/web/src/server/api/routers/workflows/stepInstance.ts
  modified:
    - apps/web/src/server/api/routers/workflows/index.ts
decisions:
  - "isDispatchBlocker read from stepSnapshot (not PlaybookStep template) — snapshot immutability is the invariant"
  - "INSPECTION_ITEM rejected with USE_FAIL_ENDPOINT — handled in Phase 44 via failInspectionItem"
  - "Assignee resolution outside transaction — best-effort, no rollback if push fails"
  - "list sorted client-side after DB fetch — Prisma lacks CASE WHEN ordering support"
  - "StepTemplate.defaultConfig (JSON) used instead of requiresPhoto/requiresSignature/formSchema — schema doesn't have those fields"
  - "User firstName+lastName used for entity labels — User model has no name field"
metrics:
  duration: "408s"
  completed: "2026-04-24"
  tasks: 2
  files_created: 6
  files_modified: 1
---

# Phase 43 Plan 03: Service Layer + tRPC Routers Summary

**One-liner:** Business logic heart of Phase 43 — 4 service functions (generatePlaybookInstance, computeDispatchReadiness, completeStep, skipStep) + 2 new tRPC routers (instance, stepInstance) backed by immutable JSON snapshot pattern and snapshot-only isDispatchBlocker reads.

## What Was Built

### Service Layer (4 files)

**`generatePlaybookInstance`** — Creates a PlaybookInstance from a Playbook template. Deep-copies the Playbook + all PlaybookSteps into immutable JSON blobs at creation time. Instance + StepInstances are created in a single `$transaction` with `bypass_rls`. Assignee resolution and push notifications run outside the transaction (best-effort). Checks: playbook is active, entity exists, no duplicate non-completed instance.

**`computeDispatchReadiness`** — Recomputes `status`, `completionPercent`, and `isDispatchReady` on a PlaybookInstance. Reads `isDispatchBlocker` exclusively from `stepSnapshot` (never from the live PlaybookStep template). When readiness flips from `false` to `true`, sends DISPATCH_READY push to all OWNER/MANAGER users. Updates `User.isDispatchReady` or `Truck.isDispatchReady` based on aggregate of active instances.

**`completeStep`** — Type-specific validation for all 8 StepTypes: DOCUMENT_UPLOAD requires fileUrls, SIGNATURE requires signatureUrl, FORM_FILL requires formData, INSPECTION_ITEM throws USE_FAIL_ENDPOINT (Phase 44), TRAINING_ACK requires acknowledged or note, APPROVAL trusts caller, THIRD_PARTY requires note or fileUrls, CUSTOM_NOTE requires note. DOCUMENT_UPLOAD side-effect creates a Document record (best-effort). Calls computeDispatchReadiness after completion.

**`skipStep`** — Skips a StepInstance with a required reason. Calls computeDispatchReadiness after skip.

### tRPC Routers (2 new + 1 updated)

**`instanceRouter`** — 5 procedures: `generate` (adminProcedure, calls generatePlaybookInstance), `list` (tenantMember, paginated + client-sort BLOCKED→IN_PROGRESS→NOT_STARTED→COMPLETED), `get` (tenantMember, single instance), `getForEntity` (tenantMember, all instances for entityId+entityType), `computeReadiness` (adminProcedure, manually re-triggers readiness with tenant ownership check).

**`stepInstanceRouter`** — 3 procedures: `complete` (tenantMember, calls completeStep), `skip` (adminProcedure, calls skipStep), `getForDriver` (tenantMember, open steps assigned to ctx.userId with pagination).

**`index.ts`** — Merges both new routers: `workflowsRouter.instance` and `workflowsRouter.stepInstance`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @drivecommand/validation dist stale — rebuilt package**
- **Found during:** Task 1
- **Issue:** `instance.ts` and `stepInstance.ts` were added to `packages/validation/src/workflows/` in Plan 43-02 but the package dist was not rebuilt. TypeScript couldn't find `StepResult` or the new schemas.
- **Fix:** Ran `npm run build` in `packages/validation/` to regenerate dist.
- **Files modified:** `packages/validation/dist/` (gitignored, not committed)
- **Commit:** 7543f29

**2. [Rule 1 - Bug] Wrong Prisma import path for enums**
- **Found during:** Task 1 TypeScript check
- **Issue:** Plan's code used `import from '../../generated/prisma/client'` — the correct project path is `'@/generated/prisma'`.
- **Fix:** Updated all enum imports to `'@/generated/prisma'`.
- **Files modified:** generatePlaybookInstance.ts, computeDispatchReadiness.ts
- **Commit:** 7543f29

**3. [Rule 1 - Bug] Wrong Truck field name: `plateNumber` → `licensePlate`**
- **Found during:** Task 1 TypeScript check
- **Issue:** Plan's code referenced `truck.plateNumber` but Prisma schema defines the field as `licensePlate`.
- **Fix:** Changed `plateNumber` → `licensePlate` in computeDispatchReadiness.ts.
- **Files modified:** computeDispatchReadiness.ts
- **Commit:** 7543f29

**4. [Rule 1 - Bug] StepTemplate has `defaultConfig` not `requiresPhoto`/`requiresSignature`/`formSchema`/`documentTypeName`**
- **Found during:** Task 1 (schema inspection before writing)
- **Issue:** Plan's snapshot code referenced fields that don't exist on StepTemplate. The model uses `defaultConfig` (JSON blob) for all configuration.
- **Fix:** Replaced non-existent fields with `defaultConfig` in buildPlaybookSnapshot and buildStepSnapshot.
- **Files modified:** generatePlaybookInstance.ts
- **Commit:** 7543f29

**5. [Rule 1 - Bug] User has `firstName`/`lastName` not `name`**
- **Found during:** Task 1 (schema inspection before writing)
- **Issue:** Plan's code referenced `u?.name` on User records, but User model has `firstName` and `lastName`.
- **Fix:** Updated `getEntityLabel` to concatenate `firstName`+`lastName` with email fallback.
- **Files modified:** computeDispatchReadiness.ts
- **Commit:** 7543f29

**6. [Rule 1 - Bug] Prisma InputJsonValue cast required for JSON fields**
- **Found during:** Task 1 TypeScript check
- **Issue:** TypeScript rejected snapshot objects assigned to Prisma Json fields without explicit cast.
- **Fix:** Added `as Prisma.InputJsonValue` cast on playbookSnapshot and stepSnapshot in the create calls.
- **Files modified:** generatePlaybookInstance.ts
- **Commit:** 7543f29

## Commits

| Hash | Message |
|------|---------|
| 7543f29 | feat(43-03): add generatePlaybookInstance, computeDispatchReadiness, completeStep, skipStep services |
| ae19f9a | feat(43-03): add instance and stepInstance tRPC routers, update workflows index |

## Self-Check

**Files created:**
- `apps/web/src/server/services/workflows/generatePlaybookInstance.ts` — FOUND
- `apps/web/src/server/services/workflows/computeDispatchReadiness.ts` — FOUND
- `apps/web/src/server/services/workflows/completeStep.ts` — FOUND
- `apps/web/src/server/services/workflows/skipStep.ts` — FOUND
- `apps/web/src/server/api/routers/workflows/instance.ts` — FOUND
- `apps/web/src/server/api/routers/workflows/stepInstance.ts` — FOUND

**Files modified:**
- `apps/web/src/server/api/routers/workflows/index.ts` — FOUND

**Exports verified:**
- `generatePlaybookInstance`, `computeDispatchReadiness`, `completeStep`, `skipStep` — all exported
- `instanceRouter`, `stepInstanceRouter` — both exported
- `workflowsRouter.instance`, `workflowsRouter.stepInstance` — both merged

**TypeScript:** `tsc --noEmit` exits with 1 pre-existing error only (deleted file in `.next/types/validator.ts`) — not caused by this plan.

## Self-Check: PASSED
