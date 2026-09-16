import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { TX_OPTIONS } from '@/lib/db/prisma'
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context'

/**
 * GET /api/mobile/driver/dashboard
 *
 * Returns the driver's dashboard data:
 * - activeLoad: first in-progress load (PENDING/DISPATCHED/PICKED_UP/IN_TRANSIT)
 * - todayMiles: 0 (no GPS source yet — future HOS/ELD integration)
 * - stopsCompleted: count of RouteStops with status DEPARTED for this driver's routes today
 * - hosHoursRemaining: 11.0 (no HOS tracking yet)
 * - recentAlerts: empty array (no alerts model yet)
 *
 * Requires: Authorization: Bearer <token>
 */
export const GET = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { driverId, tenantId } = auth

    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw.
     * userId is deliberately NOT passed — it would make the audit-columns
     * extension start writing createdById/updatedById, a behaviour change
     * this routing task declines to make. Every where clause is unchanged:
     * RLS is the second layer, not a replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId)
    const data = await tenantPrisma.$transaction(async (tx) => {
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
      })

      // Count RouteStops with DEPARTED status for driver's routes today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const stopsCompleted = await tx.routeStop.count({
        where: {
          tenantId,
          status: 'DEPARTED',
          departedAt: { gte: todayStart, lte: todayEnd },
          route: {
            driverId,
          },
        },
      })

      return { activeLoad, stopsCompleted }
    }, TX_OPTIONS)

    return NextResponse.json({
      activeLoad: data.activeLoad,
      todayMiles: 0, // TODO: awaiting GPS/ELD integration
      stopsCompleted: data.stopsCompleted,
      hosHoursRemaining: 11.0, // TODO: awaiting HOS tracking integration
      recentAlerts: [], // TODO: awaiting alerts model
    })
  },
  { allowedRoles: ['DRIVER'] }
)
