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
 *
 * SCHEDULE: NONE. THIS ROUTE IS NOT SCHEDULED AND NEVER HAS BEEN.
 * -------------------------------------------------------------
 * This header used to read "Schedule: hourly (0 * * * * in vercel.json)", and
 * `docs/security/input-hardening.md:86` still says the same. Both are false:
 * `git log -S"cleanup-quarantine" -- apps/web/vercel.json` returns ZERO commits,
 * so the entry was never added (an added-then-removed entry would show two), and
 * the live Vercel project's 14 cron definitions do not include it either. No
 * code anywhere calls it. Stale R2 quarantine objects have therefore been
 * accumulating since quick-349 shipped.
 *
 * quick-603 REPORTED this and deliberately did NOT fix it — adding a cron entry
 * is a product decision, not a defect repair, and whether this route wants a
 * schedule or a deletion is not a reporting question. Its *reporting* was fixed,
 * because it is on the scheduled surface's enumeration and it did misreport.
 * See `docs/audits/scheduled-job-failure-reporting.md` §1.2.
 *
 * (Note for whoever schedules it: `0 * * * *` would have FAILED deployment on a
 * Hobby account, which is the most likely reason it was never added. The project
 * is on Pro, so hourly is available now — audit §4.4.)
 *
 * Part of quick-349 input/upload abuse hardening.
 */

import { NextRequest } from 'next/server';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { CronFailures, cronStatus } from '@/lib/cron/failure-report';

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
  const failures = new CronFailures();

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
          // The loop still continues — one undeletable object must not stop the
          // sweep. Only the reporting changed.
          errors++;
          failures.record(
            '[CRON] cleanup-quarantine: Failed to delete object',
            obj.Key,
            err,
            { ageMinutes: Math.round(ageMs / 60_000) },
          );
        }
      }

      continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (err) {
    failures.record('[CRON] cleanup-quarantine: List operation failed', 'list', err, {
      bucket,
      scanned,
      deleted,
    });
    return Response.json(
      { success: false, error: 'List operation failed', scanned, deleted, errors, ...failures.report() },
      { status: 500 }
    );
  }

  const summary = { success: failures.ok, scanned, deleted, errors, ...failures.report() };
  logger.info('[CRON] cleanup-quarantine: Completed', summary);
  return Response.json(summary, { status: cronStatus(failures) });
}
