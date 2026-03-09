-- Migration: extend_support_ticket_add_messages
-- Extends SupportTicket table with category and priority columns,
-- adds WAITING_ON_CUSTOMER status, and creates the TicketMessage table.

-- 1. Add WAITING_ON_CUSTOMER to SupportTicketStatus enum
DO $$ BEGIN
  ALTER TYPE "SupportTicketStatus" ADD VALUE 'WAITING_ON_CUSTOMER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create SupportTicketCategory enum
DO $$ BEGIN
  CREATE TYPE "SupportTicketCategory" AS ENUM ('BILLING', 'BUG', 'FEATURE', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create SupportTicketPriority enum
DO $$ BEGIN
  CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Create TicketMessageSenderType enum
DO $$ BEGIN
  CREATE TYPE "TicketMessageSenderType" AS ENUM ('OWNER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Add category column to SupportTicket (nullable first, then backfill)
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "category" "SupportTicketCategory";
UPDATE "SupportTicket" SET "category" = 'GENERAL' WHERE "category" IS NULL;

-- 6. Add priority column to SupportTicket
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "priority" "SupportTicketPriority" DEFAULT 'NORMAL';
UPDATE "SupportTicket" SET "priority" = 'NORMAL' WHERE "priority" IS NULL;

-- 7. Drop the type column (replaced by category)
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "type";

-- 8. Create TicketMessage table (no RLS — admin needs cross-tenant visibility)
CREATE TABLE IF NOT EXISTS "TicketMessage" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticketId"    UUID NOT NULL,
  "senderType"  "TicketMessageSenderType" NOT NULL,
  "senderLabel" TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE
);

-- 9. Create indexes on TicketMessage
CREATE INDEX IF NOT EXISTS "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketMessage_createdAt_idx" ON "TicketMessage"("createdAt");
