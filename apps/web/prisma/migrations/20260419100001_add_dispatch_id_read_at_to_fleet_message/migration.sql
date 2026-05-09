-- AlterTable: Add dispatchId and readAt to FleetMessage
ALTER TABLE "FleetMessage"
  ADD COLUMN "dispatchId" UUID,
  ADD COLUMN "readAt" TIMESTAMPTZ;

-- AddForeignKey
ALTER TABLE "FleetMessage"
  ADD CONSTRAINT "FleetMessage_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "FleetMessage_dispatchId_idx" ON "FleetMessage"("dispatchId");
CREATE INDEX "FleetMessage_recipientId_idx" ON "FleetMessage"("recipientId");
