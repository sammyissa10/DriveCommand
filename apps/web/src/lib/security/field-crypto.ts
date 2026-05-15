/**
 * Field-level AES-256-GCM encryption wrapper.
 *
 * Uses node:crypto. Algorithm: aes-256-gcm. IV: 12 random bytes per call.
 * Auth tag: 16 bytes.
 *
 * Never logs the plaintext, key, or any sensitive value.
 * Throws on decryption failure — no silent fallback.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.1.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getKeyById } from './key-registry';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptedField {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyId: string;
}

/**
 * Encrypts a plaintext string under the given keyId.
 * Returns the encrypted shape with a fresh random IV per call.
 */
export function encryptField(plaintext: string, keyId: string): EncryptedField {
  let key: Buffer;
  try {
    key = getKeyById(keyId);
  } catch (err) {
    throw new Error(`encryption failed: ${(err as Error).message}`);
  }

  const iv = randomBytes(IV_BYTES);

  let cipher;
  try {
    cipher = createCipheriv(ALGORITHM, key, iv);
  } catch {
    throw new Error('encryption failed: cipher init error');
  }

  const chunks: Buffer[] = [];
  chunks.push(cipher.update(plaintext, 'utf8'));
  chunks.push(cipher.final());
  const ciphertext = Buffer.concat(chunks);

  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_BYTES) {
    throw new Error('encryption failed: unexpected auth tag length');
  }

  return { ciphertext, iv, tag, keyId };
}

/**
 * Decrypts an EncryptedField back to its original string.
 * Throws if the key is unknown, the auth tag fails, or any other error occurs.
 */
export function decryptField(input: EncryptedField): string {
  let key: Buffer;
  try {
    key = getKeyById(input.keyId);
  } catch (err) {
    throw new Error(`decryption failed: ${(err as Error).message}`);
  }

  let decipher;
  try {
    decipher = createDecipheriv(ALGORITHM, key, input.iv);
    decipher.setAuthTag(input.tag);
  } catch {
    throw new Error('decryption failed: decipher init error');
  }

  try {
    const chunks: Buffer[] = [];
    chunks.push(decipher.update(input.ciphertext));
    chunks.push(decipher.final());
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    throw new Error('decryption failed: authentication tag mismatch or corrupted data');
  }
}
