---
phase: quick-155
plan: "01"
subsystem: database/migrations
tags: [migrations, carrier-ops, documents, expenses, pay-records, postgresql]
dependency_graph:
  requires:
    - 20260404100001_carrier_clients
    - 20260404100004_carrier_drivers_trucks
    - 20260404100007_carrier_dispatches
    - 20260404100008_carrier_loads
    - 20260404100009_carrier_stops
  provides:
    - carrier_documents table
    - carrier_expenses table
    - driver_pay_records table
  affects:
    - carrier ops financial layer
tech_stack:
  added: []
  patterns:
    - polymorphic parent reference (parent_type/parent_id, no FK)
    - table-level CHECK for dispatch_id OR load_id
    - DECIMAL for all money columns (never FLOAT)
    - quoted PascalCase FK references for "User" and "Tenant"
key_files:
  created:
    - apps/web/prisma/migrations/20260404100010_carrier_documents/migration.sql
    - apps/web/prisma/migrations/20260404100011_carrier_expenses/migration.sql
    - apps/web/prisma/migrations/20260404100012_driver_pay_records/migration.sql
  modified: []
decisions:
  - "carrier_documents uses polymorphic parent_type/parent_id with no FK (intentional — supports stop/load/dispatch/contract/expense parents)"
  - "carrier_expenses enforces dispatch_id IS NOT NULL OR load_id IS NOT NULL at the table level via named CHECK constraint"
  - "All money fields use DECIMAL with explicit precision/scale — verified via information_schema query"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-04"
  tasks_completed: 2
  files_created: 3
  files_modified: 0
---

# Quick Task 155: Carrier Ops Migrations 010-012 Summary

Three PostgreSQL migration files completing the financial and document management layer of the carrier ops module: polymorphic document attachments (carrier_documents), expense tracking with dispatch/load enforcement (carrier_expenses), and multi-model driver pay calculations (driver_pay_records).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create all three migration SQL files and apply to DB | 8502964 | 3 new migration.sql files |
| 2 | Verify constraints and column types | — | no files (verification only) |

## Verification Results

### Test 1: CHECK constraint on carrier_expenses
INSERT with both `dispatch_id` and `load_id` set to NULL was attempted.

Result: **PASS** — Postgres rejected with:
```
new row for relation "carrier_expenses" violates check constraint "carrier_expenses_dispatch_or_load_check"
```

### Test 2: DECIMAL column types (no FLOAT leaks)

All 14 numeric money/rate columns across `carrier_expenses` and `driver_pay_records` confirmed as `data_type = 'numeric'` with correct precision/scale. Zero columns had `numeric_precision = 53` (which would indicate FLOAT/DOUBLE PRECISION). Full results:

| column_name | table | precision | scale |
|-------------|-------|-----------|-------|
| amount | carrier_expenses | 10 | 2 |
| base_pay | driver_pay_records | 10 | 2 |
| bonuses | driver_pay_records | 8 | 2 |
| deductions | driver_pay_records | 8 | 2 |
| empty_rate | driver_pay_records | 8 | 4 |
| flat_amount | driver_pay_records | 10 | 2 |
| gross_revenue | driver_pay_records | 12 | 2 |
| hourly_rate | driver_pay_records | 8 | 2 |
| hours_worked | driver_pay_records | 6 | 2 |
| loaded_rate | driver_pay_records | 8 | 4 |
| net_pay | driver_pay_records | 10 | 2 |
| percentage_applied | driver_pay_records | 5 | 4 |
| reimbursements | driver_pay_records | 8 | 2 |
| tips | driver_pay_records | 8 | 2 |

Result: **PASS** — No FLOAT leaks.

## Schema Decisions

**carrier_documents:**
- `parent_id` is a plain UUID with NO FK constraint — intentional polymorphic design supporting stop/load/dispatch/contract/expense parent types without coupling to specific tables
- `stop_id` and `client_id` are optional explicit FKs for the two most commonly queried parent types
- No `org_id` — tenant scoping inherited from parent entity
- `verified` / `verified_by` / `verified_at` triplet for document verification workflow

**carrier_expenses:**
- Table-level CHECK `carrier_expenses_dispatch_or_load_check` enforces at least one of `dispatch_id` or `load_id` must be non-null
- `receipt_document_id` FK links to `carrier_documents(id)` — receipts are a special document type
- `org_id` with `"Tenant"(id)` FK using RESTRICT on delete

**driver_pay_records:**
- Five pay model fields all present simultaneously — nullable fields support whichever model is active
- `percentage_applied` uses DECIMAL(5,4) to represent values like 0.2800 (28%)
- Status workflow: pending → approved → paid (or voided at any stage)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- apps/web/prisma/migrations/20260404100010_carrier_documents/migration.sql: FOUND
- apps/web/prisma/migrations/20260404100011_carrier_expenses/migration.sql: FOUND
- apps/web/prisma/migrations/20260404100012_driver_pay_records/migration.sql: FOUND

Commit 8502964: FOUND
