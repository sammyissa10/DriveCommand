-- Add trigger metadata to PlaybookInstance for the automation activity log
ALTER TABLE "PlaybookInstance" ADD COLUMN "triggeredBy" TEXT;
ALTER TABLE "PlaybookInstance" ADD COLUMN "triggeredEvent" "TriggerEvent";

CREATE INDEX "PlaybookInstance_tenantId_triggeredBy_createdAt_idx"
  ON "PlaybookInstance" ("tenantId", "triggeredBy", "createdAt" DESC);
