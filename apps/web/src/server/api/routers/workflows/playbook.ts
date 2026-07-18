/**
 * tRPC router for Playbook CRUD + step management.
 * All queries are scoped by ctx.tenantId — tenant isolation is NON-NEGOTIABLE.
 * 9 procedures total: list, getById, create, update, delete, addStep, removeStep, updateStep, reorderSteps.
 * Mutations require adminProcedure (OWNER or MANAGER role).
 * Queries use tenantMemberProcedure (any authenticated role).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { router, adminProcedure, tenantMemberProcedure } from '@/server/api/trpc';
import { prisma } from '@/lib/db/prisma'; // kept for $transaction
import { getTenantPrisma } from '@/lib/context/tenant-context';
import {
  createPlaybookSchema,
  updatePlaybookSchema,
  addStepSchema,
  removeStepSchema,
  updatePlaybookStepSchema,
  reorderStepsSchema,
  playbookEntityTypeSchema,
} from '@drivecommand/validation';
import { reorderPlaybookSteps } from '@/server/services/workflows/playbookStepService';

const list = tenantMemberProcedure
  .input(z.object({ entityType: playbookEntityTypeSchema.optional() }))
  .query(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    return tenantPrisma.playbook.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        ...(input.entityType ? { entityType: input.entityType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { steps: true } },
      },
    });
  });

const getById = tenantMemberProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    const playbook = await tenantPrisma.playbook.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        steps: {
          include: { stepTemplate: true },
          orderBy: [
            { playbookPhase: 'asc' },
            { sequence: 'asc' },
          ],
        },
      },
    });
    if (!playbook) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return playbook;
  });

const create = adminProcedure
  .input(createPlaybookSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    return tenantPrisma.playbook.create({
      data: {
        ...input,
        tenantId: ctx.tenantId,
      },
    });
  });

const update = adminProcedure
  .input(updatePlaybookSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    const { id, ...rest } = input;
    const existing = await tenantPrisma.playbook.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return tenantPrisma.playbook.update({
      where: { id: existing.id },
      data: { ...rest },
    });
  });

const archiveProc = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    const existing = await tenantPrisma.playbook.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    await tenantPrisma.playbook.update({
      where: { id: existing.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { success: true };
  });

const duplicate = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    const source = await tenantPrisma.playbook.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        steps: { orderBy: [{ playbookPhase: 'asc' }, { sequence: 'asc' }] },
      },
    });
    if (!source) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return prisma.$transaction(async (tx) => {
      const copy = await tx.playbook.create({
        data: {
          tenantId: ctx.tenantId,
          name: `${source.name} (copy)`,
          description: source.description,
          entityType: source.entityType,
          category: source.category,
          playbookPhase: source.playbookPhase,
        },
      });
      if (source.steps.length > 0) {
        await tx.playbookStep.createMany({
          data: source.steps.map((s) => ({
            playbookId: copy.id,
            stepTemplateId: s.stepTemplateId,
            sequence: s.sequence,
            playbookPhase: s.playbookPhase,
            overrideConfig: s.overrideConfig ?? {},
            isRequired: s.isRequired,
            isDispatchBlocker: s.isDispatchBlocker,
            dueDaysFromStart: s.dueDaysFromStart,
            dueBeforeDispatch: s.dueBeforeDispatch,
            tenantId: ctx.tenantId, // required after quick-327 tenantId backfill
          })),
        });
      }
      return copy;
    });
  });

const addStep = adminProcedure
  .input(addStepSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();

    // Verify the playbook belongs to this tenant
    const playbook = await tenantPrisma.playbook.findFirst({
      where: { id: input.playbookId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!playbook) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' });
    }

    // Verify the StepTemplate belongs to this tenant
    const stepTemplate = await tenantPrisma.stepTemplate.findFirst({
      where: { id: input.stepTemplateId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!stepTemplate) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'StepTemplate not found' });
    }

    // Compute sequence if not provided
    let sequence = input.sequence;
    if (sequence === undefined) {
      const lastStep = await tenantPrisma.playbookStep.findFirst({
        where: { playbookId: input.playbookId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      sequence = lastStep ? lastStep.sequence + 1 : 0;
    }

    return tenantPrisma.playbookStep.create({
      data: {
        tenantId: ctx.tenantId, // required after quick-327 tenantId backfill
        playbookId: input.playbookId,
        stepTemplateId: input.stepTemplateId,
        playbookPhase: input.playbookPhase,
        sequence,
        overrideConfig: input.overrideConfig,
      },
      include: { stepTemplate: true },
    });
  });

const removeStep = adminProcedure
  .input(removeStepSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();

    // Verify the playbook belongs to this tenant
    const playbook = await tenantPrisma.playbook.findFirst({
      where: { id: input.playbookId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!playbook) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' });
    }

    // Verify the step belongs to this playbook
    const step = await tenantPrisma.playbookStep.findFirst({
      where: { id: input.stepId, playbookId: input.playbookId },
    });
    if (!step) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Step not found in this playbook' });
    }

    // Hard delete of the junction row (StepTemplate itself is retained)
    await tenantPrisma.playbookStep.delete({ where: { id: step.id } });
    return { success: true };
  });

const updateStep = adminProcedure
  .input(updatePlaybookStepSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();

    // 1. Verify the Playbook belongs to ctx.tenantId
    const playbook = await tenantPrisma.playbook.findFirst({
      where: { id: input.playbookId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!playbook) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // 2. Verify the PlaybookStep belongs to that playbook
    const step = await tenantPrisma.playbookStep.findFirst({
      where: { id: input.stepId, playbookId: input.playbookId },
    });
    if (!step) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // 3. Build the update data object
    const data: Prisma.PlaybookStepUpdateInput = {
      overrideConfig: input.overrideConfig,
    };
    if (input.playbookPhase !== undefined) {
      data.playbookPhase = input.playbookPhase;
    }
    if (input.dueWithinHours !== undefined) {
      data.dueWithinHours = input.dueWithinHours;
    }
    if (input.overdueRecipient !== undefined) {
      data.overdueRecipient = input.overdueRecipient;
    }

    // 4. Return the updated PlaybookStep with stepTemplate so client can re-render without refetch
    return tenantPrisma.playbookStep.update({
      where: { id: step.id },
      data,
      include: { stepTemplate: true },
    });
  });

const reorderSteps = adminProcedure
  .input(reorderStepsSchema)
  .mutation(async ({ ctx, input }) => {
    await reorderPlaybookSteps({
      playbookId: input.playbookId,
      tenantId: ctx.tenantId,
      steps: input.steps.map((s) => ({
        stepId: s.stepId,
        sequence: s.sequence,
        playbookPhase: s.playbookPhase,
      })),
    });

    // Return updated playbook with steps (same shape as getById)
    const tenantPrisma = await getTenantPrisma();
    return tenantPrisma.playbook.findFirst({
      where: { id: input.playbookId, tenantId: ctx.tenantId },
      include: {
        steps: {
          include: { stepTemplate: true },
          orderBy: [
            { playbookPhase: 'asc' },
            { sequence: 'asc' },
          ],
        },
      },
    });
  });

export const playbookRouter = router({
  list,
  getById,
  create,
  update,
  archive: archiveProc,
  duplicate,
  addStep,
  removeStep,
  updateStep,
  reorderSteps,
});
