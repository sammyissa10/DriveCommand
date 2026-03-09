/**
 * Admin session management using AES-256-GCM encryption.
 *
 * Independent from the tenant session system — uses ADMIN_SECRET_KEY env var.
 * Gates access to /admin/* portal routes for DriveCommand team members.
 *
 * Token format: base64url(iv) : base64url(authTag) : base64url(ciphertext)
 * Cookie expiry: 8 hours
 */

import { cache } from 'react';
import { cookies } from 'next/headers';

export interface AdminSessionData {
  loggedInAt: number; // Unix timestamp (ms)
}

export const ADMIN_SESSION_COOKIE = 'admin_session';
const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours in seconds
const ADMIN_SESSION_MAX_AGE_MS = ADMIN_SESSION_MAX_AGE * 1000; // for JS Date comparison

// ============================================================
// Web Crypto helpers (work in Edge Runtime and Node.js >= 18)
// ============================================================

async function getAdminCryptoKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SECRET_KEY environment variable must be set and at least 32 characters long');
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
 * Encrypt an admin session payload using AES-256-GCM (Web Crypto API).
 * Compatible with both Edge Runtime (middleware) and Node.js (server components).
 */
export async function encryptAdminSession(payload: AdminSessionData): Promise<string> {
  const key = await getAdminCryptoKey();
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
 * Decrypt an admin session token. Returns null on any failure (tampered, invalid, etc.)
 * Compatible with both Edge Runtime (middleware) and Node.js (server components).
 */
export async function decryptAdminSession(token: string | undefined): Promise<AdminSessionData | null> {
  if (!token) return null;

  try {
    const key = await getAdminCryptoKey();
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
    return JSON.parse(json) as AdminSessionData;
  } catch {
    return null;
  }
}

// ============================================================
// Server Component helpers (uses next/headers cookies())
// ============================================================

/**
 * Read and decrypt the admin session cookie from next/headers.
 * For use in Server Components, Server Actions, and API Routes (not middleware).
 *
 * Wrapped with React.cache() so the AES-256-GCM decryption runs at most once
 * per request — all callers within the same request share the same result.
 *
 * Also validates that the session is not older than 8 hours (defense-in-depth
 * beyond the cookie maxAge — covers edge cases like time drift).
 */
export const getAdminSession = cache(async function getAdminSession(): Promise<AdminSessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const data = await decryptAdminSession(token);

  if (!data) return null;

  // Defense-in-depth: validate age even if cookie hasn't expired yet
  const ageMs = Date.now() - data.loggedInAt;
  if (ageMs > ADMIN_SESSION_MAX_AGE_MS) return null;

  return data;
});

/**
 * Encrypt and set the admin session cookie.
 */
export async function setAdminSession(): Promise<void> {
  const payload: AdminSessionData = { loggedInAt: Date.now() };
  const token = await encryptAdminSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: '/',
  });
}

/**
 * Clear the admin session cookie (logout).
 */
export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}
