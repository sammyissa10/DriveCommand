import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/fuel
 *
 * Returns the 50 most recent fuel records for the authenticated owner's tenant.
 * Each record includes truck make/model/licensePlate for display.
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

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — no cookie session available.
     * SCOPE: Reads FuelRecord and Truck records belonging to the authenticated user's tenant only.
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const records = await tx.fuelRecord.findMany({
        where: { tenantId },
        take: 50,
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          truckId: true,
          fuelType: true,
          quantity: true,
          unitCost: true,
          totalCost: true,
          odometer: true,
          location: true,
          timestamp: true,
          truck: {
            select: {
              make: true,
              model: true,
              licensePlate: true,
            },
          },
        },
      });

      const entries = records.map((r) => ({
        id: r.id,
        truckId: r.truckId,
        truckName: `${r.truck.make} ${r.truck.model}`,
        licensePlate: r.truck.licensePlate,
        quantity: r.quantity.toFixed(2),
        unitCost: r.unitCost ? r.unitCost.toFixed(4) : null,
        totalCost: r.totalCost ? r.totalCost.toFixed(2) : null,
        odometer: r.odometer,
        location: r.location,
        timestamp: r.timestamp.toISOString(),
        fuelType: r.fuelType,
      }));

      return { entries };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/fuel] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/fuel
 *
 * Creates a new fuel record for the authenticated owner's tenant.
 *
 * Body: { truckId, quantity, unitCost, odometer, location?, timestamp? }
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  let body: {
    truckId?: unknown;
    quantity?: unknown;
    unitCost?: unknown;
    odometer?: unknown;
    location?: unknown;
    timestamp?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { truckId, quantity, unitCost, odometer, location, timestamp } = body;

  if (
    typeof truckId !== 'string' || !truckId.trim() ||
    typeof quantity !== 'number' || quantity <= 0 ||
    typeof unitCost !== 'number' || unitCost <= 0 ||
    typeof odometer !== 'number' || odometer < 0
  ) {
    return NextResponse.json(
      { error: 'truckId (string), quantity, unitCost, odometer (positive numbers) are required' },
      { status: 400 }
    );
  }

  const entryTimestamp = typeof timestamp === 'string' && timestamp.trim()
    ? new Date(timestamp)
    : new Date();

  if (isNaN(entryTimestamp.getTime())) {
    return NextResponse.json({ error: 'Invalid timestamp format' }, { status: 400 });
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — no cookie session available.
     * SCOPE: Creates FuelRecord only after verifying truckId belongs to the authenticated tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify truck belongs to the tenant
      const truck = await tx.truck.findFirst({
        where: { id: truckId as string, tenantId, archivedAt: null },
        select: { id: true, make: true, model: true, licensePlate: true },
      });

      if (!truck) {
        return null;
      }

      const qtyDecimal = new Prisma.Decimal(quantity as number);
      const unitCostDecimal = new Prisma.Decimal(unitCost as number);
      const totalCost = qtyDecimal.mul(unitCostDecimal).toDecimalPlaces(2);

      const record = await tx.fuelRecord.create({
        data: {
          tenantId,
          truckId: truckId as string,
          fuelType: 'DIESEL',
          quantity: qtyDecimal,
          unitCost: unitCostDecimal,
          totalCost,
          odometer: odometer as number,
          location: typeof location === 'string' ? location.trim() || null : null,
          timestamp: entryTimestamp,
        },
      });

      return {
        entry: {
          id: record.id,
          truckId: record.truckId,
          truckName: `${truck.make} ${truck.model}`,
          licensePlate: truck.licensePlate,
          quantity: record.quantity.toFixed(2),
          unitCost: record.unitCost ? record.unitCost.toFixed(4) : null,
          totalCost: record.totalCost ? record.totalCost.toFixed(2) : null,
          odometer: record.odometer,
          location: record.location,
          timestamp: record.timestamp.toISOString(),
          fuelType: record.fuelType,
        },
      };
    }, TX_OPTIONS);

    if (!result) {
      return NextResponse.json({ error: 'Truck not found or does not belong to your fleet' }, { status: 404 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    logger.error('[mobile/owner/fuel] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
