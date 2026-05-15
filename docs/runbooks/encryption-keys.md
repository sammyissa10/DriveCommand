# Encryption Key Management Runbook (quick-329)

## Overview

Field-level PII encryption uses AES-256-GCM with versioned keys. Each key is a 32-byte
random value stored as a 64-character hex string in environment variables. The key ID
(e.g. `v1`) is stored alongside the encrypted data so old rows can still be decrypted
after a key rotation.

**Spec reference:** `docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md` Section 4.2

---

## Generating a key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This outputs a 64-character hex string (32 bytes). Store it in the appropriate
environment location. **Never commit the real value to git.**

---

## Setting up for local development

1. Copy `.env.example` to `.env.local` (gitignored).
2. Generate a key for `v1`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Set in `.env.local`:
   ```
   KMS_KEY_v1=<your-64-char-hex>
   CURRENT_KMS_KEY_ID=v1
   VALID_KMS_KEY_IDS=v1
   ```

---

## Setting up for Vercel (preview + production)

In the Vercel dashboard: **Settings → Environment Variables**

| Variable | Value | Environment |
|---|---|---|
| `KMS_KEY_v1` | `<64-char hex>` | Preview + Production |
| `CURRENT_KMS_KEY_ID` | `v1` | Preview + Production |
| `VALID_KMS_KEY_IDS` | `v1` | Preview + Production |

**Use a different key for Preview and Production.** They should never share key material.

---

## Key rotation procedure (planned retirement)

Follow this procedure when rotating keys proactively (scheduled rotation, not compromise):

### Step 1: Generate the new key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Call the new key `v2` (increment the version number).

### Step 2: Add the new key to the environment

Add `KMS_KEY_v2=<new-hex>` to all environments (`.env.local`, Vercel Preview, Vercel Production).

**Do NOT yet change `CURRENT_KMS_KEY_ID` or `VALID_KMS_KEY_IDS`.**

### Step 3: Expand VALID_KMS_KEY_IDS to include both keys

Change `VALID_KMS_KEY_IDS` from `v1` to `v1,v2` in all environments.

At this point the app can decrypt rows encrypted with either `v1` or `v2`, but still
writes new rows with `v1`.

### Step 4: Flip CURRENT_KMS_KEY_ID to v2

Change `CURRENT_KMS_KEY_ID=v2` in all environments.

All new encrypt operations now use `v2`. Old rows (encrypted with `v1`) still decrypt
because `v1` is in `VALID_KMS_KEY_IDS`.

### Step 5: Re-encrypt existing rows (background)

Run the re-encryption script (future PR) to update all rows that still reference
`cdl_number_key_id = 'v1'` to use `v2`. This can be done at low traffic times and
in batches.

### Step 6: Remove v1 from VALID_KMS_KEY_IDS

Only after **zero rows** reference `key_id = 'v1'` in production:

```sql
SELECT COUNT(*) FROM carrier_drivers WHERE cdl_number_key_id = 'v1';
-- Expect: 0
```

Remove `v1` from `VALID_KMS_KEY_IDS` (change to `v2` only).
Remove the `KMS_KEY_v1` env var.

---

## Emergency rotation (suspected key compromise)

If a key is believed to be compromised, move faster:

1. **Immediately** generate `v2` and add to env.
2. **Immediately** set `CURRENT_KMS_KEY_ID=v2` and `VALID_KMS_KEY_IDS=v1,v2`.
3. Deploy the updated env vars (Vercel redeploys automatically on env change).
4. Schedule an emergency re-encryption of all rows that reference `v1`.
5. After re-encryption is complete, remove `v1` from `VALID_KMS_KEY_IDS` and delete `KMS_KEY_v1`.
6. **Do NOT attempt to "invalidate" v1 by deleting it before re-encryption** — this
   will cause decrypt failures for existing ciphertext rows.

---

## Verification

After setting up or rotating keys, verify the key registry resolves correctly:

```bash
node -e "
  require('dotenv').config({ path: '.env.local' });
  const { getCurrentKey } = require('./src/lib/security/key-registry');
  const { keyId } = getCurrentKey();
  console.log('Current key ID:', keyId);
  console.log('Key resolved successfully');
"
```

---

## Related docs

- `docs/runbooks/pii-encryption.md` — what is encrypted, the dual-write window
- `docs/runbooks/pii-encryption-pr2.md` — PR2 plan (drop plaintext column)
