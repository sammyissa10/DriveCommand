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
