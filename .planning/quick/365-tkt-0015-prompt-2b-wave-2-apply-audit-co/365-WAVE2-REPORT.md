# QT-365 Wave 2 Verification Report

**TKT-0015 Prompt 2b — Wave 2: Fleet Domain Audit FKs**
**Date:** 2026-05-17
**Status:** PASSED — all verification gates green

---

## Migration SQL

File: `apps/web/prisma/migrations/20260517150001_tkt0015_2b_wave2_fleet_audit_columns/migration.sql`

```sql
-- TKT-0015 Prompt 2b — Wave 2: fleet domain audit columns
-- Tables: clients, contracts, facilities, carrier_drivers, carrier_trucks,
--         dispatches, loads, stops, carrier_expenses, Document, FleetMessage
-- All FKs: ON DELETE SET NULL. All columns nullable.

-- ─── clients ───────────────────────────────────────────────────────────────
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'clients_created_by_id_fkey' AND table_name = 'clients'
  ) THEN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'clients_updated_by_id_fkey' AND table_name = 'clients'
  ) THEN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── contracts ─────────────────────────────────────────────────────────────
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── facilities ────────────────────────────────────────────────────────────
ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── carrier_drivers ───────────────────────────────────────────────────────
ALTER TABLE "carrier_drivers" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "carrier_drivers" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── carrier_trucks ────────────────────────────────────────────────────────
ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── dispatches ────────────────────────────────────────────────────────────
ALTER TABLE "dispatches" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "dispatches" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── loads ─────────────────────────────────────────────────────────────────
ALTER TABLE "loads" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "loads" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── stops ─────────────────────────────────────────────────────────────────
ALTER TABLE "stops" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "stops" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── carrier_expenses ──────────────────────────────────────────────────────
ALTER TABLE "carrier_expenses" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "carrier_expenses" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;
-- (+ FK guards per pattern above)

-- ─── Document (camelCase) ──────────────────────────────────────────────────
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "updatedById" UUID;
-- (+ FK guards: Document_createdById_fkey, Document_updatedById_fkey)

-- ─── FleetMessage (camelCase, createdById ONLY — immutable records) ────────
ALTER TABLE "FleetMessage" ADD COLUMN IF NOT EXISTS "createdById" UUID;
-- (+ FK guard: FleetMessage_createdById_fkey)
-- NOTE: No updatedById for FleetMessage — immutable/append-only records
```

Full idempotent SQL with per-constraint guards in the actual migration file.

---

## Schema Changes

### 9 snake_case carrier models — pattern applied to each

Each model received:
- `createdById String? @map("created_by_id") @db.Uuid // NEW (Wave 2)`
- `updatedById String? @map("updated_by_id") @db.Uuid // NEW (Wave 2)`
- `createdBy User? @relation(name: "<Model>CreatedBy", fields: [createdById], references: [id], onDelete: SetNull)`
- `updatedBy User? @relation(name: "<Model>UpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)`

| Model | Table | Relation Names |
|---|---|---|
| CarrierClient | clients | CarrierClientCreatedBy / CarrierClientUpdatedBy |
| CarrierContract | contracts | CarrierContractCreatedBy / CarrierContractUpdatedBy |
| CarrierFacility | facilities | CarrierFacilityCreatedBy / CarrierFacilityUpdatedBy |
| CarrierDriver | carrier_drivers | CarrierDriverCreatedBy / CarrierDriverUpdatedBy |
| CarrierTruck | carrier_trucks | CarrierTruckCreatedBy / CarrierTruckUpdatedBy |
| CarrierDispatch | dispatches | CarrierDispatchCreatedBy / CarrierDispatchUpdatedBy |
| CarrierLoad | loads | CarrierLoadCreatedBy / CarrierLoadUpdatedBy |
| CarrierStop | stops | CarrierStopCreatedBy / CarrierStopUpdatedBy |
| CarrierExpense | carrier_expenses | CarrierExpenseCreatedBy / CarrierExpenseUpdatedBy |

### Document (camelCase — 2 new fields + 2 new relations)

Added `createdById String? @db.Uuid` and `updatedById String? @db.Uuid` alongside the existing required `uploadedBy String @db.Uuid`.
Added `createdBy User? @relation(name: "DocumentCreatedBy", ...)` and `updatedBy User? @relation(name: "DocumentUpdatedBy", ...)`.
The existing `uploader User @relation(fields: [uploadedBy], references: [id])` relation is preserved unchanged.

### FleetMessage (camelCase — createdById ONLY)

Added `createdById String? @db.Uuid // NEW (Wave 2 — createdById ONLY, no updatedById)`.
Added `createdBy User? @relation(name: "FleetMessageCreatedBy", ...)`.
No `updatedById` added — FleetMessage is immutable/append-only.

### User model — 21 reverse-relation arrays added

Block added immediately after Wave 1 reverse relations:

```
carrierClientsCreated    CarrierClient[]    @relation(name: "CarrierClientCreatedBy")
carrierClientsUpdated    CarrierClient[]    @relation(name: "CarrierClientUpdatedBy")
carrierContractsCreated  CarrierContract[]  @relation(name: "CarrierContractCreatedBy")
carrierContractsUpdated  CarrierContract[]  @relation(name: "CarrierContractUpdatedBy")
carrierFacilitiesCreated CarrierFacility[]  @relation(name: "CarrierFacilityCreatedBy")
carrierFacilitiesUpdated CarrierFacility[]  @relation(name: "CarrierFacilityUpdatedBy")
carrierDriversCreated    CarrierDriver[]    @relation(name: "CarrierDriverCreatedBy")
carrierDriversUpdated    CarrierDriver[]    @relation(name: "CarrierDriverUpdatedBy")
carrierTrucksCreated     CarrierTruck[]     @relation(name: "CarrierTruckCreatedBy")
carrierTrucksUpdated     CarrierTruck[]     @relation(name: "CarrierTruckUpdatedBy")
carrierDispatchesCreated CarrierDispatch[]  @relation(name: "CarrierDispatchCreatedBy")
carrierDispatchesUpdated CarrierDispatch[]  @relation(name: "CarrierDispatchUpdatedBy")
carrierLoadsCreated      CarrierLoad[]      @relation(name: "CarrierLoadCreatedBy")
carrierLoadsUpdated      CarrierLoad[]      @relation(name: "CarrierLoadUpdatedBy")
carrierStopsCreated      CarrierStop[]      @relation(name: "CarrierStopCreatedBy")
carrierStopsUpdated      CarrierStop[]      @relation(name: "CarrierStopUpdatedBy")
carrierExpensesCreated   CarrierExpense[]   @relation(name: "CarrierExpenseCreatedBy")
carrierExpensesUpdated   CarrierExpense[]   @relation(name: "CarrierExpenseUpdatedBy")
documentsCreated         Document[]         @relation(name: "DocumentCreatedBy")
documentsUpdated         Document[]         @relation(name: "DocumentUpdatedBy")
fleetMessagesCreated     FleetMessage[]     @relation(name: "FleetMessageCreatedBy")
```

Total: 9×2 (carrier) + 2 (Document) + 1 (FleetMessage) = **21 arrays**.

---

## Live DB Verification

### Column query (Verification gate 4) — 21 rows

```
table_name        column_name     is_nullable  data_type
Document          createdById     YES          uuid
Document          updatedById     YES          uuid
FleetMessage      createdById     YES          uuid           ← only 1 row for FleetMessage (no updatedById)
carrier_drivers   created_by_id   YES          uuid
carrier_drivers   updated_by_id   YES          uuid
carrier_expenses  created_by_id   YES          uuid
carrier_expenses  updated_by_id   YES          uuid
carrier_trucks    created_by_id   YES          uuid
carrier_trucks    updated_by_id   YES          uuid
clients           created_by_id   YES          uuid
clients           updated_by_id   YES          uuid
contracts         created_by_id   YES          uuid
contracts         updated_by_id   YES          uuid
dispatches        created_by_id   YES          uuid
dispatches        updated_by_id   YES          uuid
facilities        created_by_id   YES          uuid
facilities        updated_by_id   YES          uuid
loads             created_by_id   YES          uuid
loads             updated_by_id   YES          uuid
stops             created_by_id   YES          uuid
stops             updated_by_id   YES          uuid
```

**Total: 21 rows. All is_nullable=YES, data_type=uuid.**

### FK constraint query (Verification gate 5) — 21 constraints

```
table_name        constraint_name                        delete_rule
Document          Document_createdById_fkey              SET NULL
Document          Document_updatedById_fkey              SET NULL
FleetMessage      FleetMessage_createdById_fkey          SET NULL
carrier_drivers   carrier_drivers_created_by_id_fkey    SET NULL
carrier_drivers   carrier_drivers_updated_by_id_fkey    SET NULL
carrier_expenses  carrier_expenses_created_by_id_fkey   SET NULL
carrier_expenses  carrier_expenses_updated_by_id_fkey   SET NULL
carrier_trucks    carrier_trucks_created_by_id_fkey     SET NULL
carrier_trucks    carrier_trucks_updated_by_id_fkey     SET NULL
clients           clients_created_by_id_fkey            SET NULL
clients           clients_updated_by_id_fkey            SET NULL
contracts         contracts_created_by_id_fkey          SET NULL
contracts         contracts_updated_by_id_fkey          SET NULL
dispatches        dispatches_created_by_id_fkey         SET NULL
dispatches        dispatches_updated_by_id_fkey         SET NULL
facilities        facilities_created_by_id_fkey         SET NULL
facilities        facilities_updated_by_id_fkey         SET NULL
loads             loads_created_by_id_fkey              SET NULL
loads             loads_updated_by_id_fkey              SET NULL
stops             stops_created_by_id_fkey              SET NULL
stops             stops_updated_by_id_fkey              SET NULL
```

**Total: 21 constraints. All delete_rule=SET NULL.**

---

## FleetMessage createdById-only Confirmation

Confirmed: FleetMessage has `createdById`, has NO `updatedById` in schema.prisma or live DB.

---

## Document.uploadedBy Preservation

Confirmed: `Document.uploadedBy String @db.Uuid` (NOT NULL, required) and `uploader User @relation(fields: [uploadedBy], references: [id])` relation preserved unchanged; `createdById`/`updatedById` added alongside as optional nullable fields.

---

## Verification Results

| Gate | Check | Result |
|---|---|---|
| 1 | `npx prisma validate` exits 0 | PASS |
| 2 | `npx prisma generate` exits 0 | PASS |
| 3 | `npx tsc --noEmit` — pre-existing errors only (framer-motion, d3-geo, topojson-client — unrelated to this wave, present in baseline before schema changes) | PASS (no new errors) |
| 4 | Column query returns 21 rows, all nullable uuid, no FleetMessage.updatedById | PASS |
| 5 | FK constraint query returns 21 constraints, all SET NULL | PASS |
| 6 | 3 isolation spot checks pass | PASS |

---

## Isolation Test Results

### Spot Check 1: CarrierClient (snake_case)

- Created: `id=9570291d-ddd5-4343-8283-4ad83b5b0056`
- `createdById = a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a` (matches userId)
- `updatedById = a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a` (matches userId)
- **PASS**

### Spot Check 2: Document (camelCase)

- Created: `id=044c9e75-968a-41a0-afbf-053ecfc902a5`
- `uploadedBy = a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a` (preserved required field)
- `createdById = a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a` (matches userId)
- `updatedById = a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a` (matches userId)
- **PASS**

### Spot Check 3: FleetMessage (camelCase, create-only)

- Created: `id=2c7c42ce-0c62-490e-850a-bebd267f7986`
- `createdById = a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a` (matches userId)
- Update `{ body: 'EDITED_MSG' }` succeeded without attempting updatedById injection
- `CREATE_ONLY_AUDIT_MODELS` correctly prevents updatedById from being injected
- **PASS**

All test records deleted after spot checks.

---

## TypeScript Widenings

None required. The schema changes only add optional nullable fields (`String?`), which are backward-compatible with all existing server actions and queries.

---

## Files Modified

- `apps/web/prisma/schema.prisma` — 11 models + User model edited
- `apps/web/prisma/migrations/20260517150001_tkt0015_2b_wave2_fleet_audit_columns/migration.sql` — new idempotent migration
- `apps/web/src/generated/prisma/` — regenerated Prisma client

---

## Commit SHA

feat(quick-365): TKT-0015 Prompt 2b Wave 2 — fleet domain audit FKs (11 tables)
*(SHA appended after commit)*

---

## Tables NOT Touched in This Wave

The following tables are explicitly confirmed unchanged:
- `Truck` / `Route` / `Load` / `Invoice` / `PayrollRecord` — already have full audit FKs (pre-QT-358)
- `Tag` / `ExpenseCategory` — Wave 1 (QT-358), already migrated
- All Wave 3+ tables (finance/CRM/compliance models) — deferred
- All Tenant, User, audit-only, append-only models — exempt by design
