-- Add billing period, recurring flag, and charge type to sysadmin invoices

ALTER TABLE "SysAdminInvoice"
  ADD COLUMN "billingPeriodStart" TIMESTAMPTZ,
  ADD COLUMN "billingPeriodEnd"   TIMESTAMPTZ,
  ADD COLUMN "isRecurring"        BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "SysAdminInvoiceItem"
  ADD COLUMN "chargeType" TEXT;
