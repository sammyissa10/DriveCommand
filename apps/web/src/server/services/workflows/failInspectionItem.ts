/**
 * Service: failInspectionItem
 *
 * Records an INSPECTION_ITEM step as FAILED, creates an ad-hoc mechanic APPROVAL
 * step when the playbook category is VEHICLE_INSPECTION, blocks the PlaybookInstance,
 * fires push notifications, and recomputes dispatch readiness.
 *
 * Spec reference: Section 6.4
 * TODO(phase-5): Add SMS delivery via Twilio for STEP_FAILED notifications.
 */
import { prisma } from '@/lib/db/prisma'; // platform table (user.findMany) kept bare
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { TRPCError } from '@trpc/server';
import { computeDispatchReadiness } from './computeDispatchReadiness';
import { sendStepFailed, sendApprovalNeeded } from './notifications';

export async function failInspectionItem(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  result: { photoUrls: string[]; note?: string };
}): Promise<void> {
  const { stepInstanceId, userId, tenantId, result } = args;

  const tenantPrisma = await getTenantPrisma();
  // Load step + instance + playbook for category check — all tenant-scoped
  const stepInstance = await tenantPrisma.stepInstance.findFirst({
    where: { id: stepInstanceId, playbookInstance: { tenantId } },
    include: {
      playbookInstance: {
        include: { playbook: { select: { category: true, name: true } } },
      },
    },
  });
  if (!stepInstance) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
  }
  if (stepInstance.status === 'FAILED') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task already failed' });
  }

  const snap = stepInstance.stepSnapshot as {
    name?: string;
    defaultConfig?: { requiresPhoto?: boolean };
  };

  // Validate photo requirement (read from stepSnapshot.defaultConfig per research)
  const requiresPhoto =
    (snap.defaultConfig as { requiresPhoto?: boolean } | undefined)?.requiresPhoto === true;
  if (requiresPhoto && (!result.photoUrls || result.photoUrls.length === 0)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'PHOTO_REQUIRED' });
  }

  const playbookInstance = stepInstance.playbookInstance;
  const playbookCategory = playbookInstance.playbook.category;

  // 1. Mark step as FAILED
  await tenantPrisma.stepInstance.update({
    where: { id: stepInstanceId },
    data: {
      status: 'FAILED',
      completedByUserId: userId,
      completedAt: new Date(),
      result: result as object,
    },
  });

  // 2. If VEHICLE_INSPECTION: create ad-hoc mechanic APPROVAL step (stepTemplateId is now nullable)
  let adHocStepId: string | undefined;
  if (playbookCategory === 'VEHICLE_INSPECTION') {
    const stepName = snap.name ?? 'Inspection Item';
    const adHocStep = await tenantPrisma.stepInstance.create({
      data: {
        tenantId, // required after quick-327 tenantId backfill
        playbookInstanceId: stepInstance.playbookInstanceId,
        stepTemplateId: null, // ad-hoc step — no template
        stepSnapshot: {
          name: `Repair sign-off: ${stepName}`,
          stepType: 'APPROVAL',
          assigneeRole: 'MECHANIC',
          isDispatchBlocker: true,
          adHoc: true,
        },
        assigneeRole: 'MECHANIC',
        assignedUserId: null,
        status: 'NOT_STARTED',
      },
    });
    adHocStepId = adHocStep.id;
  }

  // 3. Block the PlaybookInstance
  await tenantPrisma.playbookInstance.update({
    where: { id: stepInstance.playbookInstanceId },
    data: { status: 'BLOCKED' },
  });

  // 4. Send push notifications via centralized module (best-effort — do not throw on push failure)
  // STEP_FAILED — dispatcher variant
  await sendStepFailed({ stepInstanceId, tenantId, recipientRole: 'DISPATCHER' });

  // If VEHICLE_INSPECTION: also send STEP_FAILED mechanic variant + APPROVAL_NEEDED
  if (playbookCategory === 'VEHICLE_INSPECTION') {
    await sendStepFailed({ stepInstanceId, tenantId, recipientRole: 'MECHANIC' });

    // APPROVAL_NEEDED — sent to dispatchers (OWNER/MANAGER) since no MECHANIC user role exists
    // Use ad-hoc step ID if available; fall back to the original step
    const approvalStepId = adHocStepId ?? stepInstanceId;
    const dispatchers = await prisma.user.findMany({
      where: { tenantId, role: { in: ['OWNER', 'MANAGER'] }, isActive: true },
      select: { id: true },
    });
    for (const dispatcher of dispatchers) {
      await sendApprovalNeeded({
        stepInstanceId: approvalStepId,
        tenantId,
        approverUserId: dispatcher.id,
      });
    }
  }

  // 5. Recompute dispatch readiness — vehicle flips isDispatchReady=false
  await computeDispatchReadiness(stepInstance.playbookInstanceId);
}
