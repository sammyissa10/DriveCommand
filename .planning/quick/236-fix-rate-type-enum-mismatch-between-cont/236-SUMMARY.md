---
phase: quick-236
plan: "01"
subsystem: carrier-ops
tags: [bug-fix, validation, database, carrier-loads, carrier-contracts]
dependency_graph:
  requires: []
  provides: [rate_type_superset_alignment]
  affects: [carrier-loads-api, carrier-contracts-api, load-form, contract-form, revenue-calculator]
tech_stack:
  added: []
  patterns: [zod-enum-superset, prisma-migration-constraint-update, switch-case-fallthrough]
key_files:
  created:
    - apps/web/prisma/migrations/20260417050216_align_rate_type_superset/migration.sql
  modified:
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/contracts/route.ts
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/components/carrier/contracts/ContractForm.tsx
    - apps/web/src/lib/carrier/revenue-calculator.ts
decisions:
  - "per_load treated as alias for flat in revenue calculator (single fixed amount semantics)"
  - "per_hour treated as alias for hourly in revenue calculator (time-based semantics)"
  - "Both per_load/flat and per_hour/hourly retained as distinct enum values for historical contract compatibility"
metrics:
  duration: "8 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  files_changed: 6
---

# Quick Task 236: Fix rate_type Enum Mismatch Between Contracts and Loads

## One-liner
Expanded rate_type from mismatched 4/7-value enums to a unified 8-value superset (per_mile, per_load, per_hour, per_stop, flat, per_cwt, per_pallet, hourly) across DB constraints, Zod schemas, UI dropdowns, and revenue calculator.

## Problem
Load form submission was failing with a Zod validation error when a contract with `rate_type = per_hour` auto-populated the load form — `per_hour` was not in the loads Zod enum. Additionally, contracts only accepted 4 rate types while loads accepted 7 (different subset), causing inconsistency throughout the stack.

## What Was Built

### Task 1: DB Migration (commit 27e4547)
Created migration `20260417050216_align_rate_type_superset` that:
- Drops and recreates `contracts_rate_type_check` with all 8 values (was: per_mile, flat, per_load, hourly)
- Drops and recreates `loads_rate_type_check` with all 8 values (was: per_mile, flat, per_cwt, per_pallet, per_stop, hourly)

Note: Fixed a table name error during execution — plan incorrectly referenced `carrier_contracts`/`carrier_loads` but actual Prisma-mapped table names are `contracts`/`loads`. Resolved via `prisma migrate resolve --rolled-back` then corrected SQL.

### Task 2: Code Alignment (commit 90ace1c)
- **Loads API Zod schema**: Added `per_hour` (primary blocker fix)
- **Contracts API Zod schema**: Expanded from 4 to 8 values
- **LoadForm dropdown**: Added `per_hour` option + label in RATE_TYPE_LABELS
- **ContractForm RATE_TYPES**: Expanded from 4 to 8 entries
- **Revenue calculator**: `per_load` falls through to `flat` case; `per_hour` falls through to `hourly` case

## Verification
- `npx tsc --noEmit` passes (3 pre-existing e2e test errors unrelated to this change)
- Migration applied successfully to Supabase production DB
- All 8 rate_type values now accepted at DB, API, and UI layers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect table names in migration SQL**
- **Found during:** Task 1 — migration apply failed with `relation "carrier_contracts" does not exist`
- **Issue:** Plan specified `carrier_contracts` and `carrier_loads` but Prisma schema uses `@@map("contracts")` and `@@map("loads")`
- **Fix:** Corrected table names to `contracts` and `loads`; used `prisma migrate resolve --rolled-back` to clear failed state before re-applying
- **Files modified:** `apps/web/prisma/migrations/20260417050216_align_rate_type_superset/migration.sql`
- **Commit:** 27e4547

## Self-Check: PASSED
- migration.sql exists at correct path
- Commits 27e4547 and 90ace1c both present
- All 5 source files modified as planned
