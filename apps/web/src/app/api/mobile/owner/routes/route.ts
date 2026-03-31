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
