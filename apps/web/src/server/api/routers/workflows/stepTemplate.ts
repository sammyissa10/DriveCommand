/**
 * tRPC router for StepTemplate CRUD.
 * All queries are scoped by ctx.tenantId — tenant isolation is NON-NEGOTIABLE.
 * Mutations require adminProcedure (OWNER or MANAGER role).
 * Queries use tenantMemberProcedure (any authenticated role).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, adminProcedure, tenantMemberProcedure } from '@/server/api/trpc';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import {
  createStepTemplateSchema,
  updateStepTemplateSchema,
  stepTypeSchema,
  assigneeRoleSchema,
} from '@drivecommand/validation';

const list = tenantMemberProcedure
  .input(
    z.object({
      stepType: stepTypeSchema.optional(),
      assigneeRole: assigneeRoleSchema.optional(),
    })
  )
  .query(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    return tenantPrisma.stepTemplate.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        deletedAt: null,
        ...(input.stepType ? { stepType: input.stepType } : {}),
        ...(input.assigneeRole ? { assigneeRole: input.assigneeRole } : {}),
      },
      orderBy: { name: 'asc' },
    });
  });

const getById = tenantMemberProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    const stepTemplate = await tenantPrisma.stepTemplate.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!stepTemplate) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return stepTemplate;
  });

const create = adminProcedure
  .input(createStepTemplateSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    return tenantPrisma.stepTemplate.create({
      data: {
        ...input,
        tenantId: ctx.tenantId,
      },
    });
  });

const update = adminProcedure
  .input(updateStepTemplateSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    const { id, ...rest } = input;
    const existing = await tenantPrisma.stepTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return tenantPrisma.stepTemplate.update({
      where: { id: existing.id },
      data: { ...rest },
    });
  });

const archive = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    const existing = await tenantPrisma.stepTemplate.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    await tenantPrisma.stepTemplate.update({
      where: { id: existing.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { success: true };
  });

export const stepTemplateRouter = router({
  list,
  getById,
  create,
  update,
  archive,
});
