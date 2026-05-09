-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "carrier_document_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_document_types_pkey" PRIMARY KEY ("id")
);

-- AlterTable (idempotent — add columns only if missing)
ALTER TABLE "carrier_documents"
  ADD COLUMN IF NOT EXISTS "document_type_id" UUID,
  ADD COLUMN IF NOT EXISTS "load_id" UUID,
  ADD COLUMN IF NOT EXISTS "dispatch_id" UUID,
  ADD COLUMN IF NOT EXISTS "contract_id" UUID;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "carrier_document_types_org_id_slug_key" ON "carrier_document_types"("org_id", "slug");

CREATE INDEX IF NOT EXISTS "carrier_document_types_org_id_idx" ON "carrier_document_types"("org_id");

CREATE INDEX IF NOT EXISTS "carrier_documents_document_type_id_idx" ON "carrier_documents"("document_type_id");

CREATE INDEX IF NOT EXISTS "carrier_documents_load_id_idx" ON "carrier_documents"("load_id");

CREATE INDEX IF NOT EXISTS "carrier_documents_dispatch_id_idx" ON "carrier_documents"("dispatch_id");

CREATE INDEX IF NOT EXISTS "carrier_documents_contract_id_idx" ON "carrier_documents"("contract_id");

-- AddForeignKey (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carrier_document_types_org_id_fkey'
  ) THEN
    ALTER TABLE "carrier_document_types" ADD CONSTRAINT "carrier_document_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carrier_documents_document_type_id_fkey'
  ) THEN
    ALTER TABLE "carrier_documents" ADD CONSTRAINT "carrier_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "carrier_document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carrier_documents_load_id_fkey'
  ) THEN
    ALTER TABLE "carrier_documents" ADD CONSTRAINT "carrier_documents_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carrier_documents_dispatch_id_fkey'
  ) THEN
    ALTER TABLE "carrier_documents" ADD CONSTRAINT "carrier_documents_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carrier_documents_contract_id_fkey'
  ) THEN
    ALTER TABLE "carrier_documents" ADD CONSTRAINT "carrier_documents_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
