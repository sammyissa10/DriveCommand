import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
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

  const results: Record<string, number> = {};

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
      logger.error(`[CRON] purge-deleted: Failed to purge ${name}`, { error: String(err) });
      results[name] = -1;
    }
  }

  const totalPurged = Object.values(results).filter(n => n > 0).reduce((a, b) => a + b, 0);
  logger.info('[CRON] purge-deleted: Completed', { totalPurged, results });

  return Response.json({ success: true, totalPurged, results });
}
