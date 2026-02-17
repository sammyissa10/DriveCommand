/**
 * Presigned URL generation for S3 uploads and downloads.
 *
 * Implements secure direct-to-S3 upload flow:
 * 1. Client requests upload URL with file metadata
 * 2. Server validates and generates presigned PUT URL (5-min expiry)
 * 3. Client uploads directly to S3 using presigned URL
 * 4. Client notifies server to save metadata in database
 *
 * Download flow:
 * 1. Client requests download URL with document ID
 * 2. Server validates ownership and generates presigned GET URL (1-hour expiry)
 */

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, bucket } from './s3-client';

export type DocumentCategory = 'trucks' | 'routes' | 'drivers';

/**
 * Generate presigned upload URL for direct-to-S3 upload.
 *
 * @param tenantId - Tenant ID for path prefixing (tenant isolation)
 * @param category - Document category (trucks or routes)
 * @param fileId - Unique file identifier (nanoid)
 * @param fileName - Original filename
 * @param contentType - MIME type (already validated via magic bytes)
 * @param fileSize - File size in bytes
 * @returns Upload URL and S3 key
 */
export async function generateUploadUrl(
  tenantId: string,
  category: DocumentCategory,
  fileId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<{ uploadUrl: string; s3Key: string }> {
  // Tenant-prefixed S3 key for storage isolation
  const s3Key = `tenant-${tenantId}/${category}/${fileId}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
    ContentLength: fileSize,
  });

  // 5-minute expiry for upload URL
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  return { uploadUrl, s3Key };
}

/**
 * Generate presigned download URL for document retrieval.
 *
 * @param s3Key - S3 object key (already validated with tenant prefix)
 * @returns Presigned download URL
 */
export async function generateDownloadUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  // 1-hour expiry for download URL
  const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return downloadUrl;
}

/**
 * Delete object from S3 storage.
 *
 * @param s3Key - S3 object key to delete
 */
export async function deleteS3Object(s3Key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  await s3Client.send(command);
}
