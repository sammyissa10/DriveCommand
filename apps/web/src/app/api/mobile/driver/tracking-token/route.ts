import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/driver/tracking-token
 *
 * Returns the tracking token for the driver's active load.
 * The mobile app stores this in MMKV and includes it in GPS reports
 * as supplementary context (the GPS endpoint authenticates via Bearer token,
 * not this tracking token).
 *
 * Returns:
 *   { trackingToken: string | null }
 *
 * Requires: Authorization: Bearer <token> with DRIVER role
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
      return tx.load.findFirst({
        where: {
          driverId,
          tenantId,
          status: { in: ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
          archivedAt: null,
          trackingToken: { not: null },
        },
        select: { trackingToken: true },
        orderBy: { pickupDate: 'asc' },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ trackingToken: load?.trackingToken ?? null });
  } catch (err) {
    logger.error('[mobile/driver/tracking-token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
