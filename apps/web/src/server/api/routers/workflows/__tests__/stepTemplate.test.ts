/**
 * Unit tests for the stepTemplate tRPC router (plan Task 8b, spec Section 15 Phase 1).
 *
 * Verifies tenant scoping, soft-delete behavior, and access control.
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
    stepTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    playbook: { findMany: vi.fn(), findFirst: vi.fn() },
    playbookStep: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEMPLATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeContext(tenantId = TENANT_A, role = 'OWNER'): { session: SessionData; headers: Headers } {
  return {
    session: { userId: 'user-1', email: 'test@test.com', role, tenantId },
    headers: new Headers(),
  };
}

const createCaller = createCallerFactory(appRouter);

describe('stepTemplate router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns only records for calling tenant', async () => {
      const caller = createCaller(makeContext(TENANT_A));
      vi.mocked(prisma.stepTemplate.findMany).mockResolvedValue([
        { id: TEMPLATE_ID, tenantId: TENANT_A, name: 'Upload Doc', isActive: true } as never,
      ]);

      await caller.workflows.stepTemplate.list({});

      expect(vi.mocked(prisma.stepTemplate.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
      );
    });

    it('excludes archived (isActive=false) templates', async () => {
      const caller = createCaller(makeContext(TENANT_A));
      vi.mocked(prisma.stepTemplate.findMany).mockResolvedValue([]);

      await caller.workflows.stepTemplate.list({});

      expect(vi.mocked(prisma.stepTemplate.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true, deletedAt: null }),
        })
      );
    });
  });

  describe('create', () => {
    it('sets tenantId from ctx, not from input', async () => {
      const caller = createCaller(makeContext(TENANT_A));
      vi.mocked(prisma.stepTemplate.create).mockResolvedValue({
        id: TEMPLATE_ID,
        tenantId: TENANT_A,
        name: 'My Step',
      } as never);

      await caller.workflows.stepTemplate.create({
        name: 'My Step',
        stepType: 'DOCUMENT_UPLOAD',
        assigneeRole: 'DRIVER',
      });

      expect(vi.mocked(prisma.stepTemplate.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A }),
        })
      );
    });
  });

  describe('archive', () => {
    it('soft-deletes by setting isActive=false and deletedAt', async () => {
      const caller = createCaller(makeContext(TENANT_A));
      vi.mocked(prisma.stepTemplate.findFirst).mockResolvedValue({
        id: TEMPLATE_ID,
        tenantId: TENANT_A,
        isActive: true,
        deletedAt: null,
      } as never);
      vi.mocked(prisma.stepTemplate.update).mockResolvedValue({} as never);

      const result = await caller.workflows.stepTemplate.archive({ id: TEMPLATE_ID });

      expect(result).toEqual({ success: true });
      expect(vi.mocked(prisma.stepTemplate.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
        })
      );
    });

    it('throws NOT_FOUND for a cross-tenant id (tenant isolation)', async () => {
      // When the template belongs to TENANT_B, findFirst with TENANT_A's context returns null
      const caller = createCaller(makeContext(TENANT_A));
      vi.mocked(prisma.stepTemplate.findFirst).mockResolvedValue(null);

      await expect(
        caller.workflows.stepTemplate.archive({ id: TEMPLATE_ID })
      ).rejects.toThrow(TRPCError);

      const call = vi.mocked(prisma.stepTemplate.findFirst).mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.tenantId).toBe(TENANT_A);
    });
  });
});
