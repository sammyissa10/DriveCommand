-- ============================================================
-- Migration: 20260226000002_add_rls_missing_tables
--
-- Purpose: Add missing RLS policies to NotificationLog, InvoiceItem,
--          and ExpenseTemplateItem; add tenantId column to InvoiceItem
--          and ExpenseTemplateItem with backfill, FK, and index; create
--          Load and TenantIntegration tables (CREATE TABLE IF NOT EXISTS)
--          with all columns, indexes, FKs, and RLS policies; create
--          missing PostgreSQL enums for LoadStatus, IntegrationProvider,
--          and IntegrationCategory.
--
-- NOTE: Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each migration
--       in its own transaction.
-- NOTE: All statements are idempotent (IF NOT EXISTS / DO-EXCEPTION blocks)
-- ============================================================


-- ============================================================
-- Section 1: Create enums (idempotent via DO/EXCEPTION blocks)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "LoadStatus" AS ENUM ('PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IntegrationProvider" AS ENUM ('QUICKBOOKS', 'SAMSARA', 'KEEP_TRUCKIN', 'TRIUMPH_FACTORING', 'OTR_SOLUTIONS', 'SENDGRID', 'MAILGUN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IntegrationCategory" AS ENUM ('ACCOUNTING', 'ELD', 'FACTORING', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 2: Add tenantId to InvoiceItem
-- ============================================================

-- Add tenantId column (nullable first so backfill can run)
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "tenantId" UUID;

-- Backfill InvoiceItem.tenantId from parent Invoice
UPDATE "InvoiceItem" SET "tenantId" = i."tenantId"
FROM "Invoice" i WHERE "InvoiceItem"."invoiceId" = i.id AND "InvoiceItem"."tenantId" IS NULL;

-- Set NOT NULL constraint (idempotent — no-op if already NOT NULL)
DO $$ BEGIN
  ALTER TABLE "InvoiceItem" ALTER COLUMN "tenantId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- FK constraint to Tenant (idempotent)
DO $$ BEGIN
  ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index on tenantId
CREATE INDEX IF NOT EXISTS "InvoiceItem_tenantId_idx" ON "InvoiceItem"("tenantId");


-- ============================================================
-- Section 3: Add tenantId to ExpenseTemplateItem
-- ============================================================

-- Add tenantId column (nullable first so backfill can run)
ALTER TABLE "ExpenseTemplateItem" ADD COLUMN IF NOT EXISTS "tenantId" UUID;

-- Backfill ExpenseTemplateItem.tenantId from parent ExpenseTemplate
UPDATE "ExpenseTemplateItem" SET "tenantId" = t."tenantId"
FROM "ExpenseTemplate" t WHERE "ExpenseTemplateItem"."templateId" = t.id AND "ExpenseTemplateItem"."tenantId" IS NULL;

-- Set NOT NULL constraint (idempotent — no-op if already NOT NULL)
DO $$ BEGIN
  ALTER TABLE "ExpenseTemplateItem" ALTER COLUMN "tenantId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- FK constraint to Tenant (idempotent)
DO $$ BEGIN
  ALTER TABLE "ExpenseTemplateItem" ADD CONSTRAINT "ExpenseTemplateItem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index on tenantId
CREATE INDEX IF NOT EXISTS "ExpenseTemplateItem_tenantId_idx" ON "ExpenseTemplateItem"("tenantId");


-- ============================================================
-- Section 4: RLS for NotificationLog (already has tenantId)
-- ============================================================

ALTER TABLE "NotificationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationLog" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "NotificationLog"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "NotificationLog"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 5: RLS for InvoiceItem (now has tenantId)
-- ============================================================

ALTER TABLE "InvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceItem" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "InvoiceItem"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "InvoiceItem"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 6: RLS for ExpenseTemplateItem (now has tenantId)
-- ============================================================

ALTER TABLE "ExpenseTemplateItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseTemplateItem" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "ExpenseTemplateItem"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "ExpenseTemplateItem"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 7: CREATE TABLE IF NOT EXISTS Load
-- ============================================================

CREATE TABLE IF NOT EXISTS "Load" (
    "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"     UUID          NOT NULL,
    "loadNumber"   TEXT          NOT NULL,
    "customerId"   UUID          NOT NULL,
    "routeId"      UUID,
    "driverId"     UUID,
    "truckId"      UUID,
    "origin"       TEXT          NOT NULL,
    "destination"  TEXT          NOT NULL,
    "pickupDate"   TIMESTAMPTZ   NOT NULL,
    "deliveryDate" TIMESTAMPTZ,
    "weight"       INTEGER,
    "commodity"    TEXT,
    "rate"         DECIMAL(12,2) NOT NULL,
    "status"       "LoadStatus"  NOT NULL DEFAULT 'PENDING',
    "notes"        TEXT,
    "pickupLat"    DECIMAL(10,8),
    "pickupLng"    DECIMAL(11,8),
    "deliveryLat"  DECIMAL(10,8),
    "deliveryLng"  DECIMAL(11,8),
    "geofenceFlags" JSONB,
    "trackingToken" TEXT,
    "createdAt"    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Load_pkey" PRIMARY KEY ("id")
);

-- Indexes for Load (IF NOT EXISTS for idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS "Load_tenantId_loadNumber_key" ON "Load"("tenantId", "loadNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Load_trackingToken_key" ON "Load"("trackingToken") WHERE "trackingToken" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Load_tenantId_idx" ON "Load"("tenantId");
CREATE INDEX IF NOT EXISTS "Load_customerId_idx" ON "Load"("customerId");
CREATE INDEX IF NOT EXISTS "Load_driverId_idx" ON "Load"("driverId");
CREATE INDEX IF NOT EXISTS "Load_truckId_idx" ON "Load"("truckId");
CREATE INDEX IF NOT EXISTS "Load_status_idx" ON "Load"("status");
CREATE INDEX IF NOT EXISTS "Load_pickupDate_idx" ON "Load"("pickupDate");
CREATE INDEX IF NOT EXISTS "Load_trackingToken_idx" ON "Load"("trackingToken");

-- FKs for Load (idempotent DO blocks — skip if constraint already exists)
DO $$ BEGIN
  ALTER TABLE "Load" ADD CONSTRAINT "Load_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Load" ADD CONSTRAINT "Load_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Load" ADD CONSTRAINT "Load_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Load" ADD CONSTRAINT "Load_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Load" ADD CONSTRAINT "Load_truckId_fkey"
    FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 8: RLS for Load
-- ============================================================

ALTER TABLE "Load" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Load" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "Load"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "Load"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 9: CREATE TABLE IF NOT EXISTS TenantIntegration
-- ============================================================

CREATE TABLE IF NOT EXISTS "TenantIntegration" (
    "id"         UUID                  NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"   UUID                  NOT NULL,
    "provider"   "IntegrationProvider" NOT NULL,
    "category"   "IntegrationCategory" NOT NULL,
    "enabled"    BOOLEAN               NOT NULL DEFAULT false,
    "configJson" JSONB,
    "createdAt"  TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantIntegration_tenantId_provider_key" ON "TenantIntegration"("tenantId", "provider");
CREATE INDEX IF NOT EXISTS "TenantIntegration_tenantId_idx" ON "TenantIntegration"("tenantId");

DO $$ BEGIN
  ALTER TABLE "TenantIntegration" ADD CONSTRAINT "TenantIntegration_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 10: RLS for TenantIntegration
-- ============================================================

ALTER TABLE "TenantIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantIntegration" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "TenantIntegration"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "TenantIntegration"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
