-- =============================================================
-- Phase 42: Workflow Engine Foundation
-- Creates StepTemplate, Playbook, PlaybookStep tables + 5 enums
-- =============================================================

-- CreateEnum: PlaybookEntityType
DO $$ BEGIN
  CREATE TYPE "PlaybookEntityType" AS ENUM ('DRIVER', 'VEHICLE', 'PARTNER', 'DISPATCH', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum: PlaybookCategory
DO $$ BEGIN
  CREATE TYPE "PlaybookCategory" AS ENUM ('ONBOARDING', 'SAFETY', 'OPERATIONS', 'COMPLIANCE', 'PARTNER', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum: PhaseType
DO $$ BEGIN
  CREATE TYPE "PhaseType" AS ENUM ('PRE_START', 'DAY_1', 'WEEK_1', 'ONGOING', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum: StepType
DO $$ BEGIN
  CREATE TYPE "StepType" AS ENUM ('DOCUMENT_UPLOAD', 'FORM_FILL', 'INSPECTION_ITEM', 'SIGNATURE', 'TRAINING_ACK', 'APPROVAL', 'THIRD_PARTY', 'CUSTOM_NOTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum: AssigneeRole
DO $$ BEGIN
  CREATE TYPE "AssigneeRole" AS ENUM ('DRIVER', 'DISPATCHER', 'MECHANIC', 'SAFETY_MANAGER', 'THIRD_PARTY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================================
-- CreateTable: StepTemplate
-- ==============================================
CREATE TABLE IF NOT EXISTS "StepTemplate" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"      UUID NOT NULL,
    "name"          VARCHAR(200) NOT NULL,
    "description"   TEXT,
    "stepType"      "StepType" NOT NULL,
    "assigneeRole"  "AssigneeRole" NOT NULL,
    "defaultConfig" JSONB NOT NULL DEFAULT '{}',
    "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
    "deletedAt"     TIMESTAMPTZ,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "StepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: StepTemplate
CREATE INDEX IF NOT EXISTS "StepTemplate_tenantId_isActive_idx" ON "StepTemplate" ("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "StepTemplate_tenantId_stepType_idx" ON "StepTemplate" ("tenantId", "stepType");

-- AddForeignKey: StepTemplate -> Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StepTemplate_tenantId_fkey'
  ) THEN
    ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- ==============================================
-- CreateTable: Playbook
-- ==============================================
CREATE TABLE IF NOT EXISTS "Playbook" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"      UUID NOT NULL,
    "name"          VARCHAR(200) NOT NULL,
    "description"   TEXT,
    "entityType"    "PlaybookEntityType" NOT NULL,
    "category"      "PlaybookCategory" NOT NULL,
    "playbookPhase" "PhaseType" NOT NULL DEFAULT 'NONE',
    "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
    "deletedAt"     TIMESTAMPTZ,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Playbook
CREATE INDEX IF NOT EXISTS "Playbook_tenantId_isActive_idx" ON "Playbook" ("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "Playbook_tenantId_entityType_idx" ON "Playbook" ("tenantId", "entityType");

-- AddForeignKey: Playbook -> Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Playbook_tenantId_fkey'
  ) THEN
    ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- ==============================================
-- CreateTable: PlaybookStep
-- ==============================================
CREATE TABLE IF NOT EXISTS "PlaybookStep" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "playbookId"     UUID NOT NULL,
    "stepTemplateId" UUID NOT NULL,
    "sequence"       INTEGER NOT NULL,
    "playbookPhase"  "PhaseType" NOT NULL DEFAULT 'NONE',
    "overrideConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "PlaybookStep_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlaybookStep_playbookId_sequence_key" UNIQUE ("playbookId", "sequence")
);

-- CreateIndex: PlaybookStep
CREATE INDEX IF NOT EXISTS "PlaybookStep_playbookId_idx" ON "PlaybookStep" ("playbookId");
CREATE INDEX IF NOT EXISTS "PlaybookStep_stepTemplateId_idx" ON "PlaybookStep" ("stepTemplateId");

-- AddForeignKey: PlaybookStep -> Playbook
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaybookStep_playbookId_fkey'
  ) THEN
    ALTER TABLE "PlaybookStep" ADD CONSTRAINT "PlaybookStep_playbookId_fkey"
      FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- AddForeignKey: PlaybookStep -> StepTemplate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaybookStep_stepTemplateId_fkey'
  ) THEN
    ALTER TABLE "PlaybookStep" ADD CONSTRAINT "PlaybookStep_stepTemplateId_fkey"
      FOREIGN KEY ("stepTemplateId") REFERENCES "StepTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

-- ==============================================
-- Row-Level Security: StepTemplate
-- ==============================================
ALTER TABLE "StepTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StepTemplate" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "StepTemplate"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "StepTemplate"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security: Playbook
-- ==============================================
ALTER TABLE "Playbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Playbook" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Playbook"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "Playbook"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Row-Level Security: PlaybookStep
-- PlaybookStep has no tenantId — isolate via Playbook JOIN
-- ==============================================
ALTER TABLE "PlaybookStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookStep" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "PlaybookStep"
  FOR ALL
  USING (
    "playbookId" IN (
      SELECT id FROM "Playbook" WHERE "tenantId" = current_tenant_id()
    )
  );

CREATE POLICY bypass_rls_policy ON "PlaybookStep"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
