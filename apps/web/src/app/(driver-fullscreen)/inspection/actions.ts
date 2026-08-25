'use server';

/**
 * Phase 9-web — every mutation the full-screen walkaround can perform.
 *
 * One rule runs through the whole file: **every action begins with
 * `resolveInspectionAccess`**, and none of them trusts the client for identity.
 * The page's guard is not enough on its own — a server action reached from a
 * tab left open since yesterday does not re-run a layout or a page — so the
 * guard is re-asked here, per call, against the trip id the caller named.
 *
 * The actions themselves are thin. Each one resolves access, then delegates to
 * the transport-neutral handler or the driver-scoped task action that already
 * exists. Nothing in this file knows how an inspection works; if it did, that
 * would be the second implementation Phase 9 forbade.
 */

import { revalidatePath } from 'next/cache';
import { getSession, getRole } from '@/lib/auth/supabase';
import { logger, serializeError } from '@/lib/logger';
import { generateUploadUrl } from '@/lib/storage/presigned';
import { assertTenantKey } from '@/lib/storage/tenant-key';
import { nanoid } from 'nanoid';
import {
  resolveInspectionAccess,
  INSPECTION_ACCESS_DENIED_MESSAGE,
} from '@/lib/carrier/inspection-access';
import {
  handleOpenChecklist,
  handleSubmitInspection,
  type InspectionChecklistView,
  type InspectionGateView,
} from '@/lib/carrier/inspection-handlers';
import {
  completeDriverTask,
  recordDriverInspectionFailure,
  markDriverTaskNotApplicable,
} from '@/app/(driver)/actions/driver-tasks';

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/**
 * Deliberately the same discriminated result the driver task actions already
 * return, so the client has one shape to branch on.
 *
 * There is no third "queued" arm and there will not be one: the web inspection
 * is online-only by decision, and a client that can render "queued" is a client
 * that will eventually render it for something that never sent. Every failure
 * here is a failure the driver is told about and can retry.
 */
export type InspectionActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function guard(dispatchId: string) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: 'Your session has expired. Sign in again.' };

  const role = await getRole();
  const access = await resolveInspectionAccess({
    role,
    userId: session.userId,
    tenantId: session.tenantId,
    dispatchId,
  });

  if (!access.allowed) {
    // Logged with the real reason, answered with one sentence. A driver editing
    // ids in the URL learns nothing from the response.
    logger.warn('[inspection] access denied', {
      dispatchId,
      userId: session.userId,
      tenantId: session.tenantId,
      reason: access.reason,
    });
    return { ok: false as const, error: INSPECTION_ACCESS_DENIED_MESSAGE };
  }

  return { ok: true as const, session, access };
}

function refreshInspection(dispatchId: string) {
  revalidatePath(`/inspection/${dispatchId}`);
  revalidatePath(`/inspection/${dispatchId}/blocked`);
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

/**
 * Open (and, on a tenant without an ON_DISPATCH_CREATE trigger, create) the
 * checklist for this trip.
 *
 * A POST, always — `handleOpenChecklist` can write a `PlaybookInstance`, and
 * quick-516's lesson is that anything which can change stored state is a POST.
 * That is exactly why the page below does NOT call this on render: a GET that
 * quietly spawns a checklist would put the module's creation path on a page
 * load, and every refresh would be a write.
 */
export async function openInspectionChecklist(
  dispatchId: string,
): Promise<InspectionActionResult<InspectionChecklistView>> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  try {
    const result = await handleOpenChecklist({
      orgId: g.session.tenantId,
      dispatchId,
      userId: g.session.userId,
    });
    if (!result.ok) return { success: false, error: result.error };

    refreshInspection(dispatchId);
    return { success: true, data: result.data };
  } catch (err) {
    logger.error('[openInspectionChecklist] failed', err, {
      dispatchId,
      error: serializeError(err),
    });
    return {
      success: false,
      error: 'Could not open the inspection. Check your connection and try again.',
    };
  }
}

// ---------------------------------------------------------------------------
// Answering one item
// ---------------------------------------------------------------------------

export async function answerInspectionPass(
  dispatchId: string,
  stepInstanceId: string,
): Promise<InspectionActionResult> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  const res = await completeDriverTask(stepInstanceId, { passOrFail: 'pass' });
  if (!res.success) return { success: false, error: res.error };

  refreshInspection(dispatchId);
  return { success: true, data: undefined };
}

/**
 * Fail an item. The note is mandatory and the photo has already been uploaded.
 *
 * `photoKeys` are the s3 keys `requestInspectionPhotoUpload` handed out and the
 * browser has already PUT bytes to — this action never receives a file. That is
 * the whole point of upload-at-capture: by the time this runs, the evidence is
 * in the bucket whether or not this call succeeds.
 *
 * Each key is re-validated against the caller's own tenant prefix. The client
 * supplies them, and a client-supplied storage key that nobody checks is how
 * one carrier's photo ends up attached to another's DVIR.
 */
export async function answerInspectionFail(
  dispatchId: string,
  stepInstanceId: string,
  input: { note: string; photoKeys: string[] },
): Promise<InspectionActionResult> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  const photoKeys = Array.isArray(input.photoKeys) ? input.photoKeys : [];
  try {
    for (const key of photoKeys) assertTenantKey(key, g.session.tenantId);
  } catch (err) {
    logger.warn('[answerInspectionFail] rejected a foreign storage key', {
      dispatchId,
      stepInstanceId,
      tenantId: g.session.tenantId,
      error: serializeError(err),
    });
    return { success: false, error: 'That photo could not be attached. Take it again.' };
  }

  const res = await recordDriverInspectionFailure(stepInstanceId, {
    photoUrls: photoKeys,
    note: input.note,
  });
  if (!res.success) return { success: false, error: res.error };

  refreshInspection(dispatchId);
  return { success: true, data: undefined };
}

export async function answerInspectionNotApplicable(
  dispatchId: string,
  stepInstanceId: string,
  reason: string,
): Promise<InspectionActionResult> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  const res = await markDriverTaskNotApplicable(stepInstanceId, reason);
  if (!res.success) return { success: false, error: res.error };

  refreshInspection(dispatchId);
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Photo — the grant half of upload-at-capture
// ---------------------------------------------------------------------------

const PHOTO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Issue a presigned R2 PUT for one inspection photo.
 *
 * R2 under the `inspections` category, matching mobile exactly (ruling 3). The
 * web driver's other upload path, `uploadTaskFile`, writes to Supabase Storage
 * under a different prefix; it is left alone for the Tasks tab's other step
 * types, but an inspection photo taken on web now lands where an inspection
 * photo taken on the phone lands. One key format meaning one thing.
 *
 * Browser-to-R2 direct PUT is not new here — `components/documents/document-
 * upload.tsx` and `TruckPhotoUploadModal` have done exactly this against the
 * same bucket since long before this phase, so the CORS configuration this
 * depends on is already proven in production rather than assumed.
 */
export async function requestInspectionPhotoUpload(
  dispatchId: string,
  input: { fileName: string; contentType: string; sizeBytes: number },
): Promise<InspectionActionResult<{ uploadUrl: string; s3Key: string }>> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  if (!PHOTO_TYPES.has(input.contentType)) {
    return { success: false, error: 'Photos must be JPEG, PNG or WebP.' };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { success: false, error: 'That photo could not be read. Take it again.' };
  }
  if (input.sizeBytes > MAX_PHOTO_BYTES) {
    return { success: false, error: 'That photo is over 10 MB. Take it again at a lower size.' };
  }

  try {
    const sanitized = (input.fileName || 'photo.jpg').replace(/[/\\?#]/g, '-').slice(0, 120);
    const grant = await generateUploadUrl(
      g.session.tenantId,
      'inspections',
      nanoid(),
      sanitized,
      input.contentType,
      input.sizeBytes,
    );
    return { success: true, data: grant };
  } catch (err) {
    logger.error('[requestInspectionPhotoUpload] failed', err, {
      dispatchId,
      error: serializeError(err),
    });
    return { success: false, error: 'Could not prepare the photo upload. Try again.' };
  }
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

const SIGNATURE_TYPES = new Set(['image/png']);

/** Presigned PUT for the signature PNG. Same bucket, same category. */
export async function requestSignatureUpload(
  dispatchId: string,
  input: { contentType: string; sizeBytes: number },
): Promise<InspectionActionResult<{ uploadUrl: string; s3Key: string }>> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  if (!SIGNATURE_TYPES.has(input.contentType)) {
    return { success: false, error: 'The signature could not be saved. Sign again.' };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { success: false, error: 'The signature came out empty. Sign again.' };
  }
  if (input.sizeBytes > MAX_PHOTO_BYTES) {
    return { success: false, error: 'The signature file is too large. Sign again.' };
  }

  try {
    const grant = await generateUploadUrl(
      g.session.tenantId,
      'inspections',
      nanoid(),
      `signature-${dispatchId}.png`,
      input.contentType,
      input.sizeBytes,
    );
    return { success: true, data: grant };
  } catch (err) {
    logger.error('[requestSignatureUpload] failed', err, {
      dispatchId,
      error: serializeError(err),
    });
    return { success: false, error: 'Could not prepare the signature upload. Try again.' };
  }
}

/**
 * Record the signature against its SIGNATURE step.
 *
 * `s3Key` must already point at uploaded bytes. The client PUTs first and only
 * calls this on a 2xx — the Phase 9 lesson from `SignatureScreen`, which used
 * to set the key whether or not the bytes landed and show a green "Signature
 * submitted" either way. A signed DVIR with no signature object is precisely
 * what a roadside inspection asks for and precisely what would not be there.
 *
 * `signedByName` and `signedAt` are stored alongside, because Section 12 wants
 * the name and timestamp printed beneath the mark and a rendering-time
 * reconstruction is not the same record.
 */
export async function signInspection(
  dispatchId: string,
  input: { stepInstanceId: string; s3Key: string; signedByName: string; signedAt: string },
): Promise<InspectionActionResult> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  try {
    assertTenantKey(input.s3Key, g.session.tenantId);
  } catch (err) {
    logger.warn('[signInspection] rejected a foreign storage key', {
      dispatchId,
      tenantId: g.session.tenantId,
      error: serializeError(err),
    });
    return { success: false, error: 'That signature could not be attached. Sign again.' };
  }

  const name = (input.signedByName ?? '').trim();
  if (!name) return { success: false, error: 'Type the name you are signing under.' };

  // Parsed rather than trusted: an unparseable timestamp would be stored and
  // then rendered as "Invalid Date" beneath a legal signature.
  const at = new Date(input.signedAt);
  if (Number.isNaN(at.getTime())) {
    return { success: false, error: 'The signature timestamp was not readable. Sign again.' };
  }

  const res = await completeDriverTask(input.stepInstanceId, {
    signatureUrl: input.s3Key,
    signedByName: name,
    signedAt: at.toISOString(),
  });
  if (!res.success) return { success: false, error: res.error };

  refreshInspection(dispatchId);
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/**
 * Submit the finished walkaround and report the verdict.
 *
 * Does NOT start the trip — `handleSubmitInspection` says why, and it is worth
 * repeating here because the button sits next to one that does: a driver who
 * finishes a walkaround at 04:50 should not be put on the road at 04:50.
 */
export async function submitInspectionChecklist(
  dispatchId: string,
): Promise<InspectionActionResult<InspectionGateView>> {
  const g = await guard(dispatchId);
  if (!g.ok) return { success: false, error: g.error };

  try {
    const result = await handleSubmitInspection({
      orgId: g.session.tenantId,
      dispatchId,
      userId: g.session.userId,
    });
    if (!result.ok) return { success: false, error: result.error };

    refreshInspection(dispatchId);
    revalidatePath('/home');
    revalidatePath('/my-route');
    return { success: true, data: result.data };
  } catch (err) {
    logger.error('[submitInspectionChecklist] failed', err, {
      dispatchId,
      error: serializeError(err),
    });
    return {
      success: false,
      error:
        'Could not submit the inspection. Your answers are saved — check your connection and try again.',
    };
  }
}
