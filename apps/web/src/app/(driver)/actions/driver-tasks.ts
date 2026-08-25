'use server';

/**
 * Driver-scoped server actions for workflow task completion.
 *
 * SECURITY: All actions enforce DRIVER role + resolve identity from session.
 *           No action accepts userId as input — always resolved server-side.
 *
 * Phase 9-web rewrote the failure path and added the N/A verb. See
 * `recordDriverInspectionFailure` and `markDriverTaskNotApplicable` below for
 * what changed and why. Both are shared by the Tasks tab and the full-screen
 * walkaround, so the two web surfaces cannot drift apart the way web and mobile
 * did.
 */

import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { completeStep } from '@/server/services/workflows/completeStep';
import { failInspectionItem } from '@/server/services/workflows/failInspectionItem';
import { skipStep } from '@/server/services/workflows/skipStep';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import { FAIL_NOTE_MIN_LENGTH } from '@/lib/carrier/inspection-constants';
import { nanoid } from 'nanoid';
import type { StepResult } from '@drivecommand/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// ─── Shared: is this step this driver's to answer? ────────────────────────────

/**
 * The same `where` the driver's own task pages use, as one function.
 *
 * A step is this driver's if it lives in their tenant AND is either assigned to
 * them by id or offered to the DRIVER role with nobody assigned. That second
 * arm is not laxity — it is how `seedStarterPlaybooks` writes inspection steps,
 * which carry `assigneeRole: 'DRIVER'` and `assignedUserId: null`.
 *
 * `expectStepType` is passed by callers that may only touch one kind of step.
 * `markDriverTaskNotApplicable` passes `INSPECTION_ITEM` so a driver's N/A can
 * never reach a SIGNATURE, an APPROVAL awaiting a mechanic, or a
 * DOCUMENT_UPLOAD — skipping any of those is a dispatcher's decision, and the
 * shared `skipStep` service does not distinguish them.
 */
async function findOwnStep(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  expectStepType?: string;
}): Promise<{ ok: true; stepType: string } | { ok: false; error: string }> {
  const { stepInstanceId, userId, tenantId, expectStepType } = args;

  const tenantPrisma = await getTenantPrisma();
  const step = await tenantPrisma.stepInstance.findFirst({
    where: {
      id: stepInstanceId,
      playbookInstance: { tenantId },
      OR: [{ assignedUserId: userId }, { assigneeRole: 'DRIVER', assignedUserId: null }],
    },
    select: { stepSnapshot: true },
  });
  if (!step) return { ok: false, error: 'Task not found or not assigned to you' };

  const stepType =
    ((step.stepSnapshot ?? {}) as { stepType?: string }).stepType ?? 'CUSTOM_NOTE';

  if (expectStepType && stepType !== expectStepType) {
    return { ok: false, error: 'That action does not apply to this kind of task' };
  }
  return { ok: true, stepType };
}

// ─── Complete ─────────────────────────────────────────────────────────────────

export async function completeDriverTask(
  stepInstanceId: string,
  result: StepResult,
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.DRIVER]);
    const session = await getSession();
    if (!session) return { success: false, error: 'Unauthorized' };
    await completeStep({
      stepInstanceId,
      userId: session.userId,
      tenantId: session.tenantId,
      result,
    });
    return { success: true };
  } catch (err) {
    logger.error('[completeDriverTask] failed', err, {
      stepInstanceId,
      error: serializeError(err),
    });
    return { success: false, error: err instanceof Error ? err.message : 'Failed to complete task' };
  }
}

// ─── Fail inspection ──────────────────────────────────────────────────────────

/**
 * Record an inspection item as FAILED.
 *
 * REWRITTEN in Phase 9-web. What it used to do, and why each part was wrong:
 *
 *  1. It wrote `result: { passOrFail: 'fail', notes, photoPath }` with a bare
 *     `stepInstance.update`. Every Phase 9 reader — `inspection-lookup.ts` and
 *     `buildChecklistView` — reads `result.note` and `result.photoUrls`. So a
 *     failure recorded on web arrived at the blocked screen and the owner's
 *     trip detail with `note: null` and `photoCount: 0`. The driver's words and
 *     photo were on the row and invisible to every screen whose entire purpose
 *     is showing them.
 *
 *  2. It bypassed `failInspectionItem` entirely, so none of the side effects
 *     fired: no mechanic APPROVAL step, no BLOCKED on the parent instance, no
 *     `sendStepFailed` to the dispatcher, no `computeDispatchReadiness`.
 *     Section 12's "dispatcher notified" simply did not happen on web.
 *
 * It now delegates to the same service the mobile route calls, so there is one
 * failure path with one result shape. The note minimum is enforced HERE rather
 * than inside the service, because it is a driver-facing input rule and a
 * dispatcher recording a failure on someone's behalf should not be held to a
 * driver's phrasing bar.
 *
 * Kept under its old exported name so the Tasks tab keeps working unchanged;
 * `recordDriverInspectionFailure` is the alias new code should use.
 */
export async function failDriverInspection(
  stepInstanceId: string,
  result: { photoUrls: string[]; note?: string },
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.DRIVER]);
    const session = await getSession();
    if (!session) return { success: false, error: 'Unauthorized' };

    const owned = await findOwnStep({
      stepInstanceId,
      userId: session.userId,
      tenantId: session.tenantId,
      expectStepType: 'INSPECTION_ITEM',
    });
    if (!owned.ok) return { success: false, error: owned.error };

    const note = (result.note ?? '').trim();
    if (note.length < FAIL_NOTE_MIN_LENGTH) {
      return {
        success: false,
        error: `Describe the problem in at least ${FAIL_NOTE_MIN_LENGTH} characters.`,
      };
    }

    await failInspectionItem({
      stepInstanceId,
      userId: session.userId,
      tenantId: session.tenantId,
      result: {
        photoUrls: Array.isArray(result.photoUrls) ? result.photoUrls : [],
        note,
      },
    });

    return { success: true };
  } catch (err) {
    // PHOTO_REQUIRED is the service's own code for "this item says a photo is
    // mandatory". It reaches the driver as a sentence, not as a token — but the
    // real error, with its name and stack, still goes to the log.
    logger.error('[failDriverInspection] failed', err, {
      stepInstanceId,
      error: serializeError(err),
    });
    const message = err instanceof Error ? err.message : 'Failed to record failure';
    if (message === 'PHOTO_REQUIRED') {
      return {
        success: false,
        error: 'This item needs a photo before you can report it as failed.',
      };
    }
    return { success: false, error: message };
  }
}

/** Preferred name for new callers. Same function, clearer verb. */
export const recordDriverInspectionFailure = failDriverInspection;

// ─── Not applicable (the N/A verb) ────────────────────────────────────────────

/**
 * Mark an inspection item NOT APPLICABLE.
 *
 * N/A is not a new state. It is the existing SKIPPED status with a
 * `skipReason`, which `computeDispatchReadiness` has always counted as
 * satisfied and which `evaluateTripStartGate` counts as answered — so an
 * all-pass-and-N/A walkaround clears the gate, and a driver cannot use N/A to
 * make an unanswered item quietly disappear.
 *
 * A DISTINCT ACTION rather than a widened `skipStep`. That service is shared
 * with the dispatcher's admin path and applies to every step type; a driver's
 * N/A must not. This wrapper is the narrow permission:
 *
 *   - the step must be an INSPECTION_ITEM  (`expectStepType`)
 *   - it must be assigned to this driver   (`findOwnStep`)
 *   - a reason is required, at the same length bar as a failure note, because
 *     "n/a" as a reason for "n/a" records nothing
 *
 * Only then does it delegate. `skipStep` itself is unchanged; its stale header,
 * which claimed an admin-only guard it never performed, is corrected in place.
 */
export async function markDriverTaskNotApplicable(
  stepInstanceId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.DRIVER]);
    const session = await getSession();
    if (!session) return { success: false, error: 'Unauthorized' };

    const owned = await findOwnStep({
      stepInstanceId,
      userId: session.userId,
      tenantId: session.tenantId,
      expectStepType: 'INSPECTION_ITEM',
    });
    if (!owned.ok) return { success: false, error: owned.error };

    const trimmed = (reason ?? '').trim();
    if (trimmed.length < FAIL_NOTE_MIN_LENGTH) {
      return {
        success: false,
        error: `Say why this does not apply, in at least ${FAIL_NOTE_MIN_LENGTH} characters.`,
      };
    }

    await skipStep({
      stepInstanceId,
      userId: session.userId,
      tenantId: session.tenantId,
      reason: trimmed,
    });

    return { success: true };
  } catch (err) {
    logger.error('[markDriverTaskNotApplicable] failed', err, {
      stepInstanceId,
      error: serializeError(err),
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to mark not applicable',
    };
  }
}

// ─── Upload file ──────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadTaskFile(
  formData: FormData,
): Promise<ActionResult<{ s3Key: string }>> {
  try {
    await requireRole([UserRole.DRIVER]);
    const session = await getSession();
    if (!session) return { success: false, error: 'Unauthorized' };

    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) return { success: false, error: 'No file provided' };
    if (!ALLOWED_TYPES.has(file.type)) return { success: false, error: 'File type not allowed' };
    if (file.size > MAX_FILE_SIZE) return { success: false, error: 'File too large (max 10 MB)' };

    const fileId = nanoid();
    const sanitized = file.name.replace(/[/\\?#]/g, '-');
    const storagePath = `${session.tenantId}/tasks/${fileId}-${sanitized}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin.storage
      .from('drivecommand-files')
      .upload(storagePath, buffer, { contentType: file.type });
    if (error) throw new Error(error.message);

    return { success: true, data: { s3Key: storagePath } };
  } catch (err) {
    logger.error('[uploadTaskFile] failed', err, { error: serializeError(err) });
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}
