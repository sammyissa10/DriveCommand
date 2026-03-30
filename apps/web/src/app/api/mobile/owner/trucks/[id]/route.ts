import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { computeTruckStatus } from '@/lib/trucks/compute-truck-status';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/trucks/[id]
 *
 * Returns detail for a single truck belonging to the authenticated owner's tenant.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;
  const { id } = await params;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const truck = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.truck.findUnique({
        where: { id, tenantId, archivedAt: null },
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
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
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
            select: { id: true, baselineDate: true, intervalDays: true, intervalMiles: true, baselineOdometer: true },
          },
          documents: {
            where: { expiryDate: { not: null } },
            select: { id: true, expiryDate: true },
          },
        },
      });
    }, TX_OPTIONS);

    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    const { status } = computeTruckStatus(truck);

    return NextResponse.json({
      id: truck.id,
      make: truck.make,
      model: truck.model,
      year: truck.year,
      vin: truck.vin,
      licensePlate: truck.licensePlate,
      odometer: truck.odometer,
      inMaintenance: truck.inMaintenance,
      documentMetadata: truck.documentMetadata,
      status,
      createdAt: truck.createdAt.toISOString(),
      updatedAt: truck.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error('[mobile/owner/trucks/[id] GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
