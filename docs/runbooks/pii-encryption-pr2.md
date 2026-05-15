# PII Encryption PR2 Plan — Drop Plaintext Column

## Overview

PR2 is the follow-up to PR1 (quick-329). It completes the field-level encryption
migration by dropping the `cdl_number` plaintext column from `carrier_drivers`.

**PR1 must be deployed and verified before PR2 is started.**

---

## Minimum verification window

**7 days** in production with zero decrypt-failure errors in Sentry after PR1 deploys.

---

## Pre-PR2 smoke tests (run against production)

Before starting PR2, verify all of the following:

1. **Create driver with CDL**: Create a new carrier driver with a CDL number via the UI.
   Confirm that `cdl_number_last4` is populated correctly in the driver list.

2. **Default read redacts plaintext**: Fetch the driver detail. Confirm `cdlNumber` is `null`
   and `cdlNumberLast4` shows the last 4 characters.

3. **MANAGER decrypt succeeds**: Call `decryptCarrierDriverCDL` as a MANAGER user.
   Confirm it returns the original CDL number, and a `VIEW_PII` row appears in `audit_log`.

4. **DRIVER decrypt is denied**: Call `decryptCarrierDriverCDL` as a DRIVER user.
   Confirm `{ ok: false, status: 403 }` and a `VIEW_PII_DENIED` audit row.

5. **No unencrypted rows**: Run the following SQL:
   ```sql
   SELECT COUNT(*) FROM carrier_drivers
   WHERE cdl_number IS NOT NULL AND cdl_number_ciphertext IS NULL;
   ```
   Expect: `0`

---

## PR2 migration DDL

```sql
-- Drop the plaintext column (dual-write window complete)
ALTER TABLE carrier_drivers DROP COLUMN cdl_number;
```

Add this to a new migration file:
`apps/web/prisma/migrations/YYYYMMDD_drop_cdl_plaintext/migration.sql`

Also remove `cdlNumber` from `apps/web/prisma/schema.prisma` (the `CarrierDriver` model field).

---

## PR2 code changes

1. Remove `cdlNumber` field from `CarrierDriver` model in `schema.prisma`.
2. In `src/lib/carrier/fleet-drivers.ts`:
   - Remove `cdlNumber` from the `CarrierDriverCreateInput` and `CarrierDriverUpdateInput` types
     once the plaintext column is dropped.
   - Remove the plaintext write from `buildEncryptedCdl` helper and from `createCarrierDriver`
     / `updateCarrierDriver` data payloads.
   - The `decryptCarrierDriverCDL` function remains unchanged — it reads from ciphertext.
3. Run `npx prisma generate` and `npx tsc --noEmit`.
4. Run `npm run build` and `npm test`.

---

## Rollback plan

If PR2 must be rolled back after applying the migration:

1. Re-add the column nullable (no data recovery from ciphertext is possible):
   ```sql
   ALTER TABLE carrier_drivers ADD COLUMN cdl_number TEXT;
   ```
   The column will be NULL for all rows. **Do NOT attempt to re-derive plaintext from
   ciphertext columns** — that would require a non-trivial migration script with full
   key access, and it is safer to restore from a database snapshot if the original
   values must be recovered.

2. Revert the `schema.prisma` change and re-run `prisma generate`.

3. Revert the `fleet-drivers.ts` changes to restore dual-write behavior.

---

## Related docs

- `docs/runbooks/encryption-keys.md` — key generation, rotation procedure
- `docs/runbooks/pii-encryption.md` — PR1 scope, dual-write window details
