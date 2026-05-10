import { NextRequest } from 'next/server';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Returns allowed origins for CSRF validation.
 * Reads from environment variables at request time (not module load time)
 * to support serverless functions.
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = ['http://localhost:3000'];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    origins.push(appUrl);
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    // VERCEL_URL does not include protocol — add https://
    origins.push(`https://${vercelUrl}`);
  }

  return origins;
}

/**
 * Extracts the origin from a Referer URL.
 * Returns null if the Referer is missing or malformed.
 */
function extractOriginFromReferer(referer: string | null): string | null {
  if (!referer) return null;

  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Validates the Origin (or Referer) header on state-changing requests to prevent CSRF.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 *
 * For mutation requests, checks:
 * 1. Origin header (preferred, sent by all modern browsers on cross-origin requests)
 * 2. Referer header (fallback per OWASP guidance, for browsers/clients that don't send Origin)
 *
 * Requests without either header on mutation requests are rejected.
 *
 * @returns true if the request should be allowed, false if it should be blocked
 */
export function validateOrigin(request: NextRequest): boolean {
  // Safe methods never mutate state — no CSRF risk
  if (SAFE_METHODS.includes(request.method)) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();

  // Check Origin header first (preferred)
  const origin = request.headers.get('origin');
  if (origin) {
    return allowedOrigins.includes(origin);
  }

  // Fall back to Referer header per OWASP guidance
  // Some clients (older browsers, privacy extensions) may strip Origin but keep Referer
  const referer = request.headers.get('referer');
  const refererOrigin = extractOriginFromReferer(referer);
  if (refererOrigin) {
    return allowedOrigins.includes(refererOrigin);
  }

  // No Origin or Referer header on a mutation request — block it
  return false;
}
