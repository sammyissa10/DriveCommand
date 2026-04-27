'use server';

/**
 * Driver-scoped server actions for workflow task completion.
 *
 * SECURITY: All actions enforce DRIVER role + resolve identity from session.
 *           No action accepts userId as input — always resolved server-side.
 */

import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { completeStep } from '@/server/services/workflows/completeStep';
import { failInspectionItem } from '@/server/services/workflows/failInspectionItem';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import type { StepResult } from '@drivecommand/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

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
    return { success: false, error: err instanceof Error ? err.message : 'Failed to complete task' };
  }
}

// ─── Fail inspection ──────────────────────────────────────────────────────────

export async function failDriverInspection(
  stepInstanceId: string,
  result: { photoUrls: string[]; note?: string },
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.DRIVER]);
    const session = await getSession();
    if (!session) return { success: false, error: 'Unauthorized' };
    await failInspectionItem({
      stepInstanceId,
      userId: session.userId,
      tenantId: session.tenantId,
      result,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to record failure' };
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
    const s3Key = `tenant-${session.tenantId}/inspections/${fileId}-${sanitized}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await s3Client.send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    return { success: true, data: { s3Key } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}
