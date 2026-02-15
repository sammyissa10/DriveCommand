/**
 * Query upcoming maintenance for notification purposes.
 * Finds scheduled services due within 7 days or 500 miles.
 */

import { prisma } from '../db/prisma';
import { withTenantRLS } from '../db/extensions/tenant-rls';
import { calculateNextDue } from '../utils/maintenance-utils';

export interface UpcomingMaintenanceItem {
  scheduledServiceId: string;
  truckId: string;
  truckName: string;
  serviceType: string;
  nextDueDate: Date | null;
  nextDueMileage: number | null;
  currentMileage: number;
}

/**
 * Helper to create a tenant-scoped Prisma client for cron context.
 * Unlike getTenantPrisma(), this doesn't rely on headers() which is unavailable in cron.
 */
function getTenantPrismaForCron(tenantId: string) {
  // @ts-ignore - Prisma 7 type issue with extended client
  return prisma.$extends(withTenantRLS(tenantId));
}

/**
 * Find scheduled services that are due within 7 days or 500 miles.
 * Used by cron job to determine which maintenance reminders to send.
 */
export async function findUpcomingMaintenance(
  tenantId: string
): Promise<UpcomingMaintenanceItem[]> {
  const tenantPrisma = getTenantPrismaForCron(tenantId);

  // Query all incomplete scheduled services with truck data
  // @ts-ignore - Extended client type inference
  const scheduledServices = await tenantPrisma.scheduledService.findMany({
    where: {
      isCompleted: false,
    },
    include: {
      truck: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          odometer: true,
        },
      },
    },
  });

  // Calculate due status for each service and filter for upcoming items
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const upcomingItems: UpcomingMaintenanceItem[] = [];

  for (const service of scheduledServices) {
    const dueStatus = calculateNextDue(
      {
        intervalDays: service.intervalDays,
        intervalMiles: service.intervalMiles,
        baselineDate: service.baselineDate,
        baselineOdometer: service.baselineOdometer,
      },
      service.truck.odometer
    );

    // Include if:
    // 1. Due by date within 7 days (includes overdue)
    // 2. Due by mileage within 500 miles (includes overdue)
    const isDueSoon =
      (dueStatus.nextDueDate && dueStatus.nextDueDate <= sevenDaysFromNow) ||
      (dueStatus.milesUntilDue !== null && dueStatus.milesUntilDue <= 500);

    if (isDueSoon) {
      upcomingItems.push({
        scheduledServiceId: service.id,
        truckId: service.truck.id,
        truckName: `${service.truck.year} ${service.truck.make} ${service.truck.model}`,
        serviceType: service.serviceType,
        nextDueDate: dueStatus.nextDueDate,
        nextDueMileage: dueStatus.nextDueMileage,
        currentMileage: service.truck.odometer,
      });
    }
  }

  return upcomingItems;
}
