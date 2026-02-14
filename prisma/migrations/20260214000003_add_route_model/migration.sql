-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "Route" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "truckId" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "scheduledDate" TIMESTAMPTZ NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Route_tenantId_idx" ON "Route"("tenantId");

-- CreateIndex
CREATE INDEX "Route_driverId_idx" ON "Route"("driverId");

-- CreateIndex
CREATE INDEX "Route_truckId_idx" ON "Route"("truckId");

-- CreateIndex
CREATE INDEX "Route_scheduledDate_idx" ON "Route"("scheduledDate");

-- CreateIndex
CREATE INDEX "Route_status_idx" ON "Route"("status");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================
-- Row-Level Security Setup for Route
-- ==============================================

-- Enable RLS on Route table
ALTER TABLE "Route" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Route" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for Route
CREATE POLICY tenant_isolation_policy ON "Route"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "Route"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
