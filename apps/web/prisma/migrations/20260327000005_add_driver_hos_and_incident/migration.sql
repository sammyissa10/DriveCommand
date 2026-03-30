-- Create enums for HOS and Incident models
DO $$ BEGIN
  CREATE TYPE "HOSDutyStatus" AS ENUM ('OFF_DUTY', 'SLEEPER_BERTH', 'DRIVING', 'ON_DUTY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentCategory" AS ENUM ('ACCIDENT', 'VIOLATION', 'MECHANICAL', 'HAZARD', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create DriverHOSEntry table
CREATE TABLE IF NOT EXISTS "DriverHOSEntry" (
  "id"        UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID            NOT NULL,
  "driverId"  UUID            NOT NULL,
  "status"    "HOSDutyStatus" NOT NULL,
  "startTime" TIMESTAMPTZ     NOT NULL,
  "endTime"   TIMESTAMPTZ,
  "notes"     TEXT,
  "createdAt" TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ     NOT NULL,

  CONSTRAINT "DriverHOSEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverHOSEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "DriverHOSEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DriverHOSEntry_tenantId_idx"               ON "DriverHOSEntry"("tenantId");
CREATE INDEX IF NOT EXISTS "DriverHOSEntry_driverId_idx"               ON "DriverHOSEntry"("driverId");
CREATE INDEX IF NOT EXISTS "DriverHOSEntry_driverId_startTime_idx"     ON "DriverHOSEntry"("driverId", "startTime");
CREATE INDEX IF NOT EXISTS "DriverHOSEntry_tenantId_driverId_start_idx" ON "DriverHOSEntry"("tenantId", "driverId", "startTime");

-- Enable RLS on DriverHOSEntry
ALTER TABLE "DriverHOSEntry" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "DriverHOSEntry";
CREATE POLICY tenant_isolation_policy ON "DriverHOSEntry"
  FOR ALL
  USING ("tenantId" = current_tenant_id());

DROP POLICY IF EXISTS bypass_rls_policy ON "DriverHOSEntry";
CREATE POLICY bypass_rls_policy ON "DriverHOSEntry"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- Create DriverIncident table
CREATE TABLE IF NOT EXISTS "DriverIncident" (
  "id"          UUID               NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"    UUID               NOT NULL,
  "driverId"    UUID               NOT NULL,
  "category"    "IncidentCategory" NOT NULL,
  "severity"    "IncidentSeverity" NOT NULL,
  "description" TEXT               NOT NULL,
  "latitude"    DECIMAL(10, 8),
  "longitude"   DECIMAL(11, 8),
  "photoS3Key"  TEXT,
  "reportedAt"  TIMESTAMPTZ        NOT NULL,
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMPTZ        NOT NULL,

  CONSTRAINT "DriverIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "DriverIncident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DriverIncident_tenantId_idx"   ON "DriverIncident"("tenantId");
CREATE INDEX IF NOT EXISTS "DriverIncident_driverId_idx"   ON "DriverIncident"("driverId");
CREATE INDEX IF NOT EXISTS "DriverIncident_category_idx"   ON "DriverIncident"("category");
CREATE INDEX IF NOT EXISTS "DriverIncident_reportedAt_idx" ON "DriverIncident"("reportedAt");

-- Enable RLS on DriverIncident
ALTER TABLE "DriverIncident" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "DriverIncident";
CREATE POLICY tenant_isolation_policy ON "DriverIncident"
  FOR ALL
  USING ("tenantId" = current_tenant_id());

DROP POLICY IF EXISTS bypass_rls_policy ON "DriverIncident";
CREATE POLICY bypass_rls_policy ON "DriverIncident"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
