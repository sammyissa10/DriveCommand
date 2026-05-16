-- ============================================================================
-- DriverInvitation PII Encryption (quick-347)
-- Spec: docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Section 4
-- Adds encrypted-shape columns alongside plaintext (dual-write window PR A).
-- Plaintext columns NOT dropped — see PR B runbook docs/runbooks/pii-encryption-pr2.md
-- ============================================================================

-- 1. Encrypted shape for licenseNumber
ALTER TABLE "DriverInvitation"
  ADD COLUMN IF NOT EXISTS "licenseNumberCiphertext" BYTEA,
  ADD COLUMN IF NOT EXISTS "licenseNumberIv"         BYTEA,
  ADD COLUMN IF NOT EXISTS "licenseNumberTag"        BYTEA,
  ADD COLUMN IF NOT EXISTS "licenseNumberKeyId"      TEXT,
  ADD COLUMN IF NOT EXISTS "licenseNumberLast4"      VARCHAR(8);

-- 2. Encrypted shape for dateOfBirth
ALTER TABLE "DriverInvitation"
  ADD COLUMN IF NOT EXISTS "dateOfBirthCiphertext"   BYTEA,
  ADD COLUMN IF NOT EXISTS "dateOfBirthIv"           BYTEA,
  ADD COLUMN IF NOT EXISTS "dateOfBirthTag"          BYTEA,
  ADD COLUMN IF NOT EXISTS "dateOfBirthKeyId"        TEXT,
  ADD COLUMN IF NOT EXISTS "dateOfBirthLast4"        VARCHAR(8);

COMMENT ON TABLE "DriverInvitation" IS
  'Plaintext columns licenseNumber and dateOfBirth kept during dual-write window; remove in PR B after verification.';
