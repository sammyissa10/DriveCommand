-- ============================================================================
-- Restricted Documents column + index + audit_log constraint (quick-348)
-- Applied after 20260516100001_restricted_documents (enum ADD VALUE committed)
-- ============================================================================

-- 2. Add is_restricted column to Document table (idempotent)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Backfill is_restricted for any existing rows with restricted documentType
-- (will be 0 rows on first deploy, but safe and idempotent)
UPDATE "Document" SET is_restricted = TRUE
WHERE "documentType"::text IN ('SSN_CARD','PASSPORT','CDL_SCAN','MEDICAL_CARD','VOIDED_CHECK','W9','W4','I9')
  AND is_restricted = FALSE;

-- 4. Partial index on (tenantId, is_restricted) — only restricted rows indexed
-- Document model has no deletedAt column, so use simpler partial index
-- (satisfies spec intent: fast lookup of restricted docs per tenant at lower storage cost)
CREATE INDEX IF NOT EXISTS document_tenant_restricted_idx
  ON "Document" ("tenantId", is_restricted)
  WHERE is_restricted = TRUE;

-- 5. Extend audit_log.action CHECK constraint to include DOWNLOAD_DOCUMENT_DENIED
-- (existing constraint from quick-347 omitted this value)
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
  'VIEW_PII','VIEW_PII_DENIED','DOWNLOAD_DOCUMENT','DOWNLOAD_DOCUMENT_DENIED',
  'UPDATE_RESTRICTED','DELETE_RESTRICTED','EXPORT','RATE_LIMIT_HIT'
));
