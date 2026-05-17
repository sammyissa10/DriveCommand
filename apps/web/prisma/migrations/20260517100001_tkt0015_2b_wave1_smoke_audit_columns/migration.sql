-- TKT-0015 Prompt 2b — Wave 1 Smoke Test
-- Tag + ExpenseCategory audit FKs (nullable, ON DELETE SET NULL)

ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Tag_createdById_fkey' AND table_name = 'Tag'
  ) THEN
    ALTER TABLE "Tag" ADD CONSTRAINT "Tag_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Tag_updatedById_fkey' AND table_name = 'Tag'
  ) THEN
    ALTER TABLE "Tag" ADD CONSTRAINT "Tag_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ExpenseCategory_createdById_fkey' AND table_name = 'ExpenseCategory'
  ) THEN
    ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ExpenseCategory_updatedById_fkey' AND table_name = 'ExpenseCategory'
  ) THEN
    ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;
