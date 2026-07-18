-- Add nullable carrier_truck FK to Route (carrier orgs store fleet in carrier_trucks)
ALTER TABLE "Route"
  ADD COLUMN "carrierTruckId" UUID REFERENCES "carrier_trucks"(id) ON DELETE SET NULL;

-- Make legacy truckId nullable — carrier routes have no legacy Truck row
ALTER TABLE "Route"
  ALTER COLUMN "truckId" DROP NOT NULL;

-- Index for carrier truck route lookups
CREATE INDEX "Route_carrierTruckId_idx" ON "Route"("carrierTruckId");
