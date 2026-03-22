-- AlterTable User - Add driver-specific fields
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "licenseNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DriverInvitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "clerkInvitationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMPTZ,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DriverInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverInvitation_clerkInvitationId_key" ON "DriverInvitation"("clerkInvitationId");

-- CreateIndex
CREATE INDEX "DriverInvitation_tenantId_idx" ON "DriverInvitation"("tenantId");

-- CreateIndex
CREATE INDEX "DriverInvitation_email_idx" ON "DriverInvitation"("email");

-- CreateIndex
CREATE INDEX "DriverInvitation_clerkInvitationId_idx" ON "DriverInvitation"("clerkInvitationId");

-- AddForeignKey
ALTER TABLE "DriverInvitation" ADD CONSTRAINT "DriverInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================
-- Row-Level Security Setup for DriverInvitation
-- ==============================================

-- Enable RLS on DriverInvitation table
ALTER TABLE "DriverInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriverInvitation" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy for DriverInvitation
CREATE POLICY tenant_isolation_policy ON "DriverInvitation"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Bypass policy for system admin / provisioning operations
CREATE POLICY bypass_rls_policy ON "DriverInvitation"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
