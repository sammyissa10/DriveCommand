-- REPAIR MIGRATION (quick-593, repair 1 of N)
--
-- Missing object: "Document"."driverId"
--
-- Why it was missing: "Document" is created by 20260214000004_add_document_model
-- without a driverId column, and no migration in this repository ever adds it.
-- schema.prisma nonetheless declares `driverId String? @db.Uuid` with a `driver`
-- relation to User, and production has the column. It was added to production
-- out of band and no migration file was written, so 20260331000000_add_composite_indexes
-- (which indexes it) succeeds on production and fails on any rebuild.
--
-- How production's definition was established: read from production
-- (project oqdhberkghtnszrkdvfm), read-only, on 2026-09-12.
--
--   information_schema.columns:
--     column_name='driverId', data_type='uuid', udt_name='uuid',
--     is_nullable='YES', column_default=NULL,
--     character_maximum_length=NULL, is_identity='NO', is_generated='NEVER'
--
--   pg_get_constraintdef:
--     Document_driverId_fkey
--       FOREIGN KEY ("driverId") REFERENCES "User"(id)
--         ON UPDATE CASCADE ON DELETE SET NULL
--
-- No-op against production: the column already exists there, so ADD COLUMN
-- IF NOT EXISTS does nothing; the constraint already exists there, so the
-- guarded ADD CONSTRAINT does nothing. ADD CONSTRAINT has no IF NOT EXISTS in
-- PostgreSQL, hence the DO block.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "driverId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Document_driverId_fkey'
      AND conrelid = '"Document"'::regclass
  ) THEN
    ALTER TABLE "Document"
      ADD CONSTRAINT "Document_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "User"(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;
