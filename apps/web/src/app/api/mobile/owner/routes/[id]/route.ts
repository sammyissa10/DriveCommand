import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/routes/[id]
 *
 * Returns full route detail for any route in the owner's tenant.
 * Includes: driver, truck, stops (ordered by position asc), loads.
 *
 * Returns 403 if not owner, 404 if route not found.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
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

  const { id } = await params;
  const { tenantId } = auth;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const route = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.route.findFirst({
        where: { id, tenantId, archivedAt: null },
        include: {
          driver: { select: { id: true, firstName: true, lastName: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
          stops: { orderBy: { position: 'asc' } },
          loads: {
            select: {
              id: true,
              loadNumber: true,
              status: true,
              origin: true,
              destination: true,
              rate: true,
            },
          },
        },
      });
    }, TX_OPTIONS);

    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Normalize driver name from firstName/lastName fields
    const driver = {
      id: route.driver.id,
      name:
        [route.driver.firstName, route.driver.lastName].filter(Boolean).join(' ') ||
        'Unknown Driver',
    };

    return NextResponse.json({
      ...route,
      driver,
    });
  } catch (err) {
    logger.error('[mobile/owner/routes/[id]] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/mobile/owner/routes/[id]
 *
 * Updates a route. Owner can update: name, status, scheduledDate, driverId.
 *
 * Valid status values: PLANNED | IN_PROGRESS | COMPLETED
 *
 * Body: {
 *   name?: string,
 *   status?: string,
 *   scheduledDate?: string,   (ISO string)
 *   driverId?: string          (Route.driverId is required — no null/unassign)
 * }
 *
 * Returns updated route detail.
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

  const { id } = await params;
  const { tenantId } = auth;

  let body: { name?: string; status?: string; scheduledDate?: string; driverId?: string; truckId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const VALID_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'];

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const route = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify route belongs to tenant
      const existing = await tx.route.findUnique({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      // Validate driverId if provided
      if (body.driverId) {
        const driver = await tx.user.findFirst({
          where: { id: body.driverId, tenantId, role: 'DRIVER', isActive: true },
          select: { id: true },
        });
        if (!driver) {
          throw new Error('Driver not found or not active');
        }
      }

      // Validate truckId if provided
      if (body.truckId) {
        const truck = await tx.truck.findFirst({
          where: { id: body.truckId, tenantId },
          select: { id: true },
        });
        if (!truck) {
          throw new Error('Truck not found in this tenant');
        }
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.scheduledDate !== undefined) updateData.scheduledDate = new Date(body.scheduledDate);
      if (body.driverId !== undefined) updateData.driverId = body.driverId;
      if (body.truckId !== undefined) updateData.truckId = body.truckId;

      // SAFE: tenant ownership verified by findUnique above within this same transaction
      return tx.route.update({
        where: { id },
        data: updateData,
        include: {
          driver: { select: { id: true, firstName: true, lastName: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
          stops: { orderBy: { position: 'asc' } },
          loads: {
            select: {
              id: true,
              loadNumber: true,
              status: true,
              origin: true,
              destination: true,
              rate: true,
            },
          },
        },
      });
    }, TX_OPTIONS);

    const driver = {
      id: route.driver.id,
      name:
        [route.driver.firstName, route.driver.lastName].filter(Boolean).join(' ') ||
        'Unknown Driver',
    };

    return NextResponse.json({ route: { ...route, driver } });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }
    logger.error('[mobile/owner/routes/[id] PATCH] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
