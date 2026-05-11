import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  requireRole: vi.fn(),
  requireAuth: vi.fn().mockResolvedValue('user-123'),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  requireTenantId: vi.fn().mockResolvedValue('tenant-123'),
  getTenantPrisma: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createTemplate } from '@/app/(owner)/actions/driver-compensation-templates';

function makePrisma(overrides: Partial<Record<string, object>> = {}) {
  return {
    carrierDriver: { findFirst: vi.fn() },
    driverCompensationTemplate: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTemplate', () => {
  it('returns error and skips DB write when new effectiveFrom is the same day as the active template', async () => {
    const sameDay = new Date('2026-05-10T00:00:00.000Z');

    const mockPrisma = makePrisma({
      carrierDriver: {
        findFirst: vi.fn().mockResolvedValue({ id: 'driver-1' }),
      },
      driverCompensationTemplate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'prev-tpl',
          effectiveFrom: sameDay,
          effectiveTo: null,
          deletedAt: null,
        }),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    });

    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const result = await createTemplate('550e8400-e29b-41d4-a716-446655440000', {
      effectiveFrom: '2026-05-10',
      employmentType: 'W2_EMPLOYEE',
      payType: 'CPM',
      baseRate: '0.55',
      rateUnit: 'PER_MILE',
      loadedMilesOnly: false,
      perDiemEnabled: false,
      overtimeEligible: false,
      currency: 'USD',
    });

    expect(result.error).toContain('Cannot replace this template on the same day');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
