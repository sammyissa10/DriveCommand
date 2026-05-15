---
phase: quick-329
plan: "01"
subsystem: security/pii-encryption
tags: [security, encryption, pii, audit-log, aes-256-gcm, carrier-drivers, rls]
dependency_graph:
  requires: [quick-328]
  provides: [field-level-encryption-primitives, audit_log-table, carrier-driver-cdl-encryption]
  affects: [carrier_drivers-table, audit_log-table, fleet-drivers-repo]
tech_stack:
  added: [node:crypto AES-256-GCM, AuditLog Prisma model, KMS key registry]
  patterns: [dual-write-window, redacted-by-default-reads, RBAC-gated-decrypt, bypass_rls-audit-inserts]
key_files:
  created:
    - apps/web/src/lib/security/field-crypto.ts
    - apps/web/src/lib/security/key-registry.ts
    - apps/web/src/lib/security/audit-log.ts
    - apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql
    - apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts
    - apps/web/tests/security/field-crypto.test.ts
    - apps/web/tests/security/audit-log-isolation.test.ts
    - apps/web/tests/security/carrier-driver-pii.test.ts
    - docs/runbooks/encryption-keys.md
    - docs/runbooks/pii-encryption.md
    - docs/runbooks/pii-encryption-pr2.md
  modified:
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/prisma/schema.prisma
    - apps/web/.env.example
    - apps/web/package.json
    - docs/runbooks/db-standardization-migration.md
decisions:
  - "Dual-write window chosen: plaintext column retained until PR2 (min 7-day production verification)"
  - "audit_log inserts use bypass_rls transaction to guarantee writes regardless of caller context"
  - "Prisma Bytes fields cast to Buffer for decryptField (Uint8Array vs Buffer TS type mismatch)"
  - "VALID_KMS_KEY_IDS gate prevents decryption with any key not explicitly allowlisted"
  - "Not-found treated as VIEW_PII_DENIED (existence oracle prevention)"
metrics:
  duration: ~45min
  completed: "2026-05-15"
  tasks: 3
  files: 15
---

# Phase quick-329 Plan 01: Field-Level AES-256-GCM PII Encryption (PR1) Summary

**One-liner:** AES-256-GCM field encryption for carrier_drivers.cdl_number with dual-write window, append-only audit_log table, and RBAC-gated decrypt path.

## What Was Built

### Crypto primitives

- `field-crypto.ts` — `encryptField(plaintext, keyId)` / `decryptField(input)` using `node:crypto` AES-256-GCM, 12-byte random IV per call, 16-byte auth tag. Throws on any decrypt failure. Never logs sensitive values.
- `key-registry.ts` — `getCurrentKey()` / `getKeyById(keyId)` backed by `CURRENT_KMS_KEY_ID`, `VALID_KMS_KEY_IDS`, and `KMS_KEY_<id>` env vars. VALID_KMS_KEY_IDS gates prevent decryption with unregistered keys.
- `audit-log.ts` — `writeAuditLog(params)` insert via `prisma.auditLog.create` inside a bypass_rls transaction. On failure: logs non-PII error and rethrows.

### Database migration: `20260515_pii_encryption_pr1`

Schema deltas:
- `carrier_drivers`: 5 new nullable columns — `cdl_number_ciphertext BYTEA`, `cdl_number_iv BYTEA`, `cdl_number_tag BYTEA`, `cdl_number_key_id TEXT`, `cdl_number_last4 VARCHAR(4)`
- `audit_log`: new table with UUID PK, `tenant_id`, `user_id`, `action` (CHECK constraint on 7 valid values), `resource_type`, `resource_id`, `field_name`, `ip_address INET`, `user_agent`, `created_at TIMESTAMPTZ(6)`
  - 3 indexes: `(tenant_id, created_at DESC)`, `(tenant_id, user_id, created_at DESC)`, `(tenant_id, resource_type, resource_id)`
  - ENABLE + FORCE ROW LEVEL SECURITY
  - `tenant_isolation_policy` + `bypass_rls_policy`
  - `GRANT SELECT, INSERT` / `REVOKE UPDATE, DELETE` from `app_user` (append-only)

New Prisma model: `AuditLog` with reverse relations on `Tenant` and `User`.

### Backfill

`scripts/backfill/encrypt-carrier-driver-cdl.ts` ran post-migration:
- Found 1 row with `cdl_number IS NOT NULL AND cdl_number_ciphertext IS NULL`
- Encrypted inside a single `$transaction` with bypass_rls
- Read back and verified `decryptField(ciphertext) === original plaintext`
- Result: "backfilled 1 row, verified 1 decrypt-equals match"
- npm script: `npm run backfill:carrier-driver-cdl`

The backfilled row: present in the production database (id + tenant not logged here per constraint).

### Repository dual-write + redacted reads

`fleet-drivers.ts` changes (minimal — no unrelated refactoring):
- `buildEncryptedCdl(cdlNumber)` helper — single encryption point
- `redactCdlFields(driver)` — single redaction choke point
- `createCarrierDriver`: spreads `buildEncryptedCdl(rest.cdlNumber)` into create data (dual-write)
- `updateCarrierDriver`: dual-writes on non-empty cdlNumber; clears all 5 encrypted fields on null/empty
- `listCarrierDrivers` / `getCarrierDriver`: maps results through `redactCdlFields` — `cdlNumber`, ciphertext columns all `null`; only `cdlNumberLast4` returned
- `decryptCarrierDriverCDL`: OWNER/MANAGER only; `VIEW_PII` on success, `VIEW_PII_DENIED` on denial/not-found; returns `{ ok: true, cdlNumber }` or `{ ok: false, status: 403 }`

### Environment variables added

| Variable | Committed value |
|---|---|
| `KMS_KEY_v1` | `replace-with-32-byte-hex-string` (placeholder only) |
| `CURRENT_KMS_KEY_ID` | `v1` |
| `VALID_KMS_KEY_IDS` | `v1` |

**No real key material committed to git.**

### Tests

3 new security test files:

| File | Tests | Status |
|---|---|---|
| `tests/security/field-crypto.test.ts` | 5 | Passes (no DB needed) |
| `tests/security/audit-log-isolation.test.ts` | 5 | Skipped without DATABASE_URL (DB required) |
| `tests/security/carrier-driver-pii.test.ts` | 3 | Skipped without DATABASE_URL (DB required) |

Total: 13 new tests (5 running in CI without DB, 8 requiring live DB).

### Runbooks

- `docs/runbooks/encryption-keys.md` — key generation, local dev setup, Vercel setup, rotation procedure (step-by-step with safety checks), emergency rotation variant
- `docs/runbooks/pii-encryption.md` — what is encrypted, dual-write window explanation, default read behavior, plaintext access rules, audit log schema
- `docs/runbooks/pii-encryption-pr2.md` — PR2 plan: 7-day minimum window, smoke tests, exact DDL to drop plaintext column, rollback plan (add nullable + no re-derivation from ciphertext)
- `docs/runbooks/db-standardization-migration.md` — PII encryption section appended with links to all three runbooks

## PR2 NOT done in this PR

`carrier_drivers.cdl_number` plaintext column is **NOT** dropped. `User.licenseNumber` is **NOT** touched.

PR2 is safe to ship when:
1. PR1 in production for 7+ days with zero Sentry decrypt-failure errors
2. Four smoke tests pass against production (create→last4, default-read→null, MANAGER-decrypt→plaintext, DRIVER-decrypt→403)
3. `SELECT COUNT(*) FROM carrier_drivers WHERE cdl_number IS NOT NULL AND cdl_number_ciphertext IS NULL` = 0

See `docs/runbooks/pii-encryption-pr2.md` for full plan.

## Commits

| Hash | Message |
|---|---|
| `4d70c71` | feat(quick-329): Task 1 — crypto primitives, key registry, audit-log writer, runbooks |
| `74a91be` | feat(quick-329): Task 2 — migration, schema, backfill script, audit-log switched to Prisma client |
| `0e247ac` | feat(quick-329): Task 3 — dual-write, redacted read, decryptCarrierDriverCDL, security tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma `Bytes` type mismatch with `Buffer` in decryptField**
- **Found during:** Task 3 TypeScript check
- **Issue:** Prisma 7 maps `Bytes` schema type to `Uint8Array` in TypeScript types, but `decryptField` expects `Buffer`. TypeScript flagged type mismatch at the `decryptField({ ciphertext: driver.cdlNumberCiphertext, ... })` call.
- **Fix:** Added `Buffer.from()` casts in `decryptCarrierDriverCDL` when passing Prisma `Bytes` fields to `decryptField`. Runtime behavior is unchanged (Node.js `Buffer` extends `Uint8Array`).
- **Files modified:** `apps/web/src/lib/carrier/fleet-drivers.ts`

**2. [Rule 3 - Blocking] `dotenv/config` does not load `.env.local`**
- **Found during:** Task 2 backfill script execution
- **Issue:** `import 'dotenv/config'` loads `.env` but not `.env.local`. The backfill script couldn't find `CURRENT_KMS_KEY_ID`.
- **Fix:** Replaced with explicit `dotenv.config({ path: '.env.local' })` + `dotenv.config({ path: '.env' })` in the backfill script.
- **Files modified:** `apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts`

**3. [Rule 3 - Blocking] Backfill script relative import path**
- **Found during:** Task 2 first backfill run
- **Issue:** Initial import `from '../src/generated/prisma/client'` resolved incorrectly from `scripts/backfill/` directory.
- **Fix:** Used explicit `../../src/generated/prisma/client` (two levels up from `scripts/backfill/`).
- **Files modified:** `apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts`

## Self-Check: PASSED

All created files exist. All 3 task commits verified in git log.

| Check | Result |
|---|---|
| `field-crypto.ts` exists | FOUND |
| `key-registry.ts` exists | FOUND |
| `audit-log.ts` exists | FOUND |
| Migration SQL exists | FOUND |
| Backfill script exists | FOUND |
| 3 test files exist | FOUND |
| 3 runbooks exist | FOUND |
| Commit `4d70c71` (Task 1) | FOUND |
| Commit `74a91be` (Task 2) | FOUND |
| Commit `0e247ac` (Task 3) | FOUND |
| `tsc --noEmit` | PASSED |
| `npm run build` | PASSED |
| `audit:raw-prisma` | 0 LEAK_RISK |
| `vitest run tests/security/` | 5/5 pass (8 skipped — need DB) |
| Real KMS key in git | NOT committed |
