/**
 * Key Registry — field-level PII encryption key management.
 *
 * Reads key material from process.env:
 *   CURRENT_KMS_KEY_ID      — the key ID to use for new encryptions (e.g. "v1")
 *   VALID_KMS_KEY_IDS       — comma-separated list of all valid key IDs for decryption
 *                             (default: CURRENT_KMS_KEY_ID)
 *   KMS_KEY_<keyId>         — 64-char hex string (32 bytes) per registered key
 *
 * Never logs key material. Error messages reference only the keyId.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.2.
 */

/**
 * Returns the current active key ID (used for all new encryptions).
 * Throws if CURRENT_KMS_KEY_ID is not set.
 */
export function getCurrentKeyId(): string {
  const keyId = process.env.CURRENT_KMS_KEY_ID;
  if (!keyId) {
    throw new Error('CURRENT_KMS_KEY_ID env var is not set');
  }
  return keyId;
}

/**
 * Returns the set of valid key IDs allowed for decryption.
 * Parsed from VALID_KMS_KEY_IDS (comma-separated).
 * Falls back to [CURRENT_KMS_KEY_ID] if VALID_KMS_KEY_IDS is unset.
 */
function getValidKeyIds(): Set<string> {
  const raw = process.env.VALID_KMS_KEY_IDS;
  if (raw) {
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  const current = process.env.CURRENT_KMS_KEY_ID;
  if (current) return new Set([current]);
  return new Set();
}

/**
 * Returns the key Buffer for the given keyId.
 *
 * Throws if:
 *   - keyId is not in VALID_KMS_KEY_IDS
 *   - KMS_KEY_<keyId> env var is missing or not valid 32-byte hex
 */
export function getKeyById(keyId: string): Buffer {
  const validIds = getValidKeyIds();
  if (!validIds.has(keyId)) {
    throw new Error(`Key ID "${keyId}" is not in VALID_KMS_KEY_IDS`);
  }

  const hex = process.env[`KMS_KEY_${keyId}`];
  if (!hex) {
    throw new Error(`KMS_KEY_${keyId} env var is not set`);
  }

  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`KMS_KEY_${keyId} must be exactly 64 hex characters (32 bytes)`);
  }

  return Buffer.from(hex, 'hex');
}

/**
 * Returns the current write key (keyId + key Buffer) for new encryptions.
 */
export function getCurrentKey(): { keyId: string; key: Buffer } {
  const keyId = getCurrentKeyId();
  const key = getKeyById(keyId);
  return { keyId, key };
}
