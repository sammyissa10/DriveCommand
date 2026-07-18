/**
 * Service helper for reordering PlaybookSteps.
 * Uses a two-phase transactional update to avoid UNIQUE(playbookId, sequence) constraint
 * violations during mid-reorder state — steps are first moved to large temporary sequences,
 * then updated to their final values.
 */
import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/db/prisma'; // kept for $transaction
import { getTenantPrisma } from '@/lib/context/tenant-context';
import type { PhaseType } from '@drivecommand/validation';

export async function reorderPlaybookSteps(params: {
  playbookId: string;
  tenantId: string;
  steps: Array<{ stepId: string; sequence: number; playbookPhase: PhaseType }>;
}): Promise<void> {
  const { playbookId, tenantId, steps } = params;

  const tenantPrisma = await getTenantPrisma();
  // 1. Verify the Playbook belongs to this tenant
  const playbook = await tenantPrisma.playbook.findFirst({
    where: { id: playbookId, tenantId, deletedAt: null },
  });
  if (!playbook) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }

  // 2. Verify every stepId in params.steps belongs to this playbook
  const stepIds = steps.map((s) => s.stepId);
  const existingSteps = await tenantPrisma.playbookStep.findMany({
    where: { playbookId, id: { in: stepIds } },
    select: { id: true },
  });
  if (existingSteps.length !== stepIds.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'One or more step IDs do not belong to this playbook',
    });
  }

  // 3. Transactional two-phase reorder to avoid unique constraint violations
  await prisma.$transaction(async (tx) => {
    // Phase A: Move all affected steps to large temporary sequence values to vacate their slots
    for (let i = 0; i < steps.length; i++) {
      await tx.playbookStep.update({
        where: { id: steps[i].stepId },
        data: { sequence: 10000 + i },
      });
    }

    // Phase B: Update each step to its final sequence and playbookPhase
    for (const step of steps) {
      await tx.playbookStep.update({
        where: { id: step.stepId },
        data: {
          sequence: step.sequence,
          playbookPhase: step.playbookPhase,
        },
      });
    }
  });
}
