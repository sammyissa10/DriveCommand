---
phase: quick-154
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260404100007_carrier_dispatches/migration.sql
  - apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql
  - apps/web/prisma/migrations/20260404100009_carrier_stops/migration.sql
autonomous: true
must_haves:
  truths:
    - "dispatches table exists with all specified columns and constraints"
    - "loads table exists with client_id NOT NULL and broker_flag constraint"
    - "stops table exists with sequence_order and skip_reason constraint"
    - "dispatches has NO client_id column (hard architectural rule)"
    - "relay_handoff_stop_id on dispatches is a plain UUID with no FK"
  artifacts:
    - path: "apps/web/prisma/migrations/20260404100007_carrier_dispatches/migration.sql"
      provides: "dispatches table creation"
    - path: "apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql"
      provides: "loads table creation"
    - path: "apps/web/prisma/migrations/20260404100009_carrier_stops/migration.sql"
      provides: "stops table creation"
  key_links:
    - from: "dispatches"
      to: "carrier_drivers, carrier_trucks, route_templates, \"User\", \"Tenant\""
      via: "foreign keys"
    - from: "loads"
      to: "dispatches, contracts, clients, \"Tenant\""
      via: "foreign keys"
    - from: "stops"
      to: "dispatches, loads, clients, facilities"
      via: "foreign keys"
---

<objective>
Create three SQL migration files for Carrier Operations: dispatches (007), loads (008), and stops (009).

Purpose: Continue building the carrier ops data model with the core operational tables.
Output: Three migration files applied to the database.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/migration.sql
@apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql
@apps/web/prisma/migrations/20260404100001_carrier_clients/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration 007 (dispatches), 008 (loads), 009 (stops)</name>
  <files>
    apps/web/prisma/migrations/20260404100007_carrier_dispatches/migration.sql
    apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql
    apps/web/prisma/migrations/20260404100009_carrier_stops/migration.sql
  </files>
  <action>
Create three SQL migration files following the exact pattern of migrations 001-006. Each file lives in a timestamped directory as `migration.sql`.

**007 — dispatches table** (`20260404100007_carrier_dispatches/migration.sql`):
- Comment header: depends on 005 (route_templates), 004 (carrier_drivers, carrier_trucks), "User", "Tenant"
- CREATE TABLE dispatches with all fields from spec
- FKs: route_template_id -> route_templates(id), primary_driver_id -> carrier_drivers(id), co_driver_id -> carrier_drivers(id), truck_id -> carrier_trucks(id), trailer_id -> carrier_trucks(id), dispatcher_id -> "User"(id), org_id -> "Tenant"(id)
- relay_handoff_stop_id is a PLAIN UUID — NO foreign key (circular ref avoidance, comment explaining why)
- CHECK constraint on status: ('planned','in_progress','completed','cancelled','tonu')
- CRITICAL: NO client_id column — add comment noting this is an architectural rule
- Indexes: idx_dispatches_primary_driver_id, idx_dispatches_truck_id, idx_dispatches_status, idx_dispatches_scheduled_departure, idx_dispatches_org_id
- Use ON DELETE RESTRICT ON UPDATE CASCADE for all FKs (matching carrier convention)
- Use ON DELETE SET NULL ON UPDATE CASCADE for optional FKs (co_driver_id, trailer_id, route_template_id)

**008 — loads table** (`20260404100008_carrier_loads/migration.sql`):
- Comment header: depends on 007 (dispatches), 002 (contracts), 001 (clients), "Tenant"
- CREATE TABLE loads with all fields from spec
- FKs: dispatch_id -> dispatches(id), contract_id -> contracts(id), client_id -> clients(id) NOT NULL, org_id -> "Tenant"(id)
- CHECK on load_type: ('ftl','ltl','partial','team')
- CHECK on status: ('pending','assigned','in_transit','delivered','invoiced','paid','cancelled')
- CHECK on rate_type: ('per_mile','flat','per_cwt','per_pallet','per_stop','hourly')
- CHECK: (broker_flag = false OR carrier_cost IS NOT NULL)
- All DECIMAL money fields — never FLOAT
- Indexes: idx_loads_client_id, idx_loads_dispatch_id, idx_loads_status, idx_loads_created_at, idx_loads_org_id

**009 — stops table** (`20260404100009_carrier_stops/migration.sql`):
- Comment header: depends on 007 (dispatches), 008 (loads), 001 (clients), 003 (facilities)
- CREATE TABLE stops with all fields from spec
- FKs: dispatch_id -> dispatches(id), load_id -> loads(id), client_id -> clients(id), facility_id -> facilities(id) NOT NULL
- CHECK on stop_type: ('pickup','delivery','fuel_stop','layover','relay_handoff')
- CHECK on status: ('pending','arrived','completed','skipped')
- CHECK: (status != 'skipped' OR skip_reason IS NOT NULL)
- NO org_id — tenant scoping via parent dispatch/load
- Indexes: idx_stops_dispatch_id, idx_stops_load_id, idx_stops_client_id, idx_stops_status, idx_stops_sequence_order
- Add comment: ordering is EXCLUSIVELY by sequence_order, never by stop_type

Use the same SQL formatting style as 006: aligned columns, named constraints (e.g., dispatches_pkey, dispatches_status_check, dispatches_primary_driver_id_fkey), comment blocks for sections.
  </action>
  <verify>
Run migration: `cd apps/web && node scripts/migrate.mjs`

Then verify with SQL queries:
1. `SELECT column_name FROM information_schema.columns WHERE table_name='dispatches' AND column_name='client_id'` returns 0 rows
2. `SELECT is_nullable FROM information_schema.columns WHERE table_name='loads' AND column_name='client_id'` returns 'NO'
3. All three tables exist with correct column counts
  </verify>
  <done>
Three migration files created and applied. dispatches has no client_id column. loads has NOT NULL client_id. stops has no org_id. All FKs, CHECKs, and indexes created. relay_handoff_stop_id has no FK.
  </done>
</task>

</tasks>

<verification>
- All three migration directories exist with migration.sql files
- `node scripts/migrate.mjs` succeeds from apps/web/
- dispatches table: no client_id column, relay_handoff_stop_id has no FK
- loads table: client_id is NOT NULL, broker_flag CHECK works
- stops table: no org_id, skip_reason CHECK works
- All money fields are DECIMAL, not FLOAT
</verification>

<success_criteria>
- Three new tables (dispatches, loads, stops) exist in database
- All constraints, indexes, and foreign keys are correctly applied
- Architectural rules verified: no client_id on dispatches, NOT NULL client_id on loads
</success_criteria>

<output>
After completion, create `.planning/quick/154-carrier-ops-migrations-007-009/154-SUMMARY.md`
</output>
