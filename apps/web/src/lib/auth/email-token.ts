import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getKey(): Buffer {
  const secret = process.env.EMAIL_TOKEN_SECRET;
  if (!secret || secret.length !== 64) {
    throw new Error('EMAIL_TOKEN_SECRET must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(secret, 'hex');
}

export interface EmailTokenPayload {
  tenantId: string;
  purpose: 'email-confirm';
  exp: number;
}

export function generateEmailToken(tenantId: string): string {
  const payload: EmailTokenPayload = {
    tenantId,
    purpose: 'email-confirm',
    exp: Date.now() + TTL_MS,
  };
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: iv(12) + authTag(16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64url');
}

export type VerifyResult =
  | { ok: true; payload: EmailTokenPayload }
  | { ok: false; reason: 'expired' | 'invalid' };

export function verifyEmailToken(token: string): VerifyResult {
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < IV_LEN + TAG_LEN + 1) return { ok: false, reason: 'invalid' };
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const key = getKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8')) as EmailTokenPayload;
    if (payload.exp < Date.now()) return { ok: false, reason: 'expired' };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
