---
phase: quick-153
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260404100005_carrier_route_templates/migration.sql
  - apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/migration.sql
autonomous: true
must_haves:
  truths:
    - "route_templates table exists with all specified columns and constraints"
    - "route_template_stops table exists with CASCADE delete and unique constraint"
    - "Both tables have org_id referencing tenants(id)"
    - "Migrations 001-004 remain untouched"
  artifacts:
    - path: "apps/web/prisma/migrations/20260404100005_carrier_route_templates/migration.sql"
      provides: "route_templates table DDL"
      contains: "CREATE TABLE route_templates"
    - path: "apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/migration.sql"
      provides: "route_template_stops table DDL"
      contains: "CREATE TABLE route_template_stops"
  key_links:
    - from: "route_templates"
      to: "clients(id), contracts(id), carrier_drivers(id), carrier_trucks(id), tenants(id)"
      via: "REFERENCES foreign keys"
      pattern: "REFERENCES"
    - from: "route_template_stops"
      to: "route_templates(id), facilities(id), tenants(id)"
      via: "REFERENCES foreign keys with CASCADE"
      pattern: "ON DELETE CASCADE"
---

<objective>
Create SQL migrations 005 and 006 for the Carrier Operations module: route_templates and route_template_stops tables.

Purpose: These tables enable dispatchers to define reusable route templates with ordered stops, supporting scheduled route generation for recurring freight lanes.
Output: Two migration SQL files applied to the database.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration 005 — route_templates table</name>
  <files>apps/web/prisma/migrations/20260404100005_carrier_route_templates/migration.sql</files>
  <action>
Create directory `apps/web/prisma/migrations/20260404100005_carrier_route_templates/` and write `migration.sql` with:

CREATE TABLE route_templates with these columns:
- id UUID PK DEFAULT gen_random_uuid()
- template_name VARCHAR(200) NOT NULL
- contract_id UUID REFERENCES contracts(id) — nullable
- client_id UUID NOT NULL REFERENCES clients(id)
- schedule_type VARCHAR(20) NOT NULL CHECK (schedule_type IN ('fixed_days','frequency','on_call'))
- recurrence_rule VARCHAR(500)
- recurrence_timezone VARCHAR(100) NOT NULL DEFAULT 'America/Chicago'
- scheduled_departure_time TIME
- equipment_type VARCHAR(30) NOT NULL CHECK (equipment_type IN ('dry_van','flatbed','reefer','tanker','step_deck','other'))
- temp_min_f INTEGER
- temp_max_f INTEGER
- max_weight_lbs INTEGER
- commodity_description TEXT
- estimated_miles INTEGER
- default_driver_id UUID REFERENCES carrier_drivers(id) — nullable
- default_truck_id UUID REFERENCES carrier_trucks(id) — nullable
- auto_generate_days_ahead INTEGER NOT NULL DEFAULT 7
- active BOOLEAN NOT NULL DEFAULT true
- notes TEXT
- org_id UUID NOT NULL REFERENCES tenants(id)
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
- updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

Add indexes on: client_id, contract_id, active, org_id (four separate CREATE INDEX statements).
Use naming convention: idx_route_templates_{column}.

Do NOT add RLS policies. Do NOT modify any existing tables.
  </action>
  <verify>Check SQL syntax is valid by reviewing the file contents.</verify>
  <done>migration.sql exists at the correct path with all columns, constraints, and indexes.</done>
</task>

<task type="auto">
  <name>Task 2: Create migration 006 — route_template_stops table</name>
  <files>apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/migration.sql</files>
  <action>
Create directory `apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/` and write `migration.sql` with:

CREATE TABLE route_template_stops with these columns:
- id UUID PK DEFAULT gen_random_uuid()
- route_template_id UUID NOT NULL REFERENCES route_templates(id) ON DELETE CASCADE
- sequence_order INTEGER NOT NULL
- stop_type VARCHAR(20) NOT NULL CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover'))
- facility_id UUID NOT NULL REFERENCES facilities(id)
- contact_name VARCHAR(200)
- contact_phone VARCHAR(30)
- appt_window_start_offset_min INTEGER
- appt_window_end_offset_min INTEGER
- expected_dwell_minutes INTEGER
- commodity_description TEXT
- bol_required BOOLEAN NOT NULL DEFAULT true
- pod_required BOOLEAN NOT NULL DEFAULT true
- special_instructions TEXT
- org_id UUID NOT NULL REFERENCES tenants(id)
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

Add UNIQUE constraint on (route_template_id, sequence_order).
Add index on route_template_id: idx_route_template_stops_route_template_id.

Do NOT add any auto-sort logic — sequence_order is dispatcher-controlled.
Do NOT add RLS policies. Do NOT modify any existing tables.
  </action>
  <verify>Check SQL syntax is valid by reviewing the file contents.</verify>
  <done>migration.sql exists at the correct path with all columns, constraints, unique constraint, and index.</done>
</task>

<task type="auto">
  <name>Task 3: Run migrations and verify tables exist</name>
  <files></files>
  <action>
Run `node scripts/migrate.mjs` from the `apps/web/` directory.

After migration completes, verify both tables exist by checking the migration output for success.

If migration fails, read the error, fix the SQL in the relevant migration file, and re-run.
  </action>
  <verify>Migration script exits successfully. Both route_templates and route_template_stops tables are confirmed created.</verify>
  <done>Both migrations applied without error. Tables exist in the database with all columns, constraints, and indexes.</done>
</task>

</tasks>

<verification>
- Migration 005 creates route_templates with all 21 columns, 2 CHECK constraints, 5 FKs, 4 indexes
- Migration 006 creates route_template_stops with all 16 columns, 1 CHECK constraint, 3 FKs, 1 UNIQUE constraint, 1 index
- Both tables have org_id NOT NULL REFERENCES tenants(id)
- ON DELETE CASCADE on route_template_stops.route_template_id
- No existing migrations modified
- No RLS policies added
- `node scripts/migrate.mjs` succeeds
</verification>

<success_criteria>
Both migration files exist and have been applied to the database. Tables route_templates and route_template_stops are live with all specified columns, constraints, indexes, and foreign keys.
</success_criteria>

<output>
After completion, create `.planning/quick/153-carrier-ops-migrations-005-006/153-SUMMARY.md`
</output>
