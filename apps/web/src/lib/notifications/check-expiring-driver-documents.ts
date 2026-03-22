/**
 * Query expiring driver documents for notification purposes.
 * Finds driver documents (licenses, applications) expiring at 30/60/90 day milestones or already expired.
 */

import { prisma } from '../db/prisma';
import { withTenantRLS } from '../db/extensions/tenant-rls';

export interface ExpiringDriverDocumentItem {
  driverId: string;
  driverName: string; // "firstName lastName"
  documentType: string; // "DRIVER_LICENSE" | "DRIVER_APPLICATION" | "GENERAL"
  documentId: string;
  expiryDate: Date;
  daysUntilExpiry: number;
}

/**
 * Helper to create a tenant-scoped Prisma client for cron context.
 */
function getTenantPrismaForCron(tenantId: string) {
  // @ts-ignore - Prisma 7 type issue with extended client
  return prisma.$extends(withTenantRLS(tenantId));
}

/**
 * Find driver documents expiring at specific milestones (90, 60, 30, 0 days) or already expired.
 * Milestone filter ensures notifications only at key intervals, not every day.
 */
export async function findExpiringDriverDocuments(
  tenantId: string
): Promise<ExpiringDriverDocumentItem[]> {
  const tenantPrisma = getTenantPrismaForCron(tenantId);

  const now = new Date();
  const ninetyDaysFromNow = new Date(now);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  // Query all driver documents expiring within 90 days or already expired
  // @ts-ignore - Extended client type inference
  const documents = await tenantPrisma.document.findMany({
    where: {
      driverId: { not: null },
      expiryDate: { not: null, lte: ninetyDaysFromNow },
    },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const expiringItems: ExpiringDriverDocumentItem[] = [];
  const milestones = [90, 60, 30, 0]; // Notification milestones in days

  for (const doc of documents) {
    if (!doc.driver || !doc.expiryDate) continue;

    const daysUntilExpiry = Math.ceil(
      (doc.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Include if:
    // 1. Already expired (negative days)
    // 2. At or near a milestone (within 1 day tolerance for date math edge cases)
    const isExpired = daysUntilExpiry < 0;
    const isNearMilestone = milestones.some(
      (milestone) => Math.abs(daysUntilExpiry - milestone) < 1
    );

    if (isExpired || isNearMilestone) {
      expiringItems.push({
        driverId: doc.driver.id,
        driverName: `${doc.driver.firstName} ${doc.driver.lastName}`,
        documentType: doc.documentType || 'GENERAL',
        documentId: doc.id,
        expiryDate: doc.expiryDate,
        daysUntilExpiry,
      });
    }
  }

  return expiringItems;
}
