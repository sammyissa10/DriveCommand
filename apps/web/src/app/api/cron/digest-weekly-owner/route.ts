/**
 * Weekly owner digest cron route.
 *
 * UTC schedule:  0 22 * * 5   (every Friday at 22:00 UTC)
 * EST equivalent: Friday 5 PM EST
 *
 * Authentication: CRON_SECRET bearer token (same pattern as send-reminders)
 *
 * Processing flow:
 * 1. Verify CRON_SECRET
 * 2. Fetch all active tenants via bypass_rls
 * 3. For each tenant, find all active OWNER users
 * 4. For each owner, build the weekly payload (returns null if no loads)
 * 5. Dispatch digest.weekly_owner when payload is non-null
 * 6. Return { success, processedTenants, sent, skipped, failed }
 */

import { NextRequest } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { buildWeeklyOwnerPayload } from '@/lib/notifications/digests/weekly-owner-payload';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] digest-weekly-owner: Starting weekly owner digest');

  if (!verifyCronSecret(request)) {
    logger.error('[CRON] digest-weekly-owner: Unauthorized request');
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

  logger.info(`[CRON] digest-weekly-owner: Found ${tenants.length} active tenant(s)`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const weekStart = new Date();

  for (const tenant of tenants) {
    try {
      const tenantPrisma: any = prisma.$extends(withTenantRLS(tenant.id));

      const owners = await tenantPrisma.user.findMany({
        where: { tenantId: tenant.id, role: 'OWNER', isActive: true },
        select: { id: true, email: true, firstName: true },
      });

      for (const owner of owners) {
        try {
          const payload = await buildWeeklyOwnerPayload(tenantPrisma, tenant.id, owner.id, weekStart);
          if (!payload) {
            skipped++;
            continue;
          }
          const weekIso = weekStart.toISOString().slice(0, 10);
          const result = await dispatchNotification('digest.weekly_owner', {
            tenantId: tenant.id,
            payload,
            relatedEntity: { type: 'Digest', id: `${tenant.id}:${owner.id}:${weekIso}` },
          }).catch((err: unknown) => {
            logger.error('[CRON] digest-weekly-owner: dispatch failed', err);
            return { sent: 0, skipped: 0, failed: 1 };
          });
          sent += result.sent;
          skipped += result.skipped;
          failed += result.failed;
        } catch (ownerErr) {
          logger.error(`[CRON] digest-weekly-owner: owner ${owner.id} failed`, ownerErr);
          failed++;
        }
      }
    } catch (tenantErr) {
      logger.error(`[CRON] digest-weekly-owner: tenant ${tenant.id} failed`, tenantErr);
      failed++;
    }
  }

  const summary = { success: true, processedTenants: tenants.length, sent, skipped, failed };
  logger.info('[CRON] digest-weekly-owner: Completed', summary);
  return Response.json(summary);
}
