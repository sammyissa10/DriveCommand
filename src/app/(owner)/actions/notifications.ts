'use server';

/**
 * Server actions for notification and dashboard data.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { unstable_cache } from 'next/cache';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { getSession } from '@/lib/auth/session';
import { prisma as globalPrisma } from '@/lib/db/prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { calculateNextDue } from '@/lib/utils/maintenance-utils';
import { revalidatePath } from 'next/cache';

// ─── Auth helper ──────────────────────────────────────────────
// Validates role and extracts tenantId in a single getSession() call,
// reducing session decrypts from 2 (requireRole + requireTenantId) to 1.

async function getAuthContext(): Promise<{ tenantId: string }> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized: Authentication required');
  const role = session.role as UserRole;
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    throw new Error('Unauthorized: Required roles: OWNER, MANAGER');
  }
  if (!session.tenantId) {
    throw new Error('Tenant context is required');
  }
  return { tenantId: session.tenantId };
}

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
  /** ISO string — serialized for unstable_cache compatibility */
  nextDueDate: string | null;
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

// ─── Cached data fetchers ─────────────────────────────────────

const _fetchUpcomingMaintenance = unstable_cache(
  async (tenantId: string): Promise<UpcomingMaintenanceItem[]> => {
    const db = globalPrisma.$extends(withTenantRLS(tenantId));

    // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
    const schedules = await db.scheduledService.findMany({
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

    const upcomingItems: UpcomingMaintenanceItem[] = [];

    for (const schedule of schedules as any[]) {
      const dueStatus = calculateNextDue(schedule, schedule.truck.odometer);

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
          nextDueDate: dueStatus.nextDueDate ? (dueStatus.nextDueDate as Date).toISOString() : null,
          nextDueMileage: dueStatus.nextDueMileage,
          currentMileage: schedule.truck.odometer,
        });
      }
    }

    upcomingItems.sort((a, b) => {
      if (a.isDue && !b.isDue) return -1;
      if (!a.isDue && b.isDue) return 1;

      const aDaysRemaining = a.daysUntilDue ?? Infinity;
      const bDaysRemaining = b.daysUntilDue ?? Infinity;
      const aMilesRemaining = a.milesUntilDue ?? Infinity;
      const bMilesRemaining = b.milesUntilDue ?? Infinity;

      const aNearest = Math.min(aDaysRemaining, aMilesRemaining);
      const bNearest = Math.min(bDaysRemaining, bMilesRemaining);

      return aNearest - bNearest;
    });

    return upcomingItems;
  },
  ['dashboard-upcoming-maintenance'],
  { revalidate: 60 }
);

const _fetchExpiringDocuments = unstable_cache(
  async (tenantId: string): Promise<ExpiringDocumentItem[]> => {
    const db = globalPrisma.$extends(withTenantRLS(tenantId));

    // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
    const trucks = await db.truck.findMany({
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

      if (metadata.registrationExpiry) {
        const expiryDate = new Date(metadata.registrationExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay);

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

      if (metadata.insuranceExpiry) {
        const expiryDate = new Date(metadata.insuranceExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay);

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

    expiringItems.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    return expiringItems;
  },
  ['dashboard-expiring-documents'],
  { revalidate: 60 }
);

// ─── Public Server Actions ────────────────────────────────────

/**
 * Get upcoming maintenance for dashboard.
 * Results cached per tenant for 60 seconds via unstable_cache.
 * Requires OWNER or MANAGER role.
 * Auth enforced via getAuthContext() — single session decrypt (down from 2).
 */
export async function getUpcomingMaintenance(): Promise<UpcomingMaintenanceItem[]> {
  const { tenantId } = await getAuthContext();
  return _fetchUpcomingMaintenance(tenantId);
}

/**
 * Get expiring documents for dashboard.
 * Results cached per tenant for 60 seconds via unstable_cache.
 * Requires OWNER or MANAGER role.
 * Auth enforced via getAuthContext() — single session decrypt (down from 2).
 */
export async function getExpiringDocuments(): Promise<ExpiringDocumentItem[]> {
  const { tenantId } = await getAuthContext();
  return _fetchExpiringDocuments(tenantId);
}

// ─── Customer Notification Actions ─────────────────────────

/**
 * Send an automated load update notification to a customer.
 * Creates an interaction record in the CRM.
 */
export async function sendLoadUpdateNotification(
  customerId: string,
  routeId: string,
  message: string,
) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return { error: 'Customer not found.' };

    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: { truck: true, driver: true },
    });
    if (!route) return { error: 'Route not found.' };

    await prisma.customerInteraction.create({
      data: {
        tenantId,
        customerId,
        type: 'LOAD_UPDATE',
        subject: `Load Update: ${route.origin} → ${route.destination}`,
        description: message,
        isAutomated: true,
      },
    });

    await prisma.customer.update({
      where: { id: customerId },
      data: { lastLoadDate: new Date() },
    });

    revalidatePath(`/crm/${customerId}`);
    return { success: true, message: 'Load update notification sent.' };
  } catch {
    return { error: 'Failed to send notification.' };
  }
}

/**
 * Send an ETA notification to a customer.
 */
export async function sendETANotification(
  customerId: string,
  routeId: string,
  estimatedArrival: string,
) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return { error: 'Customer not found.' };

    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: { truck: true, driver: true },
    });
    if (!route) return { error: 'Route not found.' };

    await prisma.customerInteraction.create({
      data: {
        tenantId,
        customerId,
        type: 'ETA_NOTIFICATION',
        subject: `ETA Update: Arriving ${estimatedArrival}`,
        description: `Route: ${route.origin} → ${route.destination}\nEstimated arrival: ${estimatedArrival}\nTruck: ${route.truck.make} ${route.truck.model} (${route.truck.licensePlate})`,
        isAutomated: true,
      },
    });

    revalidatePath(`/crm/${customerId}`);
    return { success: true, message: 'ETA notification sent.' };
  } catch {
    return { error: 'Failed to send ETA notification.' };
  }
}
