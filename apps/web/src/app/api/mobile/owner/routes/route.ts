import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { RouteStatus } from '@/generated/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/routes?status=all|planned|active|completed
 *
 * Returns all routes for the authenticated owner's tenant, filtered by status tab:
 * - all (no filter)
 * - planned: PLANNED
 * - active: IN_PROGRESS
 * - completed: COMPLETED
 *
 * Returns driver name, truck info, and load/stop counts for card display.
 * Sorted by scheduledDate descending.
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
  const statusParam = searchParams.get('status') ?? 'all';

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

  let statusFilter: RouteStatus[] | undefined;
  if (statusParam === 'planned') {
    statusFilter = [RouteStatus.PLANNED];
  } else if (statusParam === 'active') {
    statusFilter = [RouteStatus.IN_PROGRESS];
  } else if (statusParam === 'completed') {
    statusFilter = [RouteStatus.COMPLETED];
  }
  // 'all' → no filter (statusFilter remains undefined)

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const { routes, total } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const where = {
        tenantId,
        archivedAt: null,
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
      };

      const [items, count] = await Promise.all([
        tx.route.findMany({
          where,
          include: {
            driver: { select: { id: true, firstName: true, lastName: true } },
            truck: { select: { id: true, make: true, model: true, licensePlate: true } },
            _count: { select: { loads: true, stops: true } },
          },
          orderBy: { scheduledDate: 'desc' },
          take: limit,
          skip: (page - 1) * limit,
        }),
        tx.route.count({ where }),
      ]);

      return { routes: items, total: count };
    }, TX_OPTIONS);

    // Normalize driver name from firstName/lastName fields
    const routesNormalized = routes.map((route) => ({
      ...route,
      driver: {
        id: route.driver.id,
        name:
          [route.driver.firstName, route.driver.lastName].filter(Boolean).join(' ') ||
          'Unknown Driver',
      },
    }));

    return NextResponse.json({
      routes: routesNormalized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error('[mobile/owner/routes] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/routes
 *
 * Creates a new route with stops for the authenticated owner's tenant.
 *
 * Body: {
 *   name: string,
 *   driverId: string,
 *   truckId: string,
 *   scheduledDate?: string,   (ISO string)
 *   stops: Array<{
 *     address: string,
 *     type: 'PICKUP' | 'DELIVERY',
 *     scheduledAt?: string,
 *     notes?: string
 *   }>
 * }
 *
 * Validates: name required, driverId required, truckId required, at least 2 stops.
 * Driver and truck must belong to the authenticated owner's tenant.
 *
 * Returns 201 with { route: { id, name, status } }
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
    name?: unknown;
    driverId?: unknown;
    truckId?: unknown;
    scheduledDate?: unknown;
    stops?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!body.driverId || typeof body.driverId !== 'string') {
    return NextResponse.json({ error: 'driverId is required' }, { status: 400 });
  }
  if (!body.truckId || typeof body.truckId !== 'string') {
    return NextResponse.json({ error: 'truckId is required' }, { status: 400 });
  }
  if (!Array.isArray(body.stops) || body.stops.length < 2) {
    return NextResponse.json({ error: 'At least 2 stops are required' }, { status: 400 });
  }

  const name = body.name.trim();
  const driverId = body.driverId;
  const truckId = body.truckId;
  const scheduledDate = typeof body.scheduledDate === 'string' ? body.scheduledDate : null;
  const stops = body.stops as Array<{
    address?: unknown;
    type?: unknown;
    scheduledAt?: unknown;
    notes?: unknown;
  }>;

  // Validate each stop has address and type
  for (const stop of stops) {
    if (!stop.address || typeof stop.address !== 'string' || stop.address.trim() === '') {
      return NextResponse.json({ error: 'Each stop must have an address' }, { status: 400 });
    }
    if (stop.type !== 'PICKUP' && stop.type !== 'DELIVERY') {
      return NextResponse.json({ error: 'Each stop type must be PICKUP or DELIVERY' }, { status: 400 });
    }
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const route = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify driver belongs to tenant (drivers are Users with DRIVER role)
      const driver = await tx.user.findFirst({
        where: { id: driverId, tenantId, role: 'DRIVER' },
        select: { id: true },
      });
      if (!driver) {
        throw new Error('DRIVER_NOT_FOUND');
      }

      // Verify truck belongs to tenant
      const truck = await tx.truck.findFirst({
        where: { id: truckId, tenantId },
        select: { id: true },
      });
      if (!truck) {
        throw new Error('TRUCK_NOT_FOUND');
      }

      // Derive origin from first stop, destination from last stop
      const origin = (stops[0].address as string).trim();
      const destination = (stops[stops.length - 1].address as string).trim();

      return tx.route.create({
        data: {
          tenantId,
          name,
          driverId,
          truckId,
          status: 'PLANNED',
          origin,
          destination,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
          stops: {
            create: stops.map((s, i) => ({
              tenantId,
              position: i + 1,
              type: s.type as 'PICKUP' | 'DELIVERY',
              address: (s.address as string).trim(),
              status: 'PENDING',
              scheduledAt: s.scheduledAt && typeof s.scheduledAt === 'string' ? new Date(s.scheduledAt) : null,
              notes: s.notes && typeof s.notes === 'string' ? s.notes : null,
            })),
          },
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ route }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'DRIVER_NOT_FOUND') {
      return NextResponse.json({ error: 'Driver not found in this tenant' }, { status: 400 });
    }
    if (err instanceof Error && err.message === 'TRUCK_NOT_FOUND') {
      return NextResponse.json({ error: 'Truck not found in this tenant' }, { status: 400 });
    }
    logger.error('[mobile/owner/routes POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
