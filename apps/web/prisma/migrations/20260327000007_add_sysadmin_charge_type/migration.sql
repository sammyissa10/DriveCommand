-- Add chargeType field to SysAdminInvoiceItem
ALTER TABLE "SysAdminInvoiceItem" ADD COLUMN IF NOT EXISTS "chargeType" TEXT;
