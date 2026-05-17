---
phase: quick
plan: 365
subsystem: database/audit
tags: [tkt-0015, audit-columns, prisma, migration, fleet-domain]
dependency_graph:
  requires: [quick-358, quick-359]
  provides: [fleet-domain-audit-fks-wave2]
  affects: [CarrierClient, CarrierContract, CarrierFacility, CarrierDriver, CarrierTruck, CarrierDispatch, CarrierLoad, CarrierStop, CarrierExpense, Document, FleetMessage]
tech_stack:
  added: []
  patterns: [named-prisma-relations, snake_case-audit-fks, create-only-audit-model]
key_files:
  created:
    - apps/web/prisma/migrations/20260517150001_tkt0015_2b_wave2_fleet_audit_columns/migration.sql
    - .planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/generated/prisma/ (regenerated)
decisions:
  - FleetMessage receives createdById only (no updatedById) — immutable records
  - Document.uploadedBy preserved unchanged; new createdById/updatedById added alongside
  - Migration applied via pg client directly (not prisma migrate deploy) due to Supabase shadow DB limitation
metrics:
  duration: 45min
  completed: 2026-05-17
  tasks_completed: 1/1
  files_modified: 9
---

# Quick Task 365: TKT-0015 Prompt 2b Wave 2 — Fleet Domain Audit FKs (11 Tables) Summary

Wave 2 of TKT-0015 Prompt 2b: nullable `createdById`/`updatedById` audit FK columns added to 9 carrier-operations models (snake_case @map) + Document (camelCase alongside preserved uploadedBy) + FleetMessage (createdById only — immutable).

## What Was Built

All 11 fleet-domain tables in scope now carry audit FK columns referencing `User.id` with `ON DELETE SET NULL`. The withAuditColumns Prisma extension (unchanged from Wave 1) auto-injects these on writes when a session userId is forwarded through the tenant client stack.

**Models updated:**
- 9 snake_case carrier models: CarrierClient, CarrierContract, CarrierFacility, CarrierDriver, CarrierTruck, CarrierDispatch, CarrierLoad, CarrierStop, CarrierExpense — each gets `created_by_id` + `updated_by_id`
- Document (camelCase): `createdById` + `updatedById` added alongside existing `uploadedBy`
- FleetMessage (camelCase): `createdById` ONLY (create-only audit model)

**User model:** 21 named reverse-relation arrays added (9×2 carrier + 2 Document + 1 FleetMessage).

**Migration:** Idempotent SQL (`ADD COLUMN IF NOT EXISTS` + per-constraint `DO $$ IF NOT EXISTS` guards) applied via pg client directly to Supabase.

## Verification Results

| Gate | Result |
|---|---|
| prisma validate | PASS |
| prisma generate | PASS |
| tsc --noEmit | PASS (pre-existing unrelated errors only) |
| 21 columns in DB (all nullable uuid) | PASS |
| 21 FK constraints (all SET NULL) | PASS |
| CarrierClient spot check | PASS |
| Document spot check | PASS |
| FleetMessage create-only spot check | PASS |
| Extension untouched | PASS |
| Tenant-client untouched | PASS |
| No forbidden tokens (as any / @ts-ignore) | PASS |

## Deviations from Plan

### Auto-fixed Issues

**[Rule 3 - Blocker] prisma migrate dev shadow DB failure**
- **Found during:** Step 6 (generate create-only migration)
- **Issue:** `npx prisma migrate dev --create-only` failed with P3006 — Supabase shadow DB doesn't have `_prisma_migrations` table
- **Fix:** Wrote migration SQL manually following the plan's exact idempotent template. Applied via pg client using `DIRECT_URL`. Recorded migration in `_prisma_migrations` manually with SHA256 checksum.
- **Files modified:** `apps/web/prisma/migrations/20260517150001_tkt0015_2b_wave2_fleet_audit_columns/migration.sql`
- **Impact:** None — result is identical to what `--create-only` would have produced; migration is idempotent and recorded in tracking table.

## Key Decisions

- **FleetMessage immutability honored at DB layer** — only 1 column (`createdById`) exists in the DB. The `CREATE_ONLY_AUDIT_MODELS` set in the extension prevents any `updatedById` injection attempt at the application layer. Spot check confirmed update operations succeed without touching `updatedById`.
- **Document dual-audit pattern** — `uploadedBy` (legacy required field for R2 uploader identity) is preserved; `createdById`/`updatedById` are added as the new audit trail fields. Both serve different purposes and coexist.
- **Direct pg migration apply** — consistent with QT-358 and QT-359 pattern for Supabase constraints.

## Wave Report

Full verification details (SQL output, spot check logs, constraint counts):
`.planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md`

## Commit

`e0fee9f8` — feat(quick-365): TKT-0015 Prompt 2b Wave 2 — fleet domain audit FKs (11 tables)
