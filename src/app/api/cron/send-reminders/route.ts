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
import { prisma } from '@/lib/db/prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { findUpcomingMaintenance } from '@/lib/notifications/check-upcoming-maintenance';
import { findExpiringDocuments } from '@/lib/notifications/check-expiring-documents';
import { sendMaintenanceReminder } from '@/lib/email/send-maintenance-reminder';
import { sendDocumentExpiryReminder } from '@/lib/email/send-document-expiry-reminder';
import {
  generateIdempotencyKey,
  wasNotificationAlreadySent,
  recordNotification,
  markNotificationSent,
  markNotificationFailed,
} from '@/lib/notifications/notification-deduplication';

export const dynamic = 'force-dynamic'; // CRITICAL: Prevent Next.js caching

interface NotificationStats {
  sent: number;
  skipped: number;
  failed: number;
}

export async function GET(request: NextRequest) {
  console.log('[CRON] send-reminders: Starting daily reminder processing');

  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    console.error('[CRON] send-reminders: Unauthorized request');
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Get all active tenants (bypass RLS - system operation)
  let tenants: Array<{ id: string; name: string }>;
  try {
    tenants = await prisma.$transaction(async (tx) => {
      // @ts-ignore - Prisma 7 type issue
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      // @ts-ignore - Prisma 7 type issue
      return tx.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });
    });

    console.log(`[CRON] send-reminders: Found ${tenants.length} active tenant(s)`);
  } catch (error) {
    console.error('[CRON] send-reminders: Failed to fetch tenants:', error);
    return Response.json(
      { success: false, error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }

  // 3. Process each tenant
  const maintenanceStats: NotificationStats = { sent: 0, skipped: 0, failed: 0 };
  const documentStats: NotificationStats = { sent: 0, skipped: 0, failed: 0 };

  for (const tenant of tenants) {
    console.log(`[CRON] send-reminders: Processing tenant ${tenant.name} (${tenant.id})`);

    try {
      // Get tenant-scoped Prisma client
      // @ts-ignore - Prisma 7 type issue
      const tenantPrisma = prisma.$extends(withTenantRLS(tenant.id));

      // Find OWNER-role users (notification recipients)
      // @ts-ignore - Extended client type inference
      const owners = await tenantPrisma.user.findMany({
        where: { role: 'OWNER', isActive: true },
        select: { email: true },
      });

      if (owners.length === 0) {
        console.log(`[CRON] send-reminders: No active owners found for tenant ${tenant.name}, skipping`);
        continue;
      }

      console.log(`[CRON] send-reminders: Found ${owners.length} owner(s) for tenant ${tenant.name}`);

      // Process maintenance reminders
      const upcomingMaintenance = await findUpcomingMaintenance(tenant.id);
      console.log(`[CRON] send-reminders: Found ${upcomingMaintenance.length} upcoming maintenance item(s)`);

      for (const item of upcomingMaintenance) {
        const today = new Date();
        const idempotencyKey = generateIdempotencyKey(
          'maintenance-reminder',
          item.scheduledServiceId,
          today
        );

        // Check if already sent today
        const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
        if (alreadySent) {
          console.log(`[CRON] send-reminders: Skipping duplicate maintenance reminder for ${item.truckName}`);
          maintenanceStats.skipped++;
          continue;
        }

        // Send to all owners
        for (const owner of owners) {
          try {
            // Record notification as PENDING
            const logId = await recordNotification(prisma, {
              tenantId: tenant.id,
              idempotencyKey,
              notificationType: 'maintenance-reminder',
              entityType: 'ScheduledService',
              entityId: item.scheduledServiceId,
              recipientEmail: owner.email,
              emailSubject: `Maintenance Due: ${item.serviceType} - ${item.truckName}`,
            });

            // Send email
            const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/trucks/${item.truckId}/maintenance`;
            const result = await sendMaintenanceReminder(owner.email, {
              truckName: item.truckName,
              serviceType: item.serviceType,
              dueDate: item.nextDueDate?.toLocaleDateString() || 'N/A',
              dueMileage: item.nextDueMileage,
              currentMileage: item.currentMileage,
              milesRemaining: item.nextDueMileage
                ? item.nextDueMileage - item.currentMileage
                : null,
              dashboardUrl,
            });

            // Mark as SENT
            await markNotificationSent(prisma, logId, result.id);
            console.log(`[CRON] send-reminders: Sent maintenance reminder to ${owner.email} for ${item.truckName}`);
            maintenanceStats.sent++;
          } catch (error) {
            console.error(`[CRON] send-reminders: Failed to send maintenance reminder to ${owner.email}:`, error);
            // Mark as FAILED (if logId was created)
            maintenanceStats.failed++;
          }
        }
      }

      // Process document expiry reminders
      const expiringDocuments = await findExpiringDocuments(tenant.id);
      console.log(`[CRON] send-reminders: Found ${expiringDocuments.length} expiring document(s)`);

      for (const item of expiringDocuments) {
        const today = new Date();
        const idempotencyKey = generateIdempotencyKey(
          'document-expiry',
          `${item.truckId}-${item.documentType}`,
          today
        );

        // Check if already sent today
        const alreadySent = await wasNotificationAlreadySent(prisma, idempotencyKey);
        if (alreadySent) {
          console.log(`[CRON] send-reminders: Skipping duplicate document reminder for ${item.truckName} ${item.documentType}`);
          documentStats.skipped++;
          continue;
        }

        // Send to all owners
        for (const owner of owners) {
          try {
            // Record notification as PENDING
            const logId = await recordNotification(prisma, {
              tenantId: tenant.id,
              idempotencyKey,
              notificationType: 'document-expiry',
              entityType: 'Truck',
              entityId: item.truckId,
              recipientEmail: owner.email,
              emailSubject: `Document Expiring: ${item.documentType} - ${item.truckName}`,
            });

            // Send email
            const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/trucks/${item.truckId}`;
            const result = await sendDocumentExpiryReminder(owner.email, {
              truckName: item.truckName,
              documentType: item.documentType,
              expiryDate: item.expiryDate.toLocaleDateString(),
              daysUntilExpiry: item.daysUntilExpiry,
              dashboardUrl,
            });

            // Mark as SENT
            await markNotificationSent(prisma, logId, result.id);
            console.log(`[CRON] send-reminders: Sent document reminder to ${owner.email} for ${item.truckName}`);
            documentStats.sent++;
          } catch (error) {
            console.error(`[CRON] send-reminders: Failed to send document reminder to ${owner.email}:`, error);
            documentStats.failed++;
          }
        }
      }
    } catch (error) {
      console.error(`[CRON] send-reminders: Failed to process tenant ${tenant.name}:`, error);
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
  };

  console.log('[CRON] send-reminders: Completed', summary);
  return Response.json(summary);
}
