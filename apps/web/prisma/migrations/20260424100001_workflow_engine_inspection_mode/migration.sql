-- Migration: Phase 44 — Inspection Mode schema changes
-- 1. Add VEHICLE_INSPECTION to PlaybookCategory enum
-- 2. Make StepInstance.stepTemplateId nullable (for ad-hoc APPROVAL steps)

-- 1. Add enum value (PostgreSQL enum ALTER)
ALTER TYPE "PlaybookCategory" ADD VALUE IF NOT EXISTS 'VEHICLE_INSPECTION';

-- 2. Make stepTemplateId nullable
ALTER TABLE "StepInstance" ALTER COLUMN "stepTemplateId" DROP NOT NULL;
