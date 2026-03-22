-- ============================================================
-- Migration: 20260315000001_add_driver_route_join
--
-- Purpose: Create the DriverRouteJoin table and DriverPaymentMethod enum
--          that were previously only created via `prisma db push` in dev
--          environments. This table was missing from the production migration
--          chain, causing listDriverRouteJoinsByDriver() to fail silently
--          and return empty arrays on the driver detail page (TKT-0025).
--
-- NOTE: Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each migration
--       in its own transaction.
-- NOTE: All statements are idempotent (IF NOT EXISTS / DO-EXCEPTION blocks)
-- ============================================================


-- ============================================================
-- Section 1: Create DriverPaymentMethod enum (idempotent)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "DriverPaymentMethod" AS ENUM ('FIXED_AMOUNT', 'HOURLY', 'PER_MILE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 2: Create DriverRouteJoin table
-- ============================================================

CREATE TABLE IF NOT EXISTS "DriverRouteJoin" (
  "id"            UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID            NOT NULL,
  "routeId"       UUID            NOT NULL,
  "driverId"      UUID            NOT NULL,
  "isMainDriver"  BOOLEAN         NOT NULL DEFAULT false,
  "paymentMethod" "DriverPaymentMethod" NOT NULL,
  "fixedAmount"   DECIMAL(10,2),
  "hourlyRate"    DECIMAL(10,2),
  "numberOfHours" DECIMAL(10,2),
  "perMileRate"   DECIMAL(10,4),
  "numberOfMiles" DECIMAL(10,2),
  "createdAt"     TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverRouteJoin_pkey" PRIMARY KEY ("id")
);


-- ============================================================
-- Section 3: Indexes (IF NOT EXISTS for idempotency)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS "DriverRouteJoin_routeId_driverId_key" ON "DriverRouteJoin"("routeId", "driverId");
CREATE INDEX IF NOT EXISTS "DriverRouteJoin_tenantId_idx" ON "DriverRouteJoin"("tenantId");
CREATE INDEX IF NOT EXISTS "DriverRouteJoin_routeId_idx" ON "DriverRouteJoin"("routeId");
CREATE INDEX IF NOT EXISTS "DriverRouteJoin_driverId_idx" ON "DriverRouteJoin"("driverId");


-- ============================================================
-- Section 4: Foreign key constraints (idempotent via DO/EXCEPTION)
-- ============================================================

DO $$ BEGIN
  ALTER TABLE "DriverRouteJoin" ADD CONSTRAINT "DriverRouteJoin_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DriverRouteJoin" ADD CONSTRAINT "DriverRouteJoin_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DriverRouteJoin" ADD CONSTRAINT "DriverRouteJoin_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 5: Enable Row Level Security
-- ============================================================

ALTER TABLE "DriverRouteJoin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriverRouteJoin" FORCE ROW LEVEL SECURITY;


-- ============================================================
-- Section 6: RLS policies (idempotent via DO/EXCEPTION)
-- ============================================================

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "DriverRouteJoin"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "DriverRouteJoin"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
