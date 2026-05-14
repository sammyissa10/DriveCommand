/**
 * 30-day compliance digest cron route.
 *
 * UTC schedule:  0 14 * * 1   (every Monday at 14:00 UTC)
 * EST equivalent: Monday 9 AM EST
 *
 * Authentication: CRON_SECRET bearer token (same pattern as send-reminders)
 *
 * Processing flow:
 * 1. Verify CRON_SECRET
 * 2. Fetch all active tenants via bypass_rls
 * 3. For each tenant, find all active OWNER users
 * 4. For each owner, build the compliance payload (returns null if no expiring docs)
 * 5. Dispatch digest.compliance_30day when payload is non-null
 * 6. Return { success, processedTenants, sent, skipped, failed }
 */

import { NextRequest } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { buildCompliance30DayPayload } from '@/lib/notifications/digests/compliance-30day-payload';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] digest-compliance-30day: Starting 30-day compliance digest');

  if (!verifyCronSecret(request)) {
    logger.error('[CRON] digest-compliance-30day: Unauthorized request');
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

  logger.info(`[CRON] digest-compliance-30day: Found ${tenants.length} active tenant(s)`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      const tenantPrisma: any = prisma.$extends(withTenantRLS(tenant.id));

      const owners = await tenantPrisma.user.findMany({
        where: { tenantId: tenant.id, role: 'OWNER', isActive: true },
        select: { id: true, email: true, firstName: true },
      });

      const runDate = new Date();

      for (const owner of owners) {
        try {
          const payload = await buildCompliance30DayPayload(tenantPrisma, tenant.id, owner.id);
          if (!payload) {
            skipped++;
            continue;
          }
          const runIso = runDate.toISOString().slice(0, 10);
          const result = await dispatchNotification('digest.compliance_30day', {
            tenantId: tenant.id,
            payload,
            relatedEntity: { type: 'Digest', id: `${tenant.id}:${owner.id}:${runIso}` },
          }).catch((err: unknown) => {
            logger.error('[CRON] digest-compliance-30day: dispatch failed', err);
            return { sent: 0, skipped: 0, failed: 1 };
          });
          sent += result.sent;
          skipped += result.skipped;
          failed += result.failed;
        } catch (ownerErr) {
          logger.error(`[CRON] digest-compliance-30day: owner ${owner.id} failed`, ownerErr);
          failed++;
        }
      }
    } catch (tenantErr) {
      logger.error(`[CRON] digest-compliance-30day: tenant ${tenant.id} failed`, tenantErr);
      failed++;
    }
  }

  const summary = { success: true, processedTenants: tenants.length, sent, skipped, failed };
  logger.info('[CRON] digest-compliance-30day: Completed', summary);
  return Response.json(summary);
}
