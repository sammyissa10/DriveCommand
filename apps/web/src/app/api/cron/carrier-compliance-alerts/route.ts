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
import { prisma } from '@/lib/db/prisma';
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

  // 2. Ensure log table exists (idempotent)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS carrier_compliance_alert_log (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        org_id uuid NOT NULL,
        alert_type text NOT NULL,
        entity_id text NOT NULL,
        message text NOT NULL,
        severity text NOT NULL,
        created_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_compliance_log_org ON carrier_compliance_alert_log(org_id);
      CREATE INDEX IF NOT EXISTS idx_compliance_log_created ON carrier_compliance_alert_log(created_at);
    `);
  } catch (err) {
    logger.error('[CRON] carrier-compliance-alerts: Failed to ensure log table', err);
    return NextResponse.json({ success: false, error: 'Failed to initialize log table' }, { status: 500 });
  }

  /**
   * @bypass_rls reason: system-operation
   * WHY: This cron job runs cross-tenant to check compliance for ALL active tenants.
   *      It has no user context to scope RLS policies to a single tenant.
   * SAFETY: Gated by CRON_SECRET header check above — only callable by Vercel Cron.
   */
  let tenants: Array<{ id: string; name: string }>;
  try {
    tenants = await prisma.tenant.findMany({
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
        for (const alert of alerts) {
          await prisma.$executeRaw(Prisma.sql`
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
