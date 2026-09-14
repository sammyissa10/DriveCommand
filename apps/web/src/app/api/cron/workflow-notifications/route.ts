/**
 * Cron endpoint for daily workflow notification sweeps.
 *
 * Schedule: Hourly — isOverdue and notification dedup gates prevent duplicate sends.
 * Recommended vercel.json entry (add on deploy):
 *   { "path": "/api/cron/workflow-notifications", "schedule": "0 * * * *" }
 *
 * Authentication: CRON_SECRET bearer token (same convention as all cron routes).
 *
 * Processing:
 *   Sweep 1 — STEP_OVERDUE (24h after due):
 *     Query StepInstance where status IN (NOT_STARTED, IN_PROGRESS) AND dueDate < now-24h AND isOverdue=false.
 *     Fire sendStepOverdue, mark isOverdue=true to prevent re-sends.
 *
 *   Sweep 2 — INSTANCE_BLOCKED >48h admin email escalation:
 *     Query PlaybookInstance where status=BLOCKED AND updatedAt < now-48h AND no EMAIL PlaybookNotification exists.
 *     Fire sendInstanceBlockedEmail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { sendStepOverdue, sendInstanceBlockedEmail } from '@/server/services/workflows/notifications';
import { logger } from '@/lib/logger';
import { verifyCronSecret } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic'; // Prevent Next.js caching

interface CronStats {
  overdueSent: number;
  overdueErrors: number;
  blockedEmailsSent: number;
  blockedEmailErrors: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  logger.info('[CRON] workflow-notifications: Starting sweep');

  // Auth guard — timing-safe CRON_SECRET verification
  if (!verifyCronSecret(request)) {
    logger.error('[CRON] workflow-notifications: Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats: CronStats = {
    overdueSent: 0,
    overdueErrors: 0,
    blockedEmailsSent: 0,
    blockedEmailErrors: 0,
  };

  // ─── Sweep 1: STEP_OVERDUE (24h after due) ──────────────────────────────────

  try {
    const overdueThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // quick-600 (B5) — ROUTE. Genuinely cross-tenant: the sweep is the list.
    const adminDb = await getAdminDb('workflow overdue-step sweep');
    const overdueSteps = await adminDb.stepInstance.findMany({
      where: {
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        dueDate: { lt: overdueThreshold },
        isOverdue: false,
      },
      select: {
        id: true,
        stepSnapshot: true, // needed to read overdueRecipient + dueWithinHours
        playbookInstance: { select: { tenantId: true, entityId: true, entityType: true } },
      },
    });

    logger.info(`[CRON] workflow-notifications: Found ${overdueSteps.length} overdue step(s)`);

    for (const step of overdueSteps) {
      const tenantId = step.playbookInstance.tenantId;
      const snap = step.stepSnapshot as { overdueRecipient?: string; dueWithinHours?: number | null };

      // Steps created before phase 46 have no dueWithinHours — mark overdue but skip alert.
      if (!snap.dueWithinHours) {
        // quick-600 (B5) — CORRECT, not ROUTE: `tenantId` is already in hand
        // from the row the sweep above just read (playbookInstance.tenantId).
        const tenantDb = await getTenantPrismaForOrg(tenantId);
        await tenantDb.stepInstance.update({ where: { id: step.id }, data: { isOverdue: true } });
        continue;
      }

      try {
        await sendStepOverdue({
          stepInstanceId: step.id,
          tenantId,
          overdueRecipient: (snap.overdueRecipient ?? 'OWNER') as 'DRIVER' | 'OWNER' | 'BOTH',
        });

        // Mark isOverdue=true to prevent duplicate sends on subsequent cron runs.
        // quick-600 (B5) — CORRECT, not ROUTE: same tenant, same row, already known.
        const tenantDb = await getTenantPrismaForOrg(tenantId);
        await tenantDb.stepInstance.update({
          where: { id: step.id },
          data: { isOverdue: true },
        });

        stats.overdueSent++;
        logger.info(`[CRON] workflow-notifications: Sent STEP_OVERDUE for step ${step.id}`);
      } catch (err) {
        stats.overdueErrors++;
        logger.error(`[CRON] workflow-notifications: STEP_OVERDUE failed for step ${step.id}`, { err });
      }
    }
  } catch (err) {
    logger.error('[CRON] workflow-notifications: Sweep 1 (STEP_OVERDUE) query failed', { err });
  }

  // ─── Sweep 2: INSTANCE_BLOCKED >48h admin email escalation ──────────────────

  try {
    const blockedThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Find instances that have been BLOCKED for >48h and have NOT yet received an EMAIL notification
    // quick-600 (B5) — ROUTE. Genuinely cross-tenant: the sweep is the list.
    const adminDb2 = await getAdminDb('workflow blocked-instance sweep');
    const blockedInstances = await adminDb2.playbookInstance.findMany({
      where: {
        status: 'BLOCKED',
        updatedAt: { lt: blockedThreshold },
        // Exclude instances that already had an EMAIL escalation sent
        notifications: {
          none: {
            notificationType: 'INSTANCE_BLOCKED',
            channel: 'EMAIL',
          },
        },
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    logger.info(
      `[CRON] workflow-notifications: Found ${blockedInstances.length} instance(s) blocked >48h needing email escalation`
    );

    for (const instance of blockedInstances) {
      try {
        await sendInstanceBlockedEmail({
          playbookInstanceId: instance.id,
          tenantId: instance.tenantId,
        });

        stats.blockedEmailsSent++;
        logger.info(
          `[CRON] workflow-notifications: Sent INSTANCE_BLOCKED email for instance ${instance.id}`
        );
      } catch (err) {
        stats.blockedEmailErrors++;
        logger.error(
          `[CRON] workflow-notifications: INSTANCE_BLOCKED email failed for instance ${instance.id}`,
          { err }
        );
      }
    }
  } catch (err) {
    logger.error('[CRON] workflow-notifications: Sweep 2 (INSTANCE_BLOCKED email) query failed', { err });
  }

  logger.info('[CRON] workflow-notifications: Completed', { stats });
  return NextResponse.json({ ok: true, stats });
}
