---
phase: quick-347
plan: "01"
description: "Field-level AES-256-GCM encryption for restricted PII columns (PR A dual-write window)"
mode: quick
directory: .planning/quick/347-field-level-aes-256-gcm-encryption-for-r
---

# Quick-347 Plan: PII Encryption PR A — Enhance Crypto Primitives + DriverInvitation Dual-Write

## Reasoning Step Output

**Schema survey results (2026-05-16):**

- **No standalone `Driver` model exists.** Drivers are `User` with `role=DRIVER` plus the newer `CarrierDriver` model.
- **`CarrierDriver`** (table: `carrier_drivers`, snake_case): Has `cdlNumber` which **already has full encryption shape** from quick-329 (`cdlNumberCiphertext/Iv/Tag/KeyId/Last4`). No SSN, passport, EIN, bankAccount, or dateOfBirth fields exist on this model.
- **`DriverInvitation`** (table: `"DriverInvitation"`, PascalCase): Has `licenseNumber String?` and `dateOfBirth DateTime?` as **plaintext PII with NO encryption shape yet**.
- **`User`** model: Has `licenseNumber String?` — a generic profile field, not driver-CDL PII in scope for this PR.
- **No `ssn`, `passport`, `ein`, `bankAccount`** columns exist in ANY model.

**What quick-329 already built:**
- `field-crypto.ts` — `encryptField(plaintext, keyId)` / `decryptField(input)` — MISSING: `last4()`, optional keyId
- `key-registry.ts` — `getCurrentKey()`, `getKeyById()` — MISSING: exported `getValidKeyIds()`, startup validation
- `audit-log.ts` — `writeAuditLog()` — COMPLETE
- `AuditLog` model + `audit_log` table — COMPLETE
- `carrier_drivers` encrypted columns + `fleet-drivers.ts` dual-write — COMPLETE
- `.env.example` KMS vars — COMPLETE

**Scope for quick-347:**
1. Enhance `field-crypto.ts` + `key-registry.ts` with missing primitives
2. Add encrypted shape columns to `"DriverInvitation"` for `licenseNumber` + `dateOfBirth`
3. Dual-write in `inviteDriver` action
4. New test file at `apps/web/__tests__/security/field-crypto.test.ts` (full spec coverage)
5. New backfill script at `apps/web/scripts/backfill-field-encryption.ts`

---

## Task 1: Enhance crypto primitives + full test suite

**Files:** `field-crypto.ts`, `key-registry.ts`, `apps/web/__tests__/security/field-crypto.test.ts`

### 1a. `field-crypto.ts` changes
- Add file-level TODO comment: "TODO: migrate keys to Supabase Vault or hosted secrets manager; env vars are a known interim solution."
- Make `keyId` optional in `encryptField`, defaulting to `getCurrentKeyId()`
- Export `last4(plaintext: string): string` — returns last 4 chars, '****' for inputs shorter than 4

### 1b. `key-registry.ts` changes
- Export `getValidKeyIds()` (currently private)
- Add `validateKeyConfig()` function that checks: CURRENT_KMS_KEY_ID set, is in valid list, KMS_KEY_<id> is 64-char hex
- Add startup validation guard at module bottom: only runs if `NODE_ENV !== 'test' && CURRENT_KMS_KEY_ID` is set

### 1c. Create `apps/web/__tests__/security/field-crypto.test.ts`
Required tests (all must pass without DB):
1. encrypt-decrypt round-trip returns original string exactly
2. ciphertext bytes do not contain plaintext as substring (binary + hex + utf-8 scan)
3. decryptField throws when given a wrong keyId
4. decryptField throws when given a corrupted auth tag
5. decryptField throws when given a corrupted ciphertext byte
6. last4 returns last 4 chars for '123-45-6789' → '6789'
7. last4 returns '****' for empty string
8. last4 returns '****' for 3-char input
9. Two encrypts of same plaintext produce different ciphertexts (IV randomness)
10. encryptField with no keyId argument uses CURRENT_KMS_KEY_ID

---

## Task 2: Migration + schema for DriverInvitation PII

**Files:** Supabase MCP migration, `apps/web/prisma/schema.prisma`

### 2a. Migration SQL (apply via Supabase MCP)
Add encrypted-shape columns to `"DriverInvitation"` for `licenseNumber` and `dateOfBirth`:
```sql
-- Encrypted shape for licenseNumber
ALTER TABLE "DriverInvitation"
  ADD COLUMN IF NOT EXISTS "licenseNumberCiphertext" BYTEA,
  ADD COLUMN IF NOT EXISTS "licenseNumberIv"         BYTEA,
  ADD COLUMN IF NOT EXISTS "licenseNumberTag"        BYTEA,
  ADD COLUMN IF NOT EXISTS "licenseNumberKeyId"      TEXT,
  ADD COLUMN IF NOT EXISTS "licenseNumberLast4"      VARCHAR(8);

-- Encrypted shape for dateOfBirth
ALTER TABLE "DriverInvitation"
  ADD COLUMN IF NOT EXISTS "dateOfBirthCiphertext"   BYTEA,
  ADD COLUMN IF NOT EXISTS "dateOfBirthIv"           BYTEA,
  ADD COLUMN IF NOT EXISTS "dateOfBirthTag"          BYTEA,
  ADD COLUMN IF NOT EXISTS "dateOfBirthKeyId"        TEXT,
  ADD COLUMN IF NOT EXISTS "dateOfBirthLast4"        VARCHAR(8);

COMMENT ON TABLE "DriverInvitation" IS
  'Plaintext columns licenseNumber and dateOfBirth kept during dual-write window; remove in PR B after verification.';
```

### 2b. Schema.prisma update
Add 10 new fields to `DriverInvitation` model (alongside existing plaintext fields).
Run `npx prisma generate` after.

---

## Task 3: Dual-write + backfill script + verification

**Files:** `apps/web/src/app/(owner)/actions/drivers.ts`, `apps/web/scripts/backfill-field-encryption.ts`

### 3a. Update `inviteDriver` action (dual-write)
In `apps/web/src/app/(owner)/actions/drivers.ts`, add dual-write for `licenseNumber` and `dateOfBirth`:
- Import `encryptField`, `last4`, `getCurrentKeyId` (or use `getCurrentKey`)
- Before `prisma.driverInvitation.create`, build encrypted shapes for non-null licenseNumber and dateOfBirth
- Spread them into the create data alongside plaintext
- Do NOT change reads — plaintext stays in responses

Also update `mobile invite route` at `apps/web/src/app/api/mobile/owner/drivers/invite/route.ts` if it writes licenseNumber directly.

### 3b. Backfill script `apps/web/scripts/backfill-field-encryption.ts`
- Batched 200 rows at a time
- Query: `WHERE "licenseNumber" IS NOT NULL AND "licenseNumberCiphertext" IS NULL`  
- Query: `WHERE "dateOfBirth" IS NOT NULL AND "dateOfBirthCiphertext" IS NULL`
- Bypass RLS via set_config('app.bypass_rls', 'on', TRUE)
- Idempotent: re-running picks up only un-encrypted rows
- Logs: encrypted=N, errors=M, skipped=K
- Uses `--env-file=.env.local` pattern

### 3c. Verification
- `npx tsc --noEmit` from apps/web
- `npm run build` from apps/web  
- `npx vitest run __tests__/security/` passes
- `npx prisma validate` passes
- Grep: `grep -r "invitation.licenseNumber\|invitation.dateOfBirth" apps/web/src --include="*.ts"` — confirm no console.* calls

---

## Commit Messages
- `feat(quick-347): Task 1 — last4, optional keyId, startup validation, full test suite`
- `feat(quick-347): Task 2 — encrypted shape columns for DriverInvitation licenseNumber + dateOfBirth`
- `feat(quick-347): Task 3 — dual-write in inviteDriver action, backfill script, verification`
