-- CreateEnum
CREATE TYPE "SafetyEventType" AS ENUM ('HARSH_BRAKING', 'HARSH_ACCELERATION', 'HARSH_CORNERING', 'SPEEDING', 'DISTRACTED_DRIVING', 'ROLLING_STOP', 'SEATBELT_VIOLATION', 'FOLLOWING_TOO_CLOSE');

-- CreateEnum
CREATE TYPE "SafetyEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'GASOLINE', 'ELECTRIC', 'HYBRID', 'CNG', 'LPG');

-- CreateTable GPSLocation
CREATE TABLE "GPSLocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "truckId" UUID NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "speed" INTEGER,
    "heading" INTEGER,
    "altitude" INTEGER,
    "accuracy" DECIMAL(6,2),
    "timestamp" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GPSLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable SafetyEvent
CREATE TABLE "SafetyEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "truckId" UUID NOT NULL,
    "driverId" UUID,
    "routeId" UUID,
    "eventType" "SafetyEventType" NOT NULL,
    "severity" "SafetyEventSeverity" NOT NULL,
    "gForce" DECIMAL(4,2),
    "speed" INTEGER,
    "speedLimit" INTEGER,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable FuelRecord
CREATE TABLE "FuelRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "truckId" UUID NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(10,4),
    "totalCost" DECIMAL(10,2),
    "odometer" INTEGER NOT NULL,
    "location" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "timestamp" TIMESTAMPTZ NOT NULL,
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GPSLocation_tenantId_idx" ON "GPSLocation"("tenantId");

-- CreateIndex
CREATE INDEX "GPSLocation_truckId_idx" ON "GPSLocation"("truckId");

-- CreateIndex
CREATE INDEX "GPSLocation_timestamp_idx" ON "GPSLocation"("timestamp");

-- CreateIndex
CREATE INDEX "GPSLocation_tenantId_timestamp_idx" ON "GPSLocation"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "SafetyEvent_tenantId_idx" ON "SafetyEvent"("tenantId");

-- CreateIndex
CREATE INDEX "SafetyEvent_truckId_idx" ON "SafetyEvent"("truckId");

-- CreateIndex
CREATE INDEX "SafetyEvent_driverId_idx" ON "SafetyEvent"("driverId");

-- CreateIndex
CREATE INDEX "SafetyEvent_routeId_idx" ON "SafetyEvent"("routeId");

-- CreateIndex
CREATE INDEX "SafetyEvent_eventType_idx" ON "SafetyEvent"("eventType");

-- CreateIndex
CREATE INDEX "SafetyEvent_severity_idx" ON "SafetyEvent"("severity");

-- CreateIndex
CREATE INDEX "SafetyEvent_timestamp_idx" ON "SafetyEvent"("timestamp");

-- CreateIndex
CREATE INDEX "SafetyEvent_tenantId_timestamp_idx" ON "SafetyEvent"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "FuelRecord_tenantId_idx" ON "FuelRecord"("tenantId");

-- CreateIndex
CREATE INDEX "FuelRecord_truckId_idx" ON "FuelRecord"("truckId");

-- CreateIndex
CREATE INDEX "FuelRecord_timestamp_idx" ON "FuelRecord"("timestamp");

-- CreateIndex
CREATE INDEX "FuelRecord_tenantId_timestamp_idx" ON "FuelRecord"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "FuelRecord_isEstimated_idx" ON "FuelRecord"("isEstimated");

-- AddForeignKey
ALTER TABLE "GPSLocation" ADD CONSTRAINT "GPSLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GPSLocation" ADD CONSTRAINT "GPSLocation_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================
-- Row-Level Security Setup for GPSLocation
-- ==============================================

-- Enable RLS on GPSLocation table
ALTER TABLE "GPSLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GPSLocation" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for GPSLocation
CREATE POLICY tenant_isolation_policy ON "GPSLocation"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "GPSLocation"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security Setup for SafetyEvent
-- ==============================================

-- Enable RLS on SafetyEvent table
ALTER TABLE "SafetyEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafetyEvent" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for SafetyEvent
CREATE POLICY tenant_isolation_policy ON "SafetyEvent"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "SafetyEvent"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security Setup for FuelRecord
-- ==============================================

-- Enable RLS on FuelRecord table
ALTER TABLE "FuelRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FuelRecord" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for FuelRecord
CREATE POLICY tenant_isolation_policy ON "FuelRecord"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "FuelRecord"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
