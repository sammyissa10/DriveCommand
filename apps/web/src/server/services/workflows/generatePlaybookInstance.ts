/**
 * Service: generatePlaybookInstance
 *
 * Creates a PlaybookInstance (Active Checklist) from a Playbook template.
 * Deep-copies the Playbook and its PlaybookSteps into immutable JSON snapshots
 * at creation time — subsequent template changes never affect running instances.
 *
 * Runs the instance + step creation in a single transaction.
 * Assignee resolution and push notifications are best-effort, outside the transaction.
 */
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { TRPCError } from '@trpc/server';
import { sendStepAssigned } from './notifications';
import type { PlaybookEntityType } from '@/generated/prisma';
import { Prisma } from '@/generated/prisma';

export async function generatePlaybookInstance(args: {
  playbookId: string;
  entityType: PlaybookEntityType;
  entityId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'trigger';
}) {
  const { playbookId, entityType, entityId, tenantId, triggeredBy } = args;

  // 1. Load Playbook with steps ordered by (playbookPhase ASC, sequence ASC)
  const playbook = await prisma.playbook.findFirst({
    where: { id: playbookId, tenantId, deletedAt: null },
    include: {
      steps: {
        orderBy: [{ playbookPhase: 'asc' }, { sequence: 'asc' }],
        include: { stepTemplate: true },
      },
    },
  });
  if (!playbook) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' });
  if (!playbook.isActive)
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Playbook is not active' });

  // 2. Verify entity exists (User for DRIVER, Truck for VEHICLE, Customer for PARTNER)
  await verifyEntity(entityType, entityId, tenantId);

  // 3. Check for duplicate active instance
  const existing = await prisma.playbookInstance.findFirst({
    where: { playbookId, entityId, tenantId, status: { not: 'COMPLETED' } },
  });
  if (existing) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Active checklist already exists for this entity',
    });
  }

  // 4–6. Build snapshot and create instance + step instances in one transaction
  const playbookSnapshot = buildPlaybookSnapshot(playbook);

  const instance = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    const newInstance = await tx.playbookInstance.create({
      data: {
        tenantId,
        playbookId,
        playbookSnapshot: playbookSnapshot as Prisma.InputJsonValue,
        entityType,
        entityId,
        status: 'NOT_STARTED',
        isDispatchReady: false,
      },
    });

    for (const step of playbook.steps) {
      // dueWithinHours takes precedence (hours-based SLA, phase 46).
      // dueDaysFromStart is the legacy days-based field — still used as fallback if dueWithinHours is null.
      const dueDate = step.dueWithinHours
        ? new Date(Date.now() + step.dueWithinHours * 3_600_000)
        : step.dueDaysFromStart
          ? new Date(Date.now() + step.dueDaysFromStart * 86_400_000)
          : null;

      const stepSnapshot = buildStepSnapshot(step);

      await tx.stepInstance.create({
        data: {
          playbookInstanceId: newInstance.id,
          stepTemplateId: step.stepTemplateId,
          stepSnapshot: stepSnapshot as Prisma.InputJsonValue,
          assigneeRole: step.stepTemplate.assigneeRole,
          assignedUserId: null,
          dueDate,
          status: 'NOT_STARTED',
        },
      });
    }

    return newInstance;
  }, TX_OPTIONS);

  // 7. Resolve assignees and send notifications (best-effort, outside transaction)
  const createdSteps = await prisma.stepInstance.findMany({
    where: { playbookInstanceId: instance.id },
    orderBy: [{ dueDate: 'asc' }],
  });

  for (const stepInstance of createdSteps) {
    const snap = stepInstance.stepSnapshot as { assigneeRole?: string };
    const assigneeRole = snap.assigneeRole ?? stepInstance.assigneeRole;
    const assignedUserId = await resolveAssignee(assigneeRole, tenantId, entityId, entityType);

    if (assignedUserId) {
      await prisma.stepInstance.update({
        where: { id: stepInstance.id },
        data: { assignedUserId },
      });

      // Notify assignee via centralized notifications module (best-effort — never throws)
      await sendStepAssigned({ stepInstanceId: stepInstance.id, tenantId });
    }
  }

  return prisma.playbookInstance.findUniqueOrThrow({
    where: { id: instance.id },
    include: { stepInstances: true },
  });
}

// ---- Helpers ----

function buildPlaybookSnapshot(playbook: {
  id: string;
  name: string;
  category: string;
  entityType: string;
  steps: Array<{
    stepTemplateId: string;
    sequence: number;
    playbookPhase: string;
    isRequired: boolean;
    isDispatchBlocker: boolean;
    dueDaysFromStart: number | null;
    dueWithinHours: number | null;
    overdueRecipient: string;
    dueBeforeDispatch: boolean;
    overrideConfig: unknown;
    stepTemplate: {
      name: string;
      stepType: string;
      assigneeRole: string;
      defaultConfig: unknown;
      description: string | null;
    };
  }>;
}) {
  return {
    id: playbook.id,
    name: playbook.name,
    category: playbook.category,
    entityType: playbook.entityType,
    steps: playbook.steps.map((step) => ({
      stepTemplateId: step.stepTemplateId,
      sequence: step.sequence,
      playbookPhase: step.playbookPhase,
      isRequired: step.isRequired,
      isDispatchBlocker: step.isDispatchBlocker,
      dueDaysFromStart: step.dueDaysFromStart,
      dueBeforeDispatch: step.dueBeforeDispatch,
      stepTemplate: {
        name: step.stepTemplate.name,
        stepType: step.stepTemplate.stepType,
        assigneeRole: step.stepTemplate.assigneeRole,
        defaultConfig: step.stepTemplate.defaultConfig,
        description: step.stepTemplate.description,
      },
    })),
  };
}

function buildStepSnapshot(step: {
  isRequired: boolean;
  isDispatchBlocker: boolean;
  dueDaysFromStart: number | null;
  dueWithinHours: number | null;          // NEW: hours-based SLA (phase 46)
  overdueRecipient: string;               // NEW: OverdueRecipient enum value
  dueBeforeDispatch: boolean;
  playbookPhase: string;
  sequence: number;
  overrideConfig: unknown;
  stepTemplate: {
    name: string;
    stepType: string;
    assigneeRole: string;
    defaultConfig: unknown;
    description: string | null;
  };
}) {
  return {
    name: step.stepTemplate.name,
    stepType: step.stepTemplate.stepType,
    assigneeRole: step.stepTemplate.assigneeRole,
    isRequired: step.isRequired,
    isDispatchBlocker: step.isDispatchBlocker,
    dueDaysFromStart: step.dueDaysFromStart,
    dueWithinHours: step.dueWithinHours,      // NEW
    overdueRecipient: step.overdueRecipient,  // NEW
    dueBeforeDispatch: step.dueBeforeDispatch,
    defaultConfig: step.stepTemplate.defaultConfig,
    description: step.stepTemplate.description ?? null,
    overrideConfig: step.overrideConfig ?? null,
    playbookPhase: step.playbookPhase,
    sequence: step.sequence,
  };
}

async function verifyEntity(
  entityType: PlaybookEntityType,
  entityId: string,
  tenantId: string
) {
  if (entityType === 'DRIVER') {
    const user = await prisma.user.findFirst({
      where: { id: entityId, tenantId, role: 'DRIVER' },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Driver not found' });
    return user;
  }
  if (entityType === 'VEHICLE') {
    const truck = await prisma.truck.findFirst({ where: { id: entityId, tenantId } });
    if (!truck) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vehicle not found' });
    return truck;
  }
  if (entityType === 'PARTNER') {
    const customer = await prisma.customer.findFirst({ where: { id: entityId, tenantId } });
    if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Partner not found' });
    return customer;
  }
  // DISPATCH and OTHER: no entity verification required
  return null;
}

async function resolveAssignee(
  assigneeRole: string,
  tenantId: string,
  entityId: string,
  entityType: PlaybookEntityType
): Promise<string | null> {
  if (assigneeRole === 'DRIVER') {
    // If entity is a DRIVER, assign to that driver directly
    if (entityType === 'DRIVER') return entityId;
    // Otherwise look for the driver assigned to this dispatch/vehicle — leave null
    return null;
  }
  // DISPATCHER, SAFETY_MANAGER, MECHANIC, THIRD_PARTY → map to OWNER or MANAGER roles
  const candidates = await prisma.user.findMany({
    where: { tenantId, role: { in: ['OWNER', 'MANAGER'] }, isActive: true },
    select: { id: true },
    take: 2,
  });
  // If exactly one admin/owner/manager → assign; if multiple → leave null (ambiguous)
  return candidates.length === 1 ? candidates[0].id : null;
}
