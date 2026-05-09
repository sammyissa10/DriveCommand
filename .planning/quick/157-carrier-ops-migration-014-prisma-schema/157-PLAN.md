---
phase: quick-157
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql
  - apps/web/prisma/schema.prisma
autonomous: true
must_haves:
  truths:
    - "Migration 014 creates carrier_catalog_meta table with 19 enum groups seeded"
    - "Prisma schema has 14 new carrier models matching the 13 SQL tables plus CarrierCatalogMeta"
    - "prisma generate succeeds and tsc --noEmit produces no new errors"
  artifacts:
    - path: "apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql"
      provides: "carrier_catalog_meta table DDL + seed INSERT statements"
    - path: "apps/web/prisma/schema.prisma"
      provides: "14 appended Prisma models for carrier operations"
  key_links:
    - from: "schema.prisma carrier models"
      to: "SQL tables from migrations 001-013"
      via: "@@map directives mapping PascalCase models to snake_case tables"
      pattern: '@@map\("(clients|contracts|facilities|carrier_drivers|carrier_trucks|route_templates|route_template_stops|dispatches|loads|stops|carrier_documents|carrier_expenses|driver_pay_records|carrier_catalog_meta)"\)'
---

<objective>
Create migration 014 (carrier_catalog_meta table + enum seed data) and append 14 Prisma models to schema.prisma for all carrier operations tables created in migrations 001-013.

Purpose: Completes the Prisma ORM layer for carrier operations, enabling typed queries against all 14 carrier tables.
Output: Working migration + updated Prisma client with all carrier models.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma
@apps/web/prisma/migrations/20260404100001_carrier_clients/migration.sql
@apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql
@apps/web/prisma/migrations/20260404100003_carrier_facilities/migration.sql
@apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql
@apps/web/prisma/migrations/20260404100005_carrier_route_templates/migration.sql
@apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/migration.sql
@apps/web/prisma/migrations/20260404100007_carrier_dispatches/migration.sql
@apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql
@apps/web/prisma/migrations/20260404100009_carrier_stops/migration.sql
@apps/web/prisma/migrations/20260404100010_carrier_documents/migration.sql
@apps/web/prisma/migrations/20260404100011_carrier_expenses/migration.sql
@apps/web/prisma/migrations/20260404100012_driver_pay_records/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration 014 SQL — carrier_catalog_meta table + enum seed data</name>
  <files>apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql</files>
  <action>
Create directory `apps/web/prisma/migrations/20260404100014_carrier_seed_enums/` and write `migration.sql` containing:

1. CREATE TABLE carrier_catalog_meta with columns:
   - id UUID PK DEFAULT gen_random_uuid()
   - enum_group VARCHAR(100) NOT NULL
   - enum_value VARCHAR(100) NOT NULL
   - display_label VARCHAR(200) NOT NULL
   - sort_order INTEGER NOT NULL DEFAULT 0
   - active BOOLEAN NOT NULL DEFAULT true

2. CREATE UNIQUE INDEX carrier_catalog_meta_group_value ON carrier_catalog_meta(enum_group, enum_value)

3. INSERT statements with ON CONFLICT (enum_group, enum_value) DO NOTHING for these 19 enum groups (sort_order = 0-based position within each group):

   - client_status: active/Active(0), inactive/Inactive(1), blocked/Blocked(2)
   - contract_type: spot_rate/Spot Rate(0), dedicated/Dedicated(1), contract_lane/Contract Lane(2), brokered/Brokered(3)
   - rate_type: per_mile/Per Mile(0), per_load/Per Load(1), per_hour/Per Hour(2), per_stop/Per Stop(3), flat/Flat Rate(4), per_cwt/Per CWT(5), per_pallet/Per Pallet(6), hourly/Hourly(7)
   - fuel_surcharge_method: none/None(0), doe_index/DOE Index(1), fixed_per_mile/Fixed Per Mile(2), fixed_flat/Fixed Flat(3)
   - schedule_type: fixed_days/Fixed Days(0), frequency/Frequency(1), on_call/On Call(2)
   - equipment_type: dry_van/Dry Van(0), flatbed/Flatbed(1), reefer/Refrigerated(2), tanker/Tanker(3), step_deck/Step Deck(4), other/Other(5)
   - dispatch_status: planned/Planned(0), in_progress/In Progress(1), completed/Completed(2), cancelled/Cancelled(3), tonu/TONU(4)
   - load_status: pending/Pending(0), assigned/Assigned(1), in_transit/In Transit(2), delivered/Delivered(3), invoiced/Invoiced(4), paid/Paid(5), cancelled/Cancelled(6)
   - load_type: ftl/Full Truckload (FTL)(0), ltl/Less Than Truckload (LTL)(1), partial/Partial(2), team/Team Load(3)
   - stop_type: pickup/Pickup(0), delivery/Delivery(1), fuel_stop/Fuel Stop(2), layover/Layover(3), relay_handoff/Relay Handoff(4)
   - stop_status: pending/Pending(0), arrived/Arrived(1), completed/Completed(2), skipped/Skipped(3)
   - document_type: bol/Bill of Lading(0), pod/Proof of Delivery(1), rate_confirmation/Rate Confirmation(2), lumper_receipt/Lumper Receipt(3), weight_ticket/Weight Ticket(4), inspection_report/Inspection Report(5), expense_receipt/Expense Receipt(6), insurance_certificate/Insurance Certificate(7), other/Other(8)
   - expense_type: fuel/Fuel(0), tolls/Tolls(1), scales/Scales(2), lumper/Lumper(3), parking/Parking(4), maintenance_emergency/Emergency Maintenance(5), driver_advance/Driver Advance(6), other/Other(7)
   - paid_by: driver_cash/Driver Cash(0), company_card/Company Card(1), fuel_card/Fuel Card(2), driver_advance/Driver Advance(3)
   - pay_model: per_mile/Per Mile(0), percentage_gross/Percentage of Gross(1), hourly/Hourly(2), flat/Flat Rate(3), salary/Salary(4)
   - pay_record_status: pending/Pending(0), approved/Approved(1), paid/Paid(2), voided/Voided(3)
   - facility_type: shipper/Shipper(0), receiver/Receiver(1), terminal/Terminal(2), fuel_stop/Fuel Stop(3), other/Other(4)
   - truck_type: day_cab/Day Cab(0), sleeper/Sleeper(1)
   - driver_status: active/Active(0), inactive/Inactive(1), terminated/Terminated(2)

Then run `node scripts/migrate.mjs` from `apps/web/` to apply migration 014 to the database.
  </action>
  <verify>Run `node scripts/migrate.mjs` from apps/web/ — should succeed with no errors. Query: the carrier_catalog_meta table should exist and contain rows.</verify>
  <done>Migration 014 applied successfully. carrier_catalog_meta table exists with unique index and all 19 enum groups seeded.</done>
</task>

<task type="auto">
  <name>Task 2: Append 14 Prisma models to schema.prisma for carrier tables</name>
  <files>apps/web/prisma/schema.prisma</files>
  <action>
Read the full schema.prisma first. APPEND (do not modify existing models) 14 new models at the end of the file. Follow existing conventions:
- PascalCase model names, camelCase field names
- `@@map("snake_case_table_name")` for SQL table mapping
- `@db.Uuid` on UUID fields
- `@default(dbgenerated("gen_random_uuid()"))` on UUID PKs
- `@default(now()) @db.Timestamptz` on createdAt
- `@updatedAt @db.Timestamptz` on updatedAt
- `Decimal` with `@db.Decimal(p,s)` for money fields
- `String` for all enum-like VARCHAR fields (no Prisma enums for carrier tables)
- Named `@relation` directives to disambiguate multiple FKs to same model

IMPORTANT naming rules to avoid conflicts with existing models (Load, Document, Truck already exist):
- Use `CarrierClient` (maps to "clients")
- Use `CarrierContract` (maps to "contracts")
- Use `CarrierFacility` (maps to "facilities")
- Use `CarrierDriver` (maps to "carrier_drivers")
- Use `CarrierTruck` (maps to "carrier_trucks")
- Use `RouteTemplate` (maps to "route_templates")
- Use `RouteTemplateStop` (maps to "route_template_stops")
- Use `CarrierDispatch` (maps to "dispatches") — avoid conflict potential
- Use `CarrierLoad` (maps to "loads") — existing `Load` model already uses "Load" table via Prisma default
- Use `CarrierStop` (maps to "stops")
- Use `CarrierDocument` (maps to "carrier_documents")
- Use `CarrierExpense` (maps to "carrier_expenses")
- Use `DriverPayRecord` (maps to "driver_pay_records")
- Use `CarrierCatalogMeta` (maps to "carrier_catalog_meta")

For each model, match columns EXACTLY from the migration SQL files (migrations 001-013 + 014). Key patterns:
- `org_id` in SQL → `orgId String @db.Uuid` with relation to Tenant
- All FK fields need `@relation` directives
- Multiple FKs to same model need named relations (e.g., CarrierDispatch has primaryDriver/coDriver both to CarrierDriver, truck/trailer both to CarrierTruck)
- Tables without org_id (stops, carrier_documents, route_template_stops) do NOT have Tenant relation
- carrier_catalog_meta is standalone — no relations
- Use `Float` for DOUBLE PRECISION columns (latitude/longitude on facilities)
- Use `Int` for INTEGER columns
- Use `DateTime` for TIMESTAMPTZ columns
- Use `Decimal` for NUMERIC/DECIMAL columns with matching precision

Also add reverse relation arrays to the Tenant and User models:
- On Tenant: add arrays for CarrierClient, CarrierContract, CarrierFacility, CarrierDriver, CarrierTruck, RouteTemplate, CarrierDispatch, CarrierLoad, CarrierExpense, DriverPayRecord
- On User: add named relation arrays for CarrierDriver (user link), CarrierDispatch (dispatcher), CarrierDocument (uploadedBy, verifiedBy), CarrierExpense (approvedBy), DriverPayRecord (approvedBy)

Make sure the `@@map()` table names match EXACTLY what the SQL migrations created. Add `@@index` directives matching the indexes from the SQL migrations.
  </action>
  <verify>Run `npx prisma generate` from apps/web/ — must succeed with no errors. Then run `npx prisma db pull --print` to verify models align with actual database tables (optional sanity check).</verify>
  <done>14 new Prisma models appended to schema.prisma. All models map to correct SQL tables. Reverse relations added to Tenant and User. prisma generate succeeds.</done>
</task>

<task type="auto">
  <name>Task 3: Validate TypeScript compilation</name>
  <files>apps/web/prisma/schema.prisma</files>
  <action>
Run `npx tsc --noEmit` from apps/web/ to verify zero new TypeScript errors from the schema changes. The Prisma client is generated to `apps/web/src/generated/prisma` (per generator config).

If new tsc errors appear that are CAUSED by the new models (e.g., missing reverse relations breaking existing code), fix them by adjusting the schema.prisma additions. Do NOT fix pre-existing errors.

Common issues to watch for:
- If adding reverse relation arrays to User or Tenant causes ambiguous relation errors, add explicit `@relation(name: "...")` disambiguation
- If any existing code imports from the generated Prisma client and the new model names shadow something, rename with Carrier prefix
  </action>
  <verify>`npx tsc --noEmit` from apps/web/ — must complete. Count of errors should not increase from baseline.</verify>
  <done>tsc --noEmit passes (or error count unchanged from pre-existing baseline). New carrier models are fully typed and available in the Prisma client.</done>
</task>

</tasks>

<verification>
1. `SELECT count(*) FROM carrier_catalog_meta;` returns row count matching total seed rows across all 19 groups
2. `npx prisma generate` succeeds from apps/web/
3. `npx tsc --noEmit` from apps/web/ has no new errors
4. `npx prisma db pull --print 2>/dev/null | grep -c "model"` shows increased model count matching additions
</verification>

<success_criteria>
- Migration 014 applied: carrier_catalog_meta table exists with 19 enum groups seeded
- schema.prisma has 14 new models with correct @@map directives
- All FK relations properly defined with named relations where needed
- Reverse relations added to Tenant and User models
- prisma generate succeeds
- tsc --noEmit introduces no new errors
</success_criteria>

<output>
After completion, create `.planning/quick/157-carrier-ops-migration-014-prisma-schema/157-SUMMARY.md`
</output>
