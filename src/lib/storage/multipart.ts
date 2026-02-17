/**
 * Multipart upload orchestration for large files (>5MB).
 *
 * Implements S3 multipart upload flow:
 * 1. Initiate multipart upload, receive uploadId
 * 2. Generate presigned URLs for each part (5MB chunks)
 * 3. Client uploads parts directly to S3
 * 4. Complete multipart upload with part ETags
 * 5. Abort if any step fails to clean up orphaned parts
 */

import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, bucket } from './s3-client';
import type { DocumentCategory } from './presigned';

/**
 * Initiate multipart upload for a large file.
 *
 * @param tenantId - Tenant ID for path prefixing (tenant isolation)
 * @param category - Document category (trucks, routes, or drivers)
 * @param fileId - Unique file identifier (nanoid)
 * @param fileName - Original filename (sanitized)
 * @param contentType - MIME type
 * @param totalParts - Number of parts the file will be split into
 * @returns Upload ID and S3 key for subsequent part uploads
 */
export async function initiateMultipartUpload(
  tenantId: string,
  category: DocumentCategory,
  fileId: string,
  fileName: string,
  contentType: string,
  totalParts: number
): Promise<{ uploadId: string; s3Key: string; totalParts: number }> {
  // Tenant-prefixed S3 key for storage isolation
  const s3Key = `tenant-${tenantId}/${category}/${fileId}-${fileName}`;

  const command = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
  });

  const response = await s3Client.send(command);

  if (!response.UploadId) {
    throw new Error('Failed to initiate multipart upload: no upload ID returned');
  }

  return {
    uploadId: response.UploadId,
    s3Key,
    totalParts,
  };
}

/**
 * Generate presigned URL for uploading a specific part.
 *
 * @param s3Key - S3 object key (from initiate step)
 * @param uploadId - Upload ID (from initiate step)
 * @param partNumber - Part number (1-indexed, up to 10,000)
 * @returns Presigned URL for uploading this part (10-minute expiry)
 */
export async function getPartUploadUrl(
  s3Key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: s3Key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  // 10-minute expiry for part upload (large parts may take time on slow connections)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

  return uploadUrl;
}

/**
 * Complete multipart upload after all parts are uploaded.
 *
 * @param s3Key - S3 object key
 * @param uploadId - Upload ID
 * @param parts - Array of {PartNumber, ETag} for each uploaded part
 */
export async function completeMultipartUpload(
  s3Key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>
): Promise<void> {
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: s3Key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((part) => ({
        PartNumber: part.PartNumber,
        ETag: part.ETag,
      })),
    },
  });

  await s3Client.send(command);
}

/**
 * Abort multipart upload and clean up orphaned parts.
 *
 * @param s3Key - S3 object key
 * @param uploadId - Upload ID
 */
export async function abortMultipartUpload(s3Key: string, uploadId: string): Promise<void> {
  const command = new AbortMultipartUploadCommand({
    Bucket: bucket,
    Key: s3Key,
    UploadId: uploadId,
  });

  await s3Client.send(command);
}
