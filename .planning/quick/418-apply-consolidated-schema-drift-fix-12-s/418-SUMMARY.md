---
phase: quick-418
plan: "01"
subsystem: db/schema-drift
tags: [migration, schema-drift, soft-delete, supabase-mcp]
dependency_graph:
  requires: [quick-417]
  provides: [zero-schema-drift-6-models]
  affects: [Route, CarrierClient, CarrierContract, CarrierDriver, CarrierTruck, CarrierLoad]
tech_stack:
  added: []
  patterns: [supabase-mcp-apply-migration, do-block-self-validation, rollback-sql]
key_files:
  created:
    - apps/web/prisma/migrations/20260530000002_add_soft_delete_columns_drift_fix/migration.sql
    - apps/web/prisma/migrations/20260530000002_add_soft_delete_columns_drift_fix/rollback.sql
  modified: []
decisions:
  - "Applied via Supabase MCP (apply_migration) per project pattern — not prisma migrate"
  - "Self-validation DO $$ block before COMMIT verifies all 12 columns exist; RAISE EXCEPTION if any missing"
  - "Rollback.sql includes explicit DATA LOSS WARNING — irreversible if soft-deleted rows exist"
  - "Drift scan re-run confirms 0 missing columns — all EXTRA columns are USER-DEFINED enum types (known false positives)"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-02"
  tasks_completed: 3
  files_created: 2
---

# Quick-418: Apply Consolidated Schema Drift Fix — Summary

## What was done

Applied the 12 missing soft-delete columns identified by quick-417 to production Supabase via MCP.

### Migration file
`apps/web/prisma/migrations/20260530000002_add_soft_delete_columns_drift_fix/migration.sql`

- 12 `ADD COLUMN IF NOT EXISTS` statements across 6 tables
- Self-validation `DO $$` block before `COMMIT` — raises exception if any column is still missing
- Wrapped in `BEGIN/COMMIT`

### Rollback file
`apps/web/prisma/migrations/20260530000002_add_soft_delete_columns_drift_fix/rollback.sql`

- 12 `DROP COLUMN IF EXISTS` statements
- Data-loss warning at top

### Columns added (12 total across 6 models)

| Model | Table | Columns |
|-------|-------|---------|
| Route | `Route` | `deletedAt` TIMESTAMPTZ, `deletedById` UUID |
| CarrierClient | `clients` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID |
| CarrierContract | `contracts` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID |
| CarrierDriver | `carrier_drivers` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID |
| CarrierTruck | `carrier_trucks` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID |
| CarrierLoad | `loads` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID |

## Verification

Supabase MCP `apply_migration` → `{"success": true}` (self-validation DO block passed — no exception)

Drift scan re-run result:
- Models scanned: 89
- **Total columns missing in DB: 0** ✓
- Total extra columns (USER-DEFINED enums, known false positives): 78

## Commit
`82d90177` — feat(quick-418): add 12 soft-delete columns to 6 models — close schema drift from quick-417
