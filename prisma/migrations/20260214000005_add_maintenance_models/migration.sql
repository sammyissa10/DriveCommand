-- CreateTable MaintenanceEvent
CREATE TABLE "MaintenanceEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "truckId" UUID NOT NULL,
    "serviceType" TEXT NOT NULL,
    "serviceDate" TIMESTAMPTZ NOT NULL,
    "odometerAtService" INTEGER NOT NULL,
    "cost" DECIMAL(10,2),
    "provider" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable ScheduledService
CREATE TABLE "ScheduledService" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "truckId" UUID NOT NULL,
    "serviceType" TEXT NOT NULL,
    "intervalDays" INTEGER,
    "intervalMiles" INTEGER,
    "baselineDate" TIMESTAMPTZ NOT NULL,
    "baselineOdometer" INTEGER NOT NULL,
    "notes" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ScheduledService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceEvent_tenantId_idx" ON "MaintenanceEvent"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_truckId_idx" ON "MaintenanceEvent"("truckId");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_serviceDate_idx" ON "MaintenanceEvent"("serviceDate");

-- CreateIndex
CREATE INDEX "ScheduledService_tenantId_idx" ON "ScheduledService"("tenantId");

-- CreateIndex
CREATE INDEX "ScheduledService_truckId_idx" ON "ScheduledService"("truckId");

-- CreateIndex
CREATE INDEX "ScheduledService_isCompleted_idx" ON "ScheduledService"("isCompleted");

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledService" ADD CONSTRAINT "ScheduledService_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledService" ADD CONSTRAINT "ScheduledService_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================
-- Row-Level Security Setup for MaintenanceEvent
-- ==============================================

-- Enable RLS on MaintenanceEvent table
ALTER TABLE "MaintenanceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceEvent" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for MaintenanceEvent
CREATE POLICY tenant_isolation_policy ON "MaintenanceEvent"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "MaintenanceEvent"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security Setup for ScheduledService
-- ==============================================

-- Enable RLS on ScheduledService table
ALTER TABLE "ScheduledService" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledService" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for ScheduledService
CREATE POLICY tenant_isolation_policy ON "ScheduledService"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "ScheduledService"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
