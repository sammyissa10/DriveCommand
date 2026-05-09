---
phase: quick-155
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260404100010_carrier_documents/migration.sql
  - apps/web/prisma/migrations/20260404100011_carrier_expenses/migration.sql
  - apps/web/prisma/migrations/20260404100012_driver_pay_records/migration.sql
autonomous: true
must_haves:
  truths:
    - "carrier_documents table exists with polymorphic parent_type/parent_id columns"
    - "carrier_expenses table exists with CHECK requiring dispatch_id OR load_id"
    - "driver_pay_records table exists with all pay model fields and status workflow"
    - "All money columns use DECIMAL, never FLOAT"
    - "FK references to users use quoted PascalCase \"User\""
    - "FK references to tenants use quoted PascalCase \"Tenant\""
  artifacts:
    - path: "apps/web/prisma/migrations/20260404100010_carrier_documents/migration.sql"
      provides: "carrier_documents table"
    - path: "apps/web/prisma/migrations/20260404100011_carrier_expenses/migration.sql"
      provides: "carrier_expenses table"
    - path: "apps/web/prisma/migrations/20260404100012_driver_pay_records/migration.sql"
      provides: "driver_pay_records table"
  key_links:
    - from: "carrier_expenses"
      to: "carrier_documents"
      via: "receipt_document_id FK"
      pattern: "REFERENCES carrier_documents"
---

<objective>
Create three SQL migration files for the Carrier Operations module: carrier_documents (010), carrier_expenses (011), and driver_pay_records (012).

Purpose: These tables complete the financial and document management layer of the carrier ops module — document attachments, expense tracking, and driver pay calculations.
Output: Three migration.sql files ready to deploy.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql
@apps/web/prisma/migrations/20260404100009_carrier_stops/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create all three migration SQL files</name>
  <files>
    apps/web/prisma/migrations/20260404100010_carrier_documents/migration.sql
    apps/web/prisma/migrations/20260404100011_carrier_expenses/migration.sql
    apps/web/prisma/migrations/20260404100012_driver_pay_records/migration.sql
  </files>
  <action>
Create three migration directories and SQL files following the exact style of existing migrations (008, 009). Each file gets a header comment block with migration number, description, and dependency notes.

**010 — carrier_documents:**
- CREATE TABLE carrier_documents with all fields per spec
- id UUID PK DEFAULT gen_random_uuid()
- parent_type VARCHAR(20) NOT NULL with CHECK ('stop','load','dispatch','contract','expense')
- parent_id UUID NOT NULL — NO foreign key (polymorphic reference)
- stop_id UUID with FK to stops(id) ON DELETE SET NULL ON UPDATE CASCADE
- client_id UUID with FK to clients(id) ON DELETE SET NULL ON UPDATE CASCADE
- document_type VARCHAR(30) NOT NULL with CHECK ('bol','pod','rate_confirmation','lumper_receipt','weight_ticket','inspection_report','expense_receipt','insurance_certificate','other')
- file_url VARCHAR(500) NOT NULL, filename VARCHAR(255) NOT NULL, file_size_bytes INTEGER
- uploaded_by UUID NOT NULL FK to "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
- verified BOOLEAN NOT NULL DEFAULT false
- verified_by UUID FK to "User"(id) ON DELETE SET NULL ON UPDATE CASCADE
- verified_at TIMESTAMPTZ
- notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Named constraints: carrier_documents_pkey, carrier_documents_parent_type_check, carrier_documents_document_type_check, all FK constraints named carrier_documents_*_fkey
- Indexes: idx_carrier_documents_parent (parent_type, parent_id), idx_carrier_documents_stop_id, idx_carrier_documents_client_id

**011 — carrier_expenses:**
- CREATE TABLE carrier_expenses with all fields per spec
- id UUID PK DEFAULT gen_random_uuid()
- dispatch_id UUID FK to dispatches(id) ON DELETE SET NULL ON UPDATE CASCADE
- load_id UUID FK to loads(id) ON DELETE SET NULL ON UPDATE CASCADE
- stop_id UUID FK to stops(id) ON DELETE SET NULL ON UPDATE CASCADE
- client_id UUID FK to clients(id) ON DELETE SET NULL ON UPDATE CASCADE
- expense_type VARCHAR(30) NOT NULL with CHECK ('fuel','tolls','scales','lumper','parking','maintenance_emergency','driver_advance','other')
- amount DECIMAL(10,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'USD'
- paid_by VARCHAR(20) NOT NULL with CHECK ('driver_cash','company_card','fuel_card','driver_advance')
- driver_id UUID FK to carrier_drivers(id) ON DELETE SET NULL ON UPDATE CASCADE
- receipt_document_id UUID FK to carrier_documents(id) ON DELETE SET NULL ON UPDATE CASCADE
- submitted_at TIMESTAMPTZ
- approved_by UUID FK to "User"(id) ON DELETE SET NULL ON UPDATE CASCADE
- approved_at TIMESTAMPTZ
- reimbursable BOOLEAN NOT NULL DEFAULT true
- notes TEXT
- org_id UUID NOT NULL FK to "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
- TABLE-LEVEL CHECK: CHECK (dispatch_id IS NOT NULL OR load_id IS NOT NULL)
- Indexes: idx_carrier_expenses_dispatch_id, idx_carrier_expenses_load_id, idx_carrier_expenses_driver_id, idx_carrier_expenses_client_id, idx_carrier_expenses_org_id

**012 — driver_pay_records:**
- CREATE TABLE driver_pay_records with all fields per spec
- id UUID PK DEFAULT gen_random_uuid()
- driver_id UUID NOT NULL FK to carrier_drivers(id) ON DELETE RESTRICT ON UPDATE CASCADE
- dispatch_id UUID FK to dispatches(id) ON DELETE SET NULL ON UPDATE CASCADE
- load_id UUID FK to loads(id) ON DELETE SET NULL ON UPDATE CASCADE
- client_id UUID FK to clients(id) ON DELETE SET NULL ON UPDATE CASCADE
- pay_model VARCHAR(30) NOT NULL with CHECK ('per_mile','percentage_gross','hourly','flat','salary')
- All numeric fields: loaded_miles INTEGER, empty_miles INTEGER, loaded_rate DECIMAL(8,4), empty_rate DECIMAL(8,4), hours_worked DECIMAL(6,2), hourly_rate DECIMAL(8,2), gross_revenue DECIMAL(12,2), percentage_applied DECIMAL(5,4), flat_amount DECIMAL(10,2)
- base_pay DECIMAL(10,2) NOT NULL DEFAULT 0, bonuses DECIMAL(8,2) NOT NULL DEFAULT 0, tips DECIMAL(8,2) NOT NULL DEFAULT 0, deductions DECIMAL(8,2) NOT NULL DEFAULT 0, reimbursements DECIMAL(8,2) NOT NULL DEFAULT 0, net_pay DECIMAL(10,2) NOT NULL DEFAULT 0
- pay_period_start DATE, pay_period_end DATE
- status VARCHAR(20) NOT NULL DEFAULT 'pending' with CHECK ('pending','approved','paid','voided')
- approved_by UUID FK to "User"(id) ON DELETE SET NULL ON UPDATE CASCADE
- approved_at TIMESTAMPTZ
- notes TEXT
- org_id UUID NOT NULL FK to "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Indexes: idx_driver_pay_records_driver_id, idx_driver_pay_records_dispatch_id, idx_driver_pay_records_status, idx_driver_pay_records_pay_period_start
  </action>
  <verify>
Run `cd /c/Users/sammy/Projects/DriveCommand/apps/web && node scripts/migrate.mjs` and confirm all three migrations apply successfully.
  </verify>
  <done>All three migration files exist and have been applied to the database.</done>
</task>

<task type="auto">
  <name>Task 2: Verify constraints and column types</name>
  <files></files>
  <action>
Run two post-migration verification queries against the database:

1. **CHECK constraint on carrier_expenses** — Attempt an INSERT into carrier_expenses with both dispatch_id and load_id set to NULL. This must fail with a CHECK constraint violation. Use a throwaway org_id from the Tenant table. The INSERT should be wrapped in a transaction that gets rolled back regardless.

2. **DECIMAL column verification** — Query information_schema.columns for all three new tables, filtering for columns with data_type = 'numeric'. Confirm that none have numeric_precision = 53 (which would indicate FLOAT/DOUBLE PRECISION was used instead of DECIMAL). All money columns must show their specified precision (e.g., 10 for DECIMAL(10,2), 8 for DECIMAL(8,2), etc.).

Run these via `npx prisma db execute --stdin` from apps/web or via the Supabase MCP SQL tool.
  </action>
  <verify>
- The NULL dispatch_id + NULL load_id INSERT attempt fails with constraint violation
- All numeric columns show correct precision values (no precision=53 floats)
  </verify>
  <done>Both constraint and column type verifications pass, confirming correct DDL.</done>
</task>

</tasks>

<verification>
- All three migration directories exist with correct timestamp naming
- `node scripts/migrate.mjs` completes without errors
- carrier_documents, carrier_expenses, driver_pay_records tables exist in DB
- carrier_expenses CHECK (dispatch_id IS NOT NULL OR load_id IS NOT NULL) enforced
- All DECIMAL columns confirmed via information_schema (no FLOAT leaks)
- No existing tables or migrations were modified
</verification>

<success_criteria>
Three new carrier ops tables (carrier_documents, carrier_expenses, driver_pay_records) are live in the database with correct constraints, indexes, and FK references. All money fields use DECIMAL. The carrier_expenses dispatch/load check constraint is enforced.
</success_criteria>

<output>
After completion, create `.planning/quick/155-carrier-ops-migrations-010-012/155-SUMMARY.md`
</output>
