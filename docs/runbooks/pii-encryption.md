# PII Encryption Runbook (quick-329 — PR1)

## What is encrypted in PR1

| Table | Column | Encrypted shape |
|---|---|---|
| `carrier_drivers` | `cdl_number` (plaintext) | `cdl_number_ciphertext`, `cdl_number_iv`, `cdl_number_tag`, `cdl_number_key_id`, `cdl_number_last4` |

**Out of scope for PR1:**
- `User.licenseNumber` — not touched.
- SSN, DOB, passport, EIN, bank account — future PRs.

**Spec reference:** `docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md` Section 4

---

## Dual-write window

PR1 implements a **dual-write** pattern:

- `createCarrierDriver` / `updateCarrierDriver` write **both** the plaintext `cdl_number`
  column AND the 5 encrypted columns (`*_ciphertext`, `*_iv`, `*_tag`, `*_key_id`, `*_last4`).
- Default reads (`listCarrierDrivers`, `getCarrierDriver`) return **only** `cdl_number_last4`.
  The plaintext `cdl_number` and all raw ciphertext columns are stripped from the response.
- The only path to full plaintext is `decryptCarrierDriverCDL`, which requires
  MANAGER or OWNER role and writes a `VIEW_PII` audit log entry.

This dual-write window exists so PR2 can safely drop the plaintext column after a
7-day verification period without any risk of data loss.

---

## Backfill

A one-time Node script (`scripts/backfill/encrypt-carrier-driver-cdl.ts`) was run after
the migration to populate the encrypted shape for all rows where `cdl_number IS NOT NULL`.
The script verifies decrypt-equals-plaintext inside the same transaction — if any row
fails verification, the entire transaction rolls back.

Run via: `npm run backfill:carrier-driver-cdl` (idempotent — safe to re-run).

---

## Default read behavior

All list and detail queries return:

```json
{
  "cdlNumber": null,
  "cdlNumberLast4": "4567",
  "cdlNumberCiphertext": null,
  "cdlNumberIv": null,
  "cdlNumberTag": null,
  "cdlNumberKeyId": null
}
```

The `cdlNumber` field is explicitly set to `null` in the response. `cdlNumberLast4`
is the only PII-adjacent value returned by default.

---

## Plaintext access

Only `decryptCarrierDriverCDL` in `src/lib/carrier/fleet-drivers.ts` returns plaintext.

Rules:
- Caller must have role `OWNER` or `MANAGER`. Any other role gets `{ ok: false, status: 403 }`.
- A `VIEW_PII` or `VIEW_PII_DENIED` audit log entry is written on every call.
- Treat not-found as denied (`VIEW_PII_DENIED`), not 404, to avoid existence oracle attacks.

---

## Audit log

Every call to `decryptCarrierDriverCDL` writes to `audit_log`:

| Field | Value |
|---|---|
| `action` | `VIEW_PII` (success) or `VIEW_PII_DENIED` (denied/not-found) |
| `resource_type` | `carrier_driver` |
| `resource_id` | the driver UUID |
| `field_name` | `cdl_number` |
| `tenant_id` | the org's tenant ID |
| `user_id` | the requesting user's ID |

The `audit_log` table has FORCE RLS and REVOKE UPDATE/DELETE — it is append-only.

---

## When is PR2 safe to ship?

PR2 drops the `cdl_number` plaintext column. It is safe to ship when **all** of the
following conditions are met:

1. PR1 has been in production for **at least 7 days** with zero decrypt-failure errors
   in Sentry.
2. The following smoke tests pass against production:
   - Create a new carrier driver with a CDL number → verify `cdl_number_last4` is correct.
   - Default read returns `cdlNumber: null` and correct `cdlNumberLast4`.
   - MANAGER decrypt call returns the original CDL number.
   - DRIVER decrypt call returns `{ ok: false, status: 403 }` with a `VIEW_PII_DENIED` audit row.
3. `SELECT COUNT(*) FROM carrier_drivers WHERE cdl_number IS NOT NULL AND cdl_number_ciphertext IS NULL;`
   returns 0.

See `docs/runbooks/pii-encryption-pr2.md` for the full PR2 plan.

---

## Related docs

- `docs/runbooks/encryption-keys.md` — key generation, rotation procedure
- `docs/runbooks/pii-encryption-pr2.md` — PR2 plan (drop plaintext column)
