-- Add missing audit/lifecycle columns to Load table

ALTER TABLE "Load"
  ADD COLUMN IF NOT EXISTS "createdById" UUID,
  ADD COLUMN IF NOT EXISTS "updatedById" UUID,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ;

-- FK: createdById -> User
DO $$ BEGIN
  ALTER TABLE "Load" ADD CONSTRAINT "Load_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: updatedById -> User
DO $$ BEGIN
  ALTER TABLE "Load" ADD CONSTRAINT "Load_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for archivedAt (used in soft-delete queries)
CREATE INDEX IF NOT EXISTS "Load_archivedAt_idx" ON "Load"("archivedAt");
