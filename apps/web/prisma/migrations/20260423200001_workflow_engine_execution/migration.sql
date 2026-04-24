-- =============================================================
-- Phase 43: Workflow Engine Execution
-- Adds PlaybookInstance, StepInstance, PlaybookNotification tables,
-- 4 new enums, first-class columns on PlaybookStep,
-- and isDispatchReady booleans on User and Truck.
-- =============================================================

-- ==============================
-- CreateEnum: InstanceStatus
-- ==============================
DO $$ BEGIN
  CREATE TYPE "InstanceStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================
-- CreateEnum: StepStatus
-- ==============================
DO $$ BEGIN
  CREATE TYPE "StepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================
-- CreateEnum: NotifType
-- ==============================
DO $$ BEGIN
  CREATE TYPE "NotifType" AS ENUM ('STEP_ASSIGNED', 'STEP_OVERDUE', 'INSTANCE_BLOCKED', 'DISPATCH_READY', 'STEP_FAILED', 'APPROVAL_NEEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================
-- CreateEnum: NotifChannel
-- ==============================
DO $$ BEGIN
  CREATE TYPE "NotifChannel" AS ENUM ('PUSH', 'SMS', 'IN_APP', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================
-- AlterTable: PlaybookStep — add first-class dispatch columns
-- ==============================
ALTER TABLE "PlaybookStep"
  ADD COLUMN IF NOT EXISTS "isRequired"        BOOLEAN  NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "isDispatchBlocker" BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "dueDaysFromStart"  INTEGER,
  ADD COLUMN IF NOT EXISTS "dueBeforeDispatch" BOOLEAN  NOT NULL DEFAULT FALSE;

-- Backfill from overrideConfig for any existing rows that stored these fields in JSON
UPDATE "PlaybookStep"
SET
  "isDispatchBlocker" = COALESCE(("overrideConfig"->>'isDispatchBlocker')::boolean, false),
  "isRequired"        = COALESCE(("overrideConfig"->>'isRequired')::boolean, true),
  "dueDaysFromStart"  = CASE
    WHEN "overrideConfig"->>'dueDaysFromStart' IS NOT NULL
    THEN ("overrideConfig"->>'dueDaysFromStart')::integer
    ELSE NULL
  END,
  "dueBeforeDispatch" = COALESCE(("overrideConfig"->>'dueBeforeDispatch')::boolean, false)
WHERE "overrideConfig" IS NOT NULL AND "overrideConfig" != '{}'::jsonb;

-- ==============================
-- AlterTable: User — add isDispatchReady
-- ==============================
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isDispatchReady" BOOLEAN NOT NULL DEFAULT FALSE;

-- ==============================
-- AlterTable: Truck — add isDispatchReady
-- ==============================
ALTER TABLE "Truck"
  ADD COLUMN IF NOT EXISTS "isDispatchReady" BOOLEAN NOT NULL DEFAULT FALSE;

-- ==============================================
-- CreateTable: PlaybookInstance
-- ==============================================
CREATE TABLE IF NOT EXISTS "PlaybookInstance" (
  "id"                UUID                NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"          UUID                NOT NULL,
  "playbookId"        UUID                NOT NULL,
  "playbookSnapshot"  JSONB               NOT NULL,
  "entityType"        "PlaybookEntityType" NOT NULL,
  "entityId"          UUID                NOT NULL,
  "status"            "InstanceStatus"    NOT NULL DEFAULT 'NOT_STARTED',
  "completionPercent" DOUBLE PRECISION    NOT NULL DEFAULT 0,
  "isDispatchReady"   BOOLEAN             NOT NULL DEFAULT FALSE,
  "startedAt"         TIMESTAMPTZ,
  "completedAt"       TIMESTAMPTZ,
  "dueDate"           TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT "PlaybookInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: PlaybookInstance
CREATE INDEX IF NOT EXISTS "PlaybookInstance_tenantId_entityType_entityId_idx"
  ON "PlaybookInstance" ("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "PlaybookInstance_tenantId_status_idx"
  ON "PlaybookInstance" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "PlaybookInstance_tenantId_isDispatchReady_idx"
  ON "PlaybookInstance" ("tenantId", "isDispatchReady");

-- AddForeignKey: PlaybookInstance -> Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaybookInstance_tenantId_fkey'
  ) THEN
    ALTER TABLE "PlaybookInstance" ADD CONSTRAINT "PlaybookInstance_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- AddForeignKey: PlaybookInstance -> Playbook
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaybookInstance_playbookId_fkey'
  ) THEN
    ALTER TABLE "PlaybookInstance" ADD CONSTRAINT "PlaybookInstance_playbookId_fkey"
      FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

-- ==============================================
-- CreateTable: StepInstance
-- ==============================================
CREATE TABLE IF NOT EXISTS "StepInstance" (
  "id"                 UUID            NOT NULL DEFAULT gen_random_uuid(),
  "playbookInstanceId" UUID            NOT NULL,
  "stepTemplateId"     UUID            NOT NULL,
  "stepSnapshot"       JSONB           NOT NULL,
  "status"             "StepStatus"    NOT NULL DEFAULT 'NOT_STARTED',
  "assigneeRole"       "AssigneeRole"  NOT NULL,
  "assignedUserId"     UUID,
  "completedByUserId"  UUID,
  "completedAt"        TIMESTAMPTZ,
  "result"             JSONB,
  "skipReason"         TEXT,
  "skippedByUserId"    UUID,
  "dueDate"            TIMESTAMPTZ,
  "isOverdue"          BOOLEAN         NOT NULL DEFAULT FALSE,
  "createdAt"          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT "StepInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: StepInstance
CREATE INDEX IF NOT EXISTS "StepInstance_playbookInstanceId_idx"
  ON "StepInstance" ("playbookInstanceId");
CREATE INDEX IF NOT EXISTS "StepInstance_assignedUserId_status_idx"
  ON "StepInstance" ("assignedUserId", "status");
CREATE INDEX IF NOT EXISTS "StepInstance_playbookInstanceId_status_idx"
  ON "StepInstance" ("playbookInstanceId", "status");

-- AddForeignKey: StepInstance -> PlaybookInstance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StepInstance_playbookInstanceId_fkey'
  ) THEN
    ALTER TABLE "StepInstance" ADD CONSTRAINT "StepInstance_playbookInstanceId_fkey"
      FOREIGN KEY ("playbookInstanceId") REFERENCES "PlaybookInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- AddForeignKey: StepInstance -> StepTemplate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StepInstance_stepTemplateId_fkey'
  ) THEN
    ALTER TABLE "StepInstance" ADD CONSTRAINT "StepInstance_stepTemplateId_fkey"
      FOREIGN KEY ("stepTemplateId") REFERENCES "StepTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

-- ==============================================
-- CreateTable: PlaybookNotification
-- ==============================================
CREATE TABLE IF NOT EXISTS "PlaybookNotification" (
  "id"                 UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"           UUID            NOT NULL,
  "playbookInstanceId" UUID            NOT NULL,
  "stepInstanceId"     UUID,
  "notificationType"   "NotifType"     NOT NULL,
  "channel"            "NotifChannel"  NOT NULL,
  "recipientUserId"    UUID            NOT NULL,
  "message"            TEXT            NOT NULL,
  "sentAt"             TIMESTAMPTZ,
  "deliveredAt"        TIMESTAMPTZ,
  "createdAt"          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT "PlaybookNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: PlaybookNotification
CREATE INDEX IF NOT EXISTS "PlaybookNotification_playbookInstanceId_idx"
  ON "PlaybookNotification" ("playbookInstanceId");
CREATE INDEX IF NOT EXISTS "PlaybookNotification_recipientUserId_idx"
  ON "PlaybookNotification" ("recipientUserId");

-- AddForeignKey: PlaybookNotification -> Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaybookNotification_tenantId_fkey'
  ) THEN
    ALTER TABLE "PlaybookNotification" ADD CONSTRAINT "PlaybookNotification_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- AddForeignKey: PlaybookNotification -> PlaybookInstance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaybookNotification_playbookInstanceId_fkey'
  ) THEN
    ALTER TABLE "PlaybookNotification" ADD CONSTRAINT "PlaybookNotification_playbookInstanceId_fkey"
      FOREIGN KEY ("playbookInstanceId") REFERENCES "PlaybookInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- ==============================================
-- Row-Level Security: PlaybookInstance
-- ==============================================
ALTER TABLE "PlaybookInstance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookInstance" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "PlaybookInstance"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "PlaybookInstance"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security: StepInstance
-- StepInstance has no tenantId — isolate via PlaybookInstance JOIN
-- ==============================================
ALTER TABLE "StepInstance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StepInstance" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "StepInstance"
  FOR ALL
  USING (
    "playbookInstanceId" IN (
      SELECT id FROM "PlaybookInstance" WHERE "tenantId" = current_tenant_id()
    )
  );

CREATE POLICY bypass_rls_policy ON "StepInstance"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security: PlaybookNotification
-- ==============================================
ALTER TABLE "PlaybookNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookNotification" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "PlaybookNotification"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "PlaybookNotification"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
