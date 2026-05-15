-- ============================================================================
-- PII Encryption PR1 (quick-329)
-- Spec: docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Section 4
-- ============================================================================
-- GREENFIELD-with-trivial-backfill: 22 rows in carrier_drivers, 1 has cdl_number.
-- cdl_number plaintext column is NOT dropped (dual-write window — PR2 only).
-- ============================================================================

-- 1. Add encrypted-shape columns to carrier_drivers (all nullable for dual-write window)
ALTER TABLE carrier_drivers
  ADD COLUMN IF NOT EXISTS cdl_number_ciphertext BYTEA,
  ADD COLUMN IF NOT EXISTS cdl_number_iv         BYTEA,
  ADD COLUMN IF NOT EXISTS cdl_number_tag        BYTEA,
  ADD COLUMN IF NOT EXISTS cdl_number_key_id     TEXT,
  ADD COLUMN IF NOT EXISTS cdl_number_last4      VARCHAR(4);

-- 2. Create audit_log table (append-only, tenant-scoped)
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  user_id       UUID        NOT NULL,
  action        TEXT        NOT NULL CHECK (action IN (
    'VIEW_PII','VIEW_PII_DENIED','DOWNLOAD_DOCUMENT',
    'UPDATE_RESTRICTED','DELETE_RESTRICTED','EXPORT','RATE_LIMIT_HIT'
  )),
  resource_type TEXT        NOT NULL,
  resource_id   UUID        NOT NULL,
  field_name    TEXT,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_log_tenant_fk FOREIGN KEY (tenant_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT,
  CONSTRAINT audit_log_user_fk   FOREIGN KEY (user_id)   REFERENCES "User"(id)
);

-- 3. Indexes on audit_log
CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx      ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_tenant_user_created_idx ON audit_log (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_tenant_resource_idx     ON audit_log (tenant_id, resource_type, resource_id);

-- 4. RLS — tenant-scoped, forced, append-only
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;
CREATE POLICY tenant_isolation_policy ON audit_log
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

DROP POLICY IF EXISTS bypass_rls_policy ON audit_log;
CREATE POLICY bypass_rls_policy ON audit_log
  USING (current_setting('app.bypass_rls', TRUE) = 'on');

-- 5. Grants — app_user can SELECT + INSERT; never UPDATE or DELETE (append-only)
GRANT SELECT, INSERT ON audit_log TO app_user;
REVOKE UPDATE, DELETE ON audit_log FROM app_user;
