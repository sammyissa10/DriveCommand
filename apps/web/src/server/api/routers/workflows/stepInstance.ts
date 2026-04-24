/**
 * tRPC router for StepInstance operations.
 *
 * Procedures:
 *   complete     — tenantMemberProcedure: complete a step (any authenticated user can complete
 *                  their own steps; APPROVAL steps are restricted at service layer)
 *   skip         — adminProcedure: skip a step with a required reason (dispatcher/admin only)
 *   getForDriver — tenantMemberProcedure: paginated open steps assigned to the caller
 *
 * All queries filter by tenantId (via playbookInstance relation) — tenant isolation is NON-NEGOTIABLE.
 */
import { router, adminProcedure, tenantMemberProcedure } from '@/server/api/trpc';
import {
  completeStepSchema,
  skipStepSchema,
  getForDriverSchema,
} from '@drivecommand/validation';
import { completeStep } from '@/server/services/workflows/completeStep';
import { skipStep } from '@/server/services/workflows/skipStep';
import { prisma } from '@/lib/db/prisma';

const complete = tenantMemberProcedure
  .input(completeStepSchema)
  .mutation(async ({ ctx, input }) => {
    return completeStep({
      stepInstanceId: input.stepInstanceId,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      result: input.result,
    });
  });

const skip = adminProcedure
  .input(skipStepSchema)
  .mutation(async ({ ctx, input }) => {
    return skipStep({
      stepInstanceId: input.stepInstanceId,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      reason: input.reason,
    });
  });

const getForDriver = tenantMemberProcedure
  .input(getForDriverSchema)
  .query(async ({ ctx, input }) => {
    const { cursor, take } = input;
    const steps = await prisma.stepInstance.findMany({
      where: {
        assignedUserId: ctx.userId,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        playbookInstance: { tenantId: ctx.tenantId },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [{ dueDate: 'asc' }],
      take: take + 1,
      include: {
        playbookInstance: {
          select: {
            id: true,
            entityType: true,
            entityId: true,
            playbookSnapshot: true,
          },
        },
      },
    });

    let nextCursor: string | undefined;
    if (steps.length > take) {
      nextCursor = steps.pop()!.id;
    }

    return { steps, nextCursor };
  });

export const stepInstanceRouter = router({
  complete,
  skip,
  getForDriver,
});
