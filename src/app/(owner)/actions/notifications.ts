'use server';

/**
 * Server actions for notification and dashboard data.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { calculateNextDue } from '@/lib/utils/maintenance-utils';

/**
 * Upcoming maintenance item for dashboard widget.
 */
export interface UpcomingMaintenanceItem {
  truckId: string;
  truckName: string;
  serviceType: string;
  daysUntilDue: number | null;
  milesUntilDue: number | null;
  isDue: boolean;
  nextDueDate: Date | null;
  nextDueMileage: number | null;
  currentMileage: number;
}

/**
 * Expiring document item for dashboard widget.
 */
export interface ExpiringDocumentItem {
  truckId: string;
  truckName: string;
  documentType: 'Registration' | 'Insurance';
  expiryDate: string;
  daysUntilExpiry: number;
  isExpired: boolean;
}

/**
 * Get upcoming maintenance for dashboard.
 * Returns scheduled services due within 30 days or 1000 miles (or already overdue).
 * Requires OWNER or MANAGER role.
 */
export async function getUpcomingMaintenance(): Promise<UpcomingMaintenanceItem[]> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  // Fetch all active scheduled services with associated truck data
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  const schedules = await prisma.scheduledService.findMany({
    where: { isCompleted: false },
    include: {
      truck: {
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          odometer: true,
        },
      },
    },
  });

  // Calculate due status for each schedule
  const upcomingItems: UpcomingMaintenanceItem[] = [];

  for (const schedule of schedules as any[]) {
    const dueStatus = calculateNextDue(schedule, schedule.truck.odometer);

    // Filter: include if overdue OR within 30 days OR within 1000 miles
    const withinTimeWindow =
      dueStatus.daysUntilDue !== null && dueStatus.daysUntilDue <= 30;
    const withinMileageWindow =
      dueStatus.milesUntilDue !== null && dueStatus.milesUntilDue <= 1000;

    if (dueStatus.isDue || withinTimeWindow || withinMileageWindow) {
      upcomingItems.push({
        truckId: schedule.truck.id,
        truckName: `${schedule.truck.year} ${schedule.truck.make} ${schedule.truck.model}`,
        serviceType: schedule.serviceType,
        daysUntilDue: dueStatus.daysUntilDue,
        milesUntilDue: dueStatus.milesUntilDue,
        isDue: dueStatus.isDue,
        nextDueDate: dueStatus.nextDueDate,
        nextDueMileage: dueStatus.nextDueMileage,
        currentMileage: schedule.truck.odometer,
      });
    }
  }

  // Sort: overdue first, then by nearest due date/mileage
  upcomingItems.sort((a, b) => {
    // Overdue items first
    if (a.isDue && !b.isDue) return -1;
    if (!a.isDue && b.isDue) return 1;

    // Both overdue or both upcoming: sort by nearest trigger
    const aDaysRemaining = a.daysUntilDue ?? Infinity;
    const bDaysRemaining = b.daysUntilDue ?? Infinity;
    const aMilesRemaining = a.milesUntilDue ?? Infinity;
    const bMilesRemaining = b.milesUntilDue ?? Infinity;

    // Use whichever comes first (days or miles)
    const aNearest = Math.min(aDaysRemaining, aMilesRemaining);
    const bNearest = Math.min(bDaysRemaining, bMilesRemaining);

    return aNearest - bNearest;
  });

  return upcomingItems;
}

/**
 * Get expiring documents for dashboard.
 * Returns registration and insurance expiring within 60 days (or already expired).
 * Requires OWNER or MANAGER role.
 */
export async function getExpiringDocuments(): Promise<ExpiringDocumentItem[]> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  // Fetch all trucks with document metadata
  const trucks = await prisma.truck.findMany({
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      documentMetadata: true,
    },
  });

  const expiringItems: ExpiringDocumentItem[] = [];
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  for (const truck of trucks as any[]) {
    const truckName = `${truck.year} ${truck.make} ${truck.model}`;
    const metadata = truck.documentMetadata as {
      registrationNumber?: string;
      registrationExpiry?: string;
      insuranceNumber?: string;
      insuranceExpiry?: string;
    } | null;

    if (!metadata) continue;

    // Check registration expiry
    if (metadata.registrationExpiry) {
      const expiryDate = new Date(metadata.registrationExpiry);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay);

      // Filter: expired OR expiring within 60 days
      if (daysUntilExpiry <= 60) {
        expiringItems.push({
          truckId: truck.id,
          truckName,
          documentType: 'Registration',
          expiryDate: metadata.registrationExpiry,
          daysUntilExpiry,
          isExpired: daysUntilExpiry < 0,
        });
      }
    }

    // Check insurance expiry
    if (metadata.insuranceExpiry) {
      const expiryDate = new Date(metadata.insuranceExpiry);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay);

      // Filter: expired OR expiring within 60 days
      if (daysUntilExpiry <= 60) {
        expiringItems.push({
          truckId: truck.id,
          truckName,
          documentType: 'Insurance',
          expiryDate: metadata.insuranceExpiry,
          daysUntilExpiry,
          isExpired: daysUntilExpiry < 0,
        });
      }
    }
  }

  // Sort: expired first, then by nearest expiry
  expiringItems.sort((a, b) => {
    // Expired items first
    if (a.isExpired && !b.isExpired) return -1;
    if (!a.isExpired && b.isExpired) return 1;

    // Both expired or both upcoming: sort by days until expiry
    return a.daysUntilExpiry - b.daysUntilExpiry;
  });

  return expiringItems;
}
