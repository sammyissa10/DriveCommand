/**
 * tRPC router for StepInstance operations.
 *
 * Procedures:
 *   complete        — tenantMemberProcedure: complete a step (any authenticated user can complete
 *                     their own steps; APPROVAL steps are restricted at service layer)
 *   skip            — adminProcedure: skip a step with a required reason (dispatcher/admin only)
 *   getForDriver    — tenantMemberProcedure: paginated open steps assigned to the caller
 *   fail            — tenantMemberProcedure: record INSPECTION_ITEM failure + block instance
 *   requestApproval — tenantMemberProcedure: advance ad-hoc APPROVAL step to IN_PROGRESS
 *   approve         — adminProcedure: dispatcher approves the mechanic APPROVAL step
 *
 * All queries filter by tenantId (via playbookInstance relation) — tenant isolation is NON-NEGOTIABLE.
 */
import { z } from 'zod';
import { router, adminProcedure, tenantMemberProcedure } from '@/server/api/trpc';
import {
  completeStepSchema,
  skipStepSchema,
  getForDriverSchema,
  failInspectionItemSchema,
  approveStepSchema,
} from '@drivecommand/validation';
import { TRPCError } from '@trpc/server';
import { completeStep } from '@/server/services/workflows/completeStep';
import { skipStep } from '@/server/services/workflows/skipStep';
import { failInspectionItem } from '@/server/services/workflows/failInspectionItem';
import { computeDispatchReadiness } from '@/server/services/workflows/computeDispatchReadiness';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { prisma } from '@/lib/db/prisma'; // kept for user.findMany — platform table
import { getTenantPrisma } from '@/lib/context/tenant-context';

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
    const tenantPrisma = await getTenantPrisma();
    const { cursor, take } = input;
    const steps = await tenantPrisma.stepInstance.findMany({
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

const fail = tenantMemberProcedure
  .input(failInspectionItemSchema)
  .mutation(async ({ ctx, input }) => {
    return failInspectionItem({
      stepInstanceId: input.stepInstanceId,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      result: input.result,
    });
  });

const requestApproval = tenantMemberProcedure
  .input(z.object({ stepInstanceId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();

    // Move ad-hoc APPROVAL step to IN_PROGRESS and notify dispatchers
    const stepInstance = await tenantPrisma.stepInstance.findFirst({
      where: { id: input.stepInstanceId, playbookInstance: { tenantId: ctx.tenantId } },
    });
    if (!stepInstance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });

    await tenantPrisma.stepInstance.update({
      where: { id: input.stepInstanceId },
      data: { status: 'IN_PROGRESS' },
    });

    // Notify dispatchers: APPROVAL_NEEDED — user is a platform table
    const dispatchers = await prisma.user.findMany({
      where: { tenantId: ctx.tenantId, role: { in: ['OWNER', 'MANAGER'] } },
      select: { id: true },
    });
    for (const d of dispatchers) {
      await sendPushToUser(d.id, {
        title: 'Approval requested',
        body: 'A mechanic approval step is ready for review.',
        data: { type: 'APPROVAL_NEEDED', stepInstanceId: input.stepInstanceId },
      }).catch(() => {});
    }
    // TODO(phase-5): SMS for APPROVAL_NEEDED
  });

const approve = adminProcedure
  .input(approveStepSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();

    // Approve the APPROVAL step: mark COMPLETE, recompute readiness
    const stepInstance = await tenantPrisma.stepInstance.findFirst({
      where: { id: input.stepInstanceId, playbookInstance: { tenantId: ctx.tenantId } },
    });
    if (!stepInstance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
    if (stepInstance.status === 'COMPLETE') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already approved' });
    }

    await tenantPrisma.stepInstance.update({
      where: { id: input.stepInstanceId },
      data: {
        status: 'COMPLETE',
        completedByUserId: ctx.userId,
        completedAt: new Date(),
        result: { note: input.note ?? 'Approved by dispatcher' } as object,
      },
    });

    await computeDispatchReadiness(stepInstance.playbookInstanceId);
    // TODO(phase-5): SMS confirmation to driver
  });

export const stepInstanceRouter = router({
  complete,
  skip,
  getForDriver,
  fail,
  requestApproval,
  approve,
});
