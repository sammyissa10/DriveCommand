---
phase: quick-329
plan: 01
type: execute
wave: 1
depends_on: [quick-328]
files_modified:
  - apps/web/src/lib/security/field-crypto.ts
  - apps/web/src/lib/security/key-registry.ts
  - apps/web/src/lib/security/audit-log.ts
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql
  - apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts
  - apps/web/package.json
  - apps/web/.env.example
  - apps/web/tests/security/field-crypto.test.ts
  - apps/web/tests/security/audit-log-isolation.test.ts
  - apps/web/tests/security/carrier-driver-pii.test.ts
  - docs/runbooks/encryption-keys.md
  - docs/runbooks/pii-encryption.md
  - docs/runbooks/pii-encryption-pr2.md
  - docs/runbooks/db-standardization-migration.md
autonomous: true

must_haves:
  truths:
    - "encryptField + decryptField round-trip preserves the exact plaintext for both 'D1234567' and '123-45-6789'"
    - "Ciphertext bytes never contain plaintext as a substring; tampered ciphertext throws on decrypt; unknown keyId throws"
    - "CURRENT_KMS_KEY_ID + VALID_KMS_KEY_IDS env vars drive key resolution; VALID_KMS_KEY_IDS gate prevents decryption with unregistered keys"
    - "carrier_drivers has 5 new nullable columns (cdl_number_ciphertext, cdl_number_iv, cdl_number_tag, cdl_number_key_id, cdl_number_last4); cdl_number plaintext column still exists untouched"
    - "Migration + Node backfill script populates the 1 row with non-null cdl_number; decrypts back to original; fails loud on mismatch"
    - "audit_log table exists with RLS + FORCE RLS + tenant_isolation_policy + bypass_rls_policy; UPDATE/DELETE revoked from app_user"
    - "create/update on CarrierDriver dual-writes both cdl_number plaintext AND the 5 encrypted columns; cdl_number_last4 populated from last 4 chars"
    - "Default repo reads return only cdl_number_last4 — never plaintext, never ciphertext"
    - "decryptCarrierDriverCDL writes a VIEW_PII audit_log row on success and VIEW_PII_DENIED on RBAC failure; returns 403 for non-MANAGER/OWNER"
    - "Two-tenant audit_log isolation: tenant A user cannot see tenant B audit_log rows; UPDATE/DELETE from app_user fails"
    - "No code path logs plaintext cdl_number, the encryption key, or sensitive values (grep verified)"
    - "User.licenseNumber is NOT touched in this PR; cdl_number plaintext column is NOT dropped"
    - "All 5 dropdown regression tests from quick-328 still pass; all 17 existing isolation tests still pass"
    - "`npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`, `npm run build`, `npm test` all succeed from apps/web/"

  artifacts:
    - path: "apps/web/src/lib/security/field-crypto.ts"
      provides: "AES-256-GCM encryptField/decryptField using node:crypto; 12-byte IV, 16-byte auth tag; throws on decrypt failure"
      exports: ["encryptField", "decryptField", "EncryptedField"]
    - path: "apps/web/src/lib/security/key-registry.ts"
      provides: "getCurrentKey() returns active write key; getKeyById(keyId) returns decryption key; throws on unregistered keyId"
      exports: ["getCurrentKey", "getCurrentKeyId", "getKeyById"]
    - path: "apps/web/src/lib/security/audit-log.ts"
      provides: "writeAuditLog({ tenantId, userId, action, resourceType, resourceId, fieldName?, ip?, userAgent? }) — append-only insert via bypass_rls transaction"
      exports: ["writeAuditLog", "AuditAction"]
    - path: "apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql"
      provides: "ALTER carrier_drivers + CREATE TABLE audit_log + RLS policies + GRANT/REVOKE for app_user"
      contains: "cdl_number_ciphertext"
    - path: "apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts"
      provides: "Post-migration Node script: encrypts every row with cdl_number IS NOT NULL, writes 5 new columns inside one transaction, decrypt-equals-plaintext verification, fails loud on mismatch"
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "Dual-write on create/update (plaintext + ciphertext); list/get redact to last4; decryptCarrierDriverCDL handles RBAC + audit"
      contains: "decryptCarrierDriverCDL"
    - path: "apps/web/tests/security/field-crypto.test.ts"
      provides: "Round-trip, no-plaintext-in-ciphertext, tamper-detection, wrong-keyId-throws, unknown-keyId-throws"
    - path: "apps/web/tests/security/audit-log-isolation.test.ts"
      provides: "Two-tenant isolation + append-only enforcement on audit_log"
    - path: "apps/web/tests/security/carrier-driver-pii.test.ts"
      provides: "End-to-end: create → last4 + ciphertext stored; default read returns only last4; MANAGER decrypt returns plaintext + audit row; DRIVER decrypt → 403 + denial audit row"
    - path: "apps/web/.env.example"
      contains: "KMS_KEY_v1"
    - path: "docs/runbooks/encryption-keys.md"
      provides: "Key generation, .env.local setup, Vercel env, rotation procedure (add new key to VALID_KMS_KEY_IDS, flip CURRENT_KMS_KEY_ID, re-encrypt over time, drop old key id when no ciphertext references it)"
    - path: "docs/runbooks/pii-encryption.md"
      provides: "Summary of what's encrypted (CarrierDriver.cdl_number), dual-write window, when PR2 is safe to ship"
    - path: "docs/runbooks/pii-encryption-pr2.md"
      provides: "PR2 plan: 7-day production verification window, smoke tests, drop cdl_number plaintext column, rollback steps"

  key_links:
    - from: "apps/web/src/lib/carrier/fleet-drivers.ts (createCarrierDriver / updateCarrierDriver)"
      to: "encryptField + getCurrentKey from src/lib/security/field-crypto + key-registry"
      via: "encrypted before prisma.carrierDriver.create / update"
      pattern: "encryptField\\("
    - from: "apps/web/src/lib/carrier/fleet-drivers.ts (decryptCarrierDriverCDL)"
      to: "writeAuditLog({ action: 'VIEW_PII' | 'VIEW_PII_DENIED', resource_type: 'carrier_driver', field_name: 'cdl_number' })"
      via: "audit-log write before plaintext return / before 403"
      pattern: "writeAuditLog"
    - from: "apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts"
      to: "single $transaction over the 1 populated row + decrypt-equals verification"
      via: "prisma.$transaction with bypass_rls; throws on any mismatch"
      pattern: "decryptField.*===.*plaintext|throw.*mismatch"
    - from: "apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql"
      to: "audit_log table with FORCE ROW LEVEL SECURITY + tenant_isolation_policy + REVOKE UPDATE,DELETE FROM app_user"
      via: "raw SQL inside migration"
      pattern: "FORCE ROW LEVEL SECURITY|REVOKE UPDATE.*DELETE.*app_user"
---

<objective>
PR1 of 2 for field-level PII encryption per DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.

Build:
- AES-256-GCM crypto wrapper (`field-crypto.ts`) and key registry (`key-registry.ts`) backed by `process.env`.
- The `audit_log` table (tenant-scoped, RLS-forced, append-only) — this PR brings it into existence for the first time.
- Encrypted-shape columns on `carrier_drivers` for `cdl_number` (ciphertext / iv / tag / key_id / last4).
- A Node backfill script that encrypts the 1 existing populated row inside a single transaction with a decrypt-equals-plaintext verification.
- Dual-write on `CarrierDriver` create/update (plaintext stays, ciphertext also written) and a redacted-by-default read path.
- A `decryptCarrierDriverCDL` function that gates plaintext access on MANAGER/OWNER role and writes a `VIEW_PII` / `VIEW_PII_DENIED` audit row.
- Tests proving round-trip, tamper detection, no-plaintext-in-ciphertext, audit-log isolation, append-only enforcement, and the end-to-end repository flow.
- Runbooks for keys, this PR's scope, and the future PR2 (drop plaintext column) plan.

Out of scope (strictly):
- Dropping `carrier_drivers.cdl_number` plaintext column → PR2 only.
- `User.licenseNumber` → not touched in this PR at all.
- Any other PII field (SSN, DOB, etc.) → future PRs.

Constraints:
- Never log plaintext PII, the encryption key, or any sensitive value.
- Never accept a key from request body or query string.
- Do not commit real encryption keys to git.
- All new columns nullable for now (dual-write window).
- `SYSTEM_USER_ID` (env var, already set to `3718344a-ccd1-4009-8220-a90439b74575`) is the actor for the backfill's audit entries.
- Migration class is GREENFIELD-with-trivial-backfill: 22 rows total in `carrier_drivers`, 1 has `cdl_number` populated.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
# Spec — read these sections first
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md
# Specifically sections 4.1, 4.2, 4.4, 4.5, 6.5, 6.7, and Prompt 4 (lines 709–776).

# Project state + decisions already locked
@.planning/STATE.md
@.planning/quick/328-lock-in-cross-tenant-leak-fix-raw-prisma/328-SUMMARY.md

# Schema (read CarrierDriver model around line 1771 + User around line 224)
@apps/web/prisma/schema.prisma

# Existing infrastructure — reuse, do not reinvent
@apps/web/src/lib/db/prisma.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/.env.example
@apps/web/tests/isolation/setup.ts
@apps/web/tests/isolation/dropdowns.test.ts

# Runbook to cross-reference
@docs/runbooks/db-standardization-migration.md

# Notes on patterns that affect this work
# - CarrierDriver uses `org_id` (not `tenant_id`) and is in EXEMPT_MODELS in tenant-rls.ts.
#   Repository code must always pass `orgId` explicitly in queries. Mirror the pattern from
#   the existing fleet-drivers.ts and the carrier dropdown isolation tests in quick-328.
# - For test fixtures, follow tests/isolation/setup.ts: open a $transaction, run
#   `set_config('app.bypass_rls','on',TRUE)` first, then insert.
# - The repository at apps/web/src/lib/carrier/fleet-drivers.ts is the canonical entry point
#   for CarrierDriver CRUD. Modify it; do not create a parallel file.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crypto wrapper, key registry, env scaffolding, runbooks, audit-log writer</name>
  <files>
    apps/web/src/lib/security/field-crypto.ts
    apps/web/src/lib/security/key-registry.ts
    apps/web/src/lib/security/audit-log.ts
    apps/web/.env.example
    apps/web/tests/security/field-crypto.test.ts
    docs/runbooks/encryption-keys.md
    docs/runbooks/pii-encryption.md
    docs/runbooks/pii-encryption-pr2.md
  </files>
  <action>
    Build the crypto and audit-log primitives first — repository wiring and migration depend on them.

    1) `apps/web/src/lib/security/field-crypto.ts`
       - Use `node:crypto`. Algorithm: `aes-256-gcm`. IV: 12 random bytes per call (`randomBytes(12)`). Auth tag: 16 bytes from `cipher.getAuthTag()`.
       - Export type:
           export interface EncryptedField {
             ciphertext: Buffer;
             iv: Buffer;
             tag: Buffer;
             keyId: string;
           }
       - `encryptField(plaintext: string, keyId: string): EncryptedField`
         * Resolve key via `getKeyById(keyId)` from `key-registry`.
         * `createCipheriv('aes-256-gcm', key, iv)`, encrypt, capture tag.
         * Return { ciphertext, iv, tag, keyId }.
       - `decryptField(input: EncryptedField): string`
         * Resolve key via `getKeyById(input.keyId)`.
         * `createDecipheriv('aes-256-gcm', key, input.iv)`, setAuthTag, decrypt.
         * Throw on auth-tag failure (no try/swallow). Never return a fallback value.
       - DO NOT call `logger.*` or `console.*` with `plaintext`, `key`, `ciphertext`, or any input. Throw plain errors with non-sensitive messages like "decryption failed" or "encryption failed".

    2) `apps/web/src/lib/security/key-registry.ts`
       - Reads three env vars: `CURRENT_KMS_KEY_ID` (e.g. "v1"), `VALID_KMS_KEY_IDS` (comma-separated, default = `CURRENT_KMS_KEY_ID`), and `KMS_KEY_<keyId>` (32-byte hex per registered key).
       - `getCurrentKeyId(): string` — returns `process.env.CURRENT_KMS_KEY_ID` or throws if unset.
       - `getCurrentKey(): { keyId: string; key: Buffer }` — returns the current encryption key (for new writes).
       - `getKeyById(keyId: string): Buffer` — throws if `keyId` is not in `VALID_KMS_KEY_IDS`; reads `KMS_KEY_${keyId}` from env; validates it parses as 32 bytes of hex; throws otherwise.
       - No file logging of keys. Error messages must reference only the keyId, never the key material.

    3) `apps/web/src/lib/security/audit-log.ts`
       - Type:
           export type AuditAction =
             | 'VIEW_PII'
             | 'VIEW_PII_DENIED'
             | 'DOWNLOAD_DOCUMENT'
             | 'UPDATE_RESTRICTED'
             | 'DELETE_RESTRICTED'
             | 'EXPORT'
             | 'RATE_LIMIT_HIT';
       - `writeAuditLog(params: { tenantId: string; userId: string; action: AuditAction; resourceType: string; resourceId: string; fieldName?: string | null; ip?: string | null; userAgent?: string | null; }): Promise<void>`
       - Insert path: use `prisma.$transaction` with `SELECT set_config('app.bypass_rls','on',TRUE)` first, then `prisma.$executeRaw` parameterized INSERT into `audit_log` (the Prisma model is not added in PR1 — keep it raw to avoid a chicken-and-egg before `prisma generate`). Use `Prisma.sql` tagged template, never string concat.
       - On any insert failure, log a non-PII error event via `logger` (e.g. `logger.error('audit_log_insert_failed', { action, resourceType })`) and **rethrow** — callers decide whether to fail the request.
       - Do NOT log `fieldName` value content beyond the field name string itself. Do NOT log `resourceId` UUID into error messages.

    4) `apps/web/.env.example` — append to the end (preserving existing content):
           # -------------------------------------------
           # Field-Level PII Encryption (required — Section 4.2 of DatabaseSecurity spec)
           # -------------------------------------------
           # Generate each key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
           # NEVER commit real values. Vercel: Settings -> Environment Variables.
           KMS_KEY_v1=replace-with-32-byte-hex-string
           CURRENT_KMS_KEY_ID=v1
           VALID_KMS_KEY_IDS=v1
       - DO NOT modify `.env.local` from the planning file; the executor will add a freshly generated 32-byte hex value locally (see runbook).

    5) `apps/web/tests/security/field-crypto.test.ts` — Vitest. Five cases:
       - Round-trip: `decryptField(encryptField('D1234567','v1')) === 'D1234567'`
       - Round-trip with multi-character + hyphens: `decryptField(encryptField('123-45-6789','v1')) === '123-45-6789'`
       - No-plaintext-in-ciphertext: `ciphertext.toString('binary').includes('D1234567')` is false; same for utf-8/hex/base64.
       - Tamper detection: flip one byte in `ciphertext` → `decryptField` throws.
       - Unknown keyId: `getKeyById('does-not-exist')` throws; `decryptField({ ...valid, keyId: 'does-not-exist' })` throws.
       - Tests must set `process.env.KMS_KEY_v1`, `CURRENT_KMS_KEY_ID=v1`, `VALID_KMS_KEY_IDS=v1` in `beforeAll` with a deterministic 32-byte hex (test-only value — do NOT reuse real keys).

    6) Runbooks:
       - `docs/runbooks/encryption-keys.md` — How KMS_KEY_v1 is generated; how to set in `.env.local`, Vercel preview, and Vercel production; rotation procedure: (a) generate `v2`, (b) set `KMS_KEY_v2`, (c) append `v2` to `VALID_KMS_KEY_IDS` ("v1,v2"), (d) flip `CURRENT_KMS_KEY_ID=v2`, (e) re-encrypt rows over time (script in future PR), (f) drop `v1` from `VALID_KMS_KEY_IDS` only when no ciphertext references `key_id='v1'`. Include emergency rotation (suspected compromise) variant.
       - `docs/runbooks/pii-encryption.md` — What's encrypted in PR1 (CarrierDriver.cdl_number only). Dual-write pattern. Default read returns last4. `decryptCarrierDriverCDL` is the only plaintext path and is audit-logged + RBAC-gated. PR2 is safe to ship when: 7+ days have passed since PR1 production deploy with zero decrypt-failure errors AND a full smoke test (create new driver with cdl, default read, MANAGER decrypt, DRIVER decrypt-denied) passes against production. PR2 will drop `cdl_number` plaintext column.
       - `docs/runbooks/pii-encryption-pr2.md` — PR2 plan: minimum 7-day verification window, list of smoke tests, exact DDL to drop column, rollback steps (re-add column nullable; do NOT attempt to re-derive plaintext from ciphertext — restore from snapshot if needed).
       - Append a "PII encryption (quick-329)" section to `docs/runbooks/db-standardization-migration.md` that links to the three runbooks above and notes the dual-write window.

    Constraints:
    - No raw key/plaintext in logs anywhere. Use grep step in <verify> below.
    - Use `Prisma.sql` parameterized templates for the audit_log INSERT — no string concatenation.
    - `audit-log.ts` falls under the raw-Prisma scanner from quick-328; add it to the scanner's `INTENTIONAL_ALLOWED` list as part of this task (mirror the pattern used for `notifications/audit-log` and `tenantRawQuery` wrappers in `apps/web/scripts/audit/raw-prisma-usage.ts`).
  </action>
  <verify>
    From `apps/web/`:
    1. `npx tsc --noEmit` — passes.
    2. `npm run audit:raw-prisma` — exits 0 (audit-log.ts in INTENTIONAL_ALLOWED).
    3. `npx vitest run tests/security/field-crypto.test.ts` — all 5 cases pass.
    4. Grep verification (from repo root):
       - `grep -rni "logger.*plaintext\|console.*plaintext\|logger.*cdlNumber\|console.*cdlNumber" apps/web/src/lib/security` — zero hits.
       - `grep -rni "logger.*KMS_KEY\|console.*KMS_KEY" apps/web/src/lib/security` — zero hits.
       - `grep -rn "cdl_number" apps/web/src/lib/security/field-crypto.ts apps/web/src/lib/security/key-registry.ts` — zero hits (crypto layer is field-agnostic).
    5. `apps/web/.env.example` contains exactly `KMS_KEY_v1=replace-with-32-byte-hex-string`, `CURRENT_KMS_KEY_ID=v1`, `VALID_KMS_KEY_IDS=v1`.
    6. The three new runbooks exist and reference each other.
  </verify>
  <done>
    - `field-crypto.ts`, `key-registry.ts`, `audit-log.ts` exist and export the named symbols.
    - 5/5 crypto tests pass.
    - `.env.example` has the three new entries; real keys are NOT in any file under version control.
    - Three runbooks exist; `db-standardization-migration.md` cross-references them.
    - Raw-Prisma scanner still exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Migration — add encrypted columns + create audit_log table + Node backfill</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql
    apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts
    apps/web/package.json
  </files>
  <action>
    1) Update `apps/web/prisma/schema.prisma`:

       Inside `model CarrierDriver` (around line 1771), keep `cdlNumber String? @map("cdl_number")` AS IS. Add five new fields below it:
           cdlNumberCiphertext Bytes?   @map("cdl_number_ciphertext")
           cdlNumberIv         Bytes?   @map("cdl_number_iv")
           cdlNumberTag        Bytes?   @map("cdl_number_tag")
           cdlNumberKeyId      String?  @map("cdl_number_key_id")
           cdlNumberLast4      String?  @map("cdl_number_last4") @db.VarChar(4)

       Add a new model `AuditLog` (snake_case @@map):
           model AuditLog {
             id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
             tenantId     String   @map("tenant_id") @db.Uuid
             userId       String   @map("user_id") @db.Uuid
             action       String
             resourceType String   @map("resource_type")
             resourceId   String   @map("resource_id") @db.Uuid
             fieldName    String?  @map("field_name")
             ipAddress    String?  @map("ip_address") @db.Inet
             userAgent    String?  @map("user_agent")
             createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

             tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
             user         User     @relation(fields: [userId], references: [id])

             @@index([tenantId, createdAt(sort: Desc)])
             @@index([tenantId, userId, createdAt(sort: Desc)])
             @@index([tenantId, resourceType, resourceId])
             @@map("audit_log")
           }

       Add reverse relations on `Tenant` and `User` models: `auditLogs AuditLog[]` on each. (Tenant relation block already has many reverse relations — append. Same for User.)

       Add `'AuditLog'` to the `EXEMPT_MODELS` set in `apps/web/src/lib/db/extensions/tenant-rls.ts` ONLY IF the model's tenant column is named `tenantId` (it is — so do NOT add to EXEMPT_MODELS; the auto-injection will work). However, audit_log inserts must go through the bypass_rls transaction path because the SYSTEM_USER context is the actor for the backfill — for runtime writes from `writeAuditLog`, the inserting user's tenantId must match the row being inserted, which auto-injection handles. Use `prisma.auditLog.create` from `writeAuditLog` once the model exists (replace the raw-SQL fallback from Task 1). NOTE: rework `audit-log.ts` to use `prisma.auditLog.create` after `prisma generate` runs in this task; remove the raw-SQL path. Then re-run the raw-Prisma scanner and confirm it returns to 0 LEAK_RISK.

    2) Create migration file `apps/web/prisma/migrations/20260515_pii_encryption_pr1/migration.sql`:

       -- 1. Add encrypted-shape columns to carrier_drivers
       ALTER TABLE carrier_drivers
         ADD COLUMN cdl_number_ciphertext BYTEA,
         ADD COLUMN cdl_number_iv         BYTEA,
         ADD COLUMN cdl_number_tag        BYTEA,
         ADD COLUMN cdl_number_key_id     TEXT,
         ADD COLUMN cdl_number_last4      VARCHAR(4);

       -- 2. Create audit_log table
       CREATE TABLE audit_log (
         id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id     UUID NOT NULL,
         user_id       UUID NOT NULL,
         action        TEXT NOT NULL CHECK (action IN (
           'VIEW_PII','VIEW_PII_DENIED','DOWNLOAD_DOCUMENT',
           'UPDATE_RESTRICTED','DELETE_RESTRICTED','EXPORT','RATE_LIMIT_HIT'
         )),
         resource_type TEXT NOT NULL,
         resource_id   UUID NOT NULL,
         field_name    TEXT,
         ip_address    INET,
         user_agent    TEXT,
         created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
         CONSTRAINT audit_log_tenant_fk FOREIGN KEY (tenant_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT,
         CONSTRAINT audit_log_user_fk   FOREIGN KEY (user_id)   REFERENCES "User"(id)
       );

       CREATE INDEX audit_log_tenant_created_idx       ON audit_log (tenant_id, created_at DESC);
       CREATE INDEX audit_log_tenant_user_created_idx  ON audit_log (tenant_id, user_id, created_at DESC);
       CREATE INDEX audit_log_tenant_resource_idx      ON audit_log (tenant_id, resource_type, resource_id);

       -- 3. RLS — append-only, tenant-scoped
       ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
       ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

       CREATE POLICY tenant_isolation_policy ON audit_log
         USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

       CREATE POLICY bypass_rls_policy ON audit_log
         USING (current_setting('app.bypass_rls', TRUE) = 'on');

       -- 4. Grants — app_user can read + insert; never update or delete
       GRANT SELECT, INSERT ON audit_log TO app_user;
       REVOKE UPDATE, DELETE ON audit_log FROM app_user;

       Validate the exact Tenant/User table casing against the schema before writing the migration — Prisma defaults to PascalCase quoted names (`"Tenant"`, `"User"`). Match what other migrations in this project use.

    3) Create the post-migration backfill at `apps/web/scripts/backfill/encrypt-carrier-driver-cdl.ts`:

       - Single Node script. Reads env vars exactly like the app: `DATABASE_URL`, `CURRENT_KMS_KEY_ID`, `VALID_KMS_KEY_IDS`, `KMS_KEY_v1`, `SYSTEM_USER_ID`.
       - Imports `encryptField`, `decryptField` from `../src/lib/security/field-crypto` and `getCurrentKey` from `key-registry`.
       - Uses the same `prisma` client.
       - Inside a single `$transaction([...], TX_OPTIONS)`:
         a. `set_config('app.bypass_rls','on',TRUE)`.
         b. `SELECT id, org_id, cdl_number FROM carrier_drivers WHERE cdl_number IS NOT NULL` via `prisma.$queryRaw` (allowlisted in the scanner because file path is `scripts/backfill/`).
         c. Per row: `const { keyId, key: _ } = getCurrentKey(); const ef = encryptField(row.cdl_number, keyId);` then `UPDATE carrier_drivers SET cdl_number_ciphertext=$1, cdl_number_iv=$2, cdl_number_tag=$3, cdl_number_key_id=$4, cdl_number_last4=$5 WHERE id=$6` (parameterized via `Prisma.sql`).
         d. Read back the row: `SELECT cdl_number_ciphertext, cdl_number_iv, cdl_number_tag, cdl_number_key_id FROM carrier_drivers WHERE id = $1`, decrypt, assert `decrypted === row.cdl_number`. Throw on any mismatch — the throw aborts the transaction.
       - Log only counts ("backfilled N rows, verified N decrypt-equals matches"). Never log `cdl_number`.
       - Add npm script in `apps/web/package.json`: `"backfill:carrier-driver-cdl": "tsx scripts/backfill/encrypt-carrier-driver-cdl.ts"`.
       - Add the script path to the raw-Prisma scanner's `INTENTIONAL_ALLOWED` list (`apps/web/scripts/backfill/` prefix), mirroring the existing `apps/web/scripts/audit/` and `prisma/migrations/` rules.

    4) Run `npx prisma generate` after schema changes. Run `npx prisma migrate deploy` (the project's migration hook auto-applies on save; if it does not, run it explicitly).

    5) Run the backfill script: `cd apps/web && npm run backfill:carrier-driver-cdl`. Expect 1 row backfilled and verified.

    6) Switch `apps/web/src/lib/security/audit-log.ts` from the raw-SQL path to `prisma.auditLog.create({ data: {...} })` (now that the model exists). Keep the function signature identical. Re-run audit:raw-prisma — expect 0 LEAK_RISK.
  </action>
  <verify>
    From `apps/web/`:
    1. `npx prisma validate` — succeeds.
    2. `npx prisma generate` — succeeds; `AuditLog` and the new `cdlNumber*` fields appear in the generated types.
    3. The migration applied. Confirm via:
       - `\d carrier_drivers` shows all 5 new columns nullable.
       - `\d audit_log` shows the table + 3 indexes + RLS enabled and forced + check constraint on `action`.
       - `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='audit_log';` → both true.
       - `SELECT polname FROM pg_policy WHERE polrelid='audit_log'::regclass;` → returns `tenant_isolation_policy` and `bypass_rls_policy`.
    4. Backfill: `npm run backfill:carrier-driver-cdl` exits 0; prints "backfilled 1 row, verified 1 decrypt-equals match".
    5. SQL sanity check: `SELECT count(*) FROM carrier_drivers WHERE cdl_number IS NOT NULL AND cdl_number_ciphertext IS NULL;` → 0. And `SELECT cdl_number_last4 FROM carrier_drivers WHERE cdl_number IS NOT NULL;` returns the last 4 chars of the original.
    6. `cdl_number` plaintext column still exists and still contains the original value (NOT dropped).
    7. `npx tsc --noEmit` passes from `apps/web/`.
    8. `npm run audit:raw-prisma` exits 0 (backfill path allowlisted; audit-log.ts now uses Prisma client).
  </verify>
  <done>
    - Migration `20260515_pii_encryption_pr1` is in `apps/web/prisma/migrations/`.
    - 5 new columns exist on `carrier_drivers`; plaintext `cdl_number` untouched.
    - `audit_log` table exists with RLS forced, both policies, three indexes, action check constraint, REVOKE UPDATE/DELETE from app_user.
    - 1 row backfilled with verified decrypt-equals-plaintext.
    - `prisma.auditLog` is the path used by `writeAuditLog`.
    - Raw-Prisma scanner exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Repository dual-write + redacted read + decryptCarrierDriverCDL + security tests</name>
  <files>
    apps/web/src/lib/carrier/fleet-drivers.ts
    apps/web/tests/security/audit-log-isolation.test.ts
    apps/web/tests/security/carrier-driver-pii.test.ts
  </files>
  <action>
    1) Wire the encryption into `apps/web/src/lib/carrier/fleet-drivers.ts`. Make changes minimally — do not refactor unrelated code.

       Add a small helper at top of file:
           import { encryptField, decryptField } from '@/lib/security/field-crypto';
           import { getCurrentKey } from '@/lib/security/key-registry';
           import { writeAuditLog } from '@/lib/security/audit-log';

           function buildEncryptedCdl(cdlNumber: string | null | undefined) {
             if (!cdlNumber) return {};
             const { keyId } = getCurrentKey();
             const ef = encryptField(cdlNumber, keyId);
             return {
               cdlNumberCiphertext: ef.ciphertext,
               cdlNumberIv: ef.iv,
               cdlNumberTag: ef.tag,
               cdlNumberKeyId: ef.keyId,
               cdlNumberLast4: cdlNumber.slice(-4),
             };
           }

       `createCarrierDriver`:
         - Inside the `prisma.carrierDriver.create` data block, spread `buildEncryptedCdl(rest.cdlNumber)`. KEEP `cdlNumber` in `rest` as well (the dual-write). Do not remove it.
         - When the existing-user re-link `prisma.carrierDriver.update` happens further down, no change needed — cdlNumber not touched there.

       `updateCarrierDriver`:
         - If `cdlNumber` is in the update payload (i.e. the caller explicitly passed it — handle both `cdlNumber: 'X'` and `cdlNumber: null`), build the encrypted shape:
           * If value is non-empty string → call `buildEncryptedCdl`.
           * If value is `null` or empty string → set all 5 encrypted fields to `null` (clearing the encrypted shape mirrors clearing plaintext).
         - Spread into the prisma update `data` block alongside the existing plaintext write.

       Redacted-read default behavior:
         - `listCarrierDrivers` and `getCarrierDriver` currently return whatever Prisma returns. Add a post-processing step that maps the result(s) and:
           * Sets `cdlNumber` to `null` on each returned object (or removes it from the projection — pick whichever is less invasive; setting to null is simpler and preserves the type shape).
           * Sets `cdlNumberCiphertext`, `cdlNumberIv`, `cdlNumberTag`, `cdlNumberKeyId` to `null` on each returned object.
           * Keeps `cdlNumberLast4`.
         - This is the SINGLE choke point that prevents accidental exposure through the existing list/detail API.

       New exported function:
           export async function decryptCarrierDriverCDL(args: {
             orgId: string;
             driverId: string;
             requestingUserId: string;
             requestingUserRole: string; // 'OWNER' | 'MANAGER' | 'DRIVER' | etc.
             requestingIp?: string | null;
             requestingUserAgent?: string | null;
           }): Promise<{ ok: true; cdlNumber: string | null } | { ok: false; status: 403 }>

         Behavior:
         - If `requestingUserRole` is neither 'OWNER' nor 'MANAGER': call `writeAuditLog({ tenantId: orgId, userId: requestingUserId, action: 'VIEW_PII_DENIED', resourceType: 'carrier_driver', resourceId: driverId, fieldName: 'cdl_number', ip: requestingIp ?? null, userAgent: requestingUserAgent ?? null })` and return `{ ok: false, status: 403 }`.
         - Else: fetch the driver (orgId filter) with the 4 encrypted columns selected explicitly. If not found, return `{ ok: false, status: 403 }` AND write VIEW_PII_DENIED (treat unknown access as denied; do NOT 404 to avoid existence oracle on cross-tenant probes).
         - If `cdlNumberCiphertext` is null → return `{ ok: true, cdlNumber: null }` and write VIEW_PII (a NULL view is still a view of restricted data).
         - Else: `decryptField({ ciphertext, iv, tag, keyId })` → write VIEW_PII (with field_name='cdl_number') → return `{ ok: true, cdlNumber: plaintext }`.
         - On decrypt failure: rethrow; do NOT swallow.

    2) Create `apps/web/tests/security/audit-log-isolation.test.ts`:
       - Follows the pattern of `apps/web/tests/isolation/dropdowns.test.ts` (skip when DATABASE_URL not set; use `createTestTenant` + `createTestUser` helpers from `tests/isolation/setup.ts`; insert via `bypass_rls` transactions).
       - Two-tenant isolation:
         * Seed 2 audit_log rows in tenant A and 2 in tenant B (via raw INSERT inside bypass_rls — these tests need raw, allowlist via existing test path pattern).
         * Connect as tenant A's user (`prisma.$extends(withTenantRLS(tenantAId))`), query `auditLog.findMany`, assert exactly 2 rows all with `tenantId === tenantAId`.
       - Append-only:
         * As `app_user` role (use a separate Pool with `SET ROLE app_user` if available; fallback — connect with `current_user` and verify the grants directly via `pg_class_acl`). Run `UPDATE audit_log SET action='EXPORT' WHERE id=$1` → assert it throws / errors out with permission denied. Same for `DELETE FROM audit_log WHERE id=$1`.
         * If `SET ROLE app_user` is not feasible in the test env, fall back to verifying the grant matrix via `SELECT has_table_privilege('app_user','audit_log','UPDATE')` returns false and `has_table_privilege('app_user','audit_log','DELETE')` returns false.

    3) Create `apps/web/tests/security/carrier-driver-pii.test.ts`:
       - Skip when DATABASE_URL not set.
       - Seed tenant A and two users in tenant A: one with role `MANAGER` and one with role `DRIVER`.
       - Case A — Create + redacted read:
         * Call `createCarrierDriver(tenantAId, { firstName, lastName, cdlNumber: 'D1234567' })`.
         * Direct DB query (via bypass_rls): assert `cdl_number === 'D1234567'`, `cdl_number_ciphertext IS NOT NULL`, `cdl_number_last4 === '4567'`, `cdl_number_key_id === 'v1'`.
         * Call `getCarrierDriver(tenantAId, driverId)` → assert returned object has `cdlNumber === null`, `cdlNumberLast4 === '4567'`, `cdlNumberCiphertext === null`.
       - Case B — MANAGER decrypt success:
         * Call `decryptCarrierDriverCDL({ orgId: tenantAId, driverId, requestingUserId: managerUserId, requestingUserRole: 'MANAGER' })`.
         * Assert `{ ok: true, cdlNumber: 'D1234567' }`.
         * Assert one new audit_log row exists with `action='VIEW_PII'`, `resource_type='carrier_driver'`, `resource_id=driverId`, `field_name='cdl_number'`, `user_id=managerUserId`, `tenant_id=tenantAId`.
       - Case C — DRIVER denied:
         * Call `decryptCarrierDriverCDL` with `requestingUserRole: 'DRIVER'`.
         * Assert `{ ok: false, status: 403 }`.
         * Assert a NEW audit_log row exists with `action='VIEW_PII_DENIED'`, same resource fields, `user_id=driverUserId`.
       - Tests set `KMS_KEY_v1`, `CURRENT_KMS_KEY_ID=v1`, `VALID_KMS_KEY_IDS=v1` in `beforeAll`.

    Constraints:
    - The encrypted-fields default-null sanitizer in `listCarrierDrivers` / `getCarrierDriver` is the ONLY place we strip sensitive fields. Do not push redaction into multiple call sites.
    - `decryptCarrierDriverCDL` is the ONLY exported function that can return plaintext.
    - Never echo `cdl_number` in any error or log. Use only the resourceId / driverId in error messages.
  </action>
  <verify>
    From `apps/web/`:
    1. `npx tsc --noEmit` — passes.
    2. `npm run audit:raw-prisma` — exits 0.
    3. `npx vitest run tests/security/` — all 3 files pass (field-crypto.test.ts + audit-log-isolation.test.ts + carrier-driver-pii.test.ts).
    4. `npx vitest run tests/isolation/` — all 5 dropdown regression tests still pass, all 17 existing isolation tests still pass.
    5. `npm test` — full suite green.
    6. `npm run build` — succeeds.
    7. Grep verification:
       - `grep -rn "logger.*cdlNumber\|console.*cdlNumber\|logger.*cdl_number\|console.*cdl_number" apps/web/src` — zero hits.
       - `grep -rn "cdlNumber" apps/web/src/lib/carrier/fleet-drivers.ts` — only legitimate references (data shaping, encryption call, redaction). No log statements.
    8. The 1 backfilled row from Task 2: re-read via `getCarrierDriver` → returns `cdlNumber: null` + `cdlNumberLast4` matching the original. Decrypt via `decryptCarrierDriverCDL` as a MANAGER user → returns the original plaintext.
  </verify>
  <done>
    - `createCarrierDriver` / `updateCarrierDriver` dual-write plaintext + encrypted columns + last4.
    - `listCarrierDrivers` / `getCarrierDriver` redact plaintext + ciphertext, return only last4.
    - `decryptCarrierDriverCDL` enforces MANAGER/OWNER + writes VIEW_PII or VIEW_PII_DENIED audit row.
    - All security tests pass. All previous isolation/dropdown tests still pass.
    - `npm run build`, `tsc --noEmit`, `prisma validate`, `prisma generate`, `audit:raw-prisma` all green.
    - cdl_number plaintext column still exists (PR2-only drop).
    - User.licenseNumber not modified.
  </done>
</task>

</tasks>

<verification>
End-to-end gates that must all pass before the PR is considered shippable:

1. `cd apps/web && npx prisma validate` — green.
2. `cd apps/web && npx prisma generate` — green.
3. `cd apps/web && npx tsc --noEmit` — green.
4. `cd apps/web && npm run audit:raw-prisma` — exits 0 (the audit-log path uses `prisma.auditLog`; the backfill path is allowlisted).
5. `cd apps/web && npx vitest run tests/security/` — all crypto/audit-log/repository tests pass.
6. `cd apps/web && npx vitest run tests/isolation/` — all 5 dropdown regression tests + all 17 existing isolation tests pass.
7. `cd apps/web && npm test` — full suite green.
8. `cd apps/web && npm run build` — green.
9. DB inspection: `carrier_drivers` has all 5 new nullable columns; `cdl_number` plaintext column still exists with original data. `audit_log` table exists with RLS forced, both policies, three indexes, action check constraint, REVOKE UPDATE/DELETE.
10. The 1 backfilled row decrypts back to its original cdl_number value.
11. Grep checks for plaintext logging return zero hits.
12. No real KMS_KEY value committed to the repo (search `KMS_KEY_v1=` outside of .env.example and runbooks → only the placeholder string `replace-with-32-byte-hex-string` shows up).
</verification>

<success_criteria>
- Infrastructure exists for AES-256-GCM field encryption + an append-only tenant-scoped audit_log table, both with first-class tests.
- carrier_drivers.cdl_number is dual-written (plaintext + encrypted) on create/update; default reads expose only last4.
- decryptCarrierDriverCDL is the only path to plaintext; it requires MANAGER/OWNER and writes a VIEW_PII (or VIEW_PII_DENIED) audit row every time.
- Out-of-scope items strictly preserved: `cdl_number` plaintext column NOT dropped; `User.licenseNumber` not touched; no other PII field is encrypted in this PR.
- 7-day verification window + drop-plaintext steps are captured in `docs/runbooks/pii-encryption-pr2.md` for the follow-up PR.
- The quick-328 scanner + dropdown regression coverage still passes unmodified.
</success_criteria>

<output>
After completion, create `.planning/quick/329-add-field-level-aes-256-gcm-encryption-i/329-SUMMARY.md` summarizing:
- What was built (crypto primitives, audit_log table, encrypted columns, dual-write, decrypt-with-audit path).
- Schema deltas and the exact migration filename.
- Which env vars were added (with placeholder values; never the real key).
- Test counts: 3 new security test files, total cases passed.
- The single row that was backfilled (id + tenant only; never the cdl_number).
- Explicit confirmation that PR2 (drop plaintext column) was NOT done in this PR.
- Any deviations / auto-fixes encountered during execution.
</output>
