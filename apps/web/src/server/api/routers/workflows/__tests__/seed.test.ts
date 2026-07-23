/**
 * Unit tests for seedStarterPlaybooks (plan Task 8b, spec Section 15 Phase 1).
 *
 * Verifies the seed creates exactly 3 playbooks with correct step counts
 * and is idempotent when called twice for the same tenant.
 *
 * Mocked Prisma — no real database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/lib/db/prisma', () => {
  const makeTx = () => ({
    stepTemplate: { create: vi.fn() },
    playbook: { create: vi.fn() },
    playbookStep: { createMany: vi.fn() },
    playbookTrigger: { create: vi.fn() },
  });

  const tx = makeTx();

  return {
    prisma: {
      playbook: { findFirst: vi.fn() },
      $transaction: vi.fn().mockImplementation(async (cb: (tx: ReturnType<typeof makeTx>) => Promise<void>) => {
        // Reset counters on each transaction call
        tx.stepTemplate.create.mockClear();
        tx.playbook.create.mockClear();
        tx.playbookStep.createMany.mockClear();
        tx.playbookTrigger.create.mockClear();
        return cb(tx);
      }),
      _tx: tx, // expose for assertions
    },
    TX_OPTIONS: {},
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TENANT_ID = 'test-tenant-seed-123';

function getTx() {
  // Access the internal tx mock exposed via prisma._tx
  return (prisma as typeof prisma & {
    _tx: {
      stepTemplate: { create: ReturnType<typeof vi.fn> };
      playbook: { create: ReturnType<typeof vi.fn> };
      playbookStep: { createMany: ReturnType<typeof vi.fn> };
      playbookTrigger: { create: ReturnType<typeof vi.fn> };
    };
  })._tx;
}

describe('seedStarterPlaybooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates exactly 3 playbooks for a new tenant', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue(null); // not seeded yet
    const tx = getTx();
    tx.stepTemplate.create.mockResolvedValue({ id: 'step-tmpl-id' });
    tx.playbook.create.mockResolvedValue({ id: 'playbook-id' });
    tx.playbookStep.createMany.mockResolvedValue({ count: 1 });
    tx.playbookTrigger.create.mockResolvedValue({ id: 'trigger-id' });

    const { seedStarterPlaybooks } = await import(
      '@/server/services/workflows/seedStarterPlaybooks'
    );
    await seedStarterPlaybooks(TENANT_ID);

    expect(tx.playbook.create).toHaveBeenCalledTimes(3);
  });

  it('CDL Driver Onboarding creates 9 PlaybookStep rows', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue(null);
    const tx = getTx();
    tx.stepTemplate.create.mockResolvedValue({ id: 'step-tmpl-id' });
    tx.playbook.create.mockResolvedValue({ id: 'playbook-id' });
    tx.playbookStep.createMany.mockResolvedValue({ count: 1 });
    tx.playbookTrigger.create.mockResolvedValue({ id: 'trigger-id' });

    const { seedStarterPlaybooks } = await import(
      '@/server/services/workflows/seedStarterPlaybooks'
    );
    await seedStarterPlaybooks(TENANT_ID);

    const createManyCalls = vi.mocked(tx.playbookStep.createMany).mock.calls;
    // First createMany call is CDL Onboarding
    const cdlSteps = createManyCalls[0][0].data as unknown[];
    expect(cdlSteps).toHaveLength(9);
  });

  it('Pre-Trip Inspection creates 12 PlaybookStep rows', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue(null);
    const tx = getTx();
    tx.stepTemplate.create.mockResolvedValue({ id: 'step-tmpl-id' });
    tx.playbook.create.mockResolvedValue({ id: 'playbook-id' });
    tx.playbookStep.createMany.mockResolvedValue({ count: 1 });
    tx.playbookTrigger.create.mockResolvedValue({ id: 'trigger-id' });

    const { seedStarterPlaybooks } = await import(
      '@/server/services/workflows/seedStarterPlaybooks'
    );
    await seedStarterPlaybooks(TENANT_ID);

    const createManyCalls = vi.mocked(tx.playbookStep.createMany).mock.calls;
    // Second createMany call is Pre-Trip Inspection
    const dvir = createManyCalls[1][0].data as unknown[];
    expect(dvir).toHaveLength(12);
  });

  it('New Partner Setup creates 6 PlaybookStep rows', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue(null);
    const tx = getTx();
    tx.stepTemplate.create.mockResolvedValue({ id: 'step-tmpl-id' });
    tx.playbook.create.mockResolvedValue({ id: 'playbook-id' });
    tx.playbookStep.createMany.mockResolvedValue({ count: 1 });
    tx.playbookTrigger.create.mockResolvedValue({ id: 'trigger-id' });

    const { seedStarterPlaybooks } = await import(
      '@/server/services/workflows/seedStarterPlaybooks'
    );
    await seedStarterPlaybooks(TENANT_ID);

    const createManyCalls = vi.mocked(tx.playbookStep.createMany).mock.calls;
    // Third createMany call is Partner Setup
    const partner = createManyCalls[2][0].data as unknown[];
    expect(partner).toHaveLength(6);
  });

  it('creates a default-on ON_DRIVER_CREATE PlaybookTrigger linked to the CDL Onboarding playbook', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue(null);
    const tx = getTx();
    tx.stepTemplate.create.mockResolvedValue({ id: 'step-tmpl-id' });
    tx.playbookStep.createMany.mockResolvedValue({ count: 1 });
    tx.playbookTrigger.create.mockResolvedValue({ id: 'trigger-id' });
    // Distinct ids per playbook.create call: 1st=CDL, 2nd=DVIR, 3rd=Partner
    tx.playbook.create
      .mockResolvedValueOnce({ id: 'cdl-playbook-id' })
      .mockResolvedValueOnce({ id: 'dvir-playbook-id' })
      .mockResolvedValueOnce({ id: 'partner-playbook-id' });

    const { seedStarterPlaybooks } = await import(
      '@/server/services/workflows/seedStarterPlaybooks'
    );
    await seedStarterPlaybooks(TENANT_ID);

    expect(tx.playbookTrigger.create).toHaveBeenCalledTimes(1);
    expect(tx.playbookTrigger.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        playbookId: 'cdl-playbook-id',
        triggerEvent: 'ON_DRIVER_CREATE',
        conditions: {},
        recurringConfig: { _custom: true },
        isActive: true,
      },
    });
  });

  it('is idempotent — skips seeding when CDL Onboarding already exists', async () => {
    // Sentinel check returns an existing record
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue({ id: 'existing-id' } as never);

    const { seedStarterPlaybooks } = await import(
      '@/server/services/workflows/seedStarterPlaybooks'
    );
    await seedStarterPlaybooks(TENANT_ID);

    // $transaction should never be called — early return
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Idempotent path must make ZERO trigger creates
    expect(getTx().playbookTrigger.create).not.toHaveBeenCalled();
  });
});
