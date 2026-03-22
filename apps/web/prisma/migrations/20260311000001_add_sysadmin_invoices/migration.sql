-- Create SysAdminInvoiceStatus enum
CREATE TYPE "SysAdminInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID');

-- Create SysAdminInvoice table
CREATE TABLE "SysAdminInvoice" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "status"        "SysAdminInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "issueDate"     TIMESTAMPTZ NOT NULL,
  "dueDate"       TIMESTAMPTZ NOT NULL,
  "subtotal"      DECIMAL(12,2) NOT NULL,
  "total"         DECIMAL(12,2) NOT NULL,
  "notes"         TEXT,
  "paidAt"        TIMESTAMPTZ,
  "archivedAt"    TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SysAdminInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SysAdminInvoice_invoiceNumber_key" UNIQUE ("invoiceNumber"),
  CONSTRAINT "SysAdminInvoice_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SysAdminInvoice_tenantId_idx"   ON "SysAdminInvoice"("tenantId");
CREATE INDEX "SysAdminInvoice_status_idx"     ON "SysAdminInvoice"("status");
CREATE INDEX "SysAdminInvoice_dueDate_idx"    ON "SysAdminInvoice"("dueDate");
CREATE INDEX "SysAdminInvoice_archivedAt_idx" ON "SysAdminInvoice"("archivedAt");

-- Create SysAdminInvoiceItem table
CREATE TABLE "SysAdminInvoiceItem" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId"   UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity"    DECIMAL(10,2) NOT NULL,
  "unitPrice"   DECIMAL(10,2) NOT NULL,
  "amount"      DECIMAL(12,2) NOT NULL,
  CONSTRAINT "SysAdminInvoiceItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SysAdminInvoiceItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "SysAdminInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SysAdminInvoiceItem_invoiceId_idx" ON "SysAdminInvoiceItem"("invoiceId");

-- RLS: tenant users must never see sysadmin invoices
-- Admin portal uses base prisma client (no RLS session variable set),
-- so these tables are effectively admin-only.
ALTER TABLE "SysAdminInvoice"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SysAdminInvoiceItem" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sysadmin_invoices_deny_tenant_users"
  ON "SysAdminInvoice" FOR ALL
  USING (current_setting('app.current_tenant_id', TRUE) IS NULL
      OR current_setting('app.current_tenant_id', TRUE) = '');

CREATE POLICY "sysadmin_invoice_items_deny_tenant_users"
  ON "SysAdminInvoiceItem" FOR ALL
  USING (current_setting('app.current_tenant_id', TRUE) IS NULL
      OR current_setting('app.current_tenant_id', TRUE) = '');
