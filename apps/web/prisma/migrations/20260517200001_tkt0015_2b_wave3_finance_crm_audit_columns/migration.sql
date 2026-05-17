-- TKT-0015 Prompt 2b — Wave 3: finance / CRM / compliance audit columns
-- Tables: MaintenanceEvent, ScheduledService, FuelRecord (create-only),
--         RouteExpense, ExpenseTemplate, RoutePayment, RouteStop,
--         DriverHOSEntry, DriverIncident, InvoiceItem (+timestamps),
--         SysAdminInvoice, Customer, CustomerInteraction, TenantIntegration
-- All FKs: ON DELETE SET NULL. All columns nullable (except InvoiceItem timestamps).

-- ─── MaintenanceEvent ──────────────────────────────────────────────────────
ALTER TABLE "MaintenanceEvent" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "MaintenanceEvent" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MaintenanceEvent_createdById_fkey' AND table_name = 'MaintenanceEvent'
  ) THEN
    ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MaintenanceEvent_updatedById_fkey' AND table_name = 'MaintenanceEvent'
  ) THEN
    ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── ScheduledService ──────────────────────────────────────────────────────
ALTER TABLE "ScheduledService" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "ScheduledService" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ScheduledService_createdById_fkey' AND table_name = 'ScheduledService'
  ) THEN
    ALTER TABLE "ScheduledService" ADD CONSTRAINT "ScheduledService_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ScheduledService_updatedById_fkey' AND table_name = 'ScheduledService'
  ) THEN
    ALTER TABLE "ScheduledService" ADD CONSTRAINT "ScheduledService_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── FuelRecord (createdById ONLY — append-only, no updatedById) ────────────
ALTER TABLE "FuelRecord" ADD COLUMN IF NOT EXISTS "createdById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FuelRecord_createdById_fkey' AND table_name = 'FuelRecord'
  ) THEN
    ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── RouteExpense ──────────────────────────────────────────────────────────
ALTER TABLE "RouteExpense" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "RouteExpense" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RouteExpense_createdById_fkey' AND table_name = 'RouteExpense'
  ) THEN
    ALTER TABLE "RouteExpense" ADD CONSTRAINT "RouteExpense_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RouteExpense_updatedById_fkey' AND table_name = 'RouteExpense'
  ) THEN
    ALTER TABLE "RouteExpense" ADD CONSTRAINT "RouteExpense_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── ExpenseTemplate ───────────────────────────────────────────────────────
ALTER TABLE "ExpenseTemplate" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "ExpenseTemplate" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ExpenseTemplate_createdById_fkey' AND table_name = 'ExpenseTemplate'
  ) THEN
    ALTER TABLE "ExpenseTemplate" ADD CONSTRAINT "ExpenseTemplate_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ExpenseTemplate_updatedById_fkey' AND table_name = 'ExpenseTemplate'
  ) THEN
    ALTER TABLE "ExpenseTemplate" ADD CONSTRAINT "ExpenseTemplate_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── RoutePayment ──────────────────────────────────────────────────────────
ALTER TABLE "RoutePayment" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "RoutePayment" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RoutePayment_createdById_fkey' AND table_name = 'RoutePayment'
  ) THEN
    ALTER TABLE "RoutePayment" ADD CONSTRAINT "RoutePayment_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RoutePayment_updatedById_fkey' AND table_name = 'RoutePayment'
  ) THEN
    ALTER TABLE "RoutePayment" ADD CONSTRAINT "RoutePayment_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── RouteStop ─────────────────────────────────────────────────────────────
ALTER TABLE "RouteStop" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "RouteStop" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RouteStop_createdById_fkey' AND table_name = 'RouteStop'
  ) THEN
    ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RouteStop_updatedById_fkey' AND table_name = 'RouteStop'
  ) THEN
    ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── DriverHOSEntry ────────────────────────────────────────────────────────
ALTER TABLE "DriverHOSEntry" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "DriverHOSEntry" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DriverHOSEntry_createdById_fkey' AND table_name = 'DriverHOSEntry'
  ) THEN
    ALTER TABLE "DriverHOSEntry" ADD CONSTRAINT "DriverHOSEntry_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DriverHOSEntry_updatedById_fkey' AND table_name = 'DriverHOSEntry'
  ) THEN
    ALTER TABLE "DriverHOSEntry" ADD CONSTRAINT "DriverHOSEntry_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── DriverIncident ────────────────────────────────────────────────────────
ALTER TABLE "DriverIncident" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "DriverIncident" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DriverIncident_createdById_fkey' AND table_name = 'DriverIncident'
  ) THEN
    ALTER TABLE "DriverIncident" ADD CONSTRAINT "DriverIncident_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DriverIncident_updatedById_fkey' AND table_name = 'DriverIncident'
  ) THEN
    ALTER TABLE "DriverIncident" ADD CONSTRAINT "DriverIncident_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── InvoiceItem (missing all 4 audit columns — add timestamps first) ───────
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'InvoiceItem_createdById_fkey' AND table_name = 'InvoiceItem'
  ) THEN
    ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'InvoiceItem_updatedById_fkey' AND table_name = 'InvoiceItem'
  ) THEN
    ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── SysAdminInvoice ───────────────────────────────────────────────────────
ALTER TABLE "SysAdminInvoice" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "SysAdminInvoice" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SysAdminInvoice_createdById_fkey' AND table_name = 'SysAdminInvoice'
  ) THEN
    ALTER TABLE "SysAdminInvoice" ADD CONSTRAINT "SysAdminInvoice_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SysAdminInvoice_updatedById_fkey' AND table_name = 'SysAdminInvoice'
  ) THEN
    ALTER TABLE "SysAdminInvoice" ADD CONSTRAINT "SysAdminInvoice_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Customer ──────────────────────────────────────────────────────────────
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Customer_createdById_fkey' AND table_name = 'Customer'
  ) THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Customer_updatedById_fkey' AND table_name = 'Customer'
  ) THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── CustomerInteraction ───────────────────────────────────────────────────
-- Note: existing bare-UUID "createdBy" column (no FK) is left untouched.
-- New "createdById" / "updatedById" are the proper audit FK columns.
ALTER TABLE "CustomerInteraction" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "CustomerInteraction" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CustomerInteraction_createdById_fkey' AND table_name = 'CustomerInteraction'
  ) THEN
    ALTER TABLE "CustomerInteraction" ADD CONSTRAINT "CustomerInteraction_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CustomerInteraction_updatedById_fkey' AND table_name = 'CustomerInteraction'
  ) THEN
    ALTER TABLE "CustomerInteraction" ADD CONSTRAINT "CustomerInteraction_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── TenantIntegration ─────────────────────────────────────────────────────
ALTER TABLE "TenantIntegration" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "TenantIntegration" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TenantIntegration_createdById_fkey' AND table_name = 'TenantIntegration'
  ) THEN
    ALTER TABLE "TenantIntegration" ADD CONSTRAINT "TenantIntegration_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TenantIntegration_updatedById_fkey' AND table_name = 'TenantIntegration'
  ) THEN
    ALTER TABLE "TenantIntegration" ADD CONSTRAINT "TenantIntegration_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;
