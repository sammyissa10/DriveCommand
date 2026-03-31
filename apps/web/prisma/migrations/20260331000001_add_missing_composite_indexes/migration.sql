-- AddMissingCompositeIndexes: performance optimization for role/status/schedule query paths
-- Adds composite indexes on User, DriverInvitation, and Route models

-- User: composite index for active driver queries filtered by role within tenant
-- Supports 5+ endpoints that filter active drivers by role
CREATE INDEX IF NOT EXISTS "User_tenantId_role_isActive_idx"
  ON "User" ("tenantId", "role", "isActive");

-- DriverInvitation: composite index for invitation listing queries by tenant + status
CREATE INDEX IF NOT EXISTS "DriverInvitation_tenantId_status_idx"
  ON "DriverInvitation" ("tenantId", "status");

-- Route: composite index for scheduling conflict detection (tenant + driver + date)
CREATE INDEX IF NOT EXISTS "Route_tenantId_driverId_scheduledDate_idx"
  ON "Route" ("tenantId", "driverId", "scheduledDate");
