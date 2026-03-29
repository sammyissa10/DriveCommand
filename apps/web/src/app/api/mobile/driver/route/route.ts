import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/driver/route
 *
 * Returns the authenticated driver's currently assigned route that is NOT completed.
 * Includes related loads (summary) and truck info.
 *
 * Returns { route: null } with 200 if no active route is assigned.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { driverId, tenantId } = auth;

  try {
    const route = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.route.findFirst({
        where: {
          driverId,
          tenantId,
          status: { not: 'COMPLETED' },
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          origin: true,
          destination: true,
          status: true,
          scheduledDate: true,
          completedAt: true,
          loads: {
            select: {
              id: true,
              loadNumber: true,
              origin: true,
              destination: true,
              status: true,
            },
          },
          truck: {
            select: {
              make: true,
              model: true,
              year: true,
              vin: true,
              licensePlate: true,
            },
          },
        },
        orderBy: { scheduledDate: 'asc' },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ route: route ?? null });
  } catch (err) {
    console.error('[mobile/driver/route] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
