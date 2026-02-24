'use server';

import { unstable_cache } from 'next/cache';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { getSession } from '@/lib/auth/session';
import { prisma as globalPrisma } from '@/lib/db/prisma';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import { Prisma } from '@/generated/prisma';

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

// ─── Notification Alerts ─────────────────────────────────────

export interface NotificationAlert {
  id: string;
  type: 'document_expiry' | 'overdue_invoice' | 'safety_event';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  href: string;
  /** ISO string — serialized for unstable_cache compatibility */
  timestamp: string;
}

/** Severity sort order: critical=0, warning=1, info=2 */
function severityOrder(s: NotificationAlert['severity']): number {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2;
}

/** Format a SafetyEventType enum value into a readable label */
function formatEventType(eventType: string): string {
  return eventType
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

// ─── Dashboard Metrics ────────────────────────────────────────

export interface FleetStats {
  totalTrucks: number;
  activeDrivers: number;
  activeRoutes: number;
  maintenanceAlerts: number;
}

export interface DashboardMetrics {
  totalTrucks: number;
  activeDrivers: number;
  activeRoutes: number;
  maintenanceAlerts: number;
  unpaidTotal: string;       // e.g. "$12,450.00"
  overdueTotal: string;      // e.g. "$3,200.00" — subset of unpaid
  activeLoads: number;       // DISPATCHED + PICKED_UP + IN_TRANSIT
  revenuePerMile: string;    // e.g. "$2.45/mi" or "N/A"
}

/** Format a Prisma.Decimal (or null) as a USD currency string */
function formatCurrency(amount: Prisma.Decimal | null): string {
  if (!amount) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount.toNumber());
}

// ─── Cached data fetchers ─────────────────────────────────────
// Module-level constants — unstable_cache wraps the expensive DB queries
// and caches results per tenantId for 60 seconds. Auth (cookie read) still
// happens per-request in the exported functions below.

const _fetchNotificationAlerts = unstable_cache(
  async (tenantId: string): Promise<NotificationAlert[]> => {
    const db = globalPrisma.$extends(withTenantRLS(tenantId));

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const sevenDaysAgo = new Date(now.getTime() - 7 * msPerDay);

    const [truckDocAlerts, driverDocuments, overdueInvoices, recentSafetyEvents] = await Promise.all([
      // --- Truck documents: read documentMetadata JSONB from trucks ---
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      (db.truck.findMany({
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          documentMetadata: true,
        },
      }) as Promise<Array<{
        id: string;
        year: number;
        make: string;
        model: string;
        documentMetadata: unknown;
      }>>),

      // --- Driver documents expiring within 60 days (or already expired) ---
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      (db.document.findMany({
        where: {
          driverId: { not: null },
          expiryDate: {
            not: null,
            lte: new Date(now.getTime() + 60 * msPerDay),
          },
        },
        select: {
          id: true,
          fileName: true,
          documentType: true,
          expiryDate: true,
          driverId: true,
          driver: {
            select: { firstName: true, lastName: true },
          },
        },
      }) as Promise<Array<{
        id: string;
        fileName: string;
        documentType: string | null;
        expiryDate: Date | null;
        driverId: string | null;
        driver: { firstName: string | null; lastName: string | null } | null;
      }>>),

      // --- Overdue invoices ---
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      (db.invoice.findMany({
        where: { status: 'OVERDUE', paidDate: null },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          dueDate: true,
          updatedAt: true,
        },
      }) as Promise<Array<{
        id: string;
        invoiceNumber: string;
        totalAmount: Prisma.Decimal;
        dueDate: Date;
        updatedAt: Date;
      }>>),

      // --- Safety events from last 7 days ---
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      (db.safetyEvent.findMany({
        where: { timestamp: { gte: sevenDaysAgo } },
        select: {
          id: true,
          eventType: true,
          severity: true,
          timestamp: true,
          truck: { select: { licensePlate: true } },
          driver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
      }) as Promise<Array<{
        id: string;
        eventType: string;
        severity: string;
        timestamp: Date;
        truck: { licensePlate: string } | null;
        driver: { firstName: string | null; lastName: string | null } | null;
      }>>),
    ]);

    const alerts: NotificationAlert[] = [];

    // --- Process truck document alerts (from JSONB) ---
    for (const truck of truckDocAlerts) {
      const truckName = `${truck.year} ${truck.make} ${truck.model}`;
      const meta = truck.documentMetadata as {
        registrationExpiry?: string;
        insuranceExpiry?: string;
      } | null;

      if (!meta) continue;

      const checkDoc = (expiry: string | undefined, docLabel: string) => {
        if (!expiry) return;
        const expiryDate = new Date(expiry);
        const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay);
        if (daysUntil > 60) return;

        const severity: NotificationAlert['severity'] =
          daysUntil < 0 ? 'critical' : daysUntil <= 14 ? 'warning' : 'info';

        alerts.push({
          id: `truck-${truck.id}-${docLabel}`,
          type: 'document_expiry',
          severity,
          title: `${truckName} ${docLabel} ${daysUntil < 0 ? 'expired' : 'expiring'}`,
          description:
            daysUntil < 0
              ? `Expired ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago`
              : `Expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
          href: '/trucks',
          timestamp: expiryDate.toISOString(),
        });
      };

      checkDoc(meta.registrationExpiry, 'Registration');
      checkDoc(meta.insuranceExpiry, 'Insurance');
    }

    // --- Process driver document alerts ---
    for (const doc of driverDocuments) {
      if (!doc.expiryDate || !doc.driverId) continue;

      const expiryDate = doc.expiryDate;
      const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay);
      if (daysUntil > 60) continue;

      const driverName =
        doc.driver?.firstName && doc.driver?.lastName
          ? `${doc.driver.firstName} ${doc.driver.lastName}`
          : 'Unknown Driver';

      const docLabel =
        doc.documentType === 'DRIVER_LICENSE'
          ? 'Driver License'
          : doc.documentType === 'DRIVER_APPLICATION'
            ? 'Driver Application'
            : doc.fileName;

      const severity: NotificationAlert['severity'] =
        daysUntil < 0 ? 'critical' : daysUntil <= 14 ? 'warning' : 'info';

      alerts.push({
        id: `driver-doc-${doc.id}`,
        type: 'document_expiry',
        severity,
        title: `${driverName} ${docLabel} ${daysUntil < 0 ? 'expired' : 'expiring'}`,
        description:
          daysUntil < 0
            ? `Expired ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago`
            : `Expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
        href: `/drivers/${doc.driverId}`,
        timestamp: expiryDate.toISOString(),
      });
    }

    // --- Process overdue invoice alerts ---
    for (const invoice of overdueInvoices) {
      const amount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(invoice.totalAmount.toNumber());

      alerts.push({
        id: `invoice-${invoice.id}`,
        type: 'overdue_invoice',
        severity: 'critical',
        title: `Invoice ${invoice.invoiceNumber} overdue`,
        description: `${amount} past due`,
        href: '/invoices',
        timestamp: invoice.updatedAt.toISOString(),
      });
    }

    // --- Process safety event alerts ---
    for (const event of recentSafetyEvents) {
      const severity: NotificationAlert['severity'] =
        event.severity === 'CRITICAL' ? 'critical' : event.severity === 'HIGH' ? 'warning' : 'info';

      const actorName =
        event.driver?.firstName && event.driver?.lastName
          ? `${event.driver.firstName} ${event.driver.lastName}`
          : event.truck?.licensePlate ?? 'Unknown';

      alerts.push({
        id: `safety-${event.id}`,
        type: 'safety_event',
        severity,
        title: formatEventType(event.eventType),
        description: actorName,
        href: '/safety',
        timestamp: event.timestamp.toISOString(),
      });
    }

    // Sort: critical first, warning second, info last; within same severity most recent first
    alerts.sort((a, b) => {
      const severityDiff = severityOrder(a.severity) - severityOrder(b.severity);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return alerts.slice(0, 20);
  },
  ['dashboard-notification-alerts'],
  { revalidate: 60 }
);

const _fetchDashboardMetrics = unstable_cache(
  async (tenantId: string): Promise<DashboardMetrics> => {
    const db = globalPrisma.$extends(withTenantRLS(tenantId));

    const [
      totalTrucksCount,
      activeDriversCount,
      activeRoutesCount,
      maintenanceAlertsCount,
      unpaidInvoices,
      overdueInvoices,
      activeLoadsCount,
      completedRoutes,
    ] = await Promise.all([
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.truck.count() as Promise<number>,

      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.user.count({
        where: { role: 'DRIVER', isActive: true },
      }) as Promise<number>,

      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.route.count({
        where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      }) as Promise<number>,

      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.scheduledService.count({
        where: { isCompleted: false },
      }) as Promise<number>,

      // All unpaid invoices (DRAFT, SENT, OVERDUE)
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.invoice.findMany({
        where: {
          status: { in: ['DRAFT', 'SENT', 'OVERDUE'] },
          paidDate: null,
        },
        select: { totalAmount: true, status: true },
      }) as Promise<Array<{ totalAmount: Prisma.Decimal; status: string }>>,

      // Overdue invoices only (subset)
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.invoice.findMany({
        where: {
          status: 'OVERDUE',
          paidDate: null,
        },
        select: { totalAmount: true },
      }) as Promise<Array<{ totalAmount: Prisma.Decimal }>>,

      // Active loads: DISPATCHED + PICKED_UP + IN_TRANSIT
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.load.count({
        where: { status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] } },
      }) as Promise<number>,

      // Completed routes with odometer data for revenue per mile — last 90 days only
      // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
      db.route.findMany({
        where: {
          status: 'COMPLETED',
          startOdometer: { not: null },
          endOdometer: { not: null },
          completedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        select: {
          startOdometer: true,
          endOdometer: true,
          payments: {
            where: { deletedAt: null },
            select: { amount: true },
          },
        },
        take: 200,
      }) as Promise<Array<{
        startOdometer: number | null;
        endOdometer: number | null;
        payments: Array<{ amount: Prisma.Decimal }>;
      }>>,
    ]);

    // Calculate unpaid total (all DRAFT+SENT+OVERDUE)
    let unpaidSum = new Prisma.Decimal(0);
    for (const inv of unpaidInvoices) {
      unpaidSum = unpaidSum.add(inv.totalAmount);
    }

    // Calculate overdue total (OVERDUE only)
    let overdueSum = new Prisma.Decimal(0);
    for (const inv of overdueInvoices) {
      overdueSum = overdueSum.add(inv.totalAmount);
    }

    // Calculate revenue per mile from completed routes
    let totalRevenue = new Prisma.Decimal(0);
    let totalMiles = new Prisma.Decimal(0);

    for (const route of completedRoutes) {
      if (route.startOdometer == null || route.endOdometer == null) continue;
      const miles = new Prisma.Decimal(route.endOdometer - route.startOdometer);
      if (miles.lte(0)) continue;

      for (const payment of route.payments) {
        totalRevenue = totalRevenue.add(payment.amount);
      }
      totalMiles = totalMiles.add(miles);
    }

    let revenuePerMile = 'N/A';
    if (totalMiles.gt(0) && totalRevenue.gt(0)) {
      const rpmValue = totalRevenue.div(totalMiles);
      revenuePerMile = `$${rpmValue.toDecimalPlaces(2).toString()}/mi`;
    }

    return {
      totalTrucks: totalTrucksCount,
      activeDrivers: activeDriversCount,
      activeRoutes: activeRoutesCount,
      maintenanceAlerts: maintenanceAlertsCount,
      unpaidTotal: formatCurrency(unpaidSum),
      overdueTotal: formatCurrency(overdueSum),
      activeLoads: activeLoadsCount,
      revenuePerMile,
    };
  },
  ['dashboard-metrics'],
  { revalidate: 60 }
);

// ─── Public Server Actions ────────────────────────────────────

/**
 * Get unified notification alerts for dashboard panel.
 * Results cached per tenant for 60 seconds via unstable_cache.
 * Auth enforced via getAuthContext() — single session decrypt (down from 2).
 */
export async function getNotificationAlerts(): Promise<NotificationAlert[]> {
  const { tenantId } = await getAuthContext();
  return _fetchNotificationAlerts(tenantId);
}

/**
 * Get full dashboard metrics including financial data.
 * Results cached per tenant for 60 seconds via unstable_cache.
 * Requires OWNER or MANAGER role.
 * Auth enforced via getAuthContext() — single session decrypt (down from 2).
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { tenantId } = await getAuthContext();
  return _fetchDashboardMetrics(tenantId);
}

/**
 * Get fleet overview statistics for owner dashboard (legacy — use getDashboardMetrics for full data)
 * Returns total trucks, active drivers, active routes, and pending maintenance alerts
 */
export async function getFleetStats(): Promise<FleetStats> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
  const totalTrucks = db.truck.count();

  // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
  const activeDrivers = db.user.count({
    where: {
      role: 'DRIVER',
      isActive: true,
    },
  });

  // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
  const activeRoutes = db.route.count({
    where: {
      status: {
        in: ['PLANNED', 'IN_PROGRESS'],
      },
    },
  });

  // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
  const maintenanceAlerts = db.scheduledService.count({
    where: {
      isCompleted: false,
    },
  });

  const [totalTrucksCount, activeDriversCount, activeRoutesCount, maintenanceAlertsCount] = await Promise.all([
    totalTrucks,
    activeDrivers,
    activeRoutes,
    maintenanceAlerts,
  ]);

  return {
    totalTrucks: totalTrucksCount,
    activeDrivers: activeDriversCount,
    activeRoutes: activeRoutesCount,
    maintenanceAlerts: maintenanceAlertsCount,
  };
}
