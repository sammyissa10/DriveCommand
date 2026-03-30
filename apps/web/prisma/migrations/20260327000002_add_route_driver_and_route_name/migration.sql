-- Add RouteDriver join table for co-driver assignments
CREATE TABLE IF NOT EXISTS "RouteDriver" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "routeId"   UUID NOT NULL,
  "driverId"  UUID NOT NULL,
  "role"      TEXT NOT NULL DEFAULT 'co-driver',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RouteDriver_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RouteDriver_routeId_driverId_key" UNIQUE ("routeId", "driverId"),
  CONSTRAINT "RouteDriver_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE,
  CONSTRAINT "RouteDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "RouteDriver_routeId_idx" ON "RouteDriver"("routeId");
CREATE INDEX IF NOT EXISTS "RouteDriver_driverId_idx" ON "RouteDriver"("driverId");

-- Enable RLS on RouteDriver
ALTER TABLE "RouteDriver" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "RouteDriver";
CREATE POLICY tenant_isolation_policy ON "RouteDriver"
  FOR ALL
  USING ("routeId" IN (
    SELECT id FROM "Route" WHERE "tenantId" = current_tenant_id()
  ));

DROP POLICY IF EXISTS bypass_rls_policy ON "RouteDriver";
CREATE POLICY bypass_rls_policy ON "RouteDriver"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- Add optional name field to Route
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "name" TEXT;
