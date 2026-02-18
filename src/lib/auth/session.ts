/**
 * Cookie-based session management using AES-256-GCM encryption.
 * No external JWT library required — uses Node.js built-in crypto.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { UserRole } from './roles';

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  firstName?: string;
  lastName?: string;
}

const SESSION_COOKIE_NAME = 'session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Derive a 32-byte key from the AUTH_SECRET env var.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET environment variable must be set and at least 32 characters long');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a session payload using AES-256-GCM.
 * Returns a base64url-encoded string: iv:authTag:ciphertext
 */
export function encrypt(payload: SessionData): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Encode all parts as base64url and join with ':'
  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

/**
 * Decrypt a session token. Returns null on any failure (expired, tampered, invalid).
 */
export function decrypt(token: string | undefined): SessionData | null {
  if (!token) return null;

  try {
    const key = getDerivedKey();
    const parts = token.split(':');
    if (parts.length !== 3) return null;

    const [ivB64, authTagB64, encryptedB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');
    const encrypted = Buffer.from(encryptedB64, 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Read and decrypt the session cookie from next/headers.
 * For use in Server Components, Server Actions, and API Routes (not middleware).
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return decrypt(token);
}

/**
 * Encrypt and set the session cookie.
 */
export async function setSession(data: SessionData): Promise<void> {
  const token = encrypt(data);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
