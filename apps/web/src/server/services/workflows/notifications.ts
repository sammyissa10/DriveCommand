/**
 * Service: workflow notifications
 *
 * Centralized send logic for all 7 NotifType values per spec Section 10.
 * Each function:
 *   1. Resolves recipient(s) by role (tenant-scoped)
 *   2. Builds the exact message copy from spec Section 10
 *   3. Sends push via sendPushToUser
 *   4. Writes a PlaybookNotification audit row after every send attempt
 *
 * Notifications are best-effort — errors are logged but never thrown to callers.
 *
 * Email channel: used only for INSTANCE_BLOCKED admin escalation (>48h blocked).
 *
 * Spec reference: Section 10 (Notification System)
 */
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { sendEmail } from '@/lib/email/resend-client';
import { logger } from '@/lib/logger';
import { WorkflowInstanceBlockedEmail } from '@/emails/workflow-instance-blocked';
import { getAppBaseUrl } from '@/lib/app-url';

// ─── Type helpers ─────────────────────────────────────────────────────────────

type StepInstanceWithContext = {
  id: string;
  playbookInstanceId: string;
  assignedUserId: string | null;
  stepSnapshot: unknown;
  playbookInstance: {
    tenantId: string;
    entityId: string;
    entityType: string;
  };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Get step name from stepSnapshot JSON */
function getStepName(stepSnapshot: unknown): string {
  return (stepSnapshot as { name?: string })?.name ?? 'Task';
}

/** Get tenant name */
async function getTenantName(tenantId: string): Promise<string> {
  try {
    const tenant = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    }, TX_OPTIONS);
    return tenant?.name ?? 'DriveCommand';
  } catch {
    return 'DriveCommand';
  }
}

/** Get user display name (firstName + lastName or email) */
async function getUserName(userId: string): Promise<string> {
  try {
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      });
    }, TX_OPTIONS);
    if (!user) return 'Unknown';
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return full || user.email || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/** Get truck license plate label */
async function getTruckLabel(tenantId: string, entityId: string): Promise<string> {
  try {
    const truck = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.truck.findFirst({
        where: { id: entityId, tenantId },
        select: { licensePlate: true },
      });
    }, TX_OPTIONS);
    return truck?.licensePlate ?? entityId.slice(0, 8);
  } catch {
    return entityId.slice(0, 8);
  }
}

/** Find dispatchers (OWNER + MANAGER roles) in the tenant */
async function findDispatchers(tenantId: string): Promise<Array<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.user.findMany({
      where: { tenantId, role: { in: ['OWNER', 'MANAGER'] }, isActive: true },
      select: { id: true },
    });
  }, TX_OPTIONS);
}

/** Find tenant admin emails (OWNER + MANAGER) */
async function findAdminEmails(tenantId: string): Promise<Array<{ id: string; email: string }>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.user.findMany({
      where: { tenantId, role: { in: ['OWNER', 'MANAGER'] }, isActive: true },
      select: { id: true, email: true },
    });
  }, TX_OPTIONS);
}

/** Write a PlaybookNotification audit row */
async function writeAuditRow(data: {
  tenantId: string;
  playbookInstanceId: string;
  stepInstanceId?: string | null;
  notificationType: string;
  channel: string;
  recipientUserId: string;
  message: string;
  success: boolean;
}): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.playbookNotification.create({
        data: {
          tenantId: data.tenantId,
          playbookInstanceId: data.playbookInstanceId,
          stepInstanceId: data.stepInstanceId ?? null,
          notificationType: data.notificationType as never,
          channel: data.channel as never,
          recipientUserId: data.recipientUserId,
          message: data.message,
          sentAt: data.success ? new Date() : null,
        },
      });
    }, TX_OPTIONS);
  } catch (err) {
    logger.error('[notifications] writeAuditRow failed', { err, ...data });
  }
}

/** Load a StepInstance with its PlaybookInstance context */
async function loadStepInstance(stepInstanceId: string): Promise<StepInstanceWithContext | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.stepInstance.findUnique({
      where: { id: stepInstanceId },
      include: {
        playbookInstance: {
          select: { tenantId: true, entityId: true, entityType: true },
        },
      },
    });
  }, TX_OPTIONS);
}

// ─── Exported notification functions ─────────────────────────────────────────

/**
 * STEP_ASSIGNED — notify the assignee that a new task is ready.
 * Push to assignee.
 */
export async function sendStepAssigned(args: {
  stepInstanceId: string;
  tenantId: string;
}): Promise<void> {
  const { stepInstanceId, tenantId } = args;
  try {
    const step = await loadStepInstance(stepInstanceId);
    if (!step) {
      logger.warn('[notifications] sendStepAssigned: step not found', { stepInstanceId });
      return;
    }

    const assignedUserId = step.assignedUserId;
    if (!assignedUserId) {
      logger.info('[notifications] sendStepAssigned: no assignee, skipping', { stepInstanceId });
      return;
    }

    const stepName = getStepName(step.stepSnapshot);
    const tenantName = await getTenantName(tenantId);

    const title = `${tenantName}: New task ready`;
    const body = `'${stepName}' — tap to complete.`;
    const message = `New task: "${stepName}"`;

    let success = false;
    try {
      await sendPushToUser(assignedUserId, {
        title,
        body,
        data: { type: 'STEP_ASSIGNED', stepInstanceId },
      });
      success = true;
    } catch (err) {
      logger.error('[notifications] sendStepAssigned: push failed', { err, assignedUserId });
    }

    await writeAuditRow({
      tenantId,
      playbookInstanceId: step.playbookInstanceId,
      stepInstanceId,
      notificationType: 'STEP_ASSIGNED',
      channel: 'PUSH',
      recipientUserId: assignedUserId,
      message,
      success,
    });
  } catch (err) {
    logger.error('[notifications] sendStepAssigned failed', { err, stepInstanceId });
  }
}

/**
 * STEP_OVERDUE — notify the correct recipient(s) that a step is past its due date.
 * overdueRecipient controls fan-out:
 *   'DRIVER' — push to the assignee only
 *   'OWNER'  — push to dispatchers (OWNER/MANAGER) only (default)
 *   'BOTH'   — push to assignee + dispatchers (deduped)
 */
export async function sendStepOverdue({
  stepInstanceId,
  tenantId,
  overdueRecipient = 'OWNER',
}: {
  stepInstanceId: string;
  tenantId: string;
  overdueRecipient?: 'DRIVER' | 'OWNER' | 'BOTH';
}): Promise<void> {
  try {
    const step = await loadStepInstance(stepInstanceId);
    if (!step) {
      logger.warn('[notifications] sendStepOverdue: step not found', { stepInstanceId });
      return;
    }

    const stepName = getStepName(step.stepSnapshot);

    // Get assignee name (driver who hasn't completed the step)
    const assigneeName = step.assignedUserId
      ? await getUserName(step.assignedUserId)
      : 'Driver';

    // Compute how many days overdue
    const stepWithDue = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.stepInstance.findUnique({
        where: { id: stepInstanceId },
        select: { dueDate: true },
      });
    }, TX_OPTIONS);

    const daysOverdue = stepWithDue?.dueDate
      ? Math.floor((Date.now() - stepWithDue.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 1;

    const title = 'Task overdue';
    const body = `${assigneeName} hasn't completed '${stepName}' — due ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} ago.`;
    const message = `Overdue: "${stepName}" — ${assigneeName}, ${daysOverdue}d past due`;

    // Build recipient list based on overdueRecipient
    const recipientIds: string[] = [];

    if (overdueRecipient === 'DRIVER' || overdueRecipient === 'BOTH') {
      if (step.assignedUserId) recipientIds.push(step.assignedUserId);
    }

    if (overdueRecipient === 'OWNER' || overdueRecipient === 'BOTH') {
      const dispatchers = await findDispatchers(tenantId);
      for (const d of dispatchers) recipientIds.push(d.id);
    }

    const uniqueRecipientIds = [...new Set(recipientIds)];

    for (const recipientId of uniqueRecipientIds) {
      let success = false;
      try {
        await sendPushToUser(recipientId, { title, body, data: { type: 'STEP_OVERDUE', stepInstanceId } });
        success = true;
      } catch (err) {
        logger.error('[notifications] sendStepOverdue: push failed', { err, recipientId });
      }

      await writeAuditRow({
        tenantId,
        playbookInstanceId: step.playbookInstanceId,
        stepInstanceId,
        notificationType: 'STEP_OVERDUE',
        channel: 'PUSH',
        recipientUserId: recipientId,
        message,
        success,
      });
    }
  } catch (err) {
    logger.error('[notifications] sendStepOverdue failed', { err, stepInstanceId });
  }
}

/**
 * INSTANCE_BLOCKED — in-app push alert to dispatchers when a checklist transitions to BLOCKED.
 * Push to dispatchers (OWNER/MANAGER).
 */
export async function sendInstanceBlocked(args: {
  playbookInstanceId: string;
  tenantId: string;
}): Promise<void> {
  const { playbookInstanceId, tenantId } = args;
  try {
    const instance = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.playbookInstance.findUnique({
        where: { id: playbookInstanceId },
        include: {
          stepInstances: {
            where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'FAILED'] } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }, TX_OPTIONS);

    if (!instance) {
      logger.warn('[notifications] sendInstanceBlocked: instance not found', { playbookInstanceId });
      return;
    }

    // Find the first blocker step name
    const blockerStep = instance.stepInstances[0];
    const stepName = blockerStep ? getStepName(blockerStep.stepSnapshot) : 'Required step';

    // Get driver name from entityId (assume DRIVER entity)
    const driverName =
      instance.entityType === 'DRIVER' ? await getUserName(instance.entityId) : 'Driver';

    const title = 'Driver blocked from dispatch';
    const body = `${driverName} is blocked — '${stepName}' is required.`;
    const message = `Instance blocked: "${stepName}" — ${driverName}`;

    const dispatchers = await findDispatchers(tenantId);

    for (const dispatcher of dispatchers) {
      let success = false;
      try {
        await sendPushToUser(dispatcher.id, {
          title,
          body,
          data: { type: 'INSTANCE_BLOCKED', playbookInstanceId },
        });
        success = true;
      } catch (err) {
        logger.error('[notifications] sendInstanceBlocked: push failed', { err, dispatcherId: dispatcher.id });
      }

      await writeAuditRow({
        tenantId,
        playbookInstanceId,
        stepInstanceId: blockerStep?.id ?? null,
        notificationType: 'INSTANCE_BLOCKED',
        channel: 'PUSH',
        recipientUserId: dispatcher.id,
        message,
        success,
      });
    }
  } catch (err) {
    logger.error('[notifications] sendInstanceBlocked failed', { err, playbookInstanceId });
  }
}

/**
 * DISPATCH_READY — notify dispatchers that all required steps are complete.
 * Push to dispatchers (OWNER/MANAGER). Fires only on false→true flip (enforced by caller).
 */
export async function sendDispatchReady(args: {
  userId: string;
  tenantId: string;
  playbookInstanceId: string;
}): Promise<void> {
  const { userId, tenantId, playbookInstanceId } = args;
  try {
    const driverName = await getUserName(userId);

    const title = 'Driver dispatch ready';
    const body = `${driverName} is dispatch ready — all required steps complete.`;
    const message = `Dispatch ready: ${driverName}`;

    const dispatchers = await findDispatchers(tenantId);

    for (const dispatcher of dispatchers) {
      let success = false;
      try {
        await sendPushToUser(dispatcher.id, {
          title,
          body,
          data: { type: 'DISPATCH_READY', playbookInstanceId, userId },
        });
        success = true;
      } catch (err) {
        logger.error('[notifications] sendDispatchReady: push failed', { err, dispatcherId: dispatcher.id });
      }

      await writeAuditRow({
        tenantId,
        playbookInstanceId,
        notificationType: 'DISPATCH_READY',
        channel: 'PUSH',
        recipientUserId: dispatcher.id,
        message,
        success,
      });
    }
  } catch (err) {
    logger.error('[notifications] sendDispatchReady failed', { err, userId, playbookInstanceId });
  }
}

/**
 * STEP_FAILED — notify dispatchers and/or mechanics that an inspection item was flagged.
 * Push to dispatchers (OWNER/MANAGER roles). recipientRole controls copy variant.
 */
export async function sendStepFailed(args: {
  stepInstanceId: string;
  tenantId: string;
  recipientRole: 'DISPATCHER' | 'MECHANIC';
}): Promise<void> {
  const { stepInstanceId, tenantId, recipientRole } = args;
  try {
    const step = await loadStepInstance(stepInstanceId);
    if (!step) {
      logger.warn('[notifications] sendStepFailed: step not found', { stepInstanceId });
      return;
    }

    const stepName = getStepName(step.stepSnapshot);
    const driverName = step.assignedUserId ? await getUserName(step.assignedUserId) : 'Driver';

    // Truck label — works for VEHICLE entity type; for DRIVER entity fall back to stepName context
    const truckLabel =
      step.playbookInstance.entityType === 'VEHICLE'
        ? await getTruckLabel(tenantId, step.playbookInstance.entityId)
        : 'vehicle';

    let title: string;
    let body: string;

    if (recipientRole === 'DISPATCHER') {
      title = 'Issue flagged';
      body = `${driverName} flagged '${stepName}' on Truck #${truckLabel}. Tap to review.`;
    } else {
      title = 'Repair needed';
      body = `'${stepName}' flagged by ${driverName} on Truck #${truckLabel}. Tap to sign off.`;
    }

    const message = `${title}: "${stepName}" — ${driverName}`;

    // In current codebase both DISPATCHER and MECHANIC recipients are OWNER/MANAGER users
    const dispatchers = await findDispatchers(tenantId);

    for (const dispatcher of dispatchers) {
      let success = false;
      try {
        await sendPushToUser(dispatcher.id, {
          title,
          body,
          data: { type: 'STEP_FAILED', stepInstanceId, recipientRole },
        });
        success = true;
      } catch (err) {
        logger.error('[notifications] sendStepFailed: push failed', { err, dispatcherId: dispatcher.id });
      }

      await writeAuditRow({
        tenantId,
        playbookInstanceId: step.playbookInstanceId,
        stepInstanceId,
        notificationType: 'STEP_FAILED',
        channel: 'PUSH',
        recipientUserId: dispatcher.id,
        message,
        success,
      });
    }
  } catch (err) {
    logger.error('[notifications] sendStepFailed failed', { err, stepInstanceId, recipientRole: args.recipientRole });
  }
}

/**
 * APPROVAL_NEEDED — notify the approver that a step requires their sign-off.
 * Push to the specific approver user.
 */
export async function sendApprovalNeeded(args: {
  stepInstanceId: string;
  tenantId: string;
  approverUserId: string;
}): Promise<void> {
  const { stepInstanceId, tenantId, approverUserId } = args;
  try {
    const step = await loadStepInstance(stepInstanceId);
    if (!step) {
      logger.warn('[notifications] sendApprovalNeeded: step not found', { stepInstanceId });
      return;
    }

    const stepName = getStepName(step.stepSnapshot);
    const completedByName = step.assignedUserId ? await getUserName(step.assignedUserId) : 'Driver';

    const title = 'Approval needed';
    const body = `${completedByName} completed '${stepName}' and needs your approval.`;
    const message = `Approval needed: "${stepName}" — ${completedByName}`;

    let success = false;
    try {
      await sendPushToUser(approverUserId, {
        title,
        body,
        data: { type: 'APPROVAL_NEEDED', stepInstanceId },
      });
      success = true;
    } catch (err) {
      logger.error('[notifications] sendApprovalNeeded: push failed', { err, approverUserId });
    }

    await writeAuditRow({
      tenantId,
      playbookInstanceId: step.playbookInstanceId,
      stepInstanceId,
      notificationType: 'APPROVAL_NEEDED',
      channel: 'PUSH',
      recipientUserId: approverUserId,
      message,
      success,
    });
  } catch (err) {
    logger.error('[notifications] sendApprovalNeeded failed', { err, stepInstanceId });
  }
}

/**
 * INSTANCE_BLOCKED admin escalation — email channel per spec Section 10.
 * Fires when a PlaybookInstance has been BLOCKED for >48h.
 * Called by the daily cron route; dedup is handled at the cron level.
 */
export async function sendInstanceBlockedEmail(args: {
  playbookInstanceId: string;
  tenantId: string;
}): Promise<void> {
  const { playbookInstanceId, tenantId } = args;
  try {
    const instance = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.playbookInstance.findUnique({
        where: { id: playbookInstanceId },
        include: {
          playbook: { select: { name: true } },
          stepInstances: {
            where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'FAILED'] } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }, TX_OPTIONS);

    if (!instance) {
      logger.warn('[notifications] sendInstanceBlockedEmail: instance not found', { playbookInstanceId });
      return;
    }

    const tenantName = await getTenantName(tenantId);
    const playbookName = instance.playbook?.name ?? 'Checklist';
    const blockerStep = instance.stepInstances[0];
    const stepName = blockerStep ? getStepName(blockerStep.stepSnapshot) : 'Required step';
    const driverName =
      instance.entityType === 'DRIVER' ? await getUserName(instance.entityId) : 'Driver';

    // How many hours has it been blocked? Use updatedAt as proxy for when it became BLOCKED
    const hoursBlocked = Math.floor(
      (Date.now() - instance.updatedAt.getTime()) / (1000 * 60 * 60)
    );

    const dashboardUrl = `${getAppBaseUrl()}/checklists/${playbookInstanceId}`;
    const admins = await findAdminEmails(tenantId);

    for (const admin of admins) {
      let success = false;
      try {
        await sendEmail({
          to: admin.email,
          subject: `[Action Required] Driver blocked from dispatch — ${driverName}`,
          react: WorkflowInstanceBlockedEmail({
            driverName,
            stepName,
            playbookName,
            tenantName,
            hoursBlocked,
            dashboardUrl,
          }),
        });
        success = true;
      } catch (err) {
        logger.error('[notifications] sendInstanceBlockedEmail: email failed', { err, adminEmail: admin.email });
      }

      await writeAuditRow({
        tenantId,
        playbookInstanceId,
        stepInstanceId: blockerStep?.id ?? null,
        notificationType: 'INSTANCE_BLOCKED',
        channel: 'EMAIL',
        recipientUserId: admin.id,
        message: `Admin escalation email: "${stepName}" — ${driverName}`,
        success,
      });
    }
  } catch (err) {
    logger.error('[notifications] sendInstanceBlockedEmail failed', { err, playbookInstanceId });
  }
}
