/**
 * Daily driver digest cron route.
 *
 * UTC schedule:  0 22 * * *   (every day at 22:00 UTC)
 * EST equivalent: 5 PM EST daily
 *
 * Authentication: CRON_SECRET bearer token (same pattern as send-reminders)
 *
 * Processing flow:
 * 1. Verify CRON_SECRET
 * 2. Fetch all active tenants via bypass_rls
 * 3. For each tenant, find all active DRIVER users
 * 4. For each driver, build the daily payload (returns null if nothing to report)
 * 5. Dispatch digest.daily_driver when payload is non-null
 * 6. Return { success, processedTenants, sent, skipped, failed }
 */

import { NextRequest } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { buildDailyDriverPayload } from '@/lib/notifications/digests/daily-driver-payload';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] digest-daily-driver: Starting daily driver digest');

  if (!verifyCronSecret(request)) {
    logger.error('[CRON] digest-daily-driver: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  /**
   * @bypass_rls reason: system-operation
   * Cross-tenant cron — fetches all tenants then scopes per-tenant via withTenantRLS.
   * Gated by CRON_SECRET header check above.
   */
  const tenants = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  }, TX_OPTIONS);

  logger.info(`[CRON] digest-daily-driver: Found ${tenants.length} active tenant(s)`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const today = new Date();

  for (const tenant of tenants) {
    try {
      const tenantPrisma: any = prisma.$extends(withTenantRLS(tenant.id));

      const drivers = await tenantPrisma.user.findMany({
        where: { tenantId: tenant.id, role: 'DRIVER', isActive: true },
        select: { id: true, email: true, firstName: true },
      });

      for (const driver of drivers) {
        try {
          const payload = await buildDailyDriverPayload(tenantPrisma, tenant.id, driver.id, today);
          if (!payload) {
            skipped++;
            continue;
          }
          const todayIso = today.toISOString().slice(0, 10);
          const result = await dispatchNotification('digest.daily_driver', {
            tenantId: tenant.id,
            payload,
            relatedEntity: { type: 'Digest', id: `${tenant.id}:${driver.id}:${todayIso}` },
          }).catch((err: unknown) => {
            logger.error('[CRON] digest-daily-driver: dispatch failed', err);
            return { sent: 0, skipped: 0, failed: 1 };
          });
          sent += result.sent;
          skipped += result.skipped;
          failed += result.failed;
        } catch (driverErr) {
          logger.error(`[CRON] digest-daily-driver: driver ${driver.id} failed`, driverErr);
          failed++;
        }
      }
    } catch (tenantErr) {
      logger.error(`[CRON] digest-daily-driver: tenant ${tenant.id} failed`, tenantErr);
      failed++;
    }
  }

  const summary = { success: true, processedTenants: tenants.length, sent, skipped, failed };
  logger.info('[CRON] digest-daily-driver: Completed', summary);
  return Response.json(summary);
}
