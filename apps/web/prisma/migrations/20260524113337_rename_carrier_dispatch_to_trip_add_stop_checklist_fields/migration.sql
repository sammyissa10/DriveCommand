-- AlterTable: Add checklist fields to CarrierStop (stops table)
-- This migration supports future workflow engine integration at the stop level

ALTER TABLE "stops" ADD COLUMN IF NOT EXISTS "checklist_status" TEXT;
ALTER TABLE "stops" ADD COLUMN IF NOT EXISTS "deferred_reason" TEXT;
ALTER TABLE "stops" ADD COLUMN IF NOT EXISTS "checklist_entity_id" UUID;

-- Add index for checklist lookups
CREATE INDEX IF NOT EXISTS "stops_checklist_entity_id_idx" ON "stops"("checklist_entity_id");

-- Note: Prisma model rename from CarrierDispatch to Trip does NOT affect the database
-- The @@map("dispatches") directive keeps the table name unchanged
-- This is a Prisma-client-only change for better code semantics
