'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { Prisma } from '@/generated/prisma';

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

/**
 * Get full dashboard metrics including financial data.
 * Replaces getFleetStats for the main dashboard page.
 * Requires OWNER or MANAGER role.
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // Run all queries in parallel
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

    // Completed routes with odometer data for revenue per mile calculation
    // @ts-ignore - Prisma 7 withTenantRLS extension type inference issue
    db.route.findMany({
      where: {
        status: 'COMPLETED',
        startOdometer: { not: null },
        endOdometer: { not: null },
      },
      select: {
        startOdometer: true,
        endOdometer: true,
        payments: {
          where: { deletedAt: null },
          select: { amount: true },
        },
      },
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
}
