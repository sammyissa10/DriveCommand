/**
 * Test suite: completeStep type-specific validation.
 *
 * One test per StepType — verifies the exact error code thrown when the
 * caller omits a required field. All tests use mocked Prisma.
 *
 * Spec reference: Section 6.3 — type-specific completion requirements.
 * Section 15 Phase 2 mandates these tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    stepInstance: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    document: { create: vi.fn() },
    playbookInstance: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    truck: {
      update: vi.fn(),
    },
  },
  TX_OPTIONS: {},
}));

vi.mock('@/lib/notifications/send-push', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/server/services/workflows/computeDispatchReadiness', () => ({
  computeDispatchReadiness: vi.fn().mockResolvedValue({ isReady: true, blockers: [] }),
}));

/** Build a mock StepInstance for a given stepType */
function mockStepInstance(stepType: string) {
  return {
    id: 'step-1',
    status: 'NOT_STARTED',
    playbookInstanceId: 'instance-1',
    assignedUserId: null,
    stepSnapshot: {
      stepType,
      isDispatchBlocker: false,
      name: 'Test Step',
      documentTypeName: "Driver's License",
      formSchema:
        stepType === 'FORM_FILL'
          ? [{ id: 'f1', label: 'Name', type: 'text', required: true }]
          : null,
    },
    playbookInstance: {
      tenantId: 'tenant-1',
      entityType: 'DRIVER',
      entityId: 'driver-1',
    },
  };
}

describe('completeStep — type-specific validation', () => {
  const baseArgs = { userId: 'user-1', tenantId: 'tenant-1' };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.update).mockResolvedValue({} as any);
    vi.mocked(prisma.playbookInstance.findUniqueOrThrow).mockResolvedValue({
      id: 'instance-1',
      tenantId: 'tenant-1',
      entityType: 'DRIVER',
      entityId: 'driver-1',
      isDispatchReady: false,
      stepInstances: [],
    } as any);
    vi.mocked(prisma.playbookInstance.update).mockResolvedValue({} as any);
    vi.mocked(prisma.playbookInstance.findMany).mockResolvedValue([]);
    vi.mocked(prisma.document.create).mockResolvedValue({} as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
  });

  it('DOCUMENT_UPLOAD: rejects with MISSING_FILES when fileUrls is empty', async () => {
    const { completeStep } = await import('@/server/services/workflows/completeStep');
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      mockStepInstance('DOCUMENT_UPLOAD') as any
    );

    await expect(
      completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: { fileUrls: [] } })
    ).rejects.toThrowError(expect.objectContaining({ message: 'MISSING_FILES' }));
  });

  it('SIGNATURE: rejects with MISSING_SIGNATURE when signatureUrl is absent', async () => {
    const { completeStep } = await import('@/server/services/workflows/completeStep');
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      mockStepInstance('SIGNATURE') as any
    );

    await expect(
      completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: {} })
    ).rejects.toThrowError(expect.objectContaining({ message: 'MISSING_SIGNATURE' }));
  });

  it('FORM_FILL: rejects with INVALID_FORM when formData is absent', async () => {
    const { completeStep } = await import('@/server/services/workflows/completeStep');
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      mockStepInstance('FORM_FILL') as any
    );

    await expect(
      completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: {} })
    ).rejects.toThrowError(expect.objectContaining({ message: 'INVALID_FORM' }));
  });

  it('INSPECTION_ITEM: rejects with USE_FAIL_ENDPOINT', async () => {
    const { completeStep } = await import('@/server/services/workflows/completeStep');
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      mockStepInstance('INSPECTION_ITEM') as any
    );

    await expect(
      completeStep({
        ...baseArgs,
        stepInstanceId: 'step-1',
        result: { passOrFail: 'pass' },
      })
    ).rejects.toThrowError(expect.objectContaining({ message: 'USE_FAIL_ENDPOINT' }));
  });

  it('TRAINING_ACK: rejects with MISSING_ACK when neither acknowledged nor note provided', async () => {
    const { completeStep } = await import('@/server/services/workflows/completeStep');
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      mockStepInstance('TRAINING_ACK') as any
    );

    await expect(
      completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: {} })
    ).rejects.toThrowError(expect.objectContaining({ message: 'MISSING_ACK' }));
  });

  it('THIRD_PARTY: rejects with MISSING_EVIDENCE when no note and no fileUrls', async () => {
    const { completeStep } = await import('@/server/services/workflows/completeStep');
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      mockStepInstance('THIRD_PARTY') as any
    );

    await expect(
      completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: {} })
    ).rejects.toThrowError(expect.objectContaining({ message: 'MISSING_EVIDENCE' }));
  });

  it('CUSTOM_NOTE: rejects with MISSING_NOTE when note is empty (whitespace only)', async () => {
    const { completeStep } = await import('@/server/services/workflows/completeStep');
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.stepInstance.findFirst).mockResolvedValue(
      mockStepInstance('CUSTOM_NOTE') as any
    );

    await expect(
      completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: { note: '   ' } })
    ).rejects.toThrowError(expect.objectContaining({ message: 'MISSING_NOTE' }));
  });
});
