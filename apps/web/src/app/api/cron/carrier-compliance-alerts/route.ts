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
import { logger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] carrier-compliance-alerts: Starting daily compliance check');

  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    logger.error('[CRON] carrier-compliance-alerts: Unauthorized request');
    return new Response('Unauthorized', { status: 401 });
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

      summary.orgs_processed++;
      summary.total_alerts_found += alerts.length;

      logger.info(
        `[CRON] carrier-compliance-alerts: Tenant ${tenant.name} (${tenant.id}) — ${alerts.length} alert(s) found`,
      );
    } catch (tenantErr) {
      // One tenant failure must NOT block others
      logger.error(
        `[CRON] carrier-compliance-alerts: Failed to process tenant ${tenant.name} (${tenant.id})`,
        tenantErr,
      );
    }
  }

  logger.info('[CRON] carrier-compliance-alerts: Completed', summary);
  return NextResponse.json({ success: true, ...summary });
}
