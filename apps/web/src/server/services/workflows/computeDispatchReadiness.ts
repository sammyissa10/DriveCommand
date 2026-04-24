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
 */
import { prisma } from '@/lib/db/prisma';
import { sendPushToUser } from '@/lib/notifications/send-push';
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

  await prisma.playbookInstance.update({
    where: { id: instanceId },
    data: { completionPercent, isDispatchReady: isReady, status },
  });

  // Emit DISPATCH_READY notification when readiness flips to true
  if (!wasReady && isReady) {
    await notifyDispatchers(instance.tenantId, instance.entityType, instance.entityId);
  }

  // Aggregate entity-level readiness
  await updateEntityReadiness(instance.entityType, instance.entityId, instance.tenantId);

  return { isReady, blockers: openBlockers.map((s) => ({ id: s.id, status: s.status })) };
}

async function notifyDispatchers(
  tenantId: string,
  entityType: PlaybookEntityType,
  entityId: string
) {
  try {
    const dispatchers = await prisma.user.findMany({
      where: { tenantId, role: { in: ['OWNER', 'MANAGER'] }, isActive: true },
      select: { id: true },
    });
    const entityLabel = await getEntityLabel(entityType, entityId, tenantId);
    await Promise.all(
      dispatchers.map((d) =>
        sendPushToUser(d.id, {
          title: 'Dispatch Ready',
          body: `${entityLabel} is dispatch ready — all required steps complete.`,
          data: { type: 'DISPATCH_READY' },
        }).catch(() => null) // best-effort
      )
    );
  } catch {
    // Notifications are best-effort
  }
}

async function getEntityLabel(
  entityType: PlaybookEntityType,
  entityId: string,
  tenantId: string
): Promise<string> {
  if (entityType === 'DRIVER') {
    const u = await prisma.user.findFirst({
      where: { id: entityId, tenantId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (u?.firstName || u?.lastName) {
      return [u.firstName, u.lastName].filter(Boolean).join(' ');
    }
    return u?.email ?? 'Driver';
  }
  if (entityType === 'VEHICLE') {
    const t = await prisma.truck.findFirst({
      where: { id: entityId, tenantId },
      select: { licensePlate: true },
    });
    return t ? `Truck ${t.licensePlate}` : 'Vehicle';
  }
  return 'Entity';
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
  } else if (entityType === 'VEHICLE') {
    await prisma.truck.update({ where: { id: entityId }, data: { isDispatchReady: entityReady } });
  }
  // PARTNER, DISPATCH, OTHER: no entity-level field to update
}
