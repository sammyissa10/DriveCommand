/**
 * Cookie-based session management using AES-256-GCM encryption.
 *
 * Uses the Web Crypto API (available in both Edge Runtime and Node.js environments)
 * so the same encryption/decryption works in both middleware and server components.
 *
 * Token format: base64url(iv) : base64url(authTag) : base64url(ciphertext)
 */

import { cache } from 'react';
import { cookies } from 'next/headers';

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  firstName?: string;
  lastName?: string;
  isSystemAdmin?: boolean;
}

const SESSION_COOKIE_NAME = 'session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// ============================================================
// Web Crypto helpers (work in Edge Runtime and Node.js >= 18)
// ============================================================

async function getWebCryptoKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET environment variable must be set and at least 32 characters long');
  }
  const secretBytes = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', secretBytes);

  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const bytes = atob(padded).split('').map((c) => c.charCodeAt(0));
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

/**
 * Encrypt a session payload using AES-256-GCM (Web Crypto API).
 * Compatible with both Edge Runtime (middleware) and Node.js (server components).
 */
export async function encrypt(payload: SessionData): Promise<string> {
  const key = await getWebCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const json = JSON.stringify(payload);
  const encoded = new TextEncoder().encode(json);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // AES-GCM in Web Crypto appends the 16-byte auth tag to the ciphertext
  const ciphertextBytes = new Uint8Array(ciphertext);
  const data = ciphertextBytes.slice(0, -16);
  const tag = ciphertextBytes.slice(-16);

  return [
    base64urlEncode(iv.buffer),
    base64urlEncode(tag.buffer),
    base64urlEncode(data.buffer),
  ].join(':');
}

/**
 * Decrypt a session token. Returns null on any failure (tampered, invalid, etc.)
 * Compatible with both Edge Runtime (middleware) and Node.js (server components).
 */
export async function decrypt(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null;

  try {
    const key = await getWebCryptoKey();
    const parts = token.split(':');
    if (parts.length !== 3) return null;

    const [ivB64, authTagB64, encryptedB64] = parts;
    const iv = base64urlDecode(ivB64);
    const authTag = base64urlDecode(authTagB64);
    const data = base64urlDecode(encryptedB64);

    // Reconstruct full ciphertext (data + authTag for Web Crypto AES-GCM)
    const combined = new Uint8Array(data.length + authTag.length);
    combined.set(data);
    combined.set(authTag, data.length);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      combined
    );

    const json = new TextDecoder().decode(decrypted);
    return JSON.parse(json) as SessionData;
  } catch {
    return null;
  }
}

// ============================================================
// Server Component helpers (uses next/headers cookies())
// ============================================================

/**
 * Read and decrypt the session cookie from next/headers.
 * For use in Server Components, Server Actions, and API Routes (not middleware).
 *
 * Wrapped with React.cache() so the AES-256-GCM decryption runs at most once
 * per request — all callers within the same request share the same result.
 */
export const getSession = cache(async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return decrypt(token);
});

/**
 * Encrypt and set the session cookie.
 */
export async function setSession(data: SessionData): Promise<void> {
  const token = await encrypt(data);
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
