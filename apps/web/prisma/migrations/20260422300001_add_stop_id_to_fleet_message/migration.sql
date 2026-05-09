-- Add stopId FK to FleetMessage for stop-scoped messaging
ALTER TABLE "FleetMessage" ADD COLUMN "stop_id" UUID REFERENCES "stops"("id") ON DELETE SET NULL;
CREATE INDEX "FleetMessage_stop_id_idx" ON "FleetMessage"("stop_id");
