-- ============================================================
-- Migration: 20260303000001_add_support_ticket
--
-- Purpose: Add SupportTicket table with type and status enums.
--          This table intentionally has NO RLS — system admins
--          need cross-tenant access. Tenant-scoped queries use
--          WHERE clauses in server actions instead.
--
-- NOTE: Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each
--       migration in its own transaction.
-- NOTE: All statements are idempotent (IF NOT EXISTS / DO-EXCEPTION)
-- ============================================================


-- ============================================================
-- Section 1: Create enums (idempotent via DO/EXCEPTION blocks)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "SupportTicketType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'QUESTION', 'ACCOUNT_ISSUE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 2: Create SupportTicket table
-- ============================================================

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "ticketNumber" TEXT        NOT NULL,
  "tenantId"     UUID        NOT NULL,
  "submittedBy"  UUID        NOT NULL,
  "fromPage"     TEXT        NOT NULL,
  "type"         "SupportTicketType"  NOT NULL,
  "title"        TEXT        NOT NULL,
  "description"  TEXT        NOT NULL,
  "status"       "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "resolution"   TEXT,
  "resolvedAt"   TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);


-- ============================================================
-- Section 3: Unique index on ticketNumber (idempotent)
-- ============================================================

DO $$ BEGIN
  CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ============================================================
-- Section 4: Regular indexes (idempotent)
-- ============================================================

DO $$ BEGIN
  CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "SupportTicket_submittedBy_idx" ON "SupportTicket"("submittedBy");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ============================================================
-- Section 5: FK constraints to Tenant and User (idempotent)
-- ============================================================

DO $$ BEGIN
  ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_submittedBy_fkey"
    FOREIGN KEY ("submittedBy") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
