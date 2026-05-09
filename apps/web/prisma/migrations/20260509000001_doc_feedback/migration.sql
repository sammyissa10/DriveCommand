-- ============================================================
-- Migration: 20260509000001_doc_feedback
--
-- Purpose: Add DocFeedback table for Help Center feedback collection
-- ============================================================

-- Create DocFeedback table
CREATE TABLE IF NOT EXISTS "DocFeedback" (
    "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"  UUID        NOT NULL,
    "userId"    UUID        NOT NULL,
    "docSlug"   TEXT        NOT NULL,
    "helpful"   BOOLEAN     NOT NULL,
    "comment"   TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "DocFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocFeedback_tenantId_idx" ON "DocFeedback"("tenantId");
CREATE INDEX IF NOT EXISTS "DocFeedback_docSlug_idx" ON "DocFeedback"("docSlug");

DO $$ BEGIN
  ALTER TABLE "DocFeedback" ADD CONSTRAINT "DocFeedback_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies (tenant-scoped)
ALTER TABLE "DocFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocFeedback" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "DocFeedback"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "DocFeedback"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
