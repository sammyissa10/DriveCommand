---
phase: 42-workflow-engine-foundation
plan: "07"
subsystem: testing
tags: [vitest, naming-lint, workflow-engine, spec-section-3, uat, phase-close]

# Dependency graph
requires:
  - phase: 42-workflow-engine-foundation-05
    provides: "/checklists dashboard with PlaybookCard grid and CreatePlaybookDialog using only user-facing names"
  - phase: 42-workflow-engine-foundation-06
    provides: "3-column Playbook Builder with 8 step-type editors, full DnD canvas, overrideConfig persistence"
provides:
  - "Vitest naming lint test (workflows-naming-lint.test.ts) enforcing spec Section 3: PlaybookInstance, StepInstance, PlaybookTrigger cannot appear in JSX text or string attributes of the owner checklists route"
  - "Human UAT confirmation: admin can build a functional Pre-Trip Inspection in under 10 minutes (phase goal)"
  - "Phase 42 fully closed and ready for Phase 43 (runtime / Active Checklists)"
affects:
  - "43-active-checklists (runtime layer builds on this foundation)"
  - "All future /checklists route development (lint enforced on every test run)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Naming lint via Vitest + Node fs.readdirSync recursive walk — no additional tooling needed"
    - "stripImportsAndTypes() strips import/type/interface/JSDoc lines before regex search — eliminates false positives from TypeScript declarations"
    - "JSX text check: />...</ regex; string attribute check: /=\"...\"/  regex — two separate patterns to avoid false negatives"
    - "walk() recursion traverses all .tsx files in a directory tree — future sub-routes under /checklists are automatically covered"

key-files:
  created:
    - apps/web/src/__tests__/workflows-naming-lint.test.ts
  modified: []

key-decisions:
  - "Lint targets /checklists route only (not all owner portal files) — scoped to the feature boundary; naming discipline enforced where internal names are most likely to leak"
  - "Banned names: PlaybookInstance, StepInstance, PlaybookTrigger — StepTemplate and Playbook are user-facing per spec Section 3 and intentionally NOT banned"
  - "stripImportsAndTypes() heuristic strips lines matching import/type/interface/export type/JSDoc — prevents false positives from 'import { PlaybookInstance } from @prisma/client'"
  - "Phase 42 closed on explicit user approval (typed 'approved') after full end-to-end UAT including Pre-Trip Inspection creation, drag-and-drop persistence, and driver sidebar access check"

patterns-established:
  - "Pattern: Naming lint tests for user-facing naming table enforcement — drop new describe blocks in __tests__/ pointing at new routes when Phase 43+ routes are built"

# Metrics
duration: ~5min (Task 1 only; Task 2 was human verification)
completed: 2026-04-23
---

# Phase 42 Plan 07: Naming Lint Test + Phase UAT Summary

**Vitest naming lint test enforcing spec Section 3 against the /checklists route tree, plus explicit user UAT approval confirming the full Workflow Engine Foundation works end-to-end in under 10 minutes**

## Performance

- **Duration:** ~5 min (Task 1 automation) + user UAT (Task 2)
- **Started:** ~2026-04-23 (Task 1 committed as c6d92a3)
- **Completed:** 2026-04-23
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 1 created

## Accomplishments

- Created `apps/web/src/__tests__/workflows-naming-lint.test.ts` — a Vitest test that recursively walks all `.tsx` files under `src/app/(owner)/checklists/`, strips import/type/JSDoc lines, and asserts that the internal entity names `PlaybookInstance`, `StepInstance`, and `PlaybookTrigger` do not appear in JSX text content (`>...<`) or string attribute values (`="..."`) — running as part of `npm run test`
- Test passes against the current codebase (Plans 05 + 06 used exclusively user-facing names throughout)
- Test demonstrably detects violations when a banned name is temporarily injected into a JSX text node — confirmed during development
- User performed full end-to-end UAT of the Phase 42 goal: opened Checklists & Workflows from sidebar, created "Pre-Trip Inspection v2", dragged inspection step templates, configured instructions + requirePhotoOnFail toggles, tested cross-phase drag persistence after reload, verified driver account cannot see the Workflows sidebar group, and confirmed the entire flow in under 10 minutes
- Phase 42 Workflow Engine Foundation is fully closed — Phase 43 (runtime / Active Checklists) can begin

## Task Commits

Each task was committed atomically:

1. **Task 1: Write Vitest naming lint test (Section 3 enforcement)** - `c6d92a3` (test)
2. **Task 2: Human-verify phase goal — build Pre-Trip Inspection under 10 minutes** - human UAT (no code commit; user typed "approved")

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/web/src/__tests__/workflows-naming-lint.test.ts` — Naming lint: walk + strip + regex check for PlaybookInstance/StepInstance/PlaybookTrigger in JSX text and string attributes of the /checklists route

## Decisions Made

- Lint targets the `/checklists` route directory only (not the entire owner portal) — scoped to the feature boundary where naming leaks are most likely. Other routes can have their own lint blocks added in future plans.
- `StepTemplate` and `Playbook` are intentionally not banned: spec Section 3 identifies these as user-facing terms ("Step Template", "Playbook") that may appear in the UI.
- `stripImportsAndTypes()` uses a line-level heuristic (matching leading `import`, `type`, `interface`, `export type`, and JSDoc `*` lines) rather than a full AST parser — sufficient for this lint use case and avoids any additional tooling dependency.
- Phase closed on explicit typed approval: user performed the full verification steps from the checkpoint and responded "approved", confirming all pass criteria were met.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Phase 42 Complete — What Was Built

This plan closes Phase 42. The full Workflow Engine Foundation spans 7 plans:

| Plan | What was delivered |
|------|-------------------|
| 42-01 | StepTemplate, Playbook, PlaybookStep Prisma models + 5 enums + RLS migration + idempotent seedStarterPlaybooks seeder (3 starter Playbooks for all tenants) |
| 42-02 | Zod validation schemas for all workflow engine inputs (5 enum schemas + 8 CRUD/operation schemas) exported from @drivecommand/validation |
| 42-03 | tRPC v11 server foundation: createTRPCContext (Supabase session), tenantMemberProcedure + adminProcedure, /api/trpc route handler, TRPCReactProvider scoped to owner layout |
| 42-04 | 14 tRPC procedures: stepTemplateRouter (5) + playbookRouter (9 incl. updateStep + reorderSteps); transactional two-phase reorder service; full AppRouter type-safe end-to-end |
| 42-05 | Owner sidebar Workflows group + /checklists dashboard: entity-type filter tabs, PlaybookCard grid (color-coded category icons), CreatePlaybookDialog calling tRPC and redirecting to builder |
| 42-06 | 3-column Playbook Builder (/checklists/playbooks/[id]/edit): DnD canvas (5 phase sections), StepLibraryPanel, NewStepTemplateButton, StepDetailEditor with all 8 step-type config editors |
| 42-07 | Naming lint Vitest test (Section 3 enforcement) + user UAT approval (phase goal confirmed) |

## Self-Check

Files created:
- `apps/web/src/__tests__/workflows-naming-lint.test.ts` — FOUND (committed c6d92a3)

Commits:
- c6d92a3: test(42-07): add Vitest naming lint for spec Section 3 enforcement — FOUND

## Self-Check: PASSED

## Next Phase Readiness

- Phase 42 is fully closed — all 7 plans executed and approved
- Phase 43 (Active Checklists / runtime layer) can begin immediately
- Naming lint will automatically guard the /checklists route on every future `npm run test` run
- Sidebar, dashboard, and builder are all live; Phase 43 can add Active Checklist launch and execution flows without rebuilding any foundation

---
*Phase: 42-workflow-engine-foundation*
*Completed: 2026-04-23*
