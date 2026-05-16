/**
 * field-crypto.ts unit tests — quick-347 extended coverage.
 *
 * Ten cases:
 *  1. Round-trip: encrypt then decrypt preserves 'D1234567'.
 *  2. Round-trip with hyphens: encrypt then decrypt preserves '123-45-6789'.
 *  3. No-plaintext-in-ciphertext: ciphertext buffer does not contain the plaintext
 *     in any encoding (binary, utf-8, hex, base64).
 *  4. Tamper detection: flip one byte in ciphertext → decryptField throws.
 *  5. Unknown keyId: getKeyById('does-not-exist') throws; decryptField with unknown keyId throws.
 *  6. Corrupted auth tag: flip one tag byte → decryptField throws.
 *  7. last4('123-45-6789') → '6789'
 *  8. last4('') → '****'
 *  9. last4('abc') → '****' (3 chars < 4)
 * 10. Two encrypts of same plaintext produce different ciphertexts (IV randomness).
 * 11. encryptField with no keyId argument uses CURRENT_KMS_KEY_ID.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { encryptField, decryptField, last4 } from '../../src/lib/security/field-crypto';
import { getKeyById } from '../../src/lib/security/key-registry';

const TEST_KEY_HEX = 'a'.repeat(64); // 32 bytes of 0xaa — deterministic, test-only
const TEST_KEY_ID = 'v1';

beforeAll(() => {
  process.env[`KMS_KEY_${TEST_KEY_ID}`] = TEST_KEY_HEX;
  process.env.CURRENT_KMS_KEY_ID = TEST_KEY_ID;
  process.env.VALID_KMS_KEY_IDS = TEST_KEY_ID;
});

describe('encryptField / decryptField', () => {
  it('round-trip preserves "D1234567"', () => {
    const plaintext = 'D1234567';
    const encrypted = encryptField(plaintext, TEST_KEY_ID);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trip preserves "123-45-6789"', () => {
    const plaintext = '123-45-6789';
    const encrypted = encryptField(plaintext, TEST_KEY_ID);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('ciphertext does not contain plaintext in any encoding', () => {
    const plaintext = 'D1234567';
    const { ciphertext } = encryptField(plaintext, TEST_KEY_ID);

    // Check binary representation
    expect(ciphertext.toString('binary').includes(plaintext)).toBe(false);
    // Check utf-8
    expect(ciphertext.toString('utf-8').includes(plaintext)).toBe(false);
    // Check hex
    expect(ciphertext.toString('hex').includes(Buffer.from(plaintext, 'utf8').toString('hex'))).toBe(false);
    // Check base64
    expect(ciphertext.toString('base64').includes(plaintext)).toBe(false);
  });

  it('tamper detection: flipping a ciphertext byte causes decryptField to throw', () => {
    const plaintext = 'D1234567';
    const encrypted = encryptField(plaintext, TEST_KEY_ID);

    // Flip the first byte of ciphertext
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[0] = tampered[0] ^ 0xff;

    expect(() => decryptField({ ...encrypted, ciphertext: tampered })).toThrow();
  });

  it('unknown keyId: getKeyById throws; decryptField with unknown keyId throws', () => {
    expect(() => getKeyById('does-not-exist')).toThrow();

    const encrypted = encryptField('D1234567', TEST_KEY_ID);
    expect(() => decryptField({ ...encrypted, keyId: 'does-not-exist' })).toThrow();
  });

  it('corrupted auth tag: flipping a tag byte causes decryptField to throw', () => {
    const plaintext = 'D1234567';
    const encrypted = encryptField(plaintext, TEST_KEY_ID);

    const tamperedTag = Buffer.from(encrypted.tag);
    tamperedTag[0] = tamperedTag[0] ^ 0xff;

    expect(() => decryptField({ ...encrypted, tag: tamperedTag })).toThrow();
  });

  it('two encrypts of same plaintext produce different ciphertexts (IV randomness)', () => {
    const plaintext = '123-45-6789';
    const enc1 = encryptField(plaintext, TEST_KEY_ID);
    const enc2 = encryptField(plaintext, TEST_KEY_ID);

    // IVs must differ
    expect(enc1.iv.equals(enc2.iv)).toBe(false);
    // Ciphertexts must differ (because IV differs)
    expect(enc1.ciphertext.equals(enc2.ciphertext)).toBe(false);
    // Both must decrypt to the same plaintext
    expect(decryptField(enc1)).toBe(plaintext);
    expect(decryptField(enc2)).toBe(plaintext);
  });

  it('encryptField with no keyId argument uses CURRENT_KMS_KEY_ID', () => {
    const plaintext = 'D1234567';
    // No keyId argument — should default to CURRENT_KMS_KEY_ID = TEST_KEY_ID
    const encrypted = encryptField(plaintext);
    expect(encrypted.keyId).toBe(TEST_KEY_ID);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});

describe('last4', () => {
  it('returns last 4 chars of "123-45-6789" → "6789"', () => {
    expect(last4('123-45-6789')).toBe('6789');
  });

  it('returns "****" for empty string', () => {
    expect(last4('')).toBe('****');
  });

  it('returns "****" for 3-char input', () => {
    expect(last4('abc')).toBe('****');
  });

  it('returns last 4 chars for exactly 4-char input', () => {
    expect(last4('1990')).toBe('1990');
  });

  it('returns last 4 chars for license number "D1234567" → "4567"', () => {
    expect(last4('D1234567')).toBe('4567');
  });
});
