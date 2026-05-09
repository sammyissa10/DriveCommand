/**
 * Test suite: failInspectionItem — category gating, readiness flips, photo validation.
 *
 * Spec reference: Section 6.4 + Section 15 Phase 3 mandated test coverage.
 *
 * These are unit tests with mocked Prisma — no real database required.
 * vi.mock calls are hoisted by Vitest so the service import sees the mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock prisma BEFORE importing service ---
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    stepInstance: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    playbookInstance: {
      update: vi.fn(),
    },
    playbookNotification: {
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]), // no dispatchers by default
    },
  },
}));

vi.mock('@/lib/notifications/send-push', () => ({
  sendPushToUser: vi.fn().mockResolvedValue({ ok: true }),
}));

// computeDispatchReadiness is a real service that calls prisma — mock it
vi.mock('@/server/services/workflows/computeDispatchReadiness', () => ({
  computeDispatchReadiness: vi.fn().mockResolvedValue(undefined),
}));

import { failInspectionItem } from '@/server/services/workflows/failInspectionItem';
import { prisma } from '@/lib/db/prisma';
import { computeDispatchReadiness } from '@/server/services/workflows/computeDispatchReadiness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStepInstance(category: string, requiresPhoto = false) {
  return {
    id: 'step-1',
    status: 'NOT_STARTED',
    playbookInstanceId: 'inst-1',
    stepSnapshot: {
      name: 'Check brakes',
      defaultConfig: { requiresPhoto },
    },
    playbookInstance: {
      tenantId: 'tenant-1',
      playbook: { category, name: 'Pre-Trip Inspection' },
    },
  };
}

const DEFAULT_ARGS = {
  stepInstanceId: 'step-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  result: { photoUrls: [], note: undefined },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('failInspectionItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: update/create succeed
    vi.mocked(prisma.stepInstance.update).mockResolvedValue({} as any);
    vi.mocked(prisma.stepInstance.create).mockResolvedValue({} as any);
    vi.mocked(prisma.playbookInstance.update).mockResolvedValue({} as any);
    vi.mocked(prisma.playbookNotification.create).mockResolvedValue({} as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
  });

  it('creates exactly one mechanic APPROVAL step when category is VEHICLE_INSPECTION', async () => {
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      makeStepInstance('VEHICLE_INSPECTION') as any
    );

    await failInspectionItem(DEFAULT_ARGS);

    expect(prisma.stepInstance.create).toHaveBeenCalledTimes(1);
    const createCall = vi.mocked(prisma.stepInstance.create).mock.calls[0][0];
    expect(createCall.data.stepSnapshot).toMatchObject({
      stepType: 'APPROVAL',
      assigneeRole: 'MECHANIC',
    });
    expect(createCall.data.stepTemplateId).toBeNull();
  });

  it('creates zero mechanic steps when category is ONBOARDING', async () => {
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      makeStepInstance('ONBOARDING') as any
    );

    await failInspectionItem(DEFAULT_ARGS);

    expect(prisma.stepInstance.create).not.toHaveBeenCalled();
  });

  it('calls computeDispatchReadiness — readiness flips after fail', async () => {
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      makeStepInstance('VEHICLE_INSPECTION') as any
    );

    await failInspectionItem(DEFAULT_ARGS);

    expect(computeDispatchReadiness).toHaveBeenCalledWith('inst-1');
  });

  it('throws PHOTO_REQUIRED when requiresPhoto=true and photoUrls is empty', async () => {
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      makeStepInstance('VEHICLE_INSPECTION', true) as any
    );

    await expect(
      failInspectionItem({ ...DEFAULT_ARGS, result: { photoUrls: [], note: undefined } })
    ).rejects.toThrowError(expect.objectContaining({ message: 'PHOTO_REQUIRED' }));

    // Should not have written anything
    expect(prisma.stepInstance.update).not.toHaveBeenCalled();
  });

  it('succeeds when requiresPhoto=true and photoUrls has one item', async () => {
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      makeStepInstance('VEHICLE_INSPECTION', true) as any
    );

    await expect(
      failInspectionItem({
        ...DEFAULT_ARGS,
        result: { photoUrls: ['inspections/abc.jpg'], note: 'Brake pad worn' },
      })
    ).resolves.toBeUndefined();

    expect(prisma.stepInstance.update).toHaveBeenCalledTimes(1);
  });
});
