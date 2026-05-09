-- Migration: Phase 46 — Playbook Step Overdue Fields
-- 1. Add DAILY_DIGEST to NotifType enum
-- 2. Create OverdueRecipient enum (DRIVER / OWNER / BOTH)
-- 3. Add dueWithinHours and overdueRecipient columns to PlaybookStep

-- 1. Add DAILY_DIGEST to NotifType enum
ALTER TYPE "NotifType" ADD VALUE IF NOT EXISTS 'DAILY_DIGEST';

-- 2. Create OverdueRecipient enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OverdueRecipient') THEN
    CREATE TYPE "OverdueRecipient" AS ENUM ('DRIVER', 'OWNER', 'BOTH');
  END IF;
END$$;

-- 3. Add dueWithinHours (nullable int, SLA in hours) to PlaybookStep
ALTER TABLE "PlaybookStep"
  ADD COLUMN IF NOT EXISTS "dueWithinHours" INTEGER;

-- 4. Add overdueRecipient (default OWNER) to PlaybookStep
ALTER TABLE "PlaybookStep"
  ADD COLUMN IF NOT EXISTS "overdueRecipient" "OverdueRecipient" NOT NULL DEFAULT 'OWNER';
