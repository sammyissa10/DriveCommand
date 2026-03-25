import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { computeTruckStatus } from '@/lib/trucks/compute-truck-status';

/**
 * GET /api/mobile/owner/trucks
 *
 * Returns all non-archived trucks for the authenticated owner's tenant,
 * with computed operational status matching the web dashboard.
 *
 * Status priority: In Use → In Maintenance → Expired Docs → Ready to Use
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
    const trucks = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.truck.findMany({
        where: { tenantId, archivedAt: null },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          vin: true,
          licensePlate: true,
          odometer: true,
          inMaintenance: true,
          documentMetadata: true,
          tenantId: true,
          createdById: true,
          updatedById: true,
          createdAt: true,
          updatedAt: true,
          archivedAt: true,
          loads: {
            where: { status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] } },
            select: { id: true, status: true },
          },
          assignedRoutes: {
            where: { status: 'IN_PROGRESS', archivedAt: null },
            select: { id: true, status: true },
          },
          scheduledServices: {
            where: { isCompleted: false },
            select: {
              id: true,
              baselineDate: true,
              intervalDays: true,
              intervalMiles: true,
              baselineOdometer: true,
            },
          },
          documents: {
            where: { expiryDate: { not: null } },
            select: { id: true, expiryDate: true },
          },
        },
        orderBy: [{ make: 'asc' }, { model: 'asc' }],
      });
    }, TX_OPTIONS);

    const result = trucks.map((truck) => {
      const { status, variant } = computeTruckStatus(truck);
      return {
        id: truck.id,
        make: truck.make,
        model: truck.model,
        year: truck.year,
        licensePlate: truck.licensePlate,
        odometer: truck.odometer,
        inMaintenance: truck.inMaintenance,
        status,
        variant,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[mobile/owner/trucks] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
