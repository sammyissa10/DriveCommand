/**
 * Service: computeDispatchReadiness
 *
 * Recomputes the instance's status (NOT_STARTED / IN_PROGRESS / BLOCKED / COMPLETED),
 * completionPercent, and isDispatchReady flag.
 *
 * CRITICAL: isDispatchBlocker is read from stepSnapshot (immutable snapshot created at
 * generatePlaybookInstance time), never from the live PlaybookStep template. This
 * ensures that template changes do not retroactively affect running checklists.
 *
 * Also updates the entity-level isDispatchReady field on User or Truck when applicable.
 * Emits a DISPATCH_READY push notification when readiness flips from false → true.
 * Emits an INSTANCE_BLOCKED in-app push when status flips to BLOCKED (not BLOCKED → BLOCKED).
 */
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { sendDispatchReady, sendInstanceBlocked } from './notifications';
import type { PlaybookEntityType } from '@/generated/prisma';

export async function computeDispatchReadiness(instanceId: string): Promise<{
  isReady: boolean;
  blockers: { id: string; status: string }[];
}> {
  const instance = await prisma.playbookInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: { stepInstances: true },
  });

  const total = instance.stepInstances.length;
  const completeCount = instance.stepInstances.filter(
    (s) => s.status === 'COMPLETE' || s.status === 'SKIPPED'
  ).length;
  const completionPercent = total > 0 ? Math.round((completeCount / total) * 100) : 100;

  // Read isDispatchBlocker from stepSnapshot (never from PlaybookStep template — snapshot immutability)
  const blockerSteps = instance.stepInstances.filter((s) => {
    const snap = s.stepSnapshot as { isDispatchBlocker?: boolean };
    return snap.isDispatchBlocker === true;
  });
  const openBlockers = blockerSteps.filter(
    (s) => s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS' || s.status === 'FAILED'
  );
  const isReady = openBlockers.length === 0;

  // Determine status
  let status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' = 'NOT_STARTED';
  if (completionPercent === 100) status = 'COMPLETED';
  else if (!isReady) status = 'BLOCKED';
  else if (completeCount > 0) status = 'IN_PROGRESS';

  const wasReady = instance.isDispatchReady;
  const wasBlocked = instance.status === 'BLOCKED';

  await prisma.playbookInstance.update({
    where: { id: instanceId },
    data: { completionPercent, isDispatchReady: isReady, status },
  });

  // Fire DISPATCH_READY notification only on false → true flip
  // IMPORTANT: strict gate — do NOT fire on repeated true → true calls (no notification spam)
  if (wasReady === false && isReady === true) {
    try {
      await sendDispatchReady({
        userId: instance.entityId,
        tenantId: instance.tenantId,
        playbookInstanceId: instanceId,
      });
    } catch (err) {
      logger.error('[computeDispatchReadiness] sendDispatchReady failed', { instanceId, err });
    }
  }

  // Fire INSTANCE_BLOCKED in-app push only on non-BLOCKED → BLOCKED transition
  // Prevents duplicate push on repeat calls when already blocked
  if (!wasBlocked && status === 'BLOCKED') {
    try {
      await sendInstanceBlocked({
        playbookInstanceId: instanceId,
        tenantId: instance.tenantId,
      });
    } catch (err) {
      logger.error('[computeDispatchReadiness] sendInstanceBlocked failed', { instanceId, err });
    }
  }

  // Aggregate entity-level readiness
  await updateEntityReadiness(instance.entityType, instance.entityId, instance.tenantId);

  return { isReady, blockers: openBlockers.map((s) => ({ id: s.id, status: s.status })) };
}

async function updateEntityReadiness(
  entityType: PlaybookEntityType,
  entityId: string,
  tenantId: string
) {
  // An entity is ready only when every non-completed active instance is ready
  const activeInstances = await prisma.playbookInstance.findMany({
    where: { entityId, tenantId, status: { not: 'COMPLETED' } },
    select: { isDispatchReady: true },
  });
  const entityReady =
    activeInstances.length === 0 || activeInstances.every((i) => i.isDispatchReady);

  if (entityType === 'DRIVER') {
    await prisma.user.update({ where: { id: entityId }, data: { isDispatchReady: entityReady } });
  }
  // VEHICLE: CarrierTruck has no isDispatchReady column — readiness tracked on PlaybookInstance only
  // PARTNER, DISPATCH, OTHER: no entity-level field to update
}
