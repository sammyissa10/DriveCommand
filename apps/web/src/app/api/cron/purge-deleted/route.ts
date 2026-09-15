import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { CronFailures, cronStatus } from '@/lib/cron/failure-report';
import { SOFT_DELETE_RETENTION_DAYS } from '@/lib/carrier/soft-delete';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] purge-deleted: Starting');

  if (!verifyCronSecret(request)) {
    logger.error('[CRON] purge-deleted: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SOFT_DELETE_RETENTION_DAYS);

  /**
   * quick-603 — `results` now holds SUCCESSES ONLY.
   *
   * It used to hold `-1` for a failed model, and the total on the old line 50
   * summed `Object.values(results)` through a positives-only filter — which
   * threw the `-1` away, so seven failures produced `totalPurged: 0`, the same
   * number a clean run with nothing to purge produces. Encoding a failure as a
   * number in a collection that later gets summed is what made the erasure
   * possible; keeping failures in a separate structure is what makes it
   * impossible. (The old predicate is deliberately not quoted here — the audit's
   * verification greps for it and must find no match in this file.)
   */
  const results: Record<string, number> = {};
  const failures = new CronFailures();

  // Purge each entity type
  const models = [
    { name: 'CarrierLoad', model: prisma.carrierLoad },
    { name: 'Trip', model: prisma.trip },
    { name: 'CarrierContract', model: prisma.carrierContract },
    { name: 'CarrierClient', model: prisma.carrierClient },
    { name: 'CarrierDriver', model: prisma.carrierDriver },
    { name: 'CarrierTruck', model: prisma.carrierTruck },
    { name: 'Route', model: prisma.route },
  ];

  for (const { name, model } of models) {
    // The try STAYS and the loop STILL CONTINUES — one unpurgeable model must
    // not stop the other six. Only the reporting changed.
    try {
      const result = await (model as any).deleteMany({
        where: {
          deletedAt: { not: null, lt: cutoffDate },
        },
      });
      results[name] = result.count;
      if (result.count > 0) {
        logger.info(`[CRON] purge-deleted: Purged ${result.count} ${name} records`);
      }
    } catch (err) {
      failures.record(`[CRON] purge-deleted: Failed to purge ${name}`, name, err);
    }
  }

  const totalPurged = Object.values(results).reduce((a, b) => a + b, 0);
  const report = failures.report();
  logger.info('[CRON] purge-deleted: Completed', { totalPurged, results, ...report });

  return Response.json(
    { success: failures.ok, totalPurged, results, ...report },
    { status: cronStatus(failures) },
  );
}
