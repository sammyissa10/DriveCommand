import { NextRequest, NextResponse, after } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { logger } from '@/lib/logger';

/**
 * POST /api/v1/messages/send
 *
 * Send a direct message to a specific driver, optionally scoped to a dispatch.
 *
 * Body:
 *   { recipientId: string, body: string, dispatchId?: string }
 *
 * Requires: session with OWNER or MANAGER role.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'OWNER' && session.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tenantId, userId, role } = session;

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

  const recipientId = typeof payload.recipientId === 'string' ? payload.recipientId : null;
  if (!recipientId) {
    return NextResponse.json({ error: 'recipientId is required' }, { status: 400 });
  }

  const dispatchId = typeof payload.dispatchId === 'string' ? payload.dispatchId : null;
  const messageBody = payload.body.toString().trim();

  try {
    /**
     * @bypass_rls reason: server-side session-authed web route
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by getSession() above.
     */

    // Verify recipient exists in tenant
    const recipient = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findFirst({
        where: { id: recipientId, tenantId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
    }, TX_OPTIONS);

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient not found in tenant' }, { status: 404 });
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.create({
        data: {
          tenantId,
          senderId: userId,
          senderRole: role,
          body: messageBody,
          recipientId,
          dispatchId: dispatchId ?? undefined,
          isBroadcast: false,
        },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          recipientId: true,
          body: true,
          dispatchId: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Send push notification via after() — survives serverless context freezing
    const pushBody = messageBody.slice(0, 100);
    after(() =>
      sendPushToUser(recipientId, {
        title: 'New Message from Dispatch',
        body: pushBody,
        data: { type: 'fleet_message', messageId: created.id },
      })
    );

    return NextResponse.json(
      {
        message: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          isOwn: true,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error('[api/v1/messages/send POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
