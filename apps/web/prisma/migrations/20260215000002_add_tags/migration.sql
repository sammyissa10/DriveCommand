-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagAssignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "truckId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TagAssignment_tenantId_idx" ON "TagAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "TagAssignment_tagId_idx" ON "TagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "TagAssignment_truckId_idx" ON "TagAssignment"("truckId");

-- CreateIndex
CREATE INDEX "TagAssignment_userId_idx" ON "TagAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TagAssignment_tagId_truckId_key" ON "TagAssignment"("tagId", "truckId");

-- CreateIndex
CREATE UNIQUE INDEX "TagAssignment_tagId_userId_key" ON "TagAssignment"("tagId", "userId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAssignment" ADD CONSTRAINT "TagAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAssignment" ADD CONSTRAINT "TagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAssignment" ADD CONSTRAINT "TagAssignment_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAssignment" ADD CONSTRAINT "TagAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for Tag
CREATE POLICY "tenant_isolation_policy" ON "Tag" USING ("tenantId"::text = current_setting('app.current_tenant_id', TRUE));
CREATE POLICY "bypass_rls_policy" ON "Tag" USING (current_setting('app.bypass_rls', TRUE) = 'on');

-- Enable Row Level Security for TagAssignment
ALTER TABLE "TagAssignment" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for TagAssignment
CREATE POLICY "tenant_isolation_policy" ON "TagAssignment" USING ("tenantId"::text = current_setting('app.current_tenant_id', TRUE));
CREATE POLICY "bypass_rls_policy" ON "TagAssignment" USING (current_setting('app.bypass_rls', TRUE) = 'on');
