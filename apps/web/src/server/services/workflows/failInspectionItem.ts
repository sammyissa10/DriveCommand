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
import { prisma } from '@/lib/db/prisma';
import { TRPCError } from '@trpc/server';
import { computeDispatchReadiness } from './computeDispatchReadiness';
import { sendPushToUser } from '@/lib/notifications/send-push';

export async function failInspectionItem(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  result: { photoUrls: string[]; note?: string };
}): Promise<void> {
  const { stepInstanceId, userId, tenantId, result } = args;

  // Load step + instance + playbook for category check — all tenant-scoped
  const stepInstance = await prisma.stepInstance.findFirst({
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
  const stepName = snap.name ?? 'Inspection Item';

  // 1. Mark step as FAILED
  await prisma.stepInstance.update({
    where: { id: stepInstanceId },
    data: {
      status: 'FAILED',
      completedByUserId: userId,
      completedAt: new Date(),
      result: result as object,
    },
  });

  // 2. If VEHICLE_INSPECTION: create ad-hoc mechanic APPROVAL step (stepTemplateId is now nullable)
  if (playbookCategory === 'VEHICLE_INSPECTION') {
    await prisma.stepInstance.create({
      data: {
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
  }

  // 3. Block the PlaybookInstance
  await prisma.playbookInstance.update({
    where: { id: stepInstance.playbookInstanceId },
    data: { status: 'BLOCKED' },
  });

  // 4. Send push notifications (best-effort — do not throw on push failure)
  await notifyOnFail({
    tenantId,
    playbookInstanceId: stepInstance.playbookInstanceId,
    stepInstanceId,
    stepName,
    playbookName: playbookInstance.playbook.name,
    playbookCategory: playbookCategory as string,
  });

  // 5. Recompute dispatch readiness — vehicle flips isDispatchReady=false
  await computeDispatchReadiness(stepInstance.playbookInstanceId);
}

async function notifyOnFail(args: {
  tenantId: string;
  playbookInstanceId: string;
  stepInstanceId: string;
  stepName: string;
  playbookName: string;
  playbookCategory: string;
}) {
  const {
    tenantId,
    playbookInstanceId,
    stepInstanceId,
    stepName,
    playbookName,
    playbookCategory,
  } = args;

  try {
    // Find dispatchers (OWNER + MANAGER roles) in this tenant
    const dispatchers = await prisma.user.findMany({
      where: { tenantId, role: { in: ['OWNER', 'MANAGER'] } },
      select: { id: true },
    });

    for (const dispatcher of dispatchers) {
      await sendPushToUser(dispatcher.id, {
        title: 'Inspection item failed',
        body: `"${stepName}" flagged in ${playbookName}. Review required.`,
        data: {
          type: 'STEP_FAILED',
          stepInstanceId,
          playbookInstanceId,
        },
      });
      // Log notification
      await prisma.playbookNotification.create({
        data: {
          tenantId,
          playbookInstanceId,
          stepInstanceId,
          notificationType: 'STEP_FAILED',
          channel: 'PUSH',
          recipientUserId: dispatcher.id,
          message: `Inspection item failed: "${stepName}"`,
          sentAt: new Date(),
        },
      });
    }

    // If VEHICLE_INSPECTION: also notify dispatchers of APPROVAL_NEEDED for mechanic sign-off
    // (No MECHANIC user role exists — OWNER/MANAGER handles mechanic approval)
    if (playbookCategory === 'VEHICLE_INSPECTION') {
      for (const dispatcher of dispatchers) {
        await sendPushToUser(dispatcher.id, {
          title: 'Mechanic sign-off needed',
          body: `Repair required for: "${stepName}". Approve in Checklists.`,
          data: {
            type: 'APPROVAL_NEEDED',
            stepInstanceId,
            playbookInstanceId,
          },
        });
        await prisma.playbookNotification.create({
          data: {
            tenantId,
            playbookInstanceId,
            stepInstanceId,
            notificationType: 'APPROVAL_NEEDED',
            channel: 'PUSH',
            recipientUserId: dispatcher.id,
            message: `Mechanic approval needed: "${stepName}"`,
            sentAt: new Date(),
          },
        });
      }
    }
    // TODO(phase-5): SMS delivery via Twilio for STEP_FAILED and APPROVAL_NEEDED
  } catch (err) {
    // Notifications are best-effort — never fail the main operation
    console.error('[failInspectionItem] notification error:', err);
  }
}
