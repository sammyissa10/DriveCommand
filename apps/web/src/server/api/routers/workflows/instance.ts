/**
 * tRPC router for PlaybookInstance (Active Checklist) operations.
 *
 * Procedures:
 *   generate            — adminProcedure: create an Active Checklist from a Playbook
 *   list                — tenantMemberProcedure: paginated list across ALL statuses (NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED) when no `status` filter is passed; sorted BLOCKED→IN_PROGRESS→NOT_STARTED→COMPLETED. Callers that want to exclude e.g. COMPLETED must pass `status` explicitly or filter client-side.
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
import { deriveDriverReadiness } from '@/server/services/workflows/deriveDriverReadiness';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma'; // kept for $transaction (bypass_rls) + user platform table
import { getTenantPrisma } from '@/lib/context/tenant-context';

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
    const tenantPrisma = await getTenantPrisma();
    const { status, entityType, entityId, cursor, take } = input;
    const instances = await tenantPrisma.playbookInstance.findMany({
      where: {
        tenantId: ctx.tenantId,
        // No filter ⇒ returns all statuses including NOT_STARTED — Active Work Board relies on this.
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
    const tenantPrisma = await getTenantPrisma();
    const instance = await tenantPrisma.playbookInstance.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
      include: { stepInstances: true },
    });
    if (!instance) throw new TRPCError({ code: 'NOT_FOUND' });

    // Resolve user display names for audit log (secondary query — skippedByUserId has no Prisma relation)
    const skippedUserIds = [
      ...new Set(
        instance.stepInstances
          .filter((s) => s.skippedByUserId != null)
          .map((s) => s.skippedByUserId!),
      ),
    ];

    const skippedByUsers: Record<string, { fullName: string }> = {};
    if (skippedUserIds.length > 0) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { id: { in: skippedUserIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);

      for (const u of users) {
        const full = [u.firstName, u.lastName].filter(Boolean).join(' ');
        skippedByUsers[u.id] = { fullName: full || u.email || 'Unknown' };
      }
    }

    return { ...instance, skippedByUsers };
  });

const getForEntity = tenantMemberProcedure
  .input(getForEntitySchema)
  .query(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();
    return tenantPrisma.playbookInstance.findMany({
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
    const tenantPrisma = await getTenantPrisma();
    // Verify tenant ownership before computing
    const instance = await tenantPrisma.playbookInstance.findFirst({
      where: { id: input.instanceId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!instance) throw new TRPCError({ code: 'NOT_FOUND' });
    return computeDispatchReadiness(input.instanceId);
  });

/**
 * getDriverReadiness — given a CarrierDriver.id, returns:
 *   isReady: boolean — derived LIVE from open step instances (see deriveDriverReadiness),
 *     NOT from the stale User.isDispatchReady column. This makes the "unactionable
 *     dead-end" (isReady:false with zero blocker names) impossible by construction.
 *   blockerStepNames: string[] — names of open blocker steps across all active instances
 *   openInstanceId: string | null — an active instance ID (for "View Checklist" link)
 *   warning?: 'NO_ONBOARDING_INSTANCE' — set when the driver has zero active DRIVER
 *     instances at all (e.g. onboarding never fired). isReady is still true in this
 *     case (nothing to block on) but the caller can surface the warning as a nudge.
 *
 * This powers the dispatch enforcement modal in NewDispatchForm.
 * SCOPE: only DRIVER entity instances are checked (per Phase 45 scope, no truck enforcement).
 * This resolver is READ-ONLY — it never creates PlaybookInstances (that would be a side
 * effect inside a tRPC query). Auto-start wiring (quick-497 Task 2) + the backfill script
 * (Task 3) are responsible for instances existing before this resolver ever runs.
 */
const getDriverReadiness = tenantMemberProcedure
  .input(z.object({ carrierDriverId: z.string().uuid() }))
  .query(async ({ ctx, input }): Promise<{
    isReady: boolean;
    blockerStepNames: string[];
    openInstanceId: string | null;
    userId: string | null;
    warning?: 'NO_ONBOARDING_INSTANCE';
  }> => {
    const tenantPrisma = await getTenantPrisma();

    // Look up the CarrierDriver to get the linked User ID
    const carrierDriver = await tenantPrisma.carrierDriver.findFirst({
      where: { id: input.carrierDriverId, orgId: ctx.tenantId },
      select: { userId: true },
    });

    if (!carrierDriver?.userId) {
      // No linked user — treat as ready (no checklist enforcement applies)
      return { isReady: true, blockerStepNames: [], openInstanceId: null, userId: null };
    }

    const userId = carrierDriver.userId;

    // Load active (non-completed) DRIVER instances for this user, including step status +
    // snapshot so the pure helper can classify open blockers. No status filter on
    // stepInstances here — deriveDriverReadiness classifies open vs. complete itself.
    const activeInstances = await tenantPrisma.playbookInstance.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityType: 'DRIVER',
        entityId: userId,
        status: { not: 'COMPLETED' },
      },
      include: {
        stepInstances: {
          select: { stepSnapshot: true, status: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (activeInstances.length === 0) {
      // No onboarding checklist exists for this driver at all — nothing to gate on.
      // Read-only resolver: do NOT create an instance here.
      return {
        isReady: true,
        blockerStepNames: [],
        openInstanceId: null,
        userId,
        warning: 'NO_ONBOARDING_INSTANCE',
      };
    }

    const result = deriveDriverReadiness(activeInstances);
    return { ...result, userId };
  });

export const instanceRouter = router({
  generate,
  list,
  get,
  getForEntity,
  computeReadiness,
  getDriverReadiness,
});
