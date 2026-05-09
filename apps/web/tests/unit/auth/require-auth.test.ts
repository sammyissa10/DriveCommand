import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the session module
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

import { requireAuth, getSession } from '@/lib/auth/supabase';

const mockGetSession = vi.mocked(getSession);

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns userId when session exists', async () => {
    mockGetSession.mockResolvedValue({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'OWNER',
      email: 'owner@example.com',
      isSystemAdmin: false,
    });

    const userId = await requireAuth();
    expect(userId).toBe('user-123');
  });

  it('throws Unauthorized when session is null', async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow('Unauthorized');
  });

  it('throws with descriptive message when session is null', async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow('Authentication required');
  });
});
