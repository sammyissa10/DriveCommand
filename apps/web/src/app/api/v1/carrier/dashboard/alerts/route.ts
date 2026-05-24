import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

interface AlertItem {
  id: string;
  label: string;
  count: number;
  href: string;
  severity: 'warning' | 'critical';
}

/**
 * GET /api/v1/carrier/dashboard/alerts
 *
 * Returns actionable alert items for the dashboard alert strip.
 * Only returns items with count > 0.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const [
      pendingPayCount,
      expiringCdlCount,
      expiredCdlCount,
      expiringTruckRegCount,
      expiredTruckRegCount,
      expiringContractCount,
      plannedDispatchCount,
    ] = await Promise.all([
      // 1. Pending pay records
      prisma.driverPayRecord.count({
        where: { orgId, status: 'pending' },
      }),
      // 2a. CDLs expiring within 30 days (warning)
      prisma.carrierDriver.count({
        where: {
          orgId,
          status: 'active',
          cdlExpiry: { lte: thirtyDaysFromNow, gte: now },
        },
      }),
      // 2b. CDLs already expired (critical)
      prisma.carrierDriver.count({
        where: {
          orgId,
          status: 'active',
          cdlExpiry: { lt: now },
        },
      }),
      // 3a. Truck registrations expiring within 30 days (warning)
      prisma.carrierTruck.count({
        where: {
          orgId,
          status: 'active',
          registrationExpiry: { lte: thirtyDaysFromNow, gte: now },
        },
      }),
      // 3b. Truck registrations already expired (critical)
      prisma.carrierTruck.count({
        where: {
          orgId,
          status: 'active',
          registrationExpiry: { lt: now },
        },
      }),
      // 4. Contracts expiring within 30 days
      prisma.carrierContract.count({
        where: {
          orgId,
          status: 'active',
          expirationDate: { lte: thirtyDaysFromNow, gte: now },
        },
      }),
      // 5. Planned dispatches for today that haven't started
      prisma.trip.count({
        where: {
          orgId,
          status: 'planned',
          scheduledDeparture: { lte: endOfToday },
        },
      }),
    ]);

    const alerts: AlertItem[] = [];

    if (expiredCdlCount > 0) {
      alerts.push({
        id: 'expired-cdl',
        label: `${expiredCdlCount} expired CDL${expiredCdlCount > 1 ? 's' : ''}`,
        count: expiredCdlCount,
        href: '/carrier/drivers?filter=cdl_expired',
        severity: 'critical',
      });
    }

    if (expiredTruckRegCount > 0) {
      alerts.push({
        id: 'expired-truck-reg',
        label: `${expiredTruckRegCount} expired registration${expiredTruckRegCount > 1 ? 's' : ''}`,
        count: expiredTruckRegCount,
        href: '/carrier/trucks?filter=reg_expired',
        severity: 'critical',
      });
    }

    if (pendingPayCount > 0) {
      alerts.push({
        id: 'pending-pay',
        label: `${pendingPayCount} pending pay approval${pendingPayCount > 1 ? 's' : ''}`,
        count: pendingPayCount,
        href: '/carrier/reports/driver-pay',
        severity: 'warning',
      });
    }

    if (expiringCdlCount > 0) {
      alerts.push({
        id: 'expiring-cdl',
        label: `${expiringCdlCount} CDL${expiringCdlCount > 1 ? 's' : ''} expiring soon`,
        count: expiringCdlCount,
        href: '/carrier/drivers?filter=cdl_expiring',
        severity: 'warning',
      });
    }

    if (expiringTruckRegCount > 0) {
      alerts.push({
        id: 'expiring-truck-reg',
        label: `${expiringTruckRegCount} registration${expiringTruckRegCount > 1 ? 's' : ''} expiring soon`,
        count: expiringTruckRegCount,
        href: '/carrier/trucks?filter=reg_expiring',
        severity: 'warning',
      });
    }

    if (expiringContractCount > 0) {
      alerts.push({
        id: 'expiring-contracts',
        label: `${expiringContractCount} contract${expiringContractCount > 1 ? 's' : ''} expiring soon`,
        count: expiringContractCount,
        href: '/carrier/contracts',
        severity: 'warning',
      });
    }

    if (plannedDispatchCount > 0) {
      alerts.push({
        id: 'unstarted-dispatches',
        label: `${plannedDispatchCount} dispatch${plannedDispatchCount > 1 ? 'es' : ''} not started today`,
        count: plannedDispatchCount,
        href: '/carrier/dispatches?status=planned',
        severity: 'warning',
      });
    }

    return NextResponse.json(alerts);
  } catch (err) {
    logger.error('[/api/v1/carrier/dashboard/alerts] Failed to fetch alerts:', err);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}
