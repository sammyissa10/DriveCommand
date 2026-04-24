/**
 * Service: completeStep
 *
 * Validates type-specific completion requirements for all 8 StepTypes, persists the
 * completion, creates any required side-effect records (Document for DOCUMENT_UPLOAD),
 * then recomputes dispatch readiness.
 *
 * Type-specific validation follows spec Section 6.3.
 * INSPECTION_ITEM PASS flows through completeStep; FAIL is routed to failInspectionItem.
 *
 * TODO(phase-44): fireEvent('STEP_COMPLETE', stepInstance, tenantId)
 */
import { prisma } from '@/lib/db/prisma';
import { TRPCError } from '@trpc/server';
import { computeDispatchReadiness } from './computeDispatchReadiness';
import { sendStepAssigned } from './notifications';
import type { StepResult } from '@drivecommand/validation';

export async function completeStep(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  result: StepResult;
}) {
  const { stepInstanceId, userId, tenantId, result } = args;

  // Load step instance + verify tenant ownership via parent instance
  const stepInstance = await prisma.stepInstance.findFirst({
    where: {
      id: stepInstanceId,
      playbookInstance: { tenantId },
    },
    include: { playbookInstance: true },
  });
  if (!stepInstance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
  if (stepInstance.status === 'COMPLETE') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task already complete' });
  }
  if (stepInstance.status === 'SKIPPED') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task was skipped' });
  }

  const snap = stepInstance.stepSnapshot as {
    stepType: string;
    isDispatchBlocker?: boolean;
    defaultConfig?: unknown;
    documentTypeName?: string;
    name?: string;
  };

  // Type-specific validation (spec Section 6.3)
  validateStepResult(snap.stepType, result);

  // Persist completion
  const updated = await prisma.stepInstance.update({
    where: { id: stepInstanceId },
    data: {
      status: 'COMPLETE',
      completedByUserId: userId,
      completedAt: new Date(),
      result: result as object,
    },
  });

  // DOCUMENT_UPLOAD side effect: create a Document record
  if (snap.stepType === 'DOCUMENT_UPLOAD' && result.fileUrls && result.fileUrls.length > 0) {
    const instance = stepInstance.playbookInstance;
    await createDocumentRecord({
      tenantId,
      entityType: instance.entityType,
      entityId: instance.entityId,
      s3Key: result.fileUrls[0],
      documentTypeName: snap.documentTypeName ?? 'Document',
      userId,
      stepName: snap.name ?? 'Step',
    });
  }

  // Recompute dispatch readiness
  await computeDispatchReadiness(stepInstance.playbookInstanceId);

  // TODO(phase-44): fireEvent('STEP_COMPLETE', stepInstance, tenantId)

  // Notify next assignee (best-effort)
  await notifyNextStep(stepInstance.playbookInstanceId, tenantId);

  return updated;
}

function validateStepResult(stepType: string, result: StepResult) {
  switch (stepType) {
    case 'DOCUMENT_UPLOAD':
      if (!result.fileUrls || result.fileUrls.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'MISSING_FILES' });
      }
      break;
    case 'SIGNATURE':
      if (!result.signatureUrl || result.signatureUrl.trim() === '') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'MISSING_SIGNATURE' });
      }
      break;
    case 'FORM_FILL':
      if (!result.formData || typeof result.formData !== 'object') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVALID_FORM' });
      }
      break;
    case 'INSPECTION_ITEM':
      // PASS flows through completeStep; FAIL routes to failInspectionItem
      if (!result.passOrFail || result.passOrFail === 'fail') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'USE_FAIL_ENDPOINT' });
      }
      // passOrFail === 'pass' — no additional validation required
      break;
    case 'TRAINING_ACK':
      if (!result.acknowledged && !result.note) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'MISSING_ACK' });
      }
      break;
    case 'APPROVAL':
      // Role check happens at tRPC layer (adminProcedure). Service trusts caller.
      break;
    case 'THIRD_PARTY':
      if (
        (!result.note || result.note.trim() === '') &&
        (!result.fileUrls || result.fileUrls.length === 0)
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'MISSING_EVIDENCE' });
      }
      break;
    case 'CUSTOM_NOTE':
      if (!result.note || result.note.trim() === '') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'MISSING_NOTE' });
      }
      break;
  }
}

async function createDocumentRecord(args: {
  tenantId: string;
  entityType: string;
  entityId: string;
  s3Key: string;
  documentTypeName: string;
  userId: string;
  stepName: string;
}) {
  const { tenantId, entityType, entityId, s3Key, documentTypeName, userId, stepName } = args;
  try {
    await prisma.document.create({
      data: {
        tenantId,
        driverId: entityType === 'DRIVER' ? entityId : null,
        truckId: entityType === 'VEHICLE' ? entityId : null,
        fileName: documentTypeName,
        s3Key,
        contentType: 'application/octet-stream',
        sizeBytes: 0,
        uploadedBy: userId,
        documentType: 'GENERAL',
        description: `Uploaded via checklist: ${stepName}`,
      },
    });
  } catch {
    // Document creation is best-effort — step is still complete
  }
}

async function notifyNextStep(playbookInstanceId: string, tenantId: string) {
  try {
    const nextStep = await prisma.stepInstance.findFirst({
      where: {
        playbookInstanceId,
        status: 'NOT_STARTED',
        assignedUserId: { not: null },
      },
      orderBy: { dueDate: 'asc' },
    });
    if (nextStep?.assignedUserId) {
      // Route through centralized notifications module for consistent audit trail
      await sendStepAssigned({ stepInstanceId: nextStep.id, tenantId });
    }
  } catch {
    // Best-effort
  }
}
