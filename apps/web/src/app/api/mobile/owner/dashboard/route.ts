import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/owner/dashboard
 *
 * Returns the owner's dashboard data:
 * - kpis.activeLoadsCount: loads in PENDING/DISPATCHED/PICKED_UP/IN_TRANSIT
 * - kpis.driversOnDutyCount: drivers with DRIVING or ON_DUTY HOS status today
 * - kpis.revenueThisMonth: sum of rate for DELIVERED + INVOICED loads this month
 * - kpis.openAlertsCount: expiring docs (within 30 days) + trucks in maintenance
 * - activeLoads: top 5 active loads with driverName
 * - driverStatuses: all drivers with current HOS status and active load number
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const { tenantId } = auth;

  try {
    const data = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const activeStatuses = ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] as const;

      // Count active loads
      const activeLoadsCount = await tx.load.count({
        where: {
          tenantId,
          status: { in: [...activeStatuses] },
          archivedAt: null,
        },
      });

      // Get drivers on duty today: find latest HOS entry per driver that started today
      // and is DRIVING or ON_DUTY with no endTime (or endTime >= now)
      const driversOnDuty = await tx.driverHOSEntry.findMany({
        where: {
          tenantId,
          status: { in: ['DRIVING', 'ON_DUTY'] },
          startTime: { gte: todayStart },
          endTime: null,
        },
        select: { driverId: true },
        distinct: ['driverId'],
      });
      const driversOnDutyCount = driversOnDuty.length;

      // Revenue this month: sum of rate for DELIVERED + INVOICED loads
      const revenueResult = await tx.load.aggregate({
        where: {
          tenantId,
          status: { in: ['DELIVERED', 'INVOICED'] },
          archivedAt: null,
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { rate: true },
      });
      const revenueThisMonth = Number(revenueResult._sum.rate ?? 0);

      // Open alerts: expiring docs (within 30 days) + trucks in maintenance
      const expiringDocsCount = await tx.document.count({
        where: {
          tenantId,
          expiryDate: { gte: now, lte: in30Days },
        },
      });
      const trucksInMaintenance = await tx.truck.count({
        where: {
          tenantId,
          inMaintenance: true,
          archivedAt: null,
        },
      });
      const openAlertsCount = expiringDocsCount + trucksInMaintenance;

      // Top 5 active loads with driver name
      const activeLoads = await tx.load.findMany({
        where: {
          tenantId,
          status: { in: [...activeStatuses] },
          archivedAt: null,
        },
        include: {
          customer: { select: { id: true, companyName: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });

      // All drivers in tenant (role = DRIVER)
      const drivers = await tx.user.findMany({
        where: {
          tenantId,
          role: 'DRIVER',
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });

      // Latest HOS entry per driver (most recent open entry)
      const driverIds = drivers.map((d) => d.id);
      const latestHOSEntries = await tx.driverHOSEntry.findMany({
        where: {
          tenantId,
          driverId: { in: driverIds },
          endTime: null,
        },
        select: {
          driverId: true,
          status: true,
          startTime: true,
        },
        orderBy: { startTime: 'desc' },
      });

      // Deduplicate — keep only the latest entry per driver
      const hosMap = new Map<string, { status: string; startTime: Date }>();
      for (const entry of latestHOSEntries) {
        if (!hosMap.has(entry.driverId)) {
          hosMap.set(entry.driverId, { status: entry.status, startTime: entry.startTime });
        }
      }

      // Active load per driver
      const driverActiveLoads = await tx.load.findMany({
        where: {
          tenantId,
          driverId: { in: driverIds },
          status: { in: [...activeStatuses] },
          archivedAt: null,
        },
        select: {
          driverId: true,
          loadNumber: true,
        },
      });
      const driverLoadMap = new Map<string, string>();
      for (const load of driverActiveLoads) {
        if (load.driverId && !driverLoadMap.has(load.driverId)) {
          driverLoadMap.set(load.driverId, load.loadNumber);
        }
      }

      return {
        activeLoadsCount,
        driversOnDutyCount,
        revenueThisMonth,
        openAlertsCount,
        activeLoads,
        drivers,
        hosMap,
        driverLoadMap,
      };
    }, TX_OPTIONS);

    // Normalize active loads
    const normalizedActiveLoads = data.activeLoads.map((load) => ({
      id: load.id,
      loadNumber: load.loadNumber,
      status: load.status,
      origin: load.origin,
      destination: load.destination,
      customer: {
        id: load.customer.id,
        companyName: load.customer.companyName,
      },
      truck: load.truck
        ? {
            id: load.truck.id,
            make: load.truck.make,
            model: load.truck.model,
            licensePlate: load.truck.licensePlate,
          }
        : null,
      driverName: load.driver
        ? [load.driver.firstName, load.driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver'
        : null,
      createdAt: load.createdAt,
      updatedAt: load.updatedAt,
    }));

    // Normalize driver statuses
    const driverStatuses = data.drivers.map((driver) => {
      const hos = data.hosMap.get(driver.id);
      return {
        id: driver.id,
        name:
          [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver',
        hosStatus: (hos?.status ?? null) as string | null,
        activeLoadNumber: data.driverLoadMap.get(driver.id) ?? null,
      };
    });

    return NextResponse.json({
      kpis: {
        activeLoadsCount: data.activeLoadsCount,
        driversOnDutyCount: data.driversOnDutyCount,
        revenueThisMonth: data.revenueThisMonth,
        openAlertsCount: data.openAlertsCount,
      },
      activeLoads: normalizedActiveLoads,
      driverStatuses,
    });
  } catch (err) {
    console.error('[mobile/owner/dashboard] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
