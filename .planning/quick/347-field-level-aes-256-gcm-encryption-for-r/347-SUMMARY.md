---
phase: quick-347
plan: "01"
subsystem: security/pii-encryption
tags: [security, encryption, pii, aes-256-gcm, driver-invitation, dual-write]
dependency_graph:
  requires: [quick-329]
  provides: [driver-invitation-pii-encryption-pr-a]
  affects: [inviteDriver-action, mobile-invite-route, field-crypto, key-registry]
tech_stack:
  added: []
  patterns: [dual-write-encrypted-shape, last4-display-token, startup-validation-guard]
key_files:
  created:
    - apps/web/prisma/migrations/20260516000001_driver_invitation_pii_encryption/migration.sql
    - apps/web/scripts/backfill/backfill-driver-invitation-pii.ts
  modified:
    - apps/web/src/lib/security/field-crypto.ts
    - apps/web/src/lib/security/key-registry.ts
    - apps/web/tests/security/field-crypto.test.ts
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/api/mobile/owner/drivers/invite/route.ts
    - apps/web/package.json
decisions:
  - last4() operates on raw string (last 4 chars); callers pass year string for dateOfBirth
  - Startup validation guard only fires when CURRENT_KMS_KEY_ID is set (no crash in bare dev envs)
  - Mobile invite route encrypts licenseNumber only (dateOfBirth not in mobile invite payload)
  - Backfill stores dateOfBirth as ISO date string YYYY-MM-DD (consistent with future decryption)
metrics:
  duration: 30m
  completed: "2026-05-16"
  tasks: 3
  files: 7
---

# Quick-347 Summary: PII Encryption PR A — DriverInvitation Dual-Write

AES-256-GCM encrypted shape columns added to `DriverInvitation` for `licenseNumber` + `dateOfBirth`, with dual-write in both the web server action and mobile invite API route, plus a batched idempotent backfill script.

---

## Reasoning Step Output

**Schema survey results (2026-05-16):**

- No standalone `Driver` model. Driver PII lives in `DriverInvitation`.
- `CarrierDriver.cdlNumber` already encrypted by quick-329.
- `DriverInvitation` has `licenseNumber String?` and `dateOfBirth DateTime? @db.Date` — plaintext, no encryption shape.
- No SSN, passport, EIN, bankAccount fields in any model.
- `User.licenseNumber` is a generic profile field, not in scope.

**Scope for quick-347:**
1. Enhance `field-crypto.ts` (optional keyId, `last4()`)
2. Enhance `key-registry.ts` (export `getValidKeyIds()`, add `validateKeyConfig()`, startup guard)
3. 10 encrypted columns added to `"DriverInvitation"` table
4. Dual-write in `inviteDriver` action + mobile invite route
5. Batched backfill script

---

## Files Created / Modified

**Created:**
- `apps/web/prisma/migrations/20260516000001_driver_invitation_pii_encryption/migration.sql`
- `apps/web/scripts/backfill/backfill-driver-invitation-pii.ts`

**Modified:**
- `apps/web/src/lib/security/field-crypto.ts` — optional keyId, `last4()`, TODO comment
- `apps/web/src/lib/security/key-registry.ts` — export `getValidKeyIds()`, `validateKeyConfig()`, startup guard
- `apps/web/tests/security/field-crypto.test.ts` — extended from 5 to 13 tests
- `apps/web/prisma/schema.prisma` — 10 new fields on `DriverInvitation`
- `apps/web/src/app/(owner)/actions/drivers.ts` — dual-write licenseNumber + dateOfBirth
- `apps/web/src/app/api/mobile/owner/drivers/invite/route.ts` — dual-write licenseNumber
- `apps/web/package.json` — `backfill:driver-invitation-pii` script

---

## Migration SQL (full text)

```sql
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
```

Applied to Supabase: 20 rows before, 20 rows after — no data loss.

---

## Backfill Dry-Run Output

```
[backfill-driver-invitation-pii] Using KMS key: v1
[backfill-driver-invitation-pii] Rows needing encryption: 20
[backfill-driver-invitation-pii] Batch done: encrypted=N, verified=N, errors=0
[backfill-driver-invitation-pii] Complete. total_encrypted=N, total_verified=N, total_errors=0
```

NOTE: Dry-run not executed — KMS_KEY_v1 must be set in .env.local before running.
The `--env-file=.env.local` flag in the npm script ensures correct env loading.

---

## Test Output (full)

```
RUN  v4.0.18

 ✓ tests/security/field-crypto.test.ts (13 tests) 7ms

 Test Files  1 passed (1)
       Tests  13 passed (13)
    Start at  12:39:05
    Duration  479ms (transform 55ms, setup 0ms, import 72ms, tests 7ms, environment 0ms)
```

**Tests in `tests/security/field-crypto.test.ts`:**

`encryptField / decryptField` group (8 tests):
1. round-trip preserves "D1234567"
2. round-trip preserves "123-45-6789"
3. ciphertext does not contain plaintext in any encoding
4. tamper detection: flipping a ciphertext byte causes decryptField to throw
5. unknown keyId: getKeyById throws; decryptField with unknown keyId throws
6. corrupted auth tag: flipping a tag byte causes decryptField to throw
7. two encrypts of same plaintext produce different ciphertexts (IV randomness)
8. encryptField with no keyId argument uses CURRENT_KMS_KEY_ID

`last4` group (5 tests):
1. returns last 4 chars of "123-45-6789" → "6789"
2. returns "****" for empty string
3. returns "****" for 3-char input
4. returns last 4 chars for exactly 4-char input ("1990" → "1990")
5. returns last 4 chars for license number "D1234567" → "4567"

---

## Grep Result for Plaintext PII Logging

```
grep -rn "invitation\.licenseNumber|invitation\.dateOfBirth|driverInvitation\.licenseNumber|driverInvitation\.dateOfBirth" apps/web/src --include="*.ts" --include="*.tsx"
```

Result:
```
apps/web/src/app/api/auth/accept-invitation/route.ts:222:          licenseNumber: userRole === 'DRIVER' ? invitation.licenseNumber : null,
```

This is a read-path assignment (populating User.licenseNumber from invitation data during accept flow), not a console log. Confirmed: no `console.*` calls contain these PII values.

---

## Commit Messages Used

1. `feat(quick-347): Task 1 — last4, optional keyId, startup validation, full test suite` (a0759bd)
2. `feat(quick-347): Task 2 — encrypted shape columns for DriverInvitation licenseNumber + dateOfBirth` (5ceb605)
3. `feat(quick-347): Task 3 — dual-write in inviteDriver + mobile invite + backfill script` (9488f75)

---

## Deviations from Plan

**1. [Rule 3 - Blocking] Test file location adjusted to match vitest config**
- Found during: Task 1
- Issue: Plan specified `apps/web/__tests__/security/field-crypto.test.ts` but vitest.config.ts only picks up `tests/**/*.test.ts` and `src/__tests__/**/*.test.ts`. A file at `__tests__/` at root would not be run.
- Fix: Extended the existing `tests/security/field-crypto.test.ts` with the 8 additional test cases instead of creating a separate file.
- Files modified: `apps/web/tests/security/field-crypto.test.ts`

**2. [Rule 1 - Bug] Removed redundant `dobDate` vs `dateOfBirth` split in drivers.ts**
- Found during: Task 3
- Issue: Draft had both `dobDate = new Date(dateOfBirth)` and the original `dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null` pattern; unified to use `dobDate` consistently.

---

## IMPORTANT: Required Action Before Running Backfill

Sir must set these env vars in `apps/web/.env.local` before running the backfill script:

```
KMS_KEY_v1=<64-hex-char-random-key>
CURRENT_KMS_KEY_ID=v1
VALID_KMS_KEY_IDS=v1
```

Then run:
```bash
cd apps/web
npm run backfill:driver-invitation-pii
```

## Self-Check: PASSED

Files created/modified all exist. All commits verified in git log.
