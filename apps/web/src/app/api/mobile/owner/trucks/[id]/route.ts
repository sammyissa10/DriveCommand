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

/**
 * PATCH /api/mobile/owner/trucks/[id]
 *
 * Updates editable fields on a truck.
 * Accepts: { make?, model?, year?, licensePlate?, vin?, odometer? }
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function PATCH(
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

  const { tenantId, userId } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { make, model, year, licensePlate, vin, odometer } = body as Record<string, unknown>;

  // At least one field must be provided
  if (
    make === undefined &&
    model === undefined &&
    year === undefined &&
    licensePlate === undefined &&
    vin === undefined &&
    odometer === undefined
  ) {
    return NextResponse.json({ error: 'At least one field must be provided' }, { status: 400 });
  }

  // Validate field values
  if (make !== undefined && (typeof make !== 'string' || make.trim().length === 0)) {
    return NextResponse.json({ error: 'make must be a non-empty string' }, { status: 400 });
  }
  if (model !== undefined && (typeof model !== 'string' || model.trim().length === 0)) {
    return NextResponse.json({ error: 'model must be a non-empty string' }, { status: 400 });
  }
  if (year !== undefined) {
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
      return NextResponse.json({ error: 'year must be an integer between 1900 and 2100' }, { status: 400 });
    }
  }
  if (licensePlate !== undefined && (typeof licensePlate !== 'string' || licensePlate.trim().length === 0)) {
    return NextResponse.json({ error: 'licensePlate must be a non-empty string' }, { status: 400 });
  }
  if (vin !== undefined && (typeof vin !== 'string' || vin.trim().length === 0)) {
    return NextResponse.json({ error: 'vin must be a non-empty string' }, { status: 400 });
  }
  if (odometer !== undefined) {
    const odometerNum = Number(odometer);
    if (isNaN(odometerNum) || odometerNum < 0) {
      return NextResponse.json({ error: 'odometer must be a non-negative number' }, { status: 400 });
    }
  }

  const updateData: {
    make?: string;
    model?: string;
    year?: number;
    licensePlate?: string;
    vin?: string;
    odometer?: number;
    updatedById?: string;
  } = { updatedById: userId };
  if (make !== undefined) updateData.make = (make as string).trim();
  if (model !== undefined) updateData.model = (model as string).trim();
  if (year !== undefined) updateData.year = Number(year);
  if (licensePlate !== undefined) updateData.licensePlate = (licensePlate as string).trim();
  if (vin !== undefined) updateData.vin = (vin as string).trim();
  if (odometer !== undefined) updateData.odometer = Number(odometer);

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const updatedTruck = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify the truck exists and belongs to this tenant
      const existing = await tx.truck.findUnique({
        where: { id, tenantId, archivedAt: null },
        select: { id: true },
      });
      if (!existing) return null;

      return tx.truck.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          vin: true,
          odometer: true,
        },
      });
    }, TX_OPTIONS);

    if (!updatedTruck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      truck: {
        id: updatedTruck.id,
        make: updatedTruck.make,
        model: updatedTruck.model,
        year: updatedTruck.year,
        licensePlate: updatedTruck.licensePlate,
        vin: updatedTruck.vin,
        odometer: updatedTruck.odometer,
      },
    });
  } catch (err) {
    logger.error('[mobile/owner/trucks/[id] PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
