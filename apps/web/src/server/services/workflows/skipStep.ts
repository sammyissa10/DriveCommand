/**
 * Service: skipStep
 *
 * Skips a StepInstance with a required reason, then recomputes dispatch
 * readiness so a BLOCKED instance clears immediately.
 *
 * WHO MAY CALL THIS — corrected in Phase 9-web. The header used to read "Only
 * dispatchers/admins may skip (enforced at the tRPC layer via adminProcedure)".
 * That was not true of the code: this function checks tenant scope and nothing
 * else, and `POST /api/mobile/driver/tasks/[id]/skip` has called it with
 * `{ allowedRoles: ['DRIVER'] }` since it shipped. Mobile's N/A button works
 * because nobody enforced the documented restriction — a gap, not a permission.
 *
 * The restriction is NOT reinstated here, because N/A is a verb a driver
 * legitimately needs: "no trailer attached today" is the right answer to a
 * coupling-devices item, and Section 12 names it as one of the three. Instead
 * the authorisation lives at each caller, where the caller knows what it is
 * skipping and on whose behalf:
 *
 *   - `markDriverTaskNotApplicable` (web, driver) verifies the step is an
 *     INSPECTION_ITEM assigned to that driver before delegating.
 *   - the tRPC procedure keeps its admin gate, which is what lets a dispatcher
 *     skip any step for any reason.
 *
 * This function therefore trusts its caller and says so, rather than claiming a
 * check it does not perform. A comment that describes a guard which is not
 * there is worse than no comment: it is what stops the next reader looking.
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
