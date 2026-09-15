/**
 * Daily cron job: check compliance expiries for all active tenants.
 *
 * Schedule: Daily at 06:00 UTC
 * Authentication: CRON_SECRET bearer token
 *
 * Processing flow:
 * 1. Verify CRON_SECRET
 * 2. Ensure carrier_compliance_alert_log table exists (idempotent DDL)
 * 3. Fetch all active tenants
 * 4. For each tenant (in isolation — one failure does NOT block others):
 *    - Call getComplianceAlerts(tenantId)
 *    - Insert each alert into carrier_compliance_alert_log
 * 5. Return summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { getComplianceAlerts } from '@/lib/carrier/compliance';
import { sendComplianceAlertNotifications } from '@/lib/carrier/notifications';
import { logger } from '@/lib/logger';
import { CronFailures, cronStatus } from '@/lib/cron/failure-report';
import { Prisma } from '@/generated/prisma';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] carrier-compliance-alerts: Starting daily compliance check');

  // 1. Verify CRON_SECRET (timing-safe comparison)
  if (!verifyCronSecret(request)) {
    logger.error('[CRON] carrier-compliance-alerts: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  /**
   * quick-606 — THE `CREATE TABLE IF NOT EXISTS` BOOTSTRAP THAT USED TO LIVE HERE
   * IS DELETED, and it is worth saying why rather than just how.
   *
   * It ran `CREATE TABLE` + two `CREATE INDEX` on EVERY invocation, wrapped in a
   * try/catch that returned `500 {"error":"Failed to initialize log table"}`.
   * Under `app_user` that is `42501 permission denied for schema public`, wrapped
   * by Prisma as `P2010` — measured on staging, quick-606
   * `evidence/02-reverify.json` row 4. **A runtime connection was being asked to
   * run DDL**, and no policy and no grant can fix that: granting `CREATE ON
   * SCHEMA public` to a runtime role is precisely the widening the cutover
   * exists to remove.
   *
   * The table is real and does not need bootstrapping. It was created by
   * `20260515000000_repair_carrier_compliance_alert_log`, further touched by
   * `20260515000001_db_security_standardization` and
   * `20260527000001_quick410_advisor_rls_fix`, and carries a live
   * `tenant_isolation_policy` on `org_id` (sweep S10) plus an `app_user` grant.
   * Per R13 its presence was confirmed on BOTH databases against
   * `information_schema` before the bootstrap was removed — "it is in a
   * migration" and "it is in the database" are different claims
   * (`evidence/07-grants.json`, which lists grants on it for both).
   *
   * It is NOT in `schema.prisma` — a raw-SQL-only table. That is unchanged.
   */

  /**
   * quick-606 — ROUTE. This was `prisma.tenant.findMany` on the BARE client under
   * an `@bypass_rls reason: system-operation` comment, and **nothing in this file
   * ever set `app.bypass_rls`** — the comment was decorative in exactly the way
   * the digests' "DECORATIVE" note was. As `app_user` with an empty GUC the
   * honest outcomes were a `TC001` raise or, worse, a silent partial sweep.
   * Genuinely cross-tenant: the sweep IS the list.
   */
  let tenants: Array<{ id: string; name: string }>;
  try {
    const adminDb = await getAdminDb('compliance alert tenant sweep');
    tenants = await adminDb.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    logger.info(`[CRON] carrier-compliance-alerts: Found ${tenants.length} active tenant(s)`);
  } catch (error) {
    logger.error('[CRON] carrier-compliance-alerts: Failed to fetch tenants', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tenants' }, { status: 500 });
  }

  // 3. Initialize summary
  const summary = {
    orgs_processed: 0,
    total_alerts_found: 0,
  };
  const failures = new CronFailures();

  // 4. Process each tenant in isolation
  for (const tenant of tenants) {
    try {
      const alerts = await getComplianceAlerts(tenant.id);

      if (alerts.length > 0) {
        /**
         * quick-606. This raw INSERT was issued on the BARE client.
         * `carrier_compliance_alert_log` carries a live `tenant_isolation_policy`
         * on `org_id`, and a raw statement is NOT intercepted by the Prisma
         * extension — the only thing that can satisfy that policy is
         * `app.current_tenant_id` being set on the connection. It "worked" only
         * insofar as a `max: 1` pool may have inherited a GUC an earlier scoped
         * statement left behind (`unmigrated-path-tripwire.md` §8 item 7), which
         * is exactly what this task exists to stop relying on. Issue it on the
         * client that set the context.
         */
        const tenantDb = await getTenantPrismaForOrg(tenant.id);
        for (const alert of alerts) {
          await tenantDb.$executeRaw(Prisma.sql`
            INSERT INTO carrier_compliance_alert_log (org_id, alert_type, entity_id, message, severity)
            VALUES (${tenant.id}::uuid, ${alert.type}, ${alert.entityId}, ${alert.message}, ${alert.severity})
          `);
        }
      }

      // Send batched email notification for this org's alerts
      if (alerts.length > 0) {
        try {
          await sendComplianceAlertNotifications(tenant.id, alerts);
        } catch (err) {
          // Was `logger.error(msg, { tenantId, error: err })` — the error in
          // slot 2's place, rendered `Error: [object Object]` — and counted
          // nowhere, so every tenant's alert email could fail and the run still
          // reported `success: true`.
          failures.record(
            '[CRON] carrier-compliance-alerts: email notification failed',
            `tenant:${tenant.id}:email`,
            err,
            { tenantName: tenant.name, alertCount: alerts.length },
          );
        }
      }

      summary.orgs_processed++;
      summary.total_alerts_found += alerts.length;

      logger.info(
        `[CRON] carrier-compliance-alerts: Tenant ${tenant.name} (${tenant.id}) — ${alerts.length} alert(s) found`,
      );
    } catch (tenantErr) {
      // One tenant failure must NOT block others — the `continue` semantics are
      // unchanged. What changed: the failure is now COUNTED. It used to be
      // logged and then simply not increment `orgs_processed`, which made a
      // tenant that blew up indistinguishable from a tenant that does not exist.
      failures.record(
        `[CRON] carrier-compliance-alerts: Failed to process tenant ${tenant.name} (${tenant.id})`,
        `tenant:${tenant.id}`,
        tenantErr,
        { tenantName: tenant.name },
      );
    }
  }

  const report = failures.report();
  logger.info('[CRON] carrier-compliance-alerts: Completed', { ...summary, ...report });
  return NextResponse.json(
    { success: failures.ok, ...summary, ...report },
    { status: cronStatus(failures) },
  );
}
