-- Add audit and relationship fields to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "loadId"      UUID       REFERENCES "Load"("id") ON DELETE SET NULL;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "createdById" UUID       REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "updatedById" UUID       REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "archivedAt"  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Invoice_loadId_idx"     ON "Invoice"("loadId");
CREATE INDEX IF NOT EXISTS "Invoice_archivedAt_idx" ON "Invoice"("archivedAt");
