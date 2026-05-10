/**
 * Cron: Daily Workflow Safety Digest
 *
 * Schedule: 0 8 * * * (8am UTC) — registered in vercel.json by plan 01.
 * Auth: CRON_SECRET bearer token (same convention as all cron routes).
 *
 * Per-tenant sweep:
 *   1. Find all tenants with at least one active (NOT_STARTED or IN_PROGRESS) PlaybookInstance.
 *   2. Dedup: skip if a DAILY_DIGEST PlaybookNotification already exists for this tenant today.
 *   3. Collect stats: overdue step count, steps completed today, active instance count.
 *   4. Email all active OWNER + MANAGER users in the tenant.
 *   5. Write a PlaybookNotification dedup row after each successful send batch.
 *
 * Errors on individual tenants are logged and skipped — never thrown.
 */

import * as React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/gmail-client';
import { WorkflowSafetyDigestEmail } from '@/emails/workflow-safety-digest';
import { getAppBaseUrl } from '@/lib/app-url';
import { logger } from '@/lib/logger';
import { verifyCronSecret } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

interface DigestStats {
  tenantsSent: number;
  tenantsSkipped: number;
  tenantsErrored: number;
  [key: string]: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  logger.info('[CRON] workflow-digest: Starting daily digest sweep');

  // Auth guard — timing-safe CRON_SECRET verification
  if (!verifyCronSecret(request)) {
    logger.error('[CRON] workflow-digest: Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats: DigestStats = { tenantsSent: 0, tenantsSkipped: 0, tenantsErrored: 0 };

  // Find all tenants with at least one active PlaybookInstance
  let activeTenantIds: string[];
  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.playbookInstance.findMany({
        where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
        select: { tenantId: true },
        distinct: ['tenantId'],
      });
    }, TX_OPTIONS);
    activeTenantIds = rows.map((r) => r.tenantId);
  } catch (err) {
    logger.error('[CRON] workflow-digest: Failed to query active tenants', { error: err });
    return NextResponse.json({ error: 'Failed to query tenants' }, { status: 500 });
  }

  logger.info(`[CRON] workflow-digest: ${activeTenantIds.length} tenant(s) with active instances`);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const baseUrl = getAppBaseUrl();

  for (const tenantId of activeTenantIds) {
    try {
      // ── Dedup check: already sent today? ──────────────────────────────
      const alreadySent = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.playbookNotification.findFirst({
          where: {
            tenantId,
            notificationType: 'DAILY_DIGEST',
            createdAt: { gte: todayStart },
          },
          select: { id: true },
        });
      }, TX_OPTIONS);

      if (alreadySent) {
        logger.info(`[CRON] workflow-digest: Skipping tenant ${tenantId} — already sent today`);
        stats.tenantsSkipped++;
        continue;
      }

      // ── Collect stats for this tenant ─────────────────────────────────
      const [overdueCount, completedTodayCount, activeInstanceCount, recipients, tenant] =
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

          const overdueCount = await tx.stepInstance.count({
            where: {
              isOverdue: true,
              status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
              playbookInstance: { tenantId },
            },
          });

          const completedTodayCount = await tx.stepInstance.count({
            where: {
              status: 'COMPLETE',
              completedAt: { gte: todayStart },
              playbookInstance: { tenantId },
            },
          });

          const activeInstanceCount = await tx.playbookInstance.count({
            where: { tenantId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
          });

          const recipients = await tx.user.findMany({
            where: { tenantId, role: { in: ['OWNER', 'MANAGER'] }, isActive: true },
            select: { id: true, email: true, firstName: true },
          });

          const tenant = await tx.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true },
          });

          return [overdueCount, completedTodayCount, activeInstanceCount, recipients, tenant];
        }, TX_OPTIONS);

      if (recipients.length === 0) {
        logger.info(`[CRON] workflow-digest: No OWNER/MANAGER recipients for tenant ${tenantId}`);
        stats.tenantsSkipped++;
        continue;
      }

      const tenantName = tenant?.name ?? 'DriveCommand';
      const date = new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      });
      const dashboardUrl = `${baseUrl}/checklists`;

      // ── Build the email element once, send to each recipient ──────────
      const emailElement = React.createElement(WorkflowSafetyDigestEmail, {
        tenantName,
        date,
        overdueCount,
        completedTodayCount,
        activeInstanceCount,
        dashboardUrl,
      });

      for (const recipient of recipients) {
        try {
          await sendEmail({
            to: recipient.email,
            subject: `[${tenantName}] Daily Workflow Summary — ${date}`,
            react: emailElement,
          });
        } catch (emailErr) {
          logger.error(`[CRON] workflow-digest: Email failed for ${recipient.email}`, { error: emailErr });
        }
      }

      // ── Write dedup row (scoped to first active instance for FK) ──────
      const firstInstance = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.playbookInstance.findFirst({
          where: { tenantId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
          select: { id: true },
        });
      }, TX_OPTIONS);

      if (firstInstance) {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.playbookNotification.create({
            data: {
              tenantId,
              playbookInstanceId: firstInstance.id,
              notificationType: 'DAILY_DIGEST',
              channel: 'EMAIL',
              recipientUserId: recipients[0].id, // dedup row — recipient is first OWNER
              message: `Daily digest sent to ${recipients.length} recipient(s)`,
              sentAt: new Date(),
            },
          });
        }, TX_OPTIONS);
      }

      logger.info(`[CRON] workflow-digest: Sent to ${recipients.length} recipient(s) for tenant ${tenantId}`);
      stats.tenantsSent++;
    } catch (err) {
      logger.error(`[CRON] workflow-digest: Error processing tenant ${tenantId}`, { error: err });
      stats.tenantsErrored++;
      // Continue — do not let one tenant failure abort the whole sweep
    }
  }

  logger.info('[CRON] workflow-digest: Complete', stats);
  return NextResponse.json({ ok: true, ...stats });
}
