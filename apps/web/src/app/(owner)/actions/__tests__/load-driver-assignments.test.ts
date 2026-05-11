import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  requireRole: vi.fn(),
  requireAuth: vi.fn().mockResolvedValue('user-123'),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  requireTenantId: vi.fn().mockResolvedValue('tenant-123'),
  getTenantPrisma: vi.fn(),
}));

vi.mock('@/lib/driver-pay/snapshot', () => ({
  snapshotActiveTemplate: vi.fn(),
  computeIsOverride: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantPrisma } from '@/lib/context/tenant-context';
import { snapshotActiveTemplate } from '@/lib/driver-pay/snapshot';
import {
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '@/app/(owner)/actions/load-driver-assignments';

// Re-import computeIsOverride from the real module for test 5 (not mocked)
// updateAssignment imports computeIsOverride at module load time from snapshot
// Since we mocked snapshot, we control the return value of computeIsOverride

import { computeIsOverride } from '@/lib/driver-pay/snapshot';

function makePrisma(overrides: Partial<Record<string, object>> = {}) {
  return {
    carrierDriver: { findFirst: vi.fn() },
    loadDriverAssignment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAssignment', () => {
  it('returns NO_ACTIVE_TEMPLATE error when snapshot throws', async () => {
    const mockPrisma = makePrisma({
      carrierDriver: { findFirst: vi.fn().mockResolvedValue({ id: 'driver-1' }) },
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(snapshotActiveTemplate).mockRejectedValue(new Error('NO_ACTIVE_TEMPLATE'));

    const result = await createAssignment('load-1', {
      driverId: '550e8400-e29b-41d4-a716-446655440000',
      driverRole: 'MAIN_DRIVER',
    });

    expect(result.error).toContain("don't have an active pay template");
  });

  it('returns duplicate MAIN_DRIVER error when one already exists', async () => {
    const mockPrisma = makePrisma({
      carrierDriver: { findFirst: vi.fn().mockResolvedValue({ id: 'driver-1' }) },
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-assign', driverRole: 'MAIN_DRIVER' }),
        create: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const result = await createAssignment('load-1', {
      driverId: '550e8400-e29b-41d4-a716-446655440000',
      driverRole: 'MAIN_DRIVER',
    });

    expect(result.error).toContain('Cannot assign a second main driver');
  });

  it('driver not found returns error', async () => {
    const mockPrisma = makePrisma({
      carrierDriver: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const result = await createAssignment('load-1', {
      driverId: '550e8400-e29b-41d4-a716-446655440000',
      driverRole: 'MAIN_DRIVER',
    });

    expect(result.error).toBe('Driver not found.');
  });
});

describe('deleteAssignment', () => {
  it('non-DRAFT payStatus returns error', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'a-1', payStatus: 'APPROVED', loadId: 'load-1' }),
        update: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const result = await deleteAssignment('a-1');

    expect(result.error).toBe('Only draft assignments can be removed.');
  });
});

describe('updateAssignment', () => {
  it('missing overrideReason when fields differ returns error', async () => {
    const { Prisma } = await import('@/generated/prisma');

    const existingTemplate = {
      payType: 'CPM',
      baseRate: new Prisma.Decimal('0.5500'),
      rateUnit: 'PER_MILE',
      loadedMilesOnly: false,
      fuelSurchargeRate: null,
      perDiemEnabled: false,
      perDiemRate: null,
    };

    const existingAssignment = {
      id: 'assign-1',
      loadId: 'load-1',
      payType: 'CPM',
      baseRate: new Prisma.Decimal('0.5500'),
      rateUnit: 'PER_MILE',
      loadedMilesOnly: false,
      fuelSurchargeRate: null,
      perDiemEnabled: false,
      perDiemRate: null,
      estimatedMiles: null,
      overrideReason: null,
      payStatus: 'DRAFT',
      template: existingTemplate,
    };

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(existingAssignment),
        update: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    // computeIsOverride is the real function (from the actual snapshot module) since
    // updateAssignment uses it inline. Override the mock to return true so we can
    // verify the guard triggers.
    vi.mocked(computeIsOverride).mockReturnValue(true);

    // baseRate differs from template (0.9000 vs 0.5500), no overrideReason
    const result = await updateAssignment('assign-1', { baseRate: '0.9000' });

    expect(result.error).toContain('A reason is required');
  });
});
