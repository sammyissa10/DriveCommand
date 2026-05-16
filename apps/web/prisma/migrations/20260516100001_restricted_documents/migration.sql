-- ============================================================================
-- Restricted Documents (quick-348)
-- Spec: docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.3 + 4.4
-- ============================================================================
-- TODO(security): Per-tenant BYOK / CMK is future work; this milestone uses
-- Supabase Storage default AES-256 encryption-at-rest on a dedicated
-- `/restricted/` prefix. Migrate to per-tenant customer-managed keys when
-- Supabase Storage adds BYOK support (currently bucket-wide AES-256 only).
-- ============================================================================

-- 1. Extend DocumentType enum with 8 new restricted PII values
-- NOTE: ALTER TYPE ADD VALUE cannot be used inside a transaction block that
-- also references the new values. These statements run non-transactionally.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SSN_CARD';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PASSPORT';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CDL_SCAN';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'MEDICAL_CARD';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'VOIDED_CHECK';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'W9';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'W4';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'I9';
