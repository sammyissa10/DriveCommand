/**
 * Service: skipStep
 *
 * Skips a StepInstance with a required reason. Only dispatchers/admins may skip
 * (enforced at the tRPC layer via adminProcedure). After skipping, recomputes
 * dispatch readiness so BLOCKED status is updated immediately.
 */
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { TRPCError } from '@trpc/server';
import { computeDispatchReadiness } from './computeDispatchReadiness';

export async function skipStep(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  reason: string;
}) {
  const { stepInstanceId, userId, tenantId, reason } = args;

  const tenantPrisma = await getTenantPrisma();
  const stepInstance = await tenantPrisma.stepInstance.findFirst({
    where: {
      id: stepInstanceId,
      playbookInstance: { tenantId },
    },
  });
  if (!stepInstance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
  if (stepInstance.status === 'COMPLETE') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task already complete' });
  }

  const updated = await tenantPrisma.stepInstance.update({
    where: { id: stepInstanceId },
    data: {
      status: 'SKIPPED',
      skipReason: reason,
      skippedByUserId: userId,
    },
  });

  await computeDispatchReadiness(stepInstance.playbookInstanceId);

  return updated;
}
