-- ============================================================
-- Migration: 20260226000003_add_route_stops
--
-- Purpose: Add RouteStop table for multi-stop route support.
--          Creates RouteStopType (PICKUP, DELIVERY) and
--          RouteStopStatus (PENDING, ARRIVED, DEPARTED) enums,
--          the RouteStop table with all columns, indexes, FKs,
--          and RLS policies for tenant isolation.
--
-- NOTE: Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each migration
--       in its own transaction.
-- ============================================================


-- ============================================================
-- Section 1: Create enums (idempotent via DO/EXCEPTION blocks)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "RouteStopType" AS ENUM ('PICKUP', 'DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RouteStopStatus" AS ENUM ('PENDING', 'ARRIVED', 'DEPARTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 2: CREATE TABLE RouteStop
-- ============================================================

CREATE TABLE "RouteStop" (
    "id"          UUID              NOT NULL DEFAULT gen_random_uuid(),
    "routeId"     UUID              NOT NULL,
    "tenantId"    UUID              NOT NULL,
    "position"    INTEGER           NOT NULL,
    "type"        "RouteStopType"   NOT NULL,
    "address"     TEXT              NOT NULL,
    "lat"         DECIMAL(10,8),
    "lng"         DECIMAL(11,8),
    "scheduledAt" TIMESTAMPTZ,
    "arrivedAt"   TIMESTAMPTZ,
    "departedAt"  TIMESTAMPTZ,
    "notes"       TEXT,
    "status"      "RouteStopStatus" NOT NULL DEFAULT 'PENDING',
    "geofenceHit" BOOLEAN           NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMPTZ       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);


-- ============================================================
-- Section 3: Indexes
-- ============================================================

CREATE INDEX "RouteStop_routeId_idx" ON "RouteStop"("routeId");
CREATE INDEX "RouteStop_tenantId_idx" ON "RouteStop"("tenantId");
CREATE INDEX "RouteStop_routeId_position_idx" ON "RouteStop"("routeId", "position");
CREATE INDEX "RouteStop_status_idx" ON "RouteStop"("status");


-- ============================================================
-- Section 4: Foreign Key Constraints
-- ============================================================

ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Section 5: Row Level Security
-- ============================================================

ALTER TABLE "RouteStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RouteStop" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "RouteStop"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "RouteStop"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
