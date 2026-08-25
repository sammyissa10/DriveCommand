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
import { requiresPhotoOnFail } from '@/lib/carrier/inspection-snapshot';

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
    defaultConfig?: { requiresPhoto?: boolean; requiresPhotoOnFail?: boolean };
  };

  /**
   * Photo requirement — read through the SHARED reader (Phase 9-web, ruling 8).
   *
   * This used to read `defaultConfig.requiresPhoto` directly. `seedStarterPlaybooks`
   * writes `requiresPhotoOnFail: true` on all twelve inspection templates and has
   * never written `requiresPhoto`, so on every seeded tenant this check was
   * looking at an undefined key and enforcing nothing — while the driver's screen,
   * which reads `requiresPhotoOnFail`, told the driver a photo WAS required and
   * blocked them client-side. Screen and server disagreed, and the server was the
   * one that was wrong.
   *
   * `requiresPhotoOnFail()` reads both spellings, so this both closes the gap and
   * cannot break a tenant who hand-authored the older key.
   *
   * WHAT THIS CHANGES IN PRODUCTION, stated plainly rather than buried: on a
   * seeded tenant a failed item now genuinely requires a photo, where before the
   * server accepted a failure without one. That is what the seed author asked
   * for, and it is what mobile has been promising drivers since Phase 9. The
   * driver is never trapped by it — the note is required and is recorded either
   * way, and the web checklist surfaces the camera on exactly the items this
   * function returns true for, from the same helper.
   */
  const photoRequired = requiresPhotoOnFail(stepInstance.stepSnapshot);
  if (photoRequired && (!result.photoUrls || result.photoUrls.length === 0)) {
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
