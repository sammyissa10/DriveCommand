import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';

const mockGetSession = vi.mocked(getSession);

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matched role when role is in allowedRoles', async () => {
    mockGetSession.mockResolvedValue({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'OWNER',
      email: 'owner@example.com',
      isSystemAdmin: false,
    });

    const role = await requireRole([UserRole.OWNER, UserRole.MANAGER]);
    expect(role).toBe(UserRole.OWNER);
  });

  it('returns MANAGER role when allowed', async () => {
    mockGetSession.mockResolvedValue({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'MANAGER',
      email: 'manager@example.com',
      isSystemAdmin: false,
    });

    const role = await requireRole([UserRole.OWNER, UserRole.MANAGER]);
    expect(role).toBe(UserRole.MANAGER);
  });

  it('throws Unauthorized when role is not in allowedRoles', async () => {
    mockGetSession.mockResolvedValue({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'DRIVER',
      email: 'driver@example.com',
      isSystemAdmin: false,
    });

    await expect(requireRole([UserRole.OWNER])).rejects.toThrow('Unauthorized');
  });

  it('throws with role info when not authorized', async () => {
    mockGetSession.mockResolvedValue({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'DRIVER',
      email: 'driver@example.com',
      isSystemAdmin: false,
    });

    await expect(requireRole([UserRole.OWNER, UserRole.MANAGER])).rejects.toThrow('DRIVER');
  });

  it('throws Unauthorized when session is null', async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireRole([UserRole.OWNER])).rejects.toThrow('Unauthorized');
  });
});
