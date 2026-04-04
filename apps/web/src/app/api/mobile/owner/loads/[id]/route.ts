import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { geocodeLoadAddresses } from '@/lib/geo/geocode';
import {
  createRouteStopsForLoad,
  deleteRouteStopsForLoad,
} from '@/lib/route-stops/sync-route-stops';

const Decimal = Prisma.Decimal;

/**
 * GET /api/mobile/owner/loads/[id]
 *
 * Returns full load detail for any load in the owner's tenant.
 * Includes: customer, truck, driver, route with stops (ordered by position asc).
 * Stops are flattened to top-level for convenience.
 *
 * Returns 403 if not owner, 404 if load not found.
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
    const load = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.load.findUnique({
        where: { id, tenantId },
        include: {
          customer: {
            select: { id: true, companyName: true, email: true, phone: true },
          },
          truck: {
            select: { id: true, make: true, model: true, licensePlate: true },
          },
          driver: {
            select: { id: true, firstName: true, lastName: true },
          },
          route: {
            include: {
              stops: {
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });
    }, TX_OPTIONS);

    if (!load) {
      return NextResponse.json({ error: 'Load not found' }, { status: 404 });
    }

    // Flatten stops to top-level for convenience (from route.stops)
    const stops = load.route?.stops ?? [];

    // Normalize driver name from firstName/lastName fields
    const driver = load.driver
      ? {
          id: load.driver.id,
          name:
            [load.driver.firstName, load.driver.lastName].filter(Boolean).join(' ') ||
            'Unknown Driver',
        }
      : null;

    return NextResponse.json({
      ...load,
      driver,
      stops,
    });
  } catch (err) {
    logger.error('[mobile/owner/loads/[id]] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/mobile/owner/loads/[id]
 *
 * Updates a load. Owner can update: status, driverId, notes.
 * Owner is more permissive than driver — can transition to any valid status.
 *
 * Valid status values: PENDING | DISPATCHED | PICKED_UP | IN_TRANSIT | DELIVERED | INVOICED | CANCELLED
 *
 * Body: {
 *   status?: string,
 *   driverId?: string | null,   (null = unassign driver)
 *   notes?: string
 * }
 *
 * Returns updated load detail.
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

  let body: {
    status?: string;
    driverId?: string | null;
    notes?: string;
    origin?: string;
    destination?: string;
    routeId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const VALID_STATUSES = ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'CANCELLED'];

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  // Fetch existing load for comparison (needed for re-geocoding and routeId transition logic)
  let existingLoad: {
    id: string;
    origin: string;
    destination: string;
    routeId: string | null;
    pickupLat: Prisma.Decimal | null;
    pickupLng: Prisma.Decimal | null;
    deliveryLat: Prisma.Decimal | null;
    deliveryLng: Prisma.Decimal | null;
  } | null;

  try {
    existingLoad = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.load.findUnique({
        where: { id, tenantId },
        select: {
          id: true,
          origin: true,
          destination: true,
          routeId: true,
          pickupLat: true,
          pickupLng: true,
          deliveryLat: true,
          deliveryLng: true,
        },
      });
    }, TX_OPTIONS);
  } catch (err) {
    logger.error('[mobile/owner/loads/[id] PATCH] fetch existing error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!existingLoad) {
    return NextResponse.json({ error: 'Load not found' }, { status: 404 });
  }

  // Geocode BEFORE the transaction if addresses changed
  const addressChanged =
    (body.origin !== undefined && body.origin !== existingLoad.origin) ||
    (body.destination !== undefined && body.destination !== existingLoad.destination);

  let geocoded: {
    pickupLat: number | null;
    pickupLng: number | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
  } | null = null;

  if (addressChanged) {
    const newOrigin = body.origin ?? existingLoad.origin;
    const newDestination = body.destination ?? existingLoad.destination;
    geocoded = await geocodeLoadAddresses(newOrigin, newDestination);
  }

  try {
    const load = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Validate driverId if provided and not null
      if (body.driverId !== undefined && body.driverId !== null) {
        const driver = await tx.user.findFirst({
          where: { id: body.driverId, tenantId, role: 'DRIVER', isActive: true },
          select: { id: true },
        });
        if (!driver) {
          throw new Error('Driver not found or not active');
        }
      }

      const updateData: Record<string, unknown> = {};
      if (body.status !== undefined) updateData.status = body.status;
      if (body.driverId !== undefined) updateData.driverId = body.driverId;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.origin !== undefined) updateData.origin = body.origin;
      if (body.destination !== undefined) updateData.destination = body.destination;
      if (body.routeId !== undefined) updateData.routeId = body.routeId;

      // Include geocoded coordinates when addresses changed
      if (geocoded) {
        updateData.pickupLat = geocoded.pickupLat != null ? new Decimal(geocoded.pickupLat) : null;
        updateData.pickupLng = geocoded.pickupLng != null ? new Decimal(geocoded.pickupLng) : null;
        updateData.deliveryLat = geocoded.deliveryLat != null ? new Decimal(geocoded.deliveryLat) : null;
        updateData.deliveryLng = geocoded.deliveryLng != null ? new Decimal(geocoded.deliveryLng) : null;
      }

      const updatedLoad = await tx.load.update({
        where: { id },
        data: updateData,
        include: {
          customer: { select: { id: true, companyName: true, email: true, phone: true } },
          truck: { select: { id: true, make: true, model: true, licensePlate: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
          route: {
            include: { stops: { orderBy: { position: 'asc' } } },
          },
        },
      });

      // Handle routeId transitions and address changes that affect stops
      const oldRouteId = existingLoad!.routeId;
      const newRouteId = body.routeId !== undefined ? body.routeId : oldRouteId;

      const routeIdChanging = body.routeId !== undefined;
      const routeBeingSet = routeIdChanging && newRouteId && !oldRouteId;
      const routeBeingCleared = routeIdChanging && !newRouteId && oldRouteId;
      const routeBeingChanged = routeIdChanging && newRouteId && oldRouteId && newRouteId !== oldRouteId;
      const addressChangedWithRoute = addressChanged && newRouteId && !routeIdChanging;

      if (routeBeingSet && newRouteId) {
        // Load assigned to a route: create stops
        const loadForSync = {
          id,
          origin: body.origin ?? existingLoad!.origin,
          destination: body.destination ?? existingLoad!.destination,
          pickupLat: geocoded ? (geocoded.pickupLat != null ? new Decimal(geocoded.pickupLat) : null) : existingLoad!.pickupLat,
          pickupLng: geocoded ? (geocoded.pickupLng != null ? new Decimal(geocoded.pickupLng) : null) : existingLoad!.pickupLng,
          deliveryLat: geocoded ? (geocoded.deliveryLat != null ? new Decimal(geocoded.deliveryLat) : null) : existingLoad!.deliveryLat,
          deliveryLng: geocoded ? (geocoded.deliveryLng != null ? new Decimal(geocoded.deliveryLng) : null) : existingLoad!.deliveryLng,
        };
        await createRouteStopsForLoad(tx, { routeId: newRouteId, tenantId, load: loadForSync });
      } else if (routeBeingCleared && oldRouteId) {
        // Load removed from route: delete stops
        await deleteRouteStopsForLoad(tx, { routeId: oldRouteId, loadId: id });
      } else if (routeBeingChanged && newRouteId && oldRouteId) {
        // Load moving from one route to another: delete old stops, create new ones
        await deleteRouteStopsForLoad(tx, { routeId: oldRouteId, loadId: id });
        const loadForSync = {
          id,
          origin: body.origin ?? existingLoad!.origin,
          destination: body.destination ?? existingLoad!.destination,
          pickupLat: geocoded ? (geocoded.pickupLat != null ? new Decimal(geocoded.pickupLat) : null) : existingLoad!.pickupLat,
          pickupLng: geocoded ? (geocoded.pickupLng != null ? new Decimal(geocoded.pickupLng) : null) : existingLoad!.pickupLng,
          deliveryLat: geocoded ? (geocoded.deliveryLat != null ? new Decimal(geocoded.deliveryLat) : null) : existingLoad!.deliveryLat,
          deliveryLng: geocoded ? (geocoded.deliveryLng != null ? new Decimal(geocoded.deliveryLng) : null) : existingLoad!.deliveryLng,
        };
        await createRouteStopsForLoad(tx, { routeId: newRouteId, tenantId, load: loadForSync });
      } else if (addressChangedWithRoute && newRouteId && geocoded) {
        // Address changed while load stays on same route: rebuild stops with new coordinates
        await deleteRouteStopsForLoad(tx, { routeId: newRouteId, loadId: id });
        const loadForSync = {
          id,
          origin: body.origin ?? existingLoad!.origin,
          destination: body.destination ?? existingLoad!.destination,
          pickupLat: geocoded.pickupLat != null ? new Decimal(geocoded.pickupLat) : null,
          pickupLng: geocoded.pickupLng != null ? new Decimal(geocoded.pickupLng) : null,
          deliveryLat: geocoded.deliveryLat != null ? new Decimal(geocoded.deliveryLat) : null,
          deliveryLng: geocoded.deliveryLng != null ? new Decimal(geocoded.deliveryLng) : null,
        };
        await createRouteStopsForLoad(tx, { routeId: newRouteId, tenantId, load: loadForSync });
      }

      return updatedLoad;
    }, TX_OPTIONS);

    const stops = load.route?.stops ?? [];
    const driver = load.driver
      ? {
          id: load.driver.id,
          name:
            [load.driver.firstName, load.driver.lastName].filter(Boolean).join(' ') ||
            'Unknown Driver',
        }
      : null;

    return NextResponse.json({ load: { ...load, driver, stops } });
  } catch (err) {
    logger.error('[mobile/owner/loads/[id] PATCH] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
