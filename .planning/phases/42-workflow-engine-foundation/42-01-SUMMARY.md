---
phase: 42-workflow-engine-foundation
plan: "01"
subsystem: workflow-engine
tags:
  - prisma
  - migration
  - seeding
  - rls
  - multi-tenant
dependency_graph:
  requires:
    - Tenant model (existing)
    - Prisma 7 + Supabase PostgreSQL (existing)
    - apps/web/scripts/migrate.mjs (existing)
    - apps/web/src/app/(admin)/actions/tenants.ts (existing)
  provides:
    - StepTemplate, Playbook, PlaybookStep Prisma models
    - 5 workflow engine enums (PlaybookEntityType, PlaybookCategory, PhaseType, StepType, AssigneeRole)
    - seedStarterPlaybooks(tenantId) idempotent service
    - 3 starter Playbooks seeded for all existing tenants
    - Auto-seeding for all newly created tenants
  affects:
    - apps/web/src/app/(admin)/actions/tenants.ts (createTenant gains seeder call)
    - apps/web/scripts/migrate.mjs (gains seeder invocation after migration)
tech_stack:
  added:
    - "seedStarterPlaybooks service (apps/web/src/server/services/workflows/)"
  patterns:
    - "Idempotent seeding: check for sentinel record, return early if found"
    - "Prisma.$transaction wrapping all 3 playbook creations atomically"
    - "Non-fatal seeder in createTenant: try/catch, logs error, continues tenant creation"
    - "RLS via current_tenant_id() helper (existing app pattern) + bypass_rls_policy for provisioning"
    - "PlaybookStep tenant isolation via subquery: playbookId IN (SELECT id FROM Playbook WHERE tenantId = ...)"
key_files:
  created:
    - apps/web/prisma/migrations/20260423100001_add_workflow_engine_foundation/migration.sql
    - apps/web/src/server/services/workflows/seedStarterPlaybooks.ts
    - apps/web/scripts/seed-starter-playbooks.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/scripts/migrate.mjs
    - apps/web/src/app/(admin)/actions/tenants.ts
decisions:
  - "Idempotency sentinel: 'CDL Driver Onboarding' playbook name used as existence check — simple, no extra schema needed"
  - "Non-fatal seeding in createTenant: tenant creation is critical path; transient seeder failures should not block onboarding; seeder is idempotent so re-run recovers"
  - "PlaybookStep RLS via subquery pattern: table has no tenantId, isolation through JOIN to Playbook which does have tenantId"
  - "migrate.mjs invokes seed-starter-playbooks.ts via spawnSync npx tsx — avoids ESM/CJS import issues between .mjs hook and .ts seeder"
metrics:
  duration: "350s"
  completed: "2026-04-24"
  tasks: 4
  files_created: 3
  files_modified: 3
---

# Phase 42 Plan 01: Workflow Engine Database Foundation Summary

**One-liner:** Three new Prisma models (StepTemplate, Playbook, PlaybookStep) + 5 enums + RLS migration + idempotent tenant seeder delivering 3 starter Playbooks to all existing and new tenants.

## What Was Built

The complete data layer for the Workflow Engine feature:

1. **Prisma models + enums** — 5 new enums (PlaybookEntityType, PlaybookCategory, PhaseType, StepType, AssigneeRole) and 3 new models added to schema.prisma following existing codebase conventions (`@db.Uuid`, `@db.Timestamptz`, `dbgenerated("gen_random_uuid()")`). Tenant reverse relations added.

2. **Migration SQL** — Hand-written idempotent SQL at `20260423100001_add_workflow_engine_foundation/migration.sql`. Creates all 3 tables with proper indexes, FK constraints (idempotent DO blocks), and RLS policies matching the existing `current_tenant_id()` + `bypass_rls_policy` pattern. PlaybookStep uses a subquery for tenant isolation since it has no direct tenantId.

3. **seedStarterPlaybooks service** — Idempotent `seedStarterPlaybooks(tenantId)` function that creates the 3 spec-defined starter Playbooks with their full StepTemplate and PlaybookStep rows inside a single Prisma transaction. Second call returns immediately (sentinel check).

4. **Seeder wiring:**
   - `migrate.mjs` now invokes `seed-starter-playbooks.ts` via `spawnSync npx tsx` after successful migration — all 7 existing active tenants seeded.
   - `createTenant` server action now calls `seedStarterPlaybooks(tenant.id)` after `prisma.tenant.create()` — new tenants receive starters immediately on creation.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add Prisma models + enums | e08268f | apps/web/prisma/schema.prisma (+109 lines) |
| 2 | Write migration SQL with RLS policies | da0c217 | migrations/20260423100001_add_workflow_engine_foundation/migration.sql |
| 3 | seedStarterPlaybooks + migration hook | 944d77f | src/server/services/workflows/seedStarterPlaybooks.ts, scripts/seed-starter-playbooks.ts, scripts/migrate.mjs |
| 4 | Wire into createTenant server action | 9297acd | src/app/(admin)/actions/tenants.ts |

## Verification Results

- `prisma validate` — passed
- `prisma generate` — passed
- `tsc --noEmit` — passed (clean, no errors)
- Migration applied cleanly to Supabase (1 migration run)
- 3 tables confirmed in DB: StepTemplate, Playbook, PlaybookStep
- 5 enums confirmed in DB: PlaybookEntityType, PlaybookCategory, PhaseType, StepType, AssigneeRole
- Seed run 1: all 7 active tenants seeded (3 playbooks each with 5/5/4 steps)
- Seed run 2: all 7 tenants returned success without creating duplicates (idempotency confirmed)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created/modified:
- `apps/web/prisma/schema.prisma` — FOUND
- `apps/web/prisma/migrations/20260423100001_add_workflow_engine_foundation/migration.sql` — FOUND
- `apps/web/src/server/services/workflows/seedStarterPlaybooks.ts` — FOUND
- `apps/web/scripts/seed-starter-playbooks.ts` — FOUND
- `apps/web/scripts/migrate.mjs` — FOUND (modified)
- `apps/web/src/app/(admin)/actions/tenants.ts` — FOUND (modified)

Commits:
- e08268f: feat(42-01): add workflow engine Prisma models and enums — FOUND
- da0c217: feat(42-01): add workflow engine migration SQL with RLS policies — FOUND
- 944d77f: feat(42-01): add seedStarterPlaybooks service and wire into migration hook — FOUND
- 9297acd: feat(42-01): wire seedStarterPlaybooks into createTenant server action — FOUND

## Self-Check: PASSED
