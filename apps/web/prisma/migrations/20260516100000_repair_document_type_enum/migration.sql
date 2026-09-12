-- REPAIR MIGRATION (quick-593, repair 4)
--
-- Missing object: enum type "DocumentType"
--
-- Why it was missing: no migration in this repository creates it. Only two
-- reference it, and both assume it already exists:
--   20260422100001_drop_carrier_documents_type_check
--   20260516100001_restricted_documents  (ALTER TYPE ... ADD VALUE, x8)
-- It was created in production out of band, so 20260516100001 succeeds there
-- and fails on any database rebuilt from this repository with
--   type "DocumentType" does not exist
--
-- How production's definition was established: read from production
-- (project oqdhberkghtnszrkdvfm), read-only, on 2026-09-12.
--
--   pg_type / pg_enum, all 12 labels in enumsortorder:
--     DRIVER_LICENSE, DRIVER_APPLICATION, GENERAL, RATE_CONFIRMATION,
--     SSN_CARD, PASSPORT, CDL_SCAN, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9
--
-- This repair creates the FIRST FOUR only. That is not a guess: the remaining
-- eight are exactly the values 20260516100001 adds, in the order it adds them,
-- one migration after this one. Creating all twelve here would make that
-- migration's eight ADD VALUE statements silently redundant and would misplace
-- the origin of those labels. Creating the four leaves the chain reproducing
-- production's twelve exactly.
--
--   Sanity check on the split: production's labels 5..12 are SSN_CARD,
--   PASSPORT, CDL_SCAN, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9, and
--   20260516100001 lines 14-21 add SSN_CARD, PASSPORT, CDL_SCAN, MEDICAL_CARD,
--   VOIDED_CHECK, W9, W4, I9. Identical sets, identical order.
--
-- The column that uses this type, "Document"."documentType", is NOT created
-- here: 20260516100002_restricted_documents_column adds it. Only the type is
-- missing.
--
-- No-op against production: the type already exists there, so the guard finds
-- it in pg_type and does nothing. CREATE TYPE has no IF NOT EXISTS in
-- PostgreSQL, hence the DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'DocumentType' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "DocumentType" AS ENUM (
      'DRIVER_LICENSE',
      'DRIVER_APPLICATION',
      'GENERAL',
      'RATE_CONFIRMATION'
    );
  END IF;
END$$;
