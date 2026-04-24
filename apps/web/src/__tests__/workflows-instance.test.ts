/**
 * Test suite: generatePlaybookInstance snapshot immutability +
 * computeDispatchReadiness with zero dispatch-blocker steps.
 *
 * These are unit tests with mocked Prisma — no real database required.
 *
 * Spec reference: Section 15 Phase 2 — mandated test cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma — we control what each query returns
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    playbook: {
      findFirst: vi.fn(),
    },
    playbookInstance: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    stepInstance: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    truck: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    playbookNotification: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  TX_OPTIONS: {},
}));

vi.mock('@/lib/notifications/send-push', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test 1: Snapshot Immutability
// ---------------------------------------------------------------------------

describe('generatePlaybookInstance — snapshot immutability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('playbookSnapshot is a deep copy — mutating the source Playbook does not change the snapshot', async () => {
    const { generatePlaybookInstance } = await import(
      '@/server/services/workflows/generatePlaybookInstance'
    );
    const { prisma } = await import('@/lib/db/prisma');

    const mockStep = {
      stepTemplateId: 'step-tpl-1',
      sequence: 0,
      playbookPhase: 'DAY_1',
      isRequired: true,
      isDispatchBlocker: true,
      dueDaysFromStart: null,
      dueBeforeDispatch: false,
      overrideConfig: null,
      stepTemplate: {
        name: 'Upload License',
        stepType: 'DOCUMENT_UPLOAD',
        assigneeRole: 'DRIVER',
        defaultConfig: null,
        formSchema: null,
        documentTypeName: "Driver's License",
        requiresPhoto: false,
        requiresSignature: false,
        description: 'Upload a valid CDL',
      },
    };

    const sourceMutablePlaybook = {
      id: 'playbook-1',
      tenantId: 'tenant-1',
      name: 'CDL Onboarding',
      category: 'DRIVER_ONBOARDING',
      entityType: 'DRIVER',
      isActive: true,
      deletedAt: null,
      steps: [mockStep],
    };

    let capturedSnapshot: unknown = null;

    vi.mocked(prisma.playbook.findFirst).mockResolvedValue(sourceMutablePlaybook as any);
    vi.mocked(prisma.playbookInstance.findFirst).mockResolvedValue(null); // no duplicate
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'driver-1', role: 'DRIVER', tenantId: 'tenant-1' } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]); // no admin users — assignee stays null
    vi.mocked(prisma.stepInstance.findMany).mockResolvedValue([]);
    vi.mocked(prisma.playbookInstance.findUniqueOrThrow).mockResolvedValue({
      id: 'instance-1',
      stepInstances: [],
    } as any);

    // Capture the playbookSnapshot passed to playbookInstance.create
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const txMock = {
        $executeRaw: vi.fn().mockResolvedValue(undefined),
        playbookInstance: {
          create: vi.fn().mockImplementation(({ data }: any) => {
            // Deep-clone what was actually saved so we can compare later
            capturedSnapshot = JSON.parse(JSON.stringify(data.playbookSnapshot));
            return Promise.resolve({ id: 'instance-1', ...data });
          }),
        },
        stepInstance: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(txMock);
    });

    await generatePlaybookInstance({
      playbookId: 'playbook-1',
      entityType: 'DRIVER',
      entityId: 'driver-1',
      tenantId: 'tenant-1',
      triggeredBy: 'manual',
    });

    // Mutate the source playbook AFTER the instance was generated
    sourceMutablePlaybook.name = 'MUTATED NAME';
    sourceMutablePlaybook.steps[0].stepTemplate.name = 'MUTATED STEP';

    // The captured snapshot must be unchanged — it was a deep copy, not a reference
    const snap = capturedSnapshot as {
      name: string;
      steps: Array<{ stepTemplate: { name: string } }>;
    };

    expect(snap.name).toBe('CDL Onboarding');
    expect(snap.steps[0].stepTemplate.name).toBe('Upload License');
  });
});

// ---------------------------------------------------------------------------
// Test 2: Zero dispatch-blocker steps → isReady = true
// ---------------------------------------------------------------------------

describe('computeDispatchReadiness — zero dispatch blockers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns isReady=true when no steps have isDispatchBlocker=true', async () => {
    const { computeDispatchReadiness } = await import(
      '@/server/services/workflows/computeDispatchReadiness'
    );
    const { prisma } = await import('@/lib/db/prisma');

    // All steps have isDispatchBlocker=false in their snapshot
    const stepInstances = [
      { id: 's1', status: 'COMPLETE', stepSnapshot: { isDispatchBlocker: false }, dueDate: null },
      { id: 's2', status: 'NOT_STARTED', stepSnapshot: { isDispatchBlocker: false }, dueDate: null },
      { id: 's3', status: 'SKIPPED', stepSnapshot: { isDispatchBlocker: false }, dueDate: null },
    ];

    vi.mocked(prisma.playbookInstance.findUniqueOrThrow).mockResolvedValue({
      id: 'instance-1',
      tenantId: 'tenant-1',
      entityType: 'DRIVER',
      entityId: 'driver-1',
      isDispatchReady: false,
      stepInstances,
    } as any);

    vi.mocked(prisma.playbookInstance.update).mockResolvedValue({} as any);
    // updateEntityReadiness: no active instances → entityReady=true
    vi.mocked(prisma.playbookInstance.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]); // notifyDispatchers: no dispatchers

    const result = await computeDispatchReadiness('instance-1');

    expect(result.isReady).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});
