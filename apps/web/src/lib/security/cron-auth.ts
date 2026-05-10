import { NextRequest } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * Validates the CRON_SECRET bearer token using timing-safe comparison.
 *
 * This prevents timing attacks where an attacker could measure response times
 * to brute-force the secret character by character. Standard string comparison
 * (`===` or `!==`) returns early on first mismatch, leaking timing information.
 *
 * @param request - The incoming NextRequest
 * @returns true if authorized, false otherwise
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail fast if CRON_SECRET is not configured
  if (!cronSecret) {
    logger.error('[CRON] CRON_SECRET environment variable is not configured');
    return false;
  }

  // No auth header provided
  if (!authHeader) {
    return false;
  }

  const expectedAuth = `Bearer ${cronSecret}`;

  // Both strings must be same length for timingSafeEqual
  // If lengths differ, we still need to compare in constant time
  // to avoid leaking length information
  try {
    // Hash both values to ensure equal length comparison
    // This also prevents length-based timing attacks
    const providedHash = createHash('sha256').update(authHeader).digest();
    const expectedHash = createHash('sha256').update(expectedAuth).digest();

    return timingSafeEqual(providedHash, expectedHash);
  } catch {
    // timingSafeEqual throws if buffers have different lengths (shouldn't happen with hashes)
    return false;
  }
}

/**
 * Returns a 401 Unauthorized response for cron endpoints.
 */
export function cronUnauthorizedResponse(): Response {
  return new Response('Unauthorized', { status: 401 });
}
