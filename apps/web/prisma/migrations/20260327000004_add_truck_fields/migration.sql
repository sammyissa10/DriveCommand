-- Add maintenance flag and audit fields to Truck
ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "inMaintenance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "createdById"   UUID       REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "updatedById"   UUID       REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "archivedAt"    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Truck_archivedAt_idx" ON "Truck"("archivedAt");

-- Add audit fields to Route
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "createdById" UUID REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "updatedById" UUID REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "archivedAt"  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Route_archivedAt_idx" ON "Route"("archivedAt");
