import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/driver/dashboard
 *
 * Returns the driver's dashboard data:
 * - activeLoad: first in-progress load (PENDING/DISPATCHED/PICKED_UP/IN_TRANSIT)
 * - todayMiles: 0 (no GPS source yet — placeholder for future HOS/ELD integration)
 * - stopsCompleted: count of RouteStops with status DEPARTED for this driver's routes today
 * - hosHoursRemaining: 11.0 (placeholder — no HOS tracking yet)
 * - recentAlerts: empty array (no alerts model yet)
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  // Driver endpoints require DRIVER role with a driverId
  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { driverId, tenantId } = auth;

  try {
    const data = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Active load: first load in any in-progress status for this driver
      const activeLoad = await tx.load.findFirst({
        where: {
          driverId,
          tenantId,
          status: { in: ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
          archivedAt: null,
        },
        include: {
          customer: { select: { id: true, companyName: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
        },
        orderBy: { pickupDate: 'asc' },
      });

      // Count RouteStops with DEPARTED status for driver's routes today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const stopsCompleted = await tx.routeStop.count({
        where: {
          tenantId,
          status: 'DEPARTED',
          departedAt: { gte: todayStart, lte: todayEnd },
          route: {
            driverId,
          },
        },
      });

      return { activeLoad, stopsCompleted };
    }, TX_OPTIONS);

    return NextResponse.json({
      activeLoad: data.activeLoad,
      todayMiles: 0, // Placeholder — no GPS data source yet
      stopsCompleted: data.stopsCompleted,
      hosHoursRemaining: 11.0, // Placeholder — no HOS tracking yet
      recentAlerts: [], // Placeholder — no alerts model yet
    });
  } catch (err) {
    console.error('[mobile/driver/dashboard] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
