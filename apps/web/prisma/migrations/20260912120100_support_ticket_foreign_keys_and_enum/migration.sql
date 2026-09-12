-- ============================================================
-- Migration: 20260912120100_support_ticket_foreign_keys_and_enum
--
-- Purpose: Repair a production database that recorded
--          20260303000001_add_support_ticket as APPLIED but never received
--          its enum type or its foreign keys.
--
-- Evidence (docs/audits/ledger-integrity.md sections 2.2 and 5.3):
--   production oqdhberkghtnszrkdvfm holds
--     SupportTicketType              ABSENT
--     SupportTicket_tenantId_fkey    ABSENT
--     SupportTicket_submittedBy_fkey ABSENT
--     TicketMessage_ticketId_fkey    ABSENT  (from 20260309000001)
--   with 87 SupportTicket rows and 4 TicketMessage rows held together by
--   nothing. Staging, which replayed the whole chain from zero, has all
--   four -- so this file is a no-op there and a real repair on production.
--
-- ------------------------------------------------------------
-- OMISSION NOTICE -- READ BEFORE REVIEWING
-- ------------------------------------------------------------
-- SupportTicket_submittedBy_fkey is DELIBERATELY NOT CREATED by this
-- migration, even though 20260303000001 declares it.
--
-- Production holds 7 SupportTicket rows whose "submittedBy" points at a
-- User id that does not exist -- f445daf9-c637-4d6d-b8cf-a0d507225145 --
-- tickets TKT-0001, TKT-0036, TKT-0037, TKT-0038, TKT-0044, TKT-0061 and
-- TKT-0067, spanning 2026-03-28 to 2026-07-17, all with "tenantId" NULL.
--
-- The column is NOT NULL, so ON DELETE SET NULL is not an escape, and
-- NOT VALID is not the answer either: a constraint nothing ever validates
-- is a comment that looks like a control. Including the FK here would make
-- the WHOLE migration abort on production and the two safe foreign keys
-- would never land -- the repair would fail closed on the 87 tickets it
-- can actually protect.
--
-- Adding it is a separate HUMAN DATA DECISION: identify or recreate the
-- missing user, reassign those 7 tickets, or make the column nullable.
-- The closing RAISE WARNING below recomputes the live orphan count at
-- apply time and reports it.
-- ------------------------------------------------------------
--
-- Behaviour change worth naming: ON DELETE RESTRICT on "tenantId" means
-- deleting a Tenant that still has support tickets will now fail. That is
-- the intended semantics of the original migration, restored.
--
-- schema.prisma models neither of these foreign keys as a Prisma relation
-- and never did, so no relation fields are added here -- that would be a
-- schema change with code consequences and is out of scope.
--
-- Idempotency: the enum uses the same DO/EXCEPTION guard as the original;
--   the two foreign keys are guarded on pg_constraint rather than on
--   EXCEPTION WHEN duplicate_object, so a DIFFERENT failure is not
--   swallowed as "already there".
--
-- NOTE: Do NOT wrap in BEGIN/COMMIT -- migrate.mjs wraps each
--       migration in its own transaction.
-- ============================================================


-- ============================================================
-- Section 1: SupportTicketType enum
--
-- Copied verbatim from 20260303000001_add_support_ticket, guard included.
-- Honest position: NO live column references this type today --
-- 20260309000001 dropped SupportTicket."type" and the live model uses
-- "category" "SupportTicketCategory". It is created here solely so that a
-- production database matches what a from-zero replay of the chain
-- produces; the chain must describe the shape, whether or not anything
-- currently reads it.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "SupportTicketType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'QUESTION', 'ACCOUNT_ISSUE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- Section 2: SupportTicket_tenantId_fkey
-- ============================================================

DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "SupportTicket" s
  WHERE s."tenantId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = s."tenantId");

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'ABORTING: % SupportTicket row(s) reference a "tenantId" with no matching Tenant. SupportTicket_tenantId_fkey cannot be created until those rows are resolved. Locate them with: SELECT s."ticketNumber", s."tenantId" FROM "SupportTicket" s WHERE s."tenantId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = s."tenantId");',
      orphan_count;
  END IF;

  RAISE NOTICE 'SupportTicket.tenantId orphan check passed (0 rows).';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SupportTicket_tenantId_fkey'
      AND conrelid = '"SupportTicket"'::regclass
  ) THEN
    ALTER TABLE "SupportTicket"
      ADD CONSTRAINT "SupportTicket_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
    RAISE NOTICE 'Created SupportTicket_tenantId_fkey.';
  ELSE
    RAISE NOTICE 'SupportTicket_tenantId_fkey already present -- skipping.';
  END IF;
END $$;


-- ============================================================
-- Section 3: TicketMessage_ticketId_fkey
--
-- Clause taken verbatim from
-- 20260309000001_extend_support_ticket_add_messages, where it was declared
-- inline in CREATE TABLE and therefore never reached a database whose
-- TicketMessage table already existed.
-- ============================================================

DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "TicketMessage" m
  WHERE NOT EXISTS (SELECT 1 FROM "SupportTicket" t WHERE t."id" = m."ticketId");

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'ABORTING: % TicketMessage row(s) reference a "ticketId" with no matching SupportTicket. TicketMessage_ticketId_fkey cannot be created until those rows are resolved. Locate them with: SELECT m."id", m."ticketId" FROM "TicketMessage" m WHERE NOT EXISTS (SELECT 1 FROM "SupportTicket" t WHERE t."id" = m."ticketId");',
      orphan_count;
  END IF;

  RAISE NOTICE 'TicketMessage.ticketId orphan check passed (0 rows).';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TicketMessage_ticketId_fkey'
      AND conrelid = '"TicketMessage"'::regclass
  ) THEN
    ALTER TABLE "TicketMessage"
      ADD CONSTRAINT "TicketMessage_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id")
      ON DELETE CASCADE;
    RAISE NOTICE 'Created TicketMessage_ticketId_fkey.';
  ELSE
    RAISE NOTICE 'TicketMessage_ticketId_fkey already present -- skipping.';
  END IF;
END $$;


-- ============================================================
-- Section 4: Report the omitted foreign key with a LIVE orphan count
-- ============================================================

DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "SupportTicket" s
  WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."submittedBy");

  RAISE WARNING 'SupportTicket_submittedBy_fkey was NOT created by this migration. Live orphan count on this database: % SupportTicket row(s) whose "submittedBy" has no matching User. On production these are 7 rows referencing the missing user f445daf9-c637-4d6d-b8cf-a0d507225145 (TKT-0001/0036/0037/0038/0044/0061/0067, all "tenantId" NULL). The column is NOT NULL so ON DELETE SET NULL is unavailable, and NOT VALID would be a constraint nothing validates. A human must decide: recreate the missing user, reassign those tickets, or make the column nullable. If this count reads 0, a follow-up migration may add SupportTicket_submittedBy_fkey with FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE.',
    orphan_count;
END $$;
