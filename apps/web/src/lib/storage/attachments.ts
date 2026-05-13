/**
 * Storage abstraction layer for pay component attachments.
 *
 * Routes operations to the configured storage provider (default: s3).
 * Swap to Supabase Storage in the future by implementing the 'supabase' branch
 * in each function — no API/UI code changes needed.
 *
 * Storage key format: {tenantId}/components/{componentId}/{uuid}.{ext}
 * Upload URL expiry:  15 minutes (900s)
 * Download URL expiry: 15 minutes (900s), inline content disposition
 */

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, getBucketName } from './s3-client';

// ---------------------------------------------------------------------------
// Provider type
// ---------------------------------------------------------------------------

export type StorageProvider = 's3' | 'supabase';

/**
 * Returns the configured storage provider.
 * Reads STORAGE_PROVIDER env var; defaults to 's3'.
 */
export function getStorageProvider(): StorageProvider {
  const val = process.env.STORAGE_PROVIDER;
  if (val === 'supabase') return 'supabase';
  return 's3';
}

// ---------------------------------------------------------------------------
// getAttachmentUploadUrl
// ---------------------------------------------------------------------------

export interface AttachmentUploadUrlResult {
  uploadUrl: string;
  storageKey: string;
}

/**
 * Generate a presigned PUT URL for direct-to-storage upload.
 *
 * Key format: {tenantId}/components/{componentId}/{uuid}.{ext}
 * Expiry: 900s (15 minutes)
 *
 * ContentLength is intentionally omitted — Supabase S3-compat rejects presigned
 * URLs that sign ContentLength (see presigned.ts comment).
 */
export async function getAttachmentUploadUrl(params: {
  tenantId: string;
  componentId: string;
  ext: string;
  contentType: string;
}): Promise<AttachmentUploadUrlResult> {
  const provider = getStorageProvider();

  if (provider === 'supabase') {
    throw new Error('Supabase storage provider not yet implemented');
  }

  // s3 path
  const uuid = crypto.randomUUID();
  const storageKey = `${params.tenantId}/components/${params.componentId}/${uuid}.${params.ext}`;

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    ContentType: params.contentType,
    // ContentLength intentionally omitted — Supabase S3 compat issue
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  return { uploadUrl, storageKey };
}

// ---------------------------------------------------------------------------
// getAttachmentDownloadUrl
// ---------------------------------------------------------------------------

/**
 * Generate a short-lived presigned GET URL for viewing an attachment.
 *
 * Sets ResponseContentDisposition to 'inline' so browsers render images and
 * PDFs directly instead of prompting a download.
 * Expiry: 900s (15 minutes)
 *
 * @param storageKey - S3/R2 object key (validated by caller before calling)
 */
export async function getAttachmentDownloadUrl(storageKey: string): Promise<string> {
  const provider = getStorageProvider();

  if (provider === 'supabase') {
    throw new Error('Supabase storage provider not yet implemented');
  }

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    ResponseContentDisposition: 'inline',
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
  return url;
}

// ---------------------------------------------------------------------------
// deleteAttachmentObject
// ---------------------------------------------------------------------------

/**
 * Permanently delete a storage object.
 *
 * Note: API routes perform soft-deletes only (set deletedAt). This function is
 * intended for the daily cleanup job that purges soft-deleted records and their
 * storage objects.
 *
 * @param storageKey - S3/R2 object key to delete
 */
export async function deleteAttachmentObject(storageKey: string): Promise<void> {
  const provider = getStorageProvider();

  if (provider === 'supabase') {
    throw new Error('Supabase storage provider not yet implemented');
  }

  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
  });

  await s3Client.send(command);
}
