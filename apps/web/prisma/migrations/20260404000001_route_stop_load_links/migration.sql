-- Migration: route_stop_load_links
-- Adds loadId/contact/bol/po fields to RouteStop and pickupStopId/deliveryStopId to Load.
-- Backfills RouteStops for existing loads with routeId and lat/lng data.

-- ─── Step 1: Alter RouteStop ─────────────────────────────────────────────────

ALTER TABLE "RouteStop"
  ADD COLUMN "loadId"       UUID,
  ADD COLUMN "contactName"  TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "bolNumber"    TEXT,
  ADD COLUMN "poNumber"     TEXT;

-- FK: RouteStop.loadId → Load.id (nullable, deferrable to allow circular insert)
ALTER TABLE "RouteStop"
  ADD CONSTRAINT "RouteStop_loadId_fkey"
  FOREIGN KEY ("loadId") REFERENCES "Load"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- Index for FK lookups
CREATE INDEX "RouteStop_loadId_idx" ON "RouteStop"("loadId");

-- ─── Step 2: Alter Load ──────────────────────────────────────────────────────

ALTER TABLE "Load"
  ADD COLUMN "pickupStopId"   UUID,
  ADD COLUMN "deliveryStopId" UUID;

-- FK: Load.pickupStopId → RouteStop.id (nullable, deferrable)
ALTER TABLE "Load"
  ADD CONSTRAINT "Load_pickupStopId_fkey"
  FOREIGN KEY ("pickupStopId") REFERENCES "RouteStop"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- FK: Load.deliveryStopId → RouteStop.id (nullable, deferrable)
ALTER TABLE "Load"
  ADD CONSTRAINT "Load_deliveryStopId_fkey"
  FOREIGN KEY ("deliveryStopId") REFERENCES "RouteStop"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- ─── Step 3: Backfill RouteStops from existing loads ────────────────────────
-- Strategy: all PICKUP stops first (positions 1..N), then all DELIVERY stops
-- (positions N+1..N+M) per route, ordered by pickupDate / deliveryDate.
-- Only processes loads with routeId set and coordinates populated.

-- 3a: Insert PICKUP RouteStops
INSERT INTO "RouteStop" (
  "id", "routeId", "tenantId", "loadId", "type",
  "address", "lat", "lng", "position",
  "status", "geofenceHit", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  l."routeId",
  l."tenantId",
  l."id",
  'PICKUP'::"RouteStopType",
  l."origin",
  l."pickupLat",
  l."pickupLng",
  ROW_NUMBER() OVER (PARTITION BY l."routeId" ORDER BY l."pickupDate" ASC),
  'PENDING'::"RouteStopStatus",
  false,
  NOW(),
  NOW()
FROM "Load" l
WHERE l."routeId" IS NOT NULL
  AND l."pickupLat" IS NOT NULL
  AND l."archivedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "RouteStop" rs
    WHERE rs."loadId" = l."id" AND rs."type" = 'PICKUP'::"RouteStopType"
  );

-- 3b: Insert DELIVERY RouteStops (positions start after all pickups for that route)
WITH pickup_counts AS (
  SELECT l."routeId", COUNT(*) AS cnt
  FROM "Load" l
  WHERE l."routeId" IS NOT NULL
    AND l."pickupLat" IS NOT NULL
    AND l."archivedAt" IS NULL
  GROUP BY l."routeId"
)
INSERT INTO "RouteStop" (
  "id", "routeId", "tenantId", "loadId", "type",
  "address", "lat", "lng", "position",
  "status", "geofenceHit", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  l."routeId",
  l."tenantId",
  l."id",
  'DELIVERY'::"RouteStopType",
  l."destination",
  l."deliveryLat",
  l."deliveryLng",
  pc.cnt + ROW_NUMBER() OVER (PARTITION BY l."routeId" ORDER BY l."deliveryDate" ASC),
  'PENDING'::"RouteStopStatus",
  false,
  NOW(),
  NOW()
FROM "Load" l
JOIN pickup_counts pc ON pc."routeId" = l."routeId"
WHERE l."routeId" IS NOT NULL
  AND l."deliveryLat" IS NOT NULL
  AND l."archivedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "RouteStop" rs
    WHERE rs."loadId" = l."id" AND rs."type" = 'DELIVERY'::"RouteStopType"
  );

-- 3c: Backfill pickupStopId on Load from the PICKUP RouteStops just created
UPDATE "Load" l
SET "pickupStopId" = rs."id"
FROM "RouteStop" rs
WHERE rs."loadId" = l."id"
  AND rs."type" = 'PICKUP'::"RouteStopType"
  AND l."pickupStopId" IS NULL;

-- 3d: Backfill deliveryStopId on Load from the DELIVERY RouteStops just created
UPDATE "Load" l
SET "deliveryStopId" = rs."id"
FROM "RouteStop" rs
WHERE rs."loadId" = l."id"
  AND rs."type" = 'DELIVERY'::"RouteStopType"
  AND l."deliveryStopId" IS NULL;
