import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { computeTruckStatus } from '@/lib/trucks/compute-truck-status';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/mobile/owner/trucks
 *
 * Creates a new truck for the authenticated owner's tenant.
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId, userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { make, model, year, vin, licensePlate, odometer } = body;

  if (!make || !model || !year || !vin || !licensePlate || odometer == null) {
    return NextResponse.json(
      { error: 'Missing required fields: make, model, year, vin, licensePlate, odometer' },
      { status: 400 }
    );
  }

  const vinStr = String(vin).toUpperCase().trim();
  if (vinStr.length !== 17 || /[IOQ]/.test(vinStr)) {
    return NextResponse.json(
      { error: 'VIN must be 17 characters and cannot contain I, O, or Q' },
      { status: 400 }
    );
  }

  const yearNum = parseInt(String(year), 10);
  const odometerNum = parseInt(String(odometer), 10);

  if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  if (isNaN(odometerNum) || odometerNum < 0) {
    return NextResponse.json({ error: 'Invalid odometer reading' }, { status: 400 });
  }

  const documentMetadata: Record<string, string> = {};
  if (body.registrationNumber) documentMetadata.registrationNumber = String(body.registrationNumber).trim();
  if (body.registrationExpiry) documentMetadata.registrationExpiry = String(body.registrationExpiry).trim();
  if (body.insuranceNumber) documentMetadata.insuranceNumber = String(body.insuranceNumber).trim();
  if (body.insuranceExpiry) documentMetadata.insuranceExpiry = String(body.insuranceExpiry).trim();

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
      return tx.truck.create({
        data: {
          tenantId,
          make: String(make).trim(),
          model: String(model).trim(),
          year: yearNum,
          vin: vinStr,
          licensePlate: String(licensePlate).trim().toUpperCase(),
          odometer: odometerNum,
          createdById: userId,
          updatedById: userId,
          ...(Object.keys(documentMetadata).length > 0 ? { documentMetadata } : {}),
        },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          odometer: true,
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ truck }, { status: 201 });
  } catch (err: unknown) {
    const prismaErr = err as { code?: string; meta?: { target?: string[] } };
    if (prismaErr?.code === 'P2002') {
      const field = prismaErr.meta?.target?.includes('vin') ? 'VIN' : 'License plate';
      return NextResponse.json({ error: `${field} already exists` }, { status: 409 });
    }
    logger.error('[mobile/owner/trucks POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));
  const excludeSamples = searchParams.get('exclude_samples') === 'true';

  try {
    const { trucks, total } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // TKT-0076. Opt-in and default OFF: this endpoint serves the mobile
      // trucks LIST screen (`more/trucks/index`), where samples must stay
      // visible with their pill, AND the truck pickers. Only the pickers ask
      // for `exclude_samples=true`, via `ownerApi.getTruckOptions`.
      const where = {
        tenantId,
        archivedAt: null,
        ...(excludeSamples ? { isSample: false } : {}),
      };

      const [items, count] = await Promise.all([
        tx.truck.findMany({
          where,
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
          take: limit,
          skip: (page - 1) * limit,
        }),
        tx.truck.count({ where }),
      ]);

      return { trucks: items, total: count };
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

    return NextResponse.json({
      trucks: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error('[mobile/owner/trucks] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
