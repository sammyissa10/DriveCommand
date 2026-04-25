/**
 * Test suite: trigger router — enableRecipe, disableRecipe
 *
 * Spec reference: Section 15 Phase 4 DoD test 2 — "disableRecipe preserves existing instances"
 *
 * Tests cover:
 *   1. enableRecipe creates a new PlaybookTrigger (isActive: true, correct event + conditions)
 *   2. enableRecipe throws NOT_FOUND for unknown recipe key
 *   3. enableRecipe throws NOT_FOUND when playbookId doesn't belong to tenant
 *   4. disableRecipe sets isActive=false without touching PlaybookInstance rows (DoD test 2)
 *   5. disableRecipe returns { disabled: 0 } when no matching triggers exist (idempotent)
 *   6. All admin procedures reject DRIVER-role callers with FORBIDDEN
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/api/trpc';
import { appRouter } from '@/server/api/root';
import { prisma } from '@/lib/db/prisma';
import type { SessionData } from '@/lib/auth/supabase';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    playbookTrigger: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    playbook: { findFirst: vi.fn() },
    playbookInstance: {
      count: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TENANT_ID = 'tenant-abc';
const PLAYBOOK_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // valid UUID v4
const TRIGGER_ID = 'trigger-cdl-001';

function makeContext(role: string = 'OWNER'): { session: SessionData; headers: Headers } {
  return {
    session: {
      userId: 'admin-user-id',
      email: 'admin@test.com',
      role,
      tenantId: TENANT_ID,
    },
    headers: new Headers(),
  };
}

const createCaller = createCallerFactory(appRouter);

describe('trigger router — enableRecipe / disableRecipe (Phase 4 DoD test 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Test 1: enableRecipe happy path — creates new trigger
  // ---------------------------------------------------------------------------
  it('enableRecipe creates a new PlaybookTrigger with isActive: true and correct triggerEvent', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue({ id: PLAYBOOK_ID } as any);
    vi.mocked(prisma.playbookTrigger.findFirst).mockResolvedValue(null); // no existing trigger
    vi.mocked(prisma.playbookTrigger.create).mockResolvedValue({
      id: TRIGGER_ID,
      playbookId: PLAYBOOK_ID,
      isActive: true,
      triggerEvent: 'ON_DRIVER_CREATE',
      conditions: { driverType: 'CDL' },
      tenantId: TENANT_ID,
    } as any);

    const caller = createCaller(makeContext());
    await caller.workflows.trigger.enableRecipe({
      recipeKey: 'cdl_driver_onboarding',
      playbookId: PLAYBOOK_ID,
    });

    expect(prisma.playbookTrigger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: true,
          triggerEvent: 'ON_DRIVER_CREATE',
          playbookId: PLAYBOOK_ID,
          tenantId: TENANT_ID,
          conditions: { driverType: 'CDL' },
        }),
      })
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: enableRecipe reactivates an existing trigger (upsert path)
  // ---------------------------------------------------------------------------
  it('enableRecipe reactivates an existing inactive trigger instead of creating a duplicate', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue({ id: PLAYBOOK_ID } as any);
    vi.mocked(prisma.playbookTrigger.findFirst).mockResolvedValue({
      id: TRIGGER_ID,
      isActive: false,
    } as any);
    vi.mocked(prisma.playbookTrigger.update).mockResolvedValue({ id: TRIGGER_ID, isActive: true } as any);

    const caller = createCaller(makeContext());
    await caller.workflows.trigger.enableRecipe({
      recipeKey: 'cdl_driver_onboarding',
      playbookId: PLAYBOOK_ID,
    });

    expect(prisma.playbookTrigger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRIGGER_ID },
        data: expect.objectContaining({ isActive: true }),
      })
    );
    expect(prisma.playbookTrigger.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 3: enableRecipe rejects unknown recipe key
  // ---------------------------------------------------------------------------
  it('enableRecipe throws NOT_FOUND for an unknown recipe key', async () => {
    const caller = createCaller(makeContext());
    await expect(
      caller.workflows.trigger.enableRecipe({
        recipeKey: 'does_not_exist_ever',
        playbookId: PLAYBOOK_ID,
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(prisma.playbook.findFirst).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 4: enableRecipe rejects playbook not in tenant (tenant scoping)
  // ---------------------------------------------------------------------------
  it('enableRecipe throws NOT_FOUND when playbookId does not belong to tenant', async () => {
    vi.mocked(prisma.playbook.findFirst).mockResolvedValue(null); // tenant scoped lookup returns null

    const caller = createCaller(makeContext());
    await expect(
      caller.workflows.trigger.enableRecipe({
        recipeKey: 'cdl_driver_onboarding',
        playbookId: PLAYBOOK_ID,
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(prisma.playbookTrigger.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 5: disableRecipe preserves PlaybookInstance rows — Phase 4 DoD test 2
  // ---------------------------------------------------------------------------
  it('disableRecipe sets isActive=false on the trigger but leaves PlaybookInstance rows unchanged (DoD test 2 — critical)', async () => {
    // Seed: 1 active trigger with CDL conditions
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([
      { id: TRIGGER_ID, conditions: { driverType: 'CDL' } },
    ] as any);
    vi.mocked(prisma.playbookTrigger.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.playbookInstance.count).mockResolvedValue(3);

    // Pre-disable: verify 3 instances exist (baseline — unchanged before call)
    const countBefore = await prisma.playbookInstance.count({
      where: { playbookId: PLAYBOOK_ID, tenantId: TENANT_ID },
    });
    expect(countBefore).toBe(3);

    const caller = createCaller(makeContext());
    const result = await caller.workflows.trigger.disableRecipe({
      recipeKey: 'cdl_driver_onboarding',
    });

    // Trigger was deactivated
    expect(result).toEqual({ disabled: 1 });
    expect(prisma.playbookTrigger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [TRIGGER_ID] } },
        data: { isActive: false },
      })
    );

    // PlaybookInstance rows were NEVER mutated
    expect(prisma.playbookInstance.update).not.toHaveBeenCalled();
    expect(prisma.playbookInstance.updateMany).not.toHaveBeenCalled();

    // Post-disable: count is still 3 — instances preserved
    const countAfter = await prisma.playbookInstance.count({
      where: { playbookId: PLAYBOOK_ID, tenantId: TENANT_ID },
    });
    expect(countAfter).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Test 6: disableRecipe is idempotent when no matching triggers exist
  // ---------------------------------------------------------------------------
  it('disableRecipe returns { disabled: 0 } when no matching triggers exist — idempotent', async () => {
    vi.mocked(prisma.playbookTrigger.findMany).mockResolvedValue([]);

    const caller = createCaller(makeContext());
    const result = await caller.workflows.trigger.disableRecipe({
      recipeKey: 'cdl_driver_onboarding',
    });

    expect(result).toEqual({ disabled: 0 });
    expect(prisma.playbookTrigger.updateMany).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 7: Non-admin callers are rejected with FORBIDDEN
  // ---------------------------------------------------------------------------
  it('enableRecipe and disableRecipe reject DRIVER-role callers with FORBIDDEN', async () => {
    const driverCaller = createCaller(makeContext('DRIVER'));

    await expect(
      driverCaller.workflows.trigger.enableRecipe({
        recipeKey: 'cdl_driver_onboarding',
        playbookId: PLAYBOOK_ID,
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      driverCaller.workflows.trigger.disableRecipe({
        recipeKey: 'cdl_driver_onboarding',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // No DB calls should have been made
    expect(prisma.playbookTrigger.create).not.toHaveBeenCalled();
    expect(prisma.playbookTrigger.updateMany).not.toHaveBeenCalled();
  });
});
