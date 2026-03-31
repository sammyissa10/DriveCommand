import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/driver/loads?status=active|history
 *
 * Returns the authenticated driver's loads filtered by status group:
 * - active (default): PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT
 * - history: DELIVERED, INVOICED, CANCELLED
 *
 * Each load includes customer name for display in the card.
 * Sorted by updatedAt descending (most recently changed first).
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

  // Parse status filter from query param
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') ?? 'active';

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

  const activeStatuses = ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] as const;
  const historyStatuses = ['DELIVERED', 'INVOICED', 'CANCELLED'] as const;

  const statusFilter =
    statusParam === 'history' ? [...historyStatuses] : [...activeStatuses];

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const { loads, total } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const where = {
        driverId,
        tenantId,
        status: { in: statusFilter },
        archivedAt: null,
      };

      const [items, count] = await Promise.all([
        tx.load.findMany({
          where,
          include: {
            customer: { select: { id: true, companyName: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
          skip: (page - 1) * limit,
        }),
        tx.load.count({ where }),
      ]);

      return { loads: items, total: count };
    }, TX_OPTIONS);

    return NextResponse.json({
      loads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error('[mobile/driver/loads] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
