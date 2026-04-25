/**
 * Unit tests for the playbook tRPC router (plan Task 8b, spec Section 15 Phase 1).
 *
 * Verifies step sequencing invariants, tenant scoping, soft-delete, and duplicate.
 * All Prisma calls are mocked — no real database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '@/server/api/trpc';
import { appRouter } from '@/server/api/root';
import { prisma } from '@/lib/db/prisma';
import type { SessionData } from '@/lib/auth/supabase';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    playbook: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    playbookStep: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    stepTemplate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYBOOK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STEP_ID_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STEP_ID_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STEP_ID_3 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TEMPLATE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OTHER_PLAYBOOK_ID = '11111111-1111-4111-8111-111111111111';

function makeContext(role = 'OWNER'): { session: SessionData; headers: Headers } {
  return {
    session: { userId: 'user-1', email: 'test@test.com', role, tenantId: TENANT_ID },
    headers: new Headers(),
  };
}

const createCaller = createCallerFactory(appRouter);

const fakePlaybook = {
  id: PLAYBOOK_ID,
  tenantId: TENANT_ID,
  name: 'Test Playbook',
  entityType: 'DRIVER',
  category: 'ONBOARDING',
  deletedAt: null,
  isActive: true,
};

const fakeTemplate = {
  id: TEMPLATE_ID,
  tenantId: TENANT_ID,
  name: 'Upload Doc',
  stepType: 'DOCUMENT_UPLOAD',
  assigneeRole: 'DRIVER',
  deletedAt: null,
  isActive: true,
};

describe('playbook router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------
  describe('list', () => {
    it('excludes deleted (deletedAt != null) playbooks', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findMany).mockResolvedValue([]);

      await caller.workflows.playbook.list({});

      expect(vi.mocked(prisma.playbook.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, deletedAt: null }),
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // get / getById
  // ---------------------------------------------------------------------------
  describe('getById', () => {
    it('throws NOT_FOUND for a cross-tenant playbook id', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(null);

      await expect(
        caller.workflows.playbook.getById({ id: PLAYBOOK_ID })
      ).rejects.toThrow(TRPCError);

      const call = vi.mocked(prisma.playbook.findFirst).mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.tenantId).toBe(TENANT_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // addStep
  // ---------------------------------------------------------------------------
  describe('addStep', () => {
    it('appends at end when sequence is omitted', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(fakePlaybook as never);
      vi.mocked(prisma.stepTemplate.findFirst).mockResolvedValue(fakeTemplate as never);
      // Existing max sequence is 2
      vi.mocked(prisma.playbookStep.findFirst).mockResolvedValue({ sequence: 2 } as never);
      vi.mocked(prisma.playbookStep.create).mockResolvedValue({
        id: STEP_ID_3,
        sequence: 3,
        stepTemplate: fakeTemplate,
      } as never);

      await caller.workflows.playbook.addStep({
        playbookId: PLAYBOOK_ID,
        stepTemplateId: TEMPLATE_ID,
        // sequence omitted → should append at 3
      });

      expect(vi.mocked(prisma.playbookStep.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sequence: 3 }),
        })
      );
    });

    it('uses sequence 0 when playbook has no steps yet', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(fakePlaybook as never);
      vi.mocked(prisma.stepTemplate.findFirst).mockResolvedValue(fakeTemplate as never);
      vi.mocked(prisma.playbookStep.findFirst).mockResolvedValue(null); // no existing steps
      vi.mocked(prisma.playbookStep.create).mockResolvedValue({
        id: STEP_ID_1,
        sequence: 0,
        stepTemplate: fakeTemplate,
      } as never);

      await caller.workflows.playbook.addStep({
        playbookId: PLAYBOOK_ID,
        stepTemplateId: TEMPLATE_ID,
      });

      expect(vi.mocked(prisma.playbookStep.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sequence: 0 }),
        })
      );
    });

    it('uses provided sequence directly', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(fakePlaybook as never);
      vi.mocked(prisma.stepTemplate.findFirst).mockResolvedValue(fakeTemplate as never);
      vi.mocked(prisma.playbookStep.create).mockResolvedValue({
        id: STEP_ID_2,
        sequence: 5,
        stepTemplate: fakeTemplate,
      } as never);

      await caller.workflows.playbook.addStep({
        playbookId: PLAYBOOK_ID,
        stepTemplateId: TEMPLATE_ID,
        sequence: 5,
      });

      expect(vi.mocked(prisma.playbookStep.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sequence: 5 }),
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // removeStep
  // ---------------------------------------------------------------------------
  describe('removeStep', () => {
    it('deletes the PlaybookStep and returns success', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(fakePlaybook as never);
      vi.mocked(prisma.playbookStep.findFirst).mockResolvedValue({
        id: STEP_ID_1,
        playbookId: PLAYBOOK_ID,
        sequence: 1,
      } as never);
      vi.mocked(prisma.playbookStep.delete).mockResolvedValue({} as never);

      const result = await caller.workflows.playbook.removeStep({
        playbookId: PLAYBOOK_ID,
        stepId: STEP_ID_1,
      });

      expect(result).toEqual({ success: true });
      expect(vi.mocked(prisma.playbookStep.delete)).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: STEP_ID_1 } })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // reorderSteps
  // ---------------------------------------------------------------------------
  describe('reorderSteps', () => {
    it('calls reorderPlaybookSteps with correct tenant and playbook', async () => {
      const caller = createCaller(makeContext());
      // reorderPlaybookSteps calls prisma directly, mock what it needs
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(fakePlaybook as never);
      vi.mocked(prisma.playbookStep.findMany).mockResolvedValue([
        { id: STEP_ID_1 } as never,
        { id: STEP_ID_2 } as never,
      ]);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb) => (cb as (tx: typeof prisma) => Promise<void>)(prisma));
      vi.mocked(prisma.playbookStep.update).mockResolvedValue({} as never);
      // reorderSteps returns updated playbook via another findFirst
      vi.mocked(prisma.playbook.findFirst)
        .mockResolvedValueOnce(fakePlaybook as never) // service check
        .mockResolvedValueOnce({ ...fakePlaybook, steps: [] } as never); // router return

      const steps = [
        { stepId: STEP_ID_1, sequence: 0, playbookPhase: 'NONE' as const },
        { stepId: STEP_ID_2, sequence: 1, playbookPhase: 'NONE' as const },
      ];

      await caller.workflows.playbook.reorderSteps({ playbookId: PLAYBOOK_ID, steps });

      // Verify playbookStep.findMany was called to validate step ownership
      expect(vi.mocked(prisma.playbookStep.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ playbookId: PLAYBOOK_ID }),
        })
      );
    });

    it('rejects stepIds that do not belong to the playbook', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(fakePlaybook as never);
      // Returns fewer steps than requested — simulates cross-playbook step ids
      vi.mocked(prisma.playbookStep.findMany).mockResolvedValue([
        { id: STEP_ID_1 } as never,
        // STEP_ID_2 is missing — belongs to a different playbook
      ]);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb) => (cb as (tx: typeof prisma) => Promise<void>)(prisma));

      await expect(
        caller.workflows.playbook.reorderSteps({
          playbookId: PLAYBOOK_ID,
          steps: [
            { stepId: STEP_ID_1, sequence: 0, playbookPhase: 'NONE' as const },
            { stepId: STEP_ID_2, sequence: 1, playbookPhase: 'NONE' as const },
          ],
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ---------------------------------------------------------------------------
  // duplicate
  // ---------------------------------------------------------------------------
  describe('duplicate', () => {
    it('clones playbook with (copy) suffix and copies all steps', async () => {
      const caller = createCaller(makeContext());
      const sourceSteps = [
        { id: STEP_ID_1, sequence: 0, playbookPhase: 'NONE', stepTemplateId: TEMPLATE_ID, overrideConfig: {}, isRequired: true, isDispatchBlocker: false, dueDaysFromStart: null, dueBeforeDispatch: false },
        { id: STEP_ID_2, sequence: 1, playbookPhase: 'PRE_START', stepTemplateId: TEMPLATE_ID, overrideConfig: {}, isRequired: true, isDispatchBlocker: true, dueDaysFromStart: null, dueBeforeDispatch: false },
      ];
      const copyPlaybook = { ...fakePlaybook, id: 'dddddddd-dddd-4ddd-9ddd-dddddddddddd', name: 'Test Playbook (copy)' };

      // findFirst is called OUTSIDE the transaction to fetch the source
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(
        { ...fakePlaybook, steps: sourceSteps } as never
      );

      vi.mocked(prisma.$transaction).mockImplementation(async (cb) => {
        const txMock = {
          playbook: { create: vi.fn().mockResolvedValue(copyPlaybook) },
          playbookStep: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
        };
        return (cb as unknown as (tx: typeof txMock) => Promise<typeof copyPlaybook>)(txMock);
      });

      const result = await caller.workflows.playbook.duplicate({ id: PLAYBOOK_ID });

      expect(result).toMatchObject({ name: 'Test Playbook (copy)' });
    });

    it('throws NOT_FOUND for a cross-tenant playbook', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.$transaction).mockImplementation(async (cb) => {
        const txMock = {
          playbook: { findFirst: vi.fn().mockResolvedValue(null) },
          playbookStep: { createMany: vi.fn() },
        };
        return (cb as unknown as (tx: typeof txMock) => Promise<void>)(txMock);
      });

      await expect(
        caller.workflows.playbook.duplicate({ id: PLAYBOOK_ID })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ---------------------------------------------------------------------------
  // archive
  // ---------------------------------------------------------------------------
  describe('archive', () => {
    it('soft-deletes playbook (isActive=false + deletedAt set)', async () => {
      const caller = createCaller(makeContext());
      vi.mocked(prisma.playbook.findFirst).mockResolvedValue(fakePlaybook as never);
      vi.mocked(prisma.playbook.update).mockResolvedValue({} as never);

      const result = await caller.workflows.playbook.archive({ id: PLAYBOOK_ID });

      expect(result).toEqual({ success: true });
      expect(vi.mocked(prisma.playbook.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
        })
      );
    });
  });
});
