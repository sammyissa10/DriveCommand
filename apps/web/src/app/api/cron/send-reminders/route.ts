/**
 * Cron endpoint for sending daily maintenance and document expiry reminders.
 *
 * Schedule: Daily at 14:00 UTC (9 AM EST / 6 AM PST)
 * Authentication: CRON_SECRET bearer token
 *
 * Processing flow:
 * 1. Fetch all active tenants (bypass RLS - system operation)
 * 2. For each tenant:
 *    - Find upcoming maintenance (7 days or 500 miles)
 *    - Find expiring documents (14 days)
 *    - Find expiring driver documents
 *    - Dispatch each item through dispatchNotification (handles recipients, idempotency)
 * 3. Return summary of sent/skipped/failed notifications
 *
 * MIGRATED (Phase 41 Plan 05): Dispatches via dispatchNotification instead of
 * calling send* helpers directly. The dispatcher handles recipient resolution,
 * idempotency, and audit logging. The legacy per-owner loop and
 * recordNotification/markNotificationSent calls have been removed.
 */

import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { findUpcomingMaintenance } from '@/lib/notifications/check-upcoming-maintenance';
import { findExpiringDocuments } from '@/lib/notifications/check-expiring-documents';
import { findExpiringDriverDocuments } from '@/lib/notifications/check-expiring-driver-documents';
import { formatDocumentType } from '@/lib/email/send-driver-document-expiry-reminder';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logger } from '@/lib/logger';
import { CronFailures, cronStatus } from '@/lib/cron/failure-report';
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
   * quick-600 (B5) — ROUTE.
   * WHY: This cron job runs cross-tenant to send document expiry reminders for ALL
   *      active tenants. It has no user context to scope RLS policies to a single tenant.
   * SCOPE: Reads Tenant.id and Tenant.name for all active tenants, then queries
   *        compliance documents per tenant (out of this task's scope — DECORATIVE).
   * SAFETY: Gated by CRON_SECRET header check above — only callable by Vercel Cron.
   */
  // 2. Get all active tenants
  let tenants: Array<{ id: string; name: string }>;
  try {
    const adminDb = await getAdminDb('reminders cron tenant sweep');
    tenants = await adminDb.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

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
  const failures = new CronFailures();
  /**
   * quick-603 — the ONE non-purely-additive change on this route, made
   * deliberately. `processedTenants` used to be `tenants.length`, i.e. the
   * number of tenants FOUND, reported under a key that says PROCESSED. A tenant
   * that threw at the bottom of the loop was counted as processed. It now
   * counts completions. On a fully-successful run the two are identical, so
   * nothing observable changes on the success path; `tenantsFound` is added so
   * the original number is still available.
   */
  let processedTenants = 0;

  for (const tenant of tenants) {
    logger.info(`[CRON] send-reminders: Processing tenant ${tenant.name} (${tenant.id})`);

    try {
      // Fetch all reminder data in parallel
      const [upcomingMaintenance, expiringDocuments, expiringDriverDocuments] = await Promise.all([
        findUpcomingMaintenance(tenant.id),
        findExpiringDocuments(tenant.id),
        findExpiringDriverDocuments(tenant.id),
      ]);

      logger.info(`[CRON] send-reminders: Found ${upcomingMaintenance.length} upcoming maintenance item(s)`);
      logger.info(`[CRON] send-reminders: Found ${expiringDocuments.length} expiring document(s)`);
      logger.info(`[CRON] send-reminders: Found ${expiringDriverDocuments.length} expiring driver document(s)`);

      // Process maintenance reminders — dispatcher handles recipients and idempotency
      for (const item of upcomingMaintenance) {
        try {
          const result = await dispatchNotification('truck.maintenance_due', {
            tenantId: tenant.id,
            payload: {
              truckId: item.truckId,
              unitNumber: item.truckName,
              maintenanceType: item.serviceType,
              dueAt: item.nextDueDate?.toISOString() ?? '',
            },
            relatedEntity: { type: 'Truck', id: item.truckId },
          });
          maintenanceStats.sent += result.sent;
          maintenanceStats.skipped += result.skipped;
          maintenanceStats.failed += result.failed;
          if (result.failed > 0) {
            failures.record(
              `[CRON] send-reminders: ${result.failed} channel delivery(ies) failed`,
              `truck:${item.truckId}`,
              new Error(`${result.failed} notification channel delivery(ies) failed`),
              { tenantId: tenant.id, kind: 'maintenance', dispatched: result },
            );
          }
          logger.info(`[CRON] send-reminders: Dispatched maintenance reminder for ${item.truckName}: sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
        } catch (err) {
          failures.record(
            `[CRON] send-reminders: Failed to dispatch maintenance reminder for ${item.truckName}`,
            `truck:${item.truckId}`,
            err,
            { tenantId: tenant.id, kind: 'maintenance' },
          );
          maintenanceStats.failed++;
        }
      }

      // Process document expiry reminders
      for (const item of expiringDocuments) {
        try {
          const result = await dispatchNotification('truck.document_expiring', {
            tenantId: tenant.id,
            payload: {
              truckId: item.truckId,
              unitNumber: item.truckName,
              documentType: item.documentType,
              expiresAt: item.expiryDate.toISOString(),
            },
            relatedEntity: { type: 'Truck', id: item.truckId },
          });
          documentStats.sent += result.sent;
          documentStats.skipped += result.skipped;
          documentStats.failed += result.failed;
          if (result.failed > 0) {
            failures.record(
              `[CRON] send-reminders: ${result.failed} channel delivery(ies) failed`,
              `truck:${item.truckId}:${item.documentType}`,
              new Error(`${result.failed} notification channel delivery(ies) failed`),
              { tenantId: tenant.id, kind: 'document', dispatched: result },
            );
          }
          logger.info(`[CRON] send-reminders: Dispatched document reminder for ${item.truckName} ${item.documentType}: sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
        } catch (err) {
          failures.record(
            `[CRON] send-reminders: Failed to dispatch document reminder for ${item.truckName} ${item.documentType}`,
            `truck:${item.truckId}:${item.documentType}`,
            err,
            { tenantId: tenant.id, kind: 'document' },
          );
          documentStats.failed++;
        }
      }

      // Process driver document expiry reminders
      for (const item of expiringDriverDocuments) {
        try {
          const result = await dispatchNotification('driver.license_expiring', {
            tenantId: tenant.id,
            payload: {
              driverId: item.driverId,
              driverName: item.driverName,
              licenseType: formatDocumentType(item.documentType),
              expiresAt: item.expiryDate.toISOString(),
              daysUntilExpiry: String(item.daysUntilExpiry),
            },
            relatedEntity: { type: 'Document', id: item.documentId },
          });
          driverDocumentStats.sent += result.sent;
          driverDocumentStats.skipped += result.skipped;
          driverDocumentStats.failed += result.failed;
          if (result.failed > 0) {
            failures.record(
              `[CRON] send-reminders: ${result.failed} channel delivery(ies) failed`,
              `driver:${item.driverId}`,
              new Error(`${result.failed} notification channel delivery(ies) failed`),
              { tenantId: tenant.id, kind: 'driverDocument', dispatched: result },
            );
          }
          logger.info(`[CRON] send-reminders: Dispatched driver doc reminder for ${item.driverName}: sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
        } catch (err) {
          failures.record(
            `[CRON] send-reminders: Failed to dispatch driver doc reminder for ${item.driverName}`,
            `driver:${item.driverId}`,
            err,
            { tenantId: tenant.id, kind: 'driverDocument' },
          );
          driverDocumentStats.failed++;
        }
      }

      processedTenants++;
    } catch (error) {
      /**
       * quick-603 — this catch used to `continue` with NO counter of any kind.
       * A whole tenant's maintenance, document and driver-document reminders
       * could be lost and the response still read
       * `processedTenants: tenants.length` — the count of tenants FOUND, which
       * it silently presented as the count of tenants PROCESSED. The tenant is
       * now named in `failures` and `processedTenants` counts only the tenants
       * that actually completed.
       */
      failures.record(
        `[CRON] send-reminders: Failed to process tenant ${tenant.name}`,
        `tenant:${tenant.id}`,
        error,
        { tenantName: tenant.name },
      );
      // Continue with next tenant — the resilience half is unchanged.
      continue;
    }
  }

  // 4. Return summary — every original key kept, `failureCount`/`failures` added.
  const report = failures.report();
  const summary = {
    success: failures.ok,
    processedTenants,
    tenantsFound: tenants.length,
    maintenance: maintenanceStats,
    documents: documentStats,
    driverDocuments: driverDocumentStats,
    ...report,
  };

  logger.info('[CRON] send-reminders: Completed', summary);
  return Response.json(summary, { status: cronStatus(failures) });
}
