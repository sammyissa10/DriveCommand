import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { validateMobileToken } from '@/lib/auth/mobile-auth';
import { createAdminClient } from '@/lib/supabase/admin';

const mockCreateAdminClient = vi.mocked(createAdminClient);

function makeRequest(authHeader?: string): NextRequest {
  return {
    headers: {
      get: (name: string) => {
        if (name === 'Authorization') return authHeader ?? null;
        return null;
      },
    },
  } as unknown as NextRequest;
}

describe('validateMobileToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no Authorization header is present', async () => {
    const req = makeRequest();
    const result = await validateMobileToken(req);
    expect(result).toBeNull();
  });

  it('returns null when Authorization header does not start with Bearer', async () => {
    const req = makeRequest('Basic sometoken');
    const result = await validateMobileToken(req);
    expect(result).toBeNull();
  });

  it('returns MobileAuthContext when token is valid (OWNER role)', async () => {
    const mockAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              user_metadata: {
                tenantId: 'tenant-456',
                role: 'OWNER',
                isSystemAdmin: false,
              },
            },
          },
          error: null,
        }),
      },
    };
    mockCreateAdminClient.mockReturnValue(mockAdmin as any);

    const req = makeRequest('Bearer valid-token');
    const result = await validateMobileToken(req);

    expect(result).toEqual({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'OWNER',
    });
    // OWNER role does not have driverId set
    expect(result?.driverId).toBeUndefined();
  });

  it('returns MobileAuthContext with driverId when role is DRIVER', async () => {
    const mockAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'driver-789',
              user_metadata: {
                tenantId: 'tenant-456',
                role: 'DRIVER',
                isSystemAdmin: false,
              },
            },
          },
          error: null,
        }),
      },
    };
    mockCreateAdminClient.mockReturnValue(mockAdmin as any);

    const req = makeRequest('Bearer valid-token');
    const result = await validateMobileToken(req);

    expect(result?.driverId).toBe('driver-789');
    expect(result?.userId).toBe('driver-789');
    expect(result?.role).toBe('DRIVER');
  });

  it('returns null when Supabase returns an error', async () => {
    const mockAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('Invalid token'),
        }),
      },
    };
    mockCreateAdminClient.mockReturnValue(mockAdmin as any);

    const req = makeRequest('Bearer invalid-token');
    const result = await validateMobileToken(req);
    expect(result).toBeNull();
  });

  it('returns null when Supabase returns null user', async () => {
    const mockAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };
    mockCreateAdminClient.mockReturnValue(mockAdmin as any);

    const req = makeRequest('Bearer expired-token');
    const result = await validateMobileToken(req);
    expect(result).toBeNull();
  });
});
