-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('USER', 'LOAD', 'DRIVER', 'TRUCK', 'MESSAGE', 'FINANCE', 'ROUTE', 'CUSTOMER', 'DIGEST');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationSendStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED_DISABLED', 'SKIPPED_USER_PREF');

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "triggerKey" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultSubject" TEXT NOT NULL,
    "defaultBlockJson" JSONB NOT NULL,
    "defaultHtmlCache" TEXT,
    "availableVariables" JSONB NOT NULL,
    "defaultRecipients" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantNotificationSettings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customSubject" TEXT,
    "customBlockJson" JSONB,
    "customHtmlCache" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TenantNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSubscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSendLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "recipientUserId" UUID,
    "recipientEmail" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT,
    "status" "NotificationSendStatus" NOT NULL,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotificationSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEmailConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "singletonKey" TEXT NOT NULL DEFAULT 'singleton',
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotificationEmailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_triggerKey_key" ON "NotificationTemplate"("triggerKey");

-- CreateIndex
CREATE INDEX "NotificationTemplate_category_idx" ON "NotificationTemplate"("category");

-- CreateIndex
CREATE INDEX "NotificationTemplate_isActive_idx" ON "NotificationTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TenantNotificationSettings_tenantId_triggerKey_key" ON "TenantNotificationSettings"("tenantId", "triggerKey");

-- CreateIndex
CREATE INDEX "TenantNotificationSettings_tenantId_idx" ON "TenantNotificationSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantNotificationSettings_triggerKey_idx" ON "TenantNotificationSettings"("triggerKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSubscription_tenantId_triggerKey_userId_key" ON "NotificationSubscription"("tenantId", "triggerKey", "userId");

-- CreateIndex
CREATE INDEX "NotificationSubscription_tenantId_idx" ON "NotificationSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationSubscription_userId_idx" ON "NotificationSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_triggerKey_key" ON "UserNotificationPreference"("userId", "triggerKey");

-- CreateIndex
CREATE INDEX "UserNotificationPreference_userId_idx" ON "UserNotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationSendLog_tenantId_idx" ON "NotificationSendLog"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationSendLog_triggerKey_idx" ON "NotificationSendLog"("triggerKey");

-- CreateIndex
CREATE INDEX "NotificationSendLog_idempotencyKey_idx" ON "NotificationSendLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationSendLog_status_idx" ON "NotificationSendLog"("status");

-- CreateIndex
CREATE INDEX "NotificationSendLog_createdAt_idx" ON "NotificationSendLog"("createdAt");

-- AddForeignKey
ALTER TABLE "TenantNotificationSettings" ADD CONSTRAINT "TenantNotificationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubscription" ADD CONSTRAINT "NotificationSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubscription" ADD CONSTRAINT "NotificationSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================
-- RLS for tenant-scoped notification tables
-- ==============================================

-- TenantNotificationSettings
ALTER TABLE "TenantNotificationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantNotificationSettings" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "TenantNotificationSettings"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "TenantNotificationSettings"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- NotificationSubscription
ALTER TABLE "NotificationSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationSubscription" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "NotificationSubscription"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "NotificationSubscription"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- User-scoped RLS for UserNotificationPreference
-- ==============================================
ALTER TABLE "UserNotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNotificationPreference" FORCE ROW LEVEL SECURITY;

-- Users see/edit only their own rows.
-- Note: This project uses Supabase Auth; auth.uid() returns the Supabase JWT subject UUID.
-- The User table's "id" column matches the Supabase auth.uid() for authenticated users.
CREATE POLICY user_isolation_policy ON "UserNotificationPreference"
  FOR ALL
  USING ("userId" = auth.uid())
  WITH CHECK ("userId" = auth.uid());

CREATE POLICY bypass_rls_policy ON "UserNotificationPreference"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Single-row constraint on NotificationEmailConfig
-- ==============================================
CREATE UNIQUE INDEX "NotificationEmailConfig_singleton_idx"
  ON "NotificationEmailConfig" ("singletonKey")
  WHERE "singletonKey" = 'singleton';

-- ==============================================
-- Auto-populate TenantNotificationSettings on new Tenant
-- ==============================================
CREATE OR REPLACE FUNCTION seed_tenant_notification_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "TenantNotificationSettings" ("id", "tenantId", "triggerKey", "isActive", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), NEW."id", t."triggerKey", TRUE, NOW(), NOW()
  FROM "NotificationTemplate" t
  WHERE t."isActive" = TRUE
  ON CONFLICT ("tenantId", "triggerKey") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_tenant_notification_settings ON "Tenant";
CREATE TRIGGER trg_seed_tenant_notification_settings
AFTER INSERT ON "Tenant"
FOR EACH ROW
EXECUTE FUNCTION seed_tenant_notification_settings();
