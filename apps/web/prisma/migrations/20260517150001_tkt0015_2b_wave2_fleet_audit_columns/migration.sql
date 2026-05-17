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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contracts_created_by_id_fkey' AND table_name = 'contracts'
  ) THEN
    ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contracts_updated_by_id_fkey' AND table_name = 'contracts'
  ) THEN
    ALTER TABLE "contracts" ADD CONSTRAINT "contracts_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── facilities ────────────────────────────────────────────────────────────
ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'facilities_created_by_id_fkey' AND table_name = 'facilities'
  ) THEN
    ALTER TABLE "facilities" ADD CONSTRAINT "facilities_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'facilities_updated_by_id_fkey' AND table_name = 'facilities'
  ) THEN
    ALTER TABLE "facilities" ADD CONSTRAINT "facilities_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── carrier_drivers ───────────────────────────────────────────────────────
ALTER TABLE "carrier_drivers" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "carrier_drivers" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'carrier_drivers_created_by_id_fkey' AND table_name = 'carrier_drivers'
  ) THEN
    ALTER TABLE "carrier_drivers" ADD CONSTRAINT "carrier_drivers_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'carrier_drivers_updated_by_id_fkey' AND table_name = 'carrier_drivers'
  ) THEN
    ALTER TABLE "carrier_drivers" ADD CONSTRAINT "carrier_drivers_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── carrier_trucks ────────────────────────────────────────────────────────
ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'carrier_trucks_created_by_id_fkey' AND table_name = 'carrier_trucks'
  ) THEN
    ALTER TABLE "carrier_trucks" ADD CONSTRAINT "carrier_trucks_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'carrier_trucks_updated_by_id_fkey' AND table_name = 'carrier_trucks'
  ) THEN
    ALTER TABLE "carrier_trucks" ADD CONSTRAINT "carrier_trucks_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── dispatches ────────────────────────────────────────────────────────────
ALTER TABLE "dispatches" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "dispatches" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dispatches_created_by_id_fkey' AND table_name = 'dispatches'
  ) THEN
    ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dispatches_updated_by_id_fkey' AND table_name = 'dispatches'
  ) THEN
    ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── loads ─────────────────────────────────────────────────────────────────
ALTER TABLE "loads" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "loads" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'loads_created_by_id_fkey' AND table_name = 'loads'
  ) THEN
    ALTER TABLE "loads" ADD CONSTRAINT "loads_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'loads_updated_by_id_fkey' AND table_name = 'loads'
  ) THEN
    ALTER TABLE "loads" ADD CONSTRAINT "loads_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── stops ─────────────────────────────────────────────────────────────────
ALTER TABLE "stops" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "stops" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stops_created_by_id_fkey' AND table_name = 'stops'
  ) THEN
    ALTER TABLE "stops" ADD CONSTRAINT "stops_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stops_updated_by_id_fkey' AND table_name = 'stops'
  ) THEN
    ALTER TABLE "stops" ADD CONSTRAINT "stops_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── carrier_expenses ──────────────────────────────────────────────────────
ALTER TABLE "carrier_expenses" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
ALTER TABLE "carrier_expenses" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'carrier_expenses_created_by_id_fkey' AND table_name = 'carrier_expenses'
  ) THEN
    ALTER TABLE "carrier_expenses" ADD CONSTRAINT "carrier_expenses_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'carrier_expenses_updated_by_id_fkey' AND table_name = 'carrier_expenses'
  ) THEN
    ALTER TABLE "carrier_expenses" ADD CONSTRAINT "carrier_expenses_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Document (camelCase) ──────────────────────────────────────────────────
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Document_createdById_fkey' AND table_name = 'Document'
  ) THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Document_updatedById_fkey' AND table_name = 'Document'
  ) THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── FleetMessage (camelCase, createdById ONLY — immutable records) ────────
ALTER TABLE "FleetMessage" ADD COLUMN IF NOT EXISTS "createdById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FleetMessage_createdById_fkey' AND table_name = 'FleetMessage'
  ) THEN
    ALTER TABLE "FleetMessage" ADD CONSTRAINT "FleetMessage_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;
