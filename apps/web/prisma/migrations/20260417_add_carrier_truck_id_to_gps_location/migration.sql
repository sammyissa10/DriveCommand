-- Add carrier_truck_id nullable FK to GPSLocation
ALTER TABLE "GPSLocation"
  ADD COLUMN "carrierTruckId" UUID REFERENCES "carrier_trucks"(id) ON DELETE CASCADE;

-- Make truckId nullable (carrier pings have no legacy truck)
ALTER TABLE "GPSLocation"
  ALTER COLUMN "truckId" DROP NOT NULL;

-- Indexes for carrier truck GPS lookups
CREATE INDEX "GPSLocation_carrierTruckId_idx" ON "GPSLocation"("carrierTruckId");
CREATE INDEX "GPSLocation_carrierTruckId_timestamp_idx" ON "GPSLocation"("carrierTruckId", "timestamp");
