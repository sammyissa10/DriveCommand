-- CreateTable
CREATE TABLE "Truck" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "vin" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "odometer" INTEGER NOT NULL,
    "documentMetadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Truck_tenantId_idx" ON "Truck"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_tenantId_vin_key" ON "Truck"("tenantId", "vin");

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================
-- Row-Level Security Setup for Truck
-- ==============================================

-- Enable RLS on Truck table
ALTER TABLE "Truck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Truck" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for Truck
CREATE POLICY tenant_isolation_policy ON "Truck"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "Truck"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
