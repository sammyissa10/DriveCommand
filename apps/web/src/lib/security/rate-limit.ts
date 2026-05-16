/**
 * Extended rate limiters for security-sensitive endpoints.
 *
 * This file is SEPARATE from apps/web/src/lib/rate-limit.ts (which handles
 * auth, GPS, geocoding, mobile, public, and upload limiters). This new file
 * adds limiters for download, search, PII view, export, and webhook endpoints,
 * plus an audit helper for rate limit violations.
 *
 * Part of quick-349 input/upload abuse hardening (Section 4A.4).
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { writeAuditLog } from './audit-log';

// ─── Redis client ──────────────────────────────────────────────────────────

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[security/rate-limit] WARNING: Upstash Redis not configured — rate limiting DISABLED in production.'
      );
    }
    return null;
  }
  return new Redis({ url, token });
}

const redis = createRedis();

// ─── Factory ───────────────────────────────────────────────────────────────

function makeLimiter(
  limit: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`,
  prefix: string
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix,
    analytics: false,
  });
}

// ─── Pre-built limiters ────────────────────────────────────────────────────

/** 100 downloads per user per day */
export const downloadLimiter = makeLimiter(100, '1 d', 'rl:download');

/** 300 search/list requests per user per minute */
export const searchLimiter = makeLimiter(300, '1 m', 'rl:search');

/** 50 PII field views per user per hour */
export const piiViewLimiter = makeLimiter(50, '1 h', 'rl:pii');

/** 5 exports per user per hour */
export const exportLimiter = makeLimiter(5, '1 h', 'rl:export');

/** 1000 webhook requests per source per minute */
export const webhookLimiter = makeLimiter(1000, '1 m', 'rl:webhook');

// ─── Generic rateLimit() ───────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Ad-hoc rate limiter using a sliding window.
 *
 * Gracefully returns `{ allowed: true }` when Redis is not configured (dev).
 *
 * @param key           - Unique bucket key (e.g., `userId:endpoint`)
 * @param limit         - Max requests per window
 * @param windowSeconds - Window duration in seconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!redis) {
    return { allowed: true, remaining: limit, resetAt: 0 };
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: 'rl:adhoc',
    analytics: false,
  });

  const result = await limiter.limit(key);

  return {
    allowed: result.success,
    remaining: result.remaining,
    resetAt: result.reset,
  };
}

// ─── Audit helper ──────────────────────────────────────────────────────────

export interface AuditRateLimitHitParams {
  userId: string;
  tenantId: string;
  endpointClass: string;
  ipAddress?: string;
}

/**
 * Write a RATE_LIMIT_HIT audit log row.
 *
 * Uses userId as resourceId (the user being rate-limited)
 * and endpointClass as resourceType.
 */
export async function auditRateLimitHit(params: AuditRateLimitHitParams): Promise<void> {
  await writeAuditLog({
    action: 'RATE_LIMIT_HIT',
    resourceType: params.endpointClass,
    resourceId: params.userId,
    userId: params.userId,
    tenantId: params.tenantId,
    ip: params.ipAddress ?? null,
  });
}
