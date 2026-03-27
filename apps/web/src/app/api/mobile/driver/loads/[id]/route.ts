import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/driver/loads/[id]
 *
 * Returns full load detail including:
 * - stops via route (RouteStop[] ordered by position ASC)
 * - truck (id, make, model, licensePlate)
 * - customer (id, companyName, email, phone)
 *
 * Security: verifies load.driverId === authenticated driverId.
 * Returns 403 if the load belongs to another driver.
 * Returns 404 if the load doesn't exist.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { id } = await params;
  const { driverId, tenantId } = auth;

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
          // Stops come through the Route relation
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

    // Security: verify this load belongs to the authenticated driver
    if (load.driverId !== driverId) {
      return forbiddenResponse();
    }

    // Flatten stops to top-level for convenience (from route.stops)
    const stops = load.route?.stops ?? [];

    return NextResponse.json({
      ...load,
      stops,
    });
  } catch (err) {
    console.error('[mobile/driver/loads/[id]] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
