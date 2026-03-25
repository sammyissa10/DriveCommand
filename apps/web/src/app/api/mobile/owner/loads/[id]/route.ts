import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

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

  const { id } = await params;
  const { tenantId } = auth;

  try {
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
    console.error('[mobile/owner/loads/[id]] error:', err);
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

  const { id } = await params;
  const { tenantId } = auth;

  let body: { status?: string; driverId?: string | null; notes?: string };
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

  try {
    const load = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify load belongs to tenant
      const existing = await tx.load.findUnique({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) {
        throw new Error('NOT_FOUND');
      }

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

      return tx.load.update({
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
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Load not found' }, { status: 404 });
    }
    console.error('[mobile/owner/loads/[id] PATCH] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
