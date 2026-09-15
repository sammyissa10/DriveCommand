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
import { prisma } from '@/lib/db/prisma';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { CronFailures, cronStatus } from '@/lib/cron/failure-report';
import { buildCompliance30DayPayload } from '@/lib/notifications/digests/compliance-30day-payload';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] digest-compliance-30day: Starting 30-day compliance digest');

  if (!verifyCronSecret(request)) {
    logger.error('[CRON] digest-compliance-30day: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  /**
   * quick-600 (B5) — ROUTE. Cross-tenant cron — fetches all tenants then
   * scopes per-tenant via withTenantRLS (DECORATIVE, left untouched — the
   * per-tenant loop below is out of this task's scope; only this sweep
   * statement moves onto the admin connection).
   * Gated by CRON_SECRET header check above.
   */
  const adminDb = await getAdminDb('compliance digest tenant sweep');
  const tenants = await adminDb.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  logger.info(`[CRON] digest-compliance-30day: Found ${tenants.length} active tenant(s)`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const failures = new CronFailures();

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
            failures.record(
              '[CRON] digest-compliance-30day: dispatch failed',
              `owner:${owner.id}`,
              err,
              { tenantId: tenant.id },
            );
            return { sent: 0, skipped: 0, failed: 1 };
          });
          sent += result.sent;
          skipped += result.skipped;
          failed += result.failed;
          if (result.failed > 0) {
            // A per-recipient channel failure. `dispatchNotification` returns
            // counts only, so the scope is what names it; the per-recipient
            // detail is in NotificationSendLog and the dispatcher's own logs.
            failures.record(
              `[CRON] digest-compliance-30day: ${result.failed} channel delivery(ies) failed`,
              `owner:${owner.id}`,
              new Error(`${result.failed} notification channel delivery(ies) failed`),
              { tenantId: tenant.id, dispatched: result },
            );
          }
        } catch (ownerErr) {
          failures.record(
            `[CRON] digest-compliance-30day: owner ${owner.id} failed`,
            `owner:${owner.id}`,
            ownerErr,
            { tenantId: tenant.id },
          );
          failed++;
        }
      }
    } catch (tenantErr) {
      failures.record(
        `[CRON] digest-compliance-30day: tenant ${tenant.id} failed`,
        `tenant:${tenant.id}`,
        tenantErr,
      );
      failed++;
    }
  }

  const report = failures.report();
  const summary = {
    success: failures.ok,
    processedTenants: tenants.length,
    sent,
    skipped,
    failed,
    ...report,
  };
  logger.info('[CRON] digest-compliance-30day: Completed', summary);
  return Response.json(summary, { status: cronStatus(failures) });
}
