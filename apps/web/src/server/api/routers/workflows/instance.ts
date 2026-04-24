/**
 * tRPC router for PlaybookInstance (Active Checklist) operations.
 *
 * Procedures:
 *   generate            — adminProcedure: create an Active Checklist from a Playbook
 *   list                — tenantMemberProcedure: paginated list, sorted BLOCKED→IN_PROGRESS→NOT_STARTED→COMPLETED
 *   get                 — tenantMemberProcedure: single instance by ID
 *   getForEntity        — tenantMemberProcedure: all instances for a given entityId + entityType
 *   computeReadiness    — adminProcedure: manually re-trigger dispatch readiness computation
 *   getDriverReadiness  — tenantMemberProcedure: readiness check by CarrierDriver.id (for dispatch enforcement)
 *
 * All queries filter by ctx.tenantId — tenant isolation is NON-NEGOTIABLE.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, adminProcedure, tenantMemberProcedure } from '@/server/api/trpc';
import {
  generateInstanceSchema,
  listInstancesSchema,
  getInstanceSchema,
  getForEntitySchema,
  computeReadinessSchema,
} from '@drivecommand/validation';
import { generatePlaybookInstance } from '@/server/services/workflows/generatePlaybookInstance';
import { computeDispatchReadiness } from '@/server/services/workflows/computeDispatchReadiness';
import { prisma } from '@/lib/db/prisma';

const generate = adminProcedure
  .input(generateInstanceSchema)
  .mutation(async ({ ctx, input }) => {
    return generatePlaybookInstance({
      playbookId: input.playbookId,
      entityType: input.entityType,
      entityId: input.entityId,
      tenantId: ctx.tenantId,
      triggeredBy: 'manual',
    });
  });

const list = tenantMemberProcedure
  .input(listInstancesSchema)
  .query(async ({ ctx, input }) => {
    const { status, entityType, entityId, cursor, take } = input;
    const instances = await prisma.playbookInstance.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status } : {}),
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [
        // Client-side sort applied after fetch (Prisma doesn't support CASE WHEN ordering)
        { createdAt: 'desc' },
      ],
      take: take + 1,
      include: { stepInstances: { select: { id: true, status: true, dueDate: true } } },
    });

    // Sort: BLOCKED first, then IN_PROGRESS, then NOT_STARTED, then COMPLETED
    const statusOrder: Record<string, number> = {
      BLOCKED: 0,
      IN_PROGRESS: 1,
      NOT_STARTED: 2,
      COMPLETED: 3,
    };
    instances.sort(
      (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
    );

    let nextCursor: string | undefined;
    if (instances.length > take) {
      nextCursor = instances.pop()!.id;
    }

    return { instances, nextCursor };
  });

const get = tenantMemberProcedure
  .input(getInstanceSchema)
  .query(async ({ ctx, input }) => {
    const instance = await prisma.playbookInstance.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
      include: { stepInstances: true },
    });
    if (!instance) throw new TRPCError({ code: 'NOT_FOUND' });
    return instance;
  });

const getForEntity = tenantMemberProcedure
  .input(getForEntitySchema)
  .query(async ({ ctx, input }) => {
    return prisma.playbookInstance.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      orderBy: { createdAt: 'desc' },
      include: { stepInstances: { select: { id: true, status: true } } },
    });
  });

const computeReadiness = adminProcedure
  .input(computeReadinessSchema)
  .mutation(async ({ ctx, input }) => {
    // Verify tenant ownership before computing
    const instance = await prisma.playbookInstance.findFirst({
      where: { id: input.instanceId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!instance) throw new TRPCError({ code: 'NOT_FOUND' });
    return computeDispatchReadiness(input.instanceId);
  });

/**
 * getDriverReadiness — given a CarrierDriver.id, returns:
 *   isReady: boolean (from User.isDispatchReady)
 *   blockerStepNames: string[] — names of open blocker steps across all non-completed instances
 *   openInstanceId: string | null — first non-completed instance ID (for "View Checklist" link)
 *
 * This powers the dispatch enforcement modal in NewDispatchForm.
 * SCOPE: only DRIVER entity instances are checked (per Phase 45 scope, no truck enforcement).
 */
const getDriverReadiness = tenantMemberProcedure
  .input(z.object({ carrierDriverId: z.string().uuid() }))
  .query(async ({ ctx, input }): Promise<{
    isReady: boolean;
    blockerStepNames: string[];
    openInstanceId: string | null;
    userId: string | null;
  }> => {
    // Look up the CarrierDriver to get the linked User ID
    const carrierDriver = await prisma.carrierDriver.findFirst({
      where: { id: input.carrierDriverId, orgId: ctx.tenantId },
      select: { userId: true },
    });

    if (!carrierDriver?.userId) {
      // No linked user — treat as ready (no checklist enforcement applies)
      return { isReady: true, blockerStepNames: [], openInstanceId: null, userId: null };
    }

    const userId = carrierDriver.userId;

    // Check User.isDispatchReady (updated by computeDispatchReadiness service)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isDispatchReady: true },
    });

    const isReady = user?.isDispatchReady ?? true;

    if (isReady) {
      return { isReady: true, blockerStepNames: [], openInstanceId: null, userId };
    }

    // Collect open blocker step names from all active (non-completed) DRIVER instances for this user
    const activeInstances = await prisma.playbookInstance.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityType: 'DRIVER',
        entityId: userId,
        status: { not: 'COMPLETED' },
      },
      include: {
        stepInstances: {
          where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'FAILED'] } },
          select: { stepSnapshot: true, status: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const blockerStepNames: string[] = [];
    let openInstanceId: string | null = null;

    for (const inst of activeInstances) {
      if (!openInstanceId) openInstanceId = inst.id;
      for (const step of inst.stepInstances) {
        const snap = step.stepSnapshot as { isDispatchBlocker?: boolean; title?: string; name?: string };
        if (snap.isDispatchBlocker === true) {
          blockerStepNames.push(snap.title ?? snap.name ?? 'Required step');
        }
      }
    }

    return { isReady: false, blockerStepNames, openInstanceId, userId };
  });

export const instanceRouter = router({
  generate,
  list,
  get,
  getForEntity,
  computeReadiness,
  getDriverReadiness,
});
