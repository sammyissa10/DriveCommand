-- Phase 52-01: Extend AutomationRun for scheduled execution
-- Adding PENDING + SENT to AutomationRunStatus enum,
-- adding scheduledAt / eventId / errorMessage columns,
-- and a partial unique index for event-driven idempotency.

ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'SENT';

ALTER TABLE "AutomationRun"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "eventId"     UUID,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- Idempotency: one AutomationRun per (eventId, ruleId) for event-driven runs
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRun_eventId_ruleId_key"
  ON "AutomationRun"("eventId", "ruleId")
  WHERE "eventId" IS NOT NULL;

-- Performance: find PENDING runs due for execution
CREATE INDEX IF NOT EXISTS "AutomationRun_status_scheduledAt_idx"
  ON "AutomationRun"("status", "scheduledAt");
