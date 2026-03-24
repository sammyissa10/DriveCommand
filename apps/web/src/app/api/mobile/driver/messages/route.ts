import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/driver/messages
 *
 * Returns all messages for the authenticated driver's tenant,
 * ordered by createdAt ascending (oldest first for chat display).
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { tenantId } = auth;

  try {
    const messages = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.fleetMessage.findMany({
        where: { tenantId },
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
 * Body: { body: string }
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { driverId, tenantId } = auth;

  let payload: { body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { body } = payload;

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
  }

  try {
    const message = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.fleetMessage.create({
        data: {
          tenantId,
          senderId: driverId,
          senderRole: 'DRIVER',
          body: body.trim(),
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    console.error('[mobile/driver/messages] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
