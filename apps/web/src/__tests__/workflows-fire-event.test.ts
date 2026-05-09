/**
 * Test suite: fireEvent — match/skip behavior
 *
 * Spec reference: Section 15 Phase 4 DoD test 1 — "fireEvent matches condition, skips mismatch"
 *
 * Tests cover:
 *   1. Match case — trigger with matching conditions → generatePlaybookInstance called once
 *   2. Skip case — trigger with non-matching conditions → generatePlaybookInstance NOT called
 *   3. Empty conditions — trigger with {} → always matches
 *   4. Inactive trigger — isActive:false filtered by findMany where clause
 *   5. Best-effort failure — generatePlaybookInstance throws → fireEvent does not propagate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@/server/services/workflows/fireEvent';
import { generatePlaybookInstance } from '@/server/services/workflows/generatePlaybookInstance';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/server/services/workflows/generatePlaybookInstance');
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    playbookTrigger: {
      findMany: vi.fn(),
    },
  },
}));

// Suppress logger output during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const TENANT_ID = 'tenant-abc';
const PLAYBOOK_ID = 'playbook-001';

const makeTrigger = (overrides: Partial<{
  id: string;
  playbookId: string;
  triggerEvent: string;
  conditions: Record<string, unknown> | null;
  isActive: boolean;
  tenantId: string;
}> = {}) => ({
  id: 'trigger-1',
  playbookId: PLAYBOOK_ID,
  triggerEvent: 'ON_DRIVER_CREATE',
  conditions: { driverType: 'CDL' },
  isActive: true,
  tenantId: TENANT_ID,
  ...overrides,
});

describe('fireEvent — match/skip behavior (Phase 4 DoD test 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generatePlaybookInstance).mockResolvedValue({} as any);
  });

  // -------------------------------------------------------------------------
  // Test 1: Match case
  // -------------------------------------------------------------------------
  it('calls generatePlaybookInstance exactly once when entityData matches conditions', async () => {
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([makeTrigger()] as any);

    await fireEvent({
      event: 'ON_DRIVER_CREATE',
      entityData: { id: 'd1', driverType: 'CDL' },
      tenantId: TENANT_ID,
    });

    expect(generatePlaybookInstance).toHaveBeenCalledTimes(1);
    expect(generatePlaybookInstance).toHaveBeenCalledWith({
      playbookId: PLAYBOOK_ID,
      entityType: 'DRIVER',
      entityId: 'd1',
      tenantId: TENANT_ID,
      triggeredBy: 'trigger',
      triggeredEvent: 'ON_DRIVER_CREATE',
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Skip case — condition mismatch
  // -------------------------------------------------------------------------
  it('does NOT call generatePlaybookInstance when entityData does not match conditions', async () => {
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([makeTrigger()] as any);

    await fireEvent({
      event: 'ON_DRIVER_CREATE',
      entityData: { id: 'd2', driverType: 'NON_CDL' },
      tenantId: TENANT_ID,
    });

    expect(generatePlaybookInstance).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 3: Empty conditions = always match
  // -------------------------------------------------------------------------
  it('matches when conditions is an empty object (always-match rule)', async () => {
    const vehicleTrigger = makeTrigger({
      id: 'trigger-v',
      triggerEvent: 'ON_VEHICLE_CREATE',
      conditions: {},
    });
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([vehicleTrigger] as any);

    await fireEvent({
      event: 'ON_VEHICLE_CREATE',
      entityData: { id: 'v1', make: 'Kenworth' },
      tenantId: TENANT_ID,
    });

    expect(generatePlaybookInstance).toHaveBeenCalledTimes(1);
    expect(generatePlaybookInstance).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'VEHICLE', entityId: 'v1' })
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Inactive trigger skipped at DB level
  // -------------------------------------------------------------------------
  it('queries DB with isActive: true — inactive triggers are never loaded', async () => {
    // Simulate DB returning an empty array (the isActive: false row was filtered out)
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([]);

    await fireEvent({
      event: 'ON_DRIVER_CREATE',
      entityData: { id: 'd3', driverType: 'CDL' },
      tenantId: TENANT_ID,
    });

    // Verify the where clause passed to findMany includes isActive: true
    expect(prisma.playbookTrigger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      })
    );
    expect(generatePlaybookInstance).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 5: Best-effort failure — one failing trigger does not halt the loop
  // -------------------------------------------------------------------------
  it('does not throw when generatePlaybookInstance fails, and continues processing subsequent triggers', async () => {
    const trigger1 = makeTrigger({ id: 'trigger-fail', playbookId: 'pb-fail', conditions: {} });
    const trigger2 = makeTrigger({ id: 'trigger-ok', playbookId: 'pb-ok', conditions: {} });
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([trigger1, trigger2] as any);

    vi.mocked(generatePlaybookInstance)
      .mockRejectedValueOnce(new Error('DB conflict'))
      .mockResolvedValueOnce({} as any);

    await expect(
      fireEvent({
        event: 'ON_DRIVER_CREATE',
        entityData: { id: 'd4', driverType: 'CDL' },
        tenantId: TENANT_ID,
      })
    ).resolves.toBeUndefined();

    // Second trigger must still have been attempted
    expect(generatePlaybookInstance).toHaveBeenCalledTimes(2);
    expect(generatePlaybookInstance).toHaveBeenCalledWith(
      expect.objectContaining({ playbookId: 'pb-ok' })
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: Null conditions treated as empty object (always match)
  // -------------------------------------------------------------------------
  it('treats null conditions as an empty object — always matches', async () => {
    const triggerNullConds = makeTrigger({ conditions: null });
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([triggerNullConds] as any);

    await fireEvent({
      event: 'ON_DRIVER_CREATE',
      entityData: { id: 'd5', driverType: 'CDL' },
      tenantId: TENANT_ID,
    });

    expect(generatePlaybookInstance).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 7: MANUAL_ONLY event — no-op (not a lifecycle event)
  // -------------------------------------------------------------------------
  it('is a no-op for MANUAL_ONLY events — does not query DB', async () => {
    await fireEvent({
      event: 'MANUAL_ONLY',
      entityData: { id: 'd6' },
      tenantId: TENANT_ID,
    });

    expect(prisma.playbookTrigger.findMany).not.toHaveBeenCalled();
    expect(generatePlaybookInstance).not.toHaveBeenCalled();
  });
});
