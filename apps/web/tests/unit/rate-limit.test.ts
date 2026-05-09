import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Upstash modules before importing applyRateLimit
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: {
    slidingWindow: vi.fn(),
    fixedWindow: vi.fn(),
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(),
}));

import { applyRateLimit } from '@/lib/rate-limit';
import type { Ratelimit } from '@upstash/ratelimit';

describe('applyRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when limiter is null (dev mode — no Redis configured)', async () => {
    const result = await applyRateLimit(null, 'user-123');
    expect(result).toBeNull();
  });

  it('returns null when under the rate limit (success: true)', async () => {
    const mockLimiter = {
      limit: vi.fn().mockResolvedValue({
        success: true,
        reset: Date.now() + 60000,
        remaining: 59,
        limit: 60,
      }),
    } as unknown as Ratelimit;

    const result = await applyRateLimit(mockLimiter, 'user-123');
    expect(result).toBeNull();
    expect(mockLimiter.limit).toHaveBeenCalledWith('user-123');
  });

  it('returns 429 NextResponse when over the rate limit (success: false)', async () => {
    const futureReset = Date.now() + 30000; // 30 seconds from now
    const mockLimiter = {
      limit: vi.fn().mockResolvedValue({
        success: false,
        reset: futureReset,
        remaining: 0,
        limit: 5,
      }),
    } as unknown as Ratelimit;

    const result = await applyRateLimit(mockLimiter, 'user-123');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  it('sets Retry-After header on 429 response', async () => {
    const futureReset = Date.now() + 30000;
    const mockLimiter = {
      limit: vi.fn().mockResolvedValue({
        success: false,
        reset: futureReset,
        remaining: 0,
        limit: 5,
      }),
    } as unknown as Ratelimit;

    const result = await applyRateLimit(mockLimiter, 'user-123');
    expect(result?.headers.get('Retry-After')).toBeTruthy();
    const retryAfter = Number(result?.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
  });

  it('uses the provided identifier as the rate limit key', async () => {
    const mockLimiter = {
      limit: vi.fn().mockResolvedValue({
        success: true,
        reset: Date.now() + 60000,
        remaining: 59,
        limit: 60,
      }),
    } as unknown as Ratelimit;

    await applyRateLimit(mockLimiter, 'specific-user-id');
    expect(mockLimiter.limit).toHaveBeenCalledWith('specific-user-id');
  });
});
