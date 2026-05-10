/**
 * Cron endpoint for sending daily maintenance and document expiry reminders.
 *
 * Schedule: Daily at 14:00 UTC (9 AM EST / 6 AM PST)
 * Authentication: CRON_SECRET bearer token
 *
 * Processing flow:
 * 1. Fetch all active tenants (bypass RLS - system operation)
 * 2. For each tenant:
 *    - Find OWNER-role users (notification recipients)
 *    - Find upcoming maintenance (7 days or 500 miles)
 *    - Find expiring documents (14 days)
 *    - Send emails with deduplication via idempotency keys
 *    - Log results to NotificationLog
 * 3. Return summary of sent/skipped/failed notifications
 */

import { NextRequest } from 'next/server';
import { getAppBaseUrl } from '@/lib/app-url';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { findUpcomingMaintenance } from '@/lib/notifications/check-upcoming-maintenance';
import { findExpiringDocuments } from '@/lib/notifications/check-expiring-documents';
import { findExpiringDriverDocuments } from '@/lib/notifications/check-expiring-driver-documents';
import { sendMaintenanceReminder } from '@/lib/email/send-maintenance-reminder';
import { sendDocumentExpiryReminder } from '@/lib/email/send-document-expiry-reminder';
import { sendDriverDocumentExpiryReminder, formatDocumentType } from '@/lib/email/send-driver-document-expiry-reminder';
import {
  generateIdempotencyKey,
  recordNotification,
  markNotificationSent,
} from '@/lib/notifications/notification-deduplication';
import { logger } from '@/lib/logger';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic'; // CRITICAL: Prevent Next.js caching

interface NotificationStats {
  sent: number;
  skipped: number;
  failed: number;
}

export async function GET(request: NextRequest) {
  logger.info('[CRON] send-reminders: Starting daily reminder processing');

  // 1. Verify CRON_SECRET (timing-safe comparison)
  if (!verifyCronSecret(request)) {
    logger.error('[CRON] send-reminders: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  /**
   * @bypass_rls reason: system-operation
   * WHY: This cron job runs cross-tenant to send document expiry reminders for ALL
   *      active tenants. It has no user context to scope RLS policies to a single tenant.
   * SCOPE: Reads Tenant.id and Tenant.name for all active tenants, then queries
   *        compliance documents per tenant in separate transactions.
   * SAFETY: Gated by CRON_SECRET header check above — only callable by Vercel Cron.
   */
  // 2. Get all active tenants (bypass RLS - system operation)
  let tenants: Array<{ id: string; name: string }>;
  try {
    tenants = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });
    }, TX_OPTIONS);

    logger.info(`[CRON] send-reminders: Found ${tenants.length} active tenant(s)`);
  } catch (error) {
    logger.error('[CRON] send-reminders: Failed to fetch tenants:', error);
    return Response.json(
      { success: false, error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }

  // 3. Process each tenant
  const maintenanceStats: NotificationStats = { sent: 0, skipped: 0, failed: 0 };
  const documentStats: NotificationStats = { sent: 0, skipped: 0, failed: 0 };
  const driverDocumentStats: NotificationStats = { sent: 0, skipped: 0, failed: 0 };

  for (const tenant of tenants) {
    logger.info(`[CRON] send-reminders: Processing tenant ${tenant.name} (${tenant.id})`);

    try {
      // Get tenant-scoped Prisma client
      const tenantPrisma: any = prisma.$extends(withTenantRLS(tenant.id));

      // Find OWNER-role users (notification recipients)
      const owners = await tenantPrisma.user.findMany({
        where: { role: 'OWNER', isActive: true },
        select: { email: true },
      });

      if (owners.length === 0) {
        logger.info(`[CRON] send-reminders: No active owners found for tenant ${tenant.name}, skipping`);
        continue;
      }

      logger.info(`[CRON] send-reminders: Found ${owners.length} owner(s) for tenant ${tenant.name}`);

      const today = new Date();

      // Fetch all reminder data in parallel
      const [upcomingMaintenance, expiringDocuments, expiringDriverDocuments] = await Promise.all([
        findUpcomingMaintenance(tenant.id),
        findExpiringDocuments(tenant.id),
        findExpiringDriverDocuments(tenant.id),
      ]);

      logger.info(`[CRON] send-reminders: Found ${upcomingMaintenance.length} upcoming maintenance item(s)`);
      logger.info(`[CRON] send-reminders: Found ${expiringDocuments.length} expiring document(s)`);
      logger.info(`[CRON] send-reminders: Found ${expiringDriverDocuments.length} expiring driver document(s)`);

      // Build all idempotency keys upfront and batch-check them in one query
      const maintenanceKeys = upcomingMaintenance.map((item) =>
        generateIdempotencyKey('maintenance-reminder', item.scheduledServiceId, today)
      );
      const documentKeys = expiringDocuments.map((item) =>
        generateIdempotencyKey('document-expiry', `${item.truckId}-${item.documentType}`, today)
      );
      const driverDocKeys = expiringDriverDocuments.map((item) =>
        generateIdempotencyKey('driver-document-expiry', item.documentId, today)
      );

      const allKeys = [...maintenanceKeys, ...documentKeys, ...driverDocKeys];

      // Single batch query for all already-sent keys
      const alreadySentLogs = allKeys.length > 0
        ? await prisma.notificationLog.findMany({
            where: { idempotencyKey: { in: allKeys }, status: 'SENT' },
            select: { idempotencyKey: true },
          })
        : [];
      const alreadySentSet = new Set(alreadySentLogs.map((l) => l.idempotencyKey));

      // Process maintenance reminders
      for (let i = 0; i < upcomingMaintenance.length; i++) {
        const item = upcomingMaintenance[i];
        const idempotencyKey = maintenanceKeys[i];

        if (alreadySentSet.has(idempotencyKey)) {
          logger.info(`[CRON] send-reminders: Skipping duplicate maintenance reminder for ${item.truckName}`);
          maintenanceStats.skipped++;
          continue;
        }

        for (const owner of owners) {
          try {
            const logId = await recordNotification(prisma, {
              tenantId: tenant.id,
              idempotencyKey,
              notificationType: 'maintenance-reminder',
              entityType: 'ScheduledService',
              entityId: item.scheduledServiceId,
              recipientEmail: owner.email,
              emailSubject: `Maintenance Due: ${item.serviceType} - ${item.truckName}`,
            });

            const dashboardUrl = `${getAppBaseUrl()}/trucks/${item.truckId}/maintenance`;
            const result = await Promise.race([
              sendMaintenanceReminder(owner.email, {
                truckName: item.truckName,
                serviceType: item.serviceType,
                dueDate: item.nextDueDate?.toLocaleDateString() || 'N/A',
                dueMileage: item.nextDueMileage,
                currentMileage: item.currentMileage,
                milesRemaining: item.nextDueMileage
                  ? item.nextDueMileage - item.currentMileage
                  : null,
                dashboardUrl,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Email send timeout')), 10_000)
              ),
            ]);

            await markNotificationSent(prisma, logId, result.id);
            logger.info(`[CRON] send-reminders: Sent maintenance reminder to ${owner.email} for ${item.truckName}`);
            maintenanceStats.sent++;
          } catch (error) {
            logger.error(`[CRON] send-reminders: Failed to send maintenance reminder to ${owner.email}:`, error);
            maintenanceStats.failed++;
          }
        }
      }

      // Process document expiry reminders
      for (let i = 0; i < expiringDocuments.length; i++) {
        const item = expiringDocuments[i];
        const idempotencyKey = documentKeys[i];

        if (alreadySentSet.has(idempotencyKey)) {
          logger.info(`[CRON] send-reminders: Skipping duplicate document reminder for ${item.truckName} ${item.documentType}`);
          documentStats.skipped++;
          continue;
        }

        for (const owner of owners) {
          try {
            const logId = await recordNotification(prisma, {
              tenantId: tenant.id,
              idempotencyKey,
              notificationType: 'document-expiry',
              entityType: 'Truck',
              entityId: item.truckId,
              recipientEmail: owner.email,
              emailSubject: `Document Expiring: ${item.documentType} - ${item.truckName}`,
            });

            const dashboardUrl = `${getAppBaseUrl()}/trucks/${item.truckId}`;
            const result = await Promise.race([
              sendDocumentExpiryReminder(owner.email, {
                truckName: item.truckName,
                documentType: item.documentType,
                expiryDate: item.expiryDate.toLocaleDateString(),
                daysUntilExpiry: item.daysUntilExpiry,
                dashboardUrl,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Email send timeout')), 10_000)
              ),
            ]);

            await markNotificationSent(prisma, logId, result.id);
            logger.info(`[CRON] send-reminders: Sent document reminder to ${owner.email} for ${item.truckName}`);
            documentStats.sent++;
          } catch (error) {
            logger.error(`[CRON] send-reminders: Failed to send document reminder to ${owner.email}:`, error);
            documentStats.failed++;
          }
        }
      }

      // Process driver document expiry reminders
      for (let i = 0; i < expiringDriverDocuments.length; i++) {
        const item = expiringDriverDocuments[i];
        const idempotencyKey = driverDocKeys[i];

        if (alreadySentSet.has(idempotencyKey)) {
          logger.info(`[CRON] send-reminders: Skipping duplicate driver doc reminder for ${item.driverName} ${item.documentType}`);
          driverDocumentStats.skipped++;
          continue;
        }

        for (const owner of owners) {
          try {
            const logId = await recordNotification(prisma, {
              tenantId: tenant.id,
              idempotencyKey,
              notificationType: 'driver-document-expiry',
              entityType: 'Document',
              entityId: item.documentId,
              recipientEmail: owner.email,
              emailSubject: `Document Expiring: ${formatDocumentType(item.documentType)} - ${item.driverName}`,
            });

            const dashboardUrl = `${getAppBaseUrl()}/drivers/${item.driverId}`;
            const result = await Promise.race([
              sendDriverDocumentExpiryReminder(owner.email, {
                driverName: item.driverName,
                documentType: formatDocumentType(item.documentType),
                expiryDate: item.expiryDate.toLocaleDateString(),
                daysUntilExpiry: item.daysUntilExpiry,
                dashboardUrl,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Email send timeout')), 10_000)
              ),
            ]);

            await markNotificationSent(prisma, logId, result.id);
            logger.info(`[CRON] send-reminders: Sent driver doc reminder to ${owner.email} for ${item.driverName}`);
            driverDocumentStats.sent++;
          } catch (error) {
            logger.error(`[CRON] send-reminders: Failed to send driver doc reminder to ${owner.email}:`, error);
            driverDocumentStats.failed++;
          }
        }
      }
    } catch (error) {
      logger.error(`[CRON] send-reminders: Failed to process tenant ${tenant.name}:`, error);
      // Continue with next tenant
      continue;
    }
  }

  // 4. Return summary
  const summary = {
    success: true,
    processedTenants: tenants.length,
    maintenance: maintenanceStats,
    documents: documentStats,
    driverDocuments: driverDocumentStats,
  };

  logger.info('[CRON] send-reminders: Completed', summary);
  return Response.json(summary);
}
