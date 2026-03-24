-- Make FleetMessage.routeId optional to allow tenant-scoped messages without a route
ALTER TABLE "FleetMessage" ALTER COLUMN "routeId" DROP NOT NULL;
