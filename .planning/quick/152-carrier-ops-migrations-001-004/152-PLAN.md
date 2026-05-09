---
phase: quick-152
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260404100001_carrier_clients/migration.sql
  - apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql
  - apps/web/prisma/migrations/20260404100003_carrier_facilities/migration.sql
  - apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql
autonomous: true
must_haves:
  truths:
    - "Four new tables exist in the database: clients, contracts, facilities, carrier_drivers, carrier_trucks"
    - "All tables have org_id FK to Tenant for multi-tenancy"
    - "All CHECK constraints are enforced"
    - "No existing tables or migrations are modified"
  artifacts:
    - path: "apps/web/prisma/migrations/20260404100001_carrier_clients/migration.sql"
      provides: "clients table"
    - path: "apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql"
      provides: "contracts table"
    - path: "apps/web/prisma/migrations/20260404100003_carrier_facilities/migration.sql"
      provides: "facilities table"
    - path: "apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql"
      provides: "carrier_drivers and carrier_trucks tables"
  key_links:
    - from: "contracts.client_id"
      to: "clients.id"
      via: "FK reference"
    - from: "carrier_drivers.home_terminal_id"
      to: "facilities.id"
      via: "FK reference"
    - from: "carrier_drivers.user_id"
      to: "User.id"
      via: "FK reference"
    - from: "all tables org_id"
      to: "Tenant.id"
      via: "FK reference"
---

<objective>
Create four Carrier Operations SQL migration files (clients, contracts, facilities, carrier_drivers/carrier_trucks) and apply them to the database.

Purpose: Foundation tables for the Carrier Operations module — these are new tables that do NOT touch existing schema.
Output: Five new database tables applied via `node scripts/migrate.mjs`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/scripts/migrate.mjs
@apps/web/prisma/migrations/00000000000000_init/migration.sql (for FK table name casing: "Tenant", "User")
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create all four migration SQL files</name>
  <files>
    apps/web/prisma/migrations/20260404100001_carrier_clients/migration.sql
    apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql
    apps/web/prisma/migrations/20260404100003_carrier_facilities/migration.sql
    apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql
  </files>
  <action>
Create four migration directories under `apps/web/prisma/migrations/`, each containing a `migration.sql` file. The migrate script (`scripts/migrate.mjs`) expects this `<dirname>/migration.sql` structure — NOT flat SQL files.

IMPORTANT: Existing tables use PascalCase quoted identifiers. FK references MUST match:
- `REFERENCES "Tenant"("id")` (not `tenants(id)`)
- `REFERENCES "User"("id")` (not `users(id)`)

The NEW carrier tables use lowercase names (clients, contracts, facilities, carrier_drivers, carrier_trucks) as specified.

**Migration 001 — clients:**
Create `clients` table with all columns per spec. Include:
- CHECK constraint on status IN ('active','inactive','blocked')
- CHECK constraint: portal_access = false OR portal_email IS NOT NULL
- Indexes on org_id and status
- org_id FK to "Tenant"("id")

**Migration 002 — contracts:**
Create `contracts` table with all columns per spec. Include:
- CHECK constraints on contract_type, rate_type, fuel_surcharge_method, status
- UNIQUE on contract_number
- Indexes on client_id, status, org_id
- client_id FK to clients(id)
- org_id FK to "Tenant"("id")

**Migration 003 — facilities:**
Create `facilities` table with all columns per spec. Include:
- CHECK constraint on facility_type
- Indexes on org_id and facility_type
- org_id FK to "Tenant"("id")

**Migration 004 — carrier_drivers and carrier_trucks:**
Create BOTH tables in one migration. Include:
- carrier_drivers: CHECK constraints on cdl_class, pay_model, pay_period, status
- carrier_drivers: user_id UNIQUE, FK to "User"("id")
- carrier_drivers: home_terminal_id FK to facilities(id)
- carrier_drivers: org_id FK to "Tenant"("id")
- carrier_drivers: Indexes on org_id, status
- carrier_trucks: CHECK constraints on truck_type, status
- carrier_trucks: org_id FK to "Tenant"("id")
- carrier_trucks: Indexes on org_id, status

Do NOT add RLS policies. Do NOT modify any existing tables.
  </action>
  <verify>All four directories exist with migration.sql files: `ls apps/web/prisma/migrations/20260404100*`</verify>
  <done>Four migration SQL files created with correct table definitions, constraints, indexes, and FK references.</done>
</task>

<task type="auto">
  <name>Task 2: Apply migrations and verify tables exist</name>
  <files></files>
  <action>
Run `node scripts/migrate.mjs` from `apps/web/` directory to apply all four migrations.

After successful migration, verify all five tables exist by querying the database:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('clients','contracts','facilities','carrier_drivers','carrier_trucks');
```

Expect exactly 5 rows returned.

If migration fails, read the error, fix the SQL file, and re-run. Common issues:
- Wrong FK table name casing (must be "Tenant" not "tenants")
- Missing referenced table (migrations run in alphabetical order by dirname, so 001 before 002 etc.)
  </action>
  <verify>`node scripts/migrate.mjs` completes with "4 applied" and all 5 tables exist in the database.</verify>
  <done>All migrations applied successfully. clients, contracts, facilities, carrier_drivers, and carrier_trucks tables exist in the database.</done>
</task>

</tasks>

<verification>
- `node scripts/migrate.mjs` reports 4 migrations applied (or "up to date" on re-run)
- Query information_schema.tables confirms all 5 new tables exist
- No existing tables were modified (check git diff shows only new files)
</verification>

<success_criteria>
- Five new tables (clients, contracts, facilities, carrier_drivers, carrier_trucks) exist in the database
- All CHECK constraints, indexes, and FK references are in place
- No existing migrations or tables were modified
- Migrations are idempotent (re-running migrate.mjs says "up to date")
</success_criteria>

<output>
After completion, create `.planning/quick/152-carrier-ops-migrations-001-004/152-SUMMARY.md`
</output>
