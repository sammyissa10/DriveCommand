-- CreateTable: Document model for file storage metadata
CREATE TABLE "Document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "truckId" UUID,
    "routeId" UUID,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Optimize tenant-scoped queries
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");

-- CreateIndex: Optimize truck document lookups
CREATE INDEX "Document_truckId_idx" ON "Document"("truckId");

-- CreateIndex: Optimize route document lookups
CREATE INDEX "Document_routeId_idx" ON "Document"("routeId");

-- CreateIndex: Track document uploads by user
CREATE INDEX "Document_uploadedBy_idx" ON "Document"("uploadedBy");

-- AddForeignKey: Tenant isolation
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Optional truck association
ALTER TABLE "Document" ADD CONSTRAINT "Document_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Optional route association
ALTER TABLE "Document" ADD CONSTRAINT "Document_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Track uploader
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS: Tenant isolation at database level
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation (users can only access documents in their tenant)
CREATE POLICY tenant_isolation_policy ON "Document"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());

-- RLS Policy: Bypass for system operations (migrations, admin tasks)
CREATE POLICY bypass_rls_policy ON "Document"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
