import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/trucks/[id]/maintenance
 *
 * Returns maintenance history for a single truck belonging to the authenticated owner's tenant.
 * Returns the 50 most recent events ordered by service date descending.
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
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const events = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify truck belongs to this tenant
      const truck = await tx.truck.findUnique({
        where: { id, tenantId, archivedAt: null },
        select: { id: true },
      });
      if (!truck) return null;

      return tx.maintenanceEvent.findMany({
        where: { truckId: id, tenantId },
        orderBy: { serviceDate: 'desc' },
        take: 50,
        select: {
          id: true,
          serviceType: true,
          serviceDate: true,
          odometerAtService: true,
          cost: true,
          provider: true,
          notes: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    if (events === null) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    return NextResponse.json(
      events.map((e) => ({
        id: e.id,
        serviceType: e.serviceType,
        serviceDate: e.serviceDate.toISOString(),
        odometerAtService: e.odometerAtService,
        cost: e.cost != null ? e.cost.toString() : null,
        provider: e.provider,
        notes: e.notes,
        createdAt: e.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error('[mobile/owner/trucks/[id]/maintenance GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/trucks/[id]/maintenance
 *
 * Creates a new maintenance event for the specified truck.
 * Body: { serviceType, serviceDate, odometerAtService, cost?, provider?, notes? }
 */
export async function POST(
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { serviceType, serviceDate, odometerAtService, cost, provider, notes } = body as Record<string, unknown>;

  // Validate required fields
  if (!serviceType || typeof serviceType !== 'string' || serviceType.trim().length === 0) {
    return NextResponse.json({ error: 'serviceType is required and must be a non-empty string' }, { status: 400 });
  }

  if (!serviceDate || typeof serviceDate !== 'string') {
    return NextResponse.json({ error: 'serviceDate is required (ISO string)' }, { status: 400 });
  }
  const parsedDate = new Date(serviceDate);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: 'serviceDate must be a valid date string' }, { status: 400 });
  }

  if (odometerAtService === undefined || odometerAtService === null) {
    return NextResponse.json({ error: 'odometerAtService is required' }, { status: 400 });
  }
  const odometerNum = Number(odometerAtService);
  if (!Number.isInteger(odometerNum) || odometerNum < 0) {
    return NextResponse.json({ error: 'odometerAtService must be a non-negative integer' }, { status: 400 });
  }

  let costNum: number | null = null;
  if (cost !== undefined && cost !== null) {
    costNum = Number(cost);
    if (isNaN(costNum) || costNum < 0) {
      return NextResponse.json({ error: 'cost must be a non-negative number' }, { status: 400 });
    }
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const event = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify truck exists and belongs to this tenant
      const truck = await tx.truck.findUnique({
        where: { id, tenantId, archivedAt: null },
        select: { id: true },
      });
      if (!truck) return null;

      return tx.maintenanceEvent.create({
        data: {
          tenantId,
          truckId: id,
          serviceType: serviceType.trim(),
          serviceDate: parsedDate,
          odometerAtService: odometerNum,
          cost: costNum,
          provider: provider != null && typeof provider === 'string' ? provider.trim() || null : null,
          notes: notes != null && typeof notes === 'string' ? notes.trim() || null : null,
        },
        select: {
          id: true,
          serviceType: true,
          serviceDate: true,
          odometerAtService: true,
          cost: true,
          provider: true,
          notes: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    if (event === null) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      event: {
        id: event.id,
        serviceType: event.serviceType,
        serviceDate: event.serviceDate.toISOString(),
        odometerAtService: event.odometerAtService,
        cost: event.cost != null ? event.cost.toString() : null,
        provider: event.provider,
        notes: event.notes,
        createdAt: event.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    logger.error('[mobile/owner/trucks/[id]/maintenance POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
