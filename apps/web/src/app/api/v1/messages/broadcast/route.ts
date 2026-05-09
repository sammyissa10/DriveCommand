import { NextRequest, NextResponse, after } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToOrg } from '@/lib/notifications/send-push';
import { logger } from '@/lib/logger';

/**
 * POST /api/v1/messages/broadcast
 *
 * Broadcast a message to all drivers in the tenant.
 * Sends push notification to all DRIVER users in the org.
 *
 * Body:
 *   { body: string }
 *
 * Requires: OWNER role only.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const { tenantId, userId } = session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;

  if (typeof payload.body !== 'string' || payload.body.trim().length === 0) {
    return NextResponse.json({ error: 'body is required and must be non-empty' }, { status: 400 });
  }
  if (payload.body.toString().length > 2000) {
    return NextResponse.json({ error: 'body must be 2000 characters or fewer' }, { status: 400 });
  }

  const messageBody = payload.body.toString().trim();

  try {
    /**
     * @bypass_rls reason: server-side session-authed web route
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by getSession() (OWNER role only) above.
     */
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.create({
        data: {
          tenantId,
          senderId: userId,
          senderRole: 'OWNER',
          body: messageBody,
          isBroadcast: true,
          recipientId: null,
        },
        select: {
          id: true,
          body: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Send broadcast push notification via after()
    const pushBody = messageBody.slice(0, 100);
    after(() =>
      sendPushToOrg(
        tenantId,
        {
          title: 'Broadcast Message',
          body: pushBody,
          data: { type: 'fleet_broadcast', messageId: created.id },
        },
        { role: 'DRIVER' }
      )
    );

    return NextResponse.json(
      {
        message: {
          ...created,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error('[api/v1/messages/broadcast POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
