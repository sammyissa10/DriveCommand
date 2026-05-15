/**
 * field-crypto.ts unit tests.
 *
 * Five cases:
 * 1. Round-trip: encrypt then decrypt preserves plaintext 'D1234567'.
 * 2. Round-trip with hyphens: encrypt then decrypt preserves '123-45-6789'.
 * 3. No-plaintext-in-ciphertext: ciphertext buffer does not contain the plaintext
 *    in any encoding (binary, utf-8, hex, base64).
 * 4. Tamper detection: flip one byte in ciphertext → decryptField throws.
 * 5. Unknown keyId: getKeyById('does-not-exist') throws; decryptField with unknown keyId throws.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { encryptField, decryptField } from '../../src/lib/security/field-crypto';
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
});
