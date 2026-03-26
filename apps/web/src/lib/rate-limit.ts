import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Only instantiate Redis if env vars are present (skips in local dev)
function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = createRedis();

/**
 * Auth limiter: 5 requests per 15 minutes per IP.
 * Applied to POST /api/auth/login to prevent brute-force attacks.
 */
export const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      prefix: 'rl:auth',
    })
  : null;

/**
 * GPS limiter: 1 request per 5 seconds per driver.
 * Applied to POST /api/gps/report to prevent GPS spam.
 */
export const gpsLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(1, '5 s'),
      prefix: 'rl:gps',
    })
  : null;

/**
 * Mobile API limiter: 60 requests per minute per user.
 * Applied to /api/mobile/* routes.
 */
export const mobileLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(60, '1 m'),
      prefix: 'rl:mobile',
    })
  : null;

/**
 * Apply a rate limiter to a request.
 *
 * Returns null if the request is allowed (caller proceeds normally).
 * Returns a NextResponse with status 429 if the limit is exceeded.
 * Gracefully skips limiting when env vars are not set (local dev).
 *
 * @param limiter - Pre-configured Ratelimit instance (or null in dev)
 * @param identifier - Unique key for this rate limit bucket (IP, userId, etc.)
 */
export async function applyRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<NextResponse | null> {
  // Skip rate limiting if Redis is not configured (local dev)
  if (!limiter) return null;

  const { success, reset } = await limiter.limit(identifier);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  return null;
}
