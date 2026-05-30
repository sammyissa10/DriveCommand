-- Migration: Quick-416 — Add missing Trip soft-delete columns to public.dispatches
-- Reason: schema.prisma (model Trip, lines 2214-2215) declares deletedAt + deletedById,
--         but the live DB is missing both columns, causing Prisma P2022 in
--         /api/v1/carrier/dispatches. Quick-415 diagnostic confirmed the drift.
-- Scope:  TWO columns on ONE table (public.dispatches). No other table touched.
-- Types:  deleted_at  = TIMESTAMPTZ(6) NULL   — matches existing pattern in
--                                              20260515000001_db_security_standardization
--                                              (e.g. loads.deleted_at, clients.deleted_at)
--         deleted_by_id = UUID NULL           — matches schema.prisma `String? @db.Uuid`
-- Index:  idx_dispatches_org_id_deleted_at ALREADY EXISTS (created by 20260515000001 line 191).
--         No new index is created here.
-- Nullable: Both columns are NULL — 267+ existing dispatch rows must back-fill cleanly.

BEGIN;

-- 1. Add columns (idempotent — safe to re-run)
ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6) NULL;

ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID NULL;

-- 2. Self-validation block — abort the transaction if the columns are not present after the ALTERs.
DO $$
DECLARE
  has_deleted_at  BOOLEAN;
  has_deleted_by  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'dispatches'
      AND column_name  = 'deleted_at'
  ) INTO has_deleted_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'dispatches'
      AND column_name  = 'deleted_by_id'
  ) INTO has_deleted_by;

  IF NOT has_deleted_at THEN
    RAISE EXCEPTION 'Quick-416: public.dispatches.deleted_at is still missing after ALTER — aborting';
  END IF;

  IF NOT has_deleted_by THEN
    RAISE EXCEPTION 'Quick-416: public.dispatches.deleted_by_id is still missing after ALTER — aborting';
  END IF;
END $$;

COMMIT;
