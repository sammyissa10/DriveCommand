-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "endOdometer" INTEGER,
ADD COLUMN     "startOdometer" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "profitMarginThreshold" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteExpense" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RouteExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ExpenseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseTemplateItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "templateId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "ExpenseTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ,
    "notes" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RoutePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseCategory_tenantId_idx" ON "ExpenseCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_tenantId_name_key" ON "ExpenseCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "RouteExpense_tenantId_idx" ON "RouteExpense"("tenantId");

-- CreateIndex
CREATE INDEX "RouteExpense_routeId_idx" ON "RouteExpense"("routeId");

-- CreateIndex
CREATE INDEX "RouteExpense_categoryId_idx" ON "RouteExpense"("categoryId");

-- CreateIndex
CREATE INDEX "RouteExpense_deletedAt_idx" ON "RouteExpense"("deletedAt");

-- CreateIndex
CREATE INDEX "ExpenseTemplate_tenantId_idx" ON "ExpenseTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseTemplate_tenantId_name_key" ON "ExpenseTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ExpenseTemplateItem_templateId_idx" ON "ExpenseTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "ExpenseTemplateItem_categoryId_idx" ON "ExpenseTemplateItem"("categoryId");

-- CreateIndex
CREATE INDEX "RoutePayment_tenantId_idx" ON "RoutePayment"("tenantId");

-- CreateIndex
CREATE INDEX "RoutePayment_routeId_idx" ON "RoutePayment"("routeId");

-- CreateIndex
CREATE INDEX "RoutePayment_status_idx" ON "RoutePayment"("status");

-- CreateIndex
CREATE INDEX "RoutePayment_deletedAt_idx" ON "RoutePayment"("deletedAt");

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteExpense" ADD CONSTRAINT "RouteExpense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteExpense" ADD CONSTRAINT "RouteExpense_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteExpense" ADD CONSTRAINT "RouteExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTemplate" ADD CONSTRAINT "ExpenseTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTemplateItem" ADD CONSTRAINT "ExpenseTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExpenseTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTemplateItem" ADD CONSTRAINT "ExpenseTemplateItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePayment" ADD CONSTRAINT "RoutePayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePayment" ADD CONSTRAINT "RoutePayment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================
-- Row-Level Security Setup for ExpenseCategory
-- ==============================================

ALTER TABLE "ExpenseCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseCategory" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ExpenseCategory"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "ExpenseCategory"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security Setup for RouteExpense
-- ==============================================

ALTER TABLE "RouteExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RouteExpense" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "RouteExpense"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "RouteExpense"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security Setup for ExpenseTemplate
-- ==============================================

ALTER TABLE "ExpenseTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseTemplate" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ExpenseTemplate"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "ExpenseTemplate"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security Setup for RoutePayment
-- ==============================================

ALTER TABLE "RoutePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoutePayment" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "RoutePayment"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "RoutePayment"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
