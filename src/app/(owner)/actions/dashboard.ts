'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';

export interface FleetStats {
  totalTrucks: number;
  activeDrivers: number;
  activeRoutes: number;
  maintenanceAlerts: number;
}

/**
 * Get fleet overview statistics for owner dashboard
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
