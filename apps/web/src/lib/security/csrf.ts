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
 * Validates the Origin header on state-changing requests to prevent CSRF.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 * Requests without an Origin header on mutation requests are rejected
 * (modern browsers always send Origin on cross-origin requests; same-origin
 * requests from the browser also include Origin or Referer).
 *
 * @returns true if the request should be allowed, false if it should be blocked
 */
export function validateOrigin(request: NextRequest): boolean {
  // Safe methods never mutate state — no CSRF risk
  if (SAFE_METHODS.includes(request.method)) {
    return true;
  }

  const origin = request.headers.get('origin');

  // No Origin header on a mutation request — block it
  if (!origin) {
    return false;
  }

  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(origin);
}
