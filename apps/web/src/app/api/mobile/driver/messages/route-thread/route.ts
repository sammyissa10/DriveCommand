import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/driver/messages/route-thread?routeId=<id>
 *
 * Returns messages scoped to a specific route, ordered oldest-first.
 * Verifies the route belongs to the authenticated driver.
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

  const { searchParams } = new URL(req.url);
  const routeId = searchParams.get('routeId');

  if (!routeId) {
    return NextResponse.json({ error: 'routeId query param is required' }, { status: 400 });
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const messages = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify the route belongs to this driver
      const route = await tx.route.findFirst({
        where: { id: routeId, driverId, tenantId },
        select: { id: true },
      });

      if (!route) {
        return null;
      }

      return tx.fleetMessage.findMany({
        where: { routeId, tenantId },
        orderBy: { createdAt: 'asc' },
      });
    }, TX_OPTIONS);

    if (messages === null) {
      return NextResponse.json({ error: 'Route not found or not assigned to you' }, { status: 403 });
    }

    return NextResponse.json(messages);
  } catch (err) {
    logger.error('[mobile/driver/messages/route-thread] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/driver/messages/route-thread
 *
 * Creates a new route-scoped message from the authenticated driver.
 * Body: { routeId: string; body: string }
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { driverId, tenantId } = auth;

  let payload: { routeId?: unknown; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { routeId, body } = payload;

  if (!routeId || typeof routeId !== 'string') {
    return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
  }

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
  }

  try {
    const message = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify the route belongs to this driver
      const route = await tx.route.findFirst({
        where: { id: routeId, driverId, tenantId },
        select: { id: true },
      });

      if (!route) {
        return null;
      }

      return tx.fleetMessage.create({
        data: {
          tenantId,
          routeId,
          senderId: driverId,
          senderRole: 'DRIVER',
          body: body.trim(),
        },
      });
    }, TX_OPTIONS);

    if (!message) {
      return NextResponse.json({ error: 'Route not found or not assigned to you' }, { status: 403 });
    }

    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    logger.error('[mobile/driver/messages/route-thread] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
