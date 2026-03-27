import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/driver/messages
 *
 * Returns all messages for the authenticated driver's assigned loads,
 * plus any legacy messages the driver sent without a loadId.
 * Ordered by createdAt ascending (oldest first for chat display).
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
    const messages = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Find all loads assigned to this driver
      const driverLoads = await tx.load.findMany({
        where: { driverId, tenantId },
        select: { id: true },
      });

      const loadIds = driverLoads.map((l) => l.id);

      // Return messages scoped to the driver's loads, plus legacy unscoped messages from this driver
      return tx.fleetMessage.findMany({
        where: {
          tenantId,
          OR: [
            { loadId: { in: loadIds } },
            { loadId: null, senderId: driverId },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
    }, TX_OPTIONS);

    return NextResponse.json(messages);
  } catch (err) {
    console.error('[mobile/driver/messages] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/driver/messages
 *
 * Creates a new message from the authenticated driver.
 * Body: { body: string; loadId?: string }
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

  let payload: { body?: unknown; loadId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { body, loadId } = payload;

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
  }

  // Validate loadId type if provided
  const resolvedLoadId = loadId && typeof loadId === 'string' ? loadId : null;

  try {
    const message = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // If loadId is provided, verify the load exists and is assigned to this driver
      if (resolvedLoadId) {
        const load = await tx.load.findFirst({
          where: { id: resolvedLoadId, driverId },
        });
        if (!load) {
          return null;
        }
      }

      return tx.fleetMessage.create({
        data: {
          tenantId,
          senderId: driverId,
          senderRole: 'DRIVER',
          body: body.trim(),
          loadId: resolvedLoadId,
        },
      });
    }, TX_OPTIONS);

    if (!message) {
      return NextResponse.json({ error: 'Load not found or not assigned to you' }, { status: 403 });
    }

    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    console.error('[mobile/driver/messages] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
