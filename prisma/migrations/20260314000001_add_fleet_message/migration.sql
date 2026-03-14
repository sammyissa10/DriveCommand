-- Migration: add_fleet_message
-- Creates FleetMessage table for driver-owner messaging scoped to routes.

CREATE TABLE IF NOT EXISTS "FleetMessage" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"   UUID NOT NULL,
  "routeId"    UUID NOT NULL,
  "senderId"   UUID NOT NULL,
  "senderRole" TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FleetMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FleetMessage_tenantId_idx" ON "FleetMessage"("tenantId");
CREATE INDEX IF NOT EXISTS "FleetMessage_routeId_idx" ON "FleetMessage"("routeId");
CREATE INDEX IF NOT EXISTS "FleetMessage_createdAt_idx" ON "FleetMessage"("createdAt");

-- RLS
ALTER TABLE "FleetMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FleetMessage" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "FleetMessage"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "FleetMessage"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
