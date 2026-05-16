/**
 * GET /api/cron/cleanup-quarantine
 *
 * Hourly cron to delete stale quarantine upload objects from R2/S3.
 *
 * Quarantine objects are created by /api/documents/request-upload-url when a
 * presigned URL is issued. The client uploads directly to the quarantine prefix;
 * the server then validates and promotes to the final key. If the client never
 * completes the upload (browser crash, network failure, etc.), the quarantine
 * object will remain in R2 indefinitely without this cleanup cron.
 *
 * Stale threshold: > 1 hour (objects that weren't promoted within 1h are garbage).
 *
 * Authentication: CRON_SECRET bearer token (timing-safe comparison).
 * Schedule: hourly (0 * * * * in vercel.json).
 *
 * Part of quick-349 input/upload abuse hardening.
 */

import { NextRequest } from 'next/server';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const QUARANTINE_PREFIX = '_quarantine/';
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  logger.info('[CRON] cleanup-quarantine: Starting');

  // Verify CRON_SECRET (timing-safe comparison)
  if (!verifyCronSecret(request)) {
    logger.error('[CRON] cleanup-quarantine: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  const bucket = getBucketName();
  const now = Date.now();
  let scanned = 0;
  let deleted = 0;
  let errors = 0;
  let continuationToken: string | undefined;

  try {
    // Paginate through all objects under any tenant's _quarantine/ prefix
    // Objects are stored as: tenant-{tenantId}/_quarantine/{fileId}-{filename}
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        // No Prefix filter — we iterate everything and check _quarantine in key
        // This is correct: we can't know all tenant IDs ahead of time.
        // For very large buckets, add a "tenant-" prefix to reduce scan cost.
        Prefix: 'tenant-',
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const listResult = await s3Client.send(listCommand);
      const objects = listResult.Contents ?? [];

      for (const obj of objects) {
        if (!obj.Key || !obj.LastModified) continue;

        // Only touch quarantine objects
        if (!obj.Key.includes('/_quarantine/')) continue;

        scanned++;

        const ageMs = now - obj.LastModified.getTime();
        if (ageMs < STALE_THRESHOLD_MS) continue;

        // Object is stale — delete it
        try {
          await s3Client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key })
          );
          deleted++;
          logger.info('[CRON] cleanup-quarantine: Deleted stale object', {
            key: obj.Key,
            ageMinutes: Math.round(ageMs / 60_000),
          });
        } catch (err) {
          errors++;
          logger.error('[CRON] cleanup-quarantine: Failed to delete object', {
            key: obj.Key,
            error: String(err),
          });
        }
      }

      continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (err) {
    logger.error('[CRON] cleanup-quarantine: List operation failed', { error: String(err) });
    return Response.json(
      { success: false, error: 'List operation failed' },
      { status: 500 }
    );
  }

  const summary = { success: true, scanned, deleted, errors };
  logger.info('[CRON] cleanup-quarantine: Completed', summary);
  return Response.json(summary);
}
