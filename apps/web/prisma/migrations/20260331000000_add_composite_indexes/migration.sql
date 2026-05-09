-- AddCompositeIndexes: performance optimization for high-traffic query paths
-- Adds composite indexes on Load, Invoice, Document, and FleetMessage models

-- Load: composite index for status-filtered queries by tenant (most common mobile/web query)
CREATE INDEX IF NOT EXISTS "Load_tenantId_status_archivedAt_idx"
  ON "Load" ("tenantId", "status", "archivedAt");

-- Invoice: composite index for status-grouped stats queries by tenant
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_status_idx"
  ON "Invoice" ("tenantId", "status");

-- Document: composite index for compliance queries filtering by driver within tenant
CREATE INDEX IF NOT EXISTS "Document_tenantId_driverId_idx"
  ON "Document" ("tenantId", "driverId");

-- FleetMessage: composite index for cursor-paginated message queries by tenant
CREATE INDEX IF NOT EXISTS "FleetMessage_tenantId_createdAt_idx"
  ON "FleetMessage" ("tenantId", "createdAt");
