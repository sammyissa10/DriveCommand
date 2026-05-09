-- Migration: Phase 45 — Automation Foundation
-- 1. Create TriggerEvent enum (8 values: 6 lifecycle + MANUAL_ONLY + RECURRING)
-- 2. Create PlaybookTrigger table (auto-start rules, spec Section 5.2)
-- 3. Create DispatchOverrideAudit table (admin override audit trail, spec Section 13)

-- 1. TriggerEvent enum
CREATE TYPE "TriggerEvent" AS ENUM (
  'ON_DRIVER_CREATE',
  'ON_VEHICLE_CREATE',
  'ON_DISPATCH_CREATE',
  'ON_DISPATCH_DEPART',
  'ON_DISPATCH_DELIVER',
  'ON_PARTNER_CREATE',
  'MANUAL_ONLY',
  'RECURRING'
);

-- 2. PlaybookTrigger table
CREATE TABLE "PlaybookTrigger" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "playbookId"      UUID        NOT NULL,
  "tenantId"        UUID        NOT NULL,
  "triggerEvent"    "TriggerEvent" NOT NULL,
  "conditions"      JSONB,
  "recurringConfig" JSONB,
  "isActive"        BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL,

  CONSTRAINT "PlaybookTrigger_pkey" PRIMARY KEY ("id")
);

-- Foreign keys for PlaybookTrigger
ALTER TABLE "PlaybookTrigger"
  ADD CONSTRAINT "PlaybookTrigger_playbookId_fkey"
    FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlaybookTrigger"
  ADD CONSTRAINT "PlaybookTrigger_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for PlaybookTrigger
CREATE INDEX "PlaybookTrigger_tenantId_triggerEvent_idx" ON "PlaybookTrigger"("tenantId", "triggerEvent");
CREATE INDEX "PlaybookTrigger_playbookId_idx" ON "PlaybookTrigger"("playbookId");

-- 3. DispatchOverrideAudit table
CREATE TABLE "DispatchOverrideAudit" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"   UUID        NOT NULL,
  "dispatchId" UUID        NOT NULL,
  "userId"     UUID        NOT NULL,
  "reason"     TEXT        NOT NULL,
  "entityType" TEXT        NOT NULL,
  "entityId"   UUID        NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "DispatchOverrideAudit_pkey" PRIMARY KEY ("id")
);

-- Foreign key for DispatchOverrideAudit
ALTER TABLE "DispatchOverrideAudit"
  ADD CONSTRAINT "DispatchOverrideAudit_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for DispatchOverrideAudit
CREATE INDEX "DispatchOverrideAudit_tenantId_idx" ON "DispatchOverrideAudit"("tenantId");
CREATE INDEX "DispatchOverrideAudit_dispatchId_idx" ON "DispatchOverrideAudit"("dispatchId");
