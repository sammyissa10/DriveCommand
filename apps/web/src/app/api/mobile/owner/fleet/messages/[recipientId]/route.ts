import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToUser } from '@/lib/notifications/send-push';

type Params = { params: Promise<{ recipientId: string }> };

/**
 * GET /api/mobile/owner/fleet/messages/[recipientId]
 *
 * Returns the full message thread between the owner and the specified recipient.
 * Special case: recipientId = "broadcast" returns all broadcast messages.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const { tenantId, userId } = auth;
  const { recipientId } = await params;
  const isBroadcastThread = recipientId === 'broadcast';

  try {
    const messages = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      if (isBroadcastThread) {
        return tx.fleetMessage.findMany({
          where: { tenantId, isBroadcast: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderId: true,
            senderRole: true,
            body: true,
            isBroadcast: true,
            createdAt: true,
          },
        });
      }

      return tx.fleetMessage.findMany({
        where: {
          tenantId,
          isBroadcast: false,
          OR: [
            { senderId: userId, recipientId },
            { senderId: recipientId, recipientId: userId },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          body: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Collect all sender IDs for name resolution
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const nameMap = new Map<string, string>();

    if (senderIds.length > 0) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, firstName: true, lastName: true },
        });
      }, TX_OPTIONS);

      for (const u of users) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unknown';
        nameMap.set(u.id, name);
      }
    }

    // Resolve recipient name
    let recipientName = 'All Drivers';
    if (!isBroadcastThread) {
      const recipient = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findUnique({
          where: { id: recipientId },
          select: { firstName: true, lastName: true },
        });
      }, TX_OPTIONS);
      if (recipient) {
        recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || 'Unknown Driver';
      }
    }

    const result = messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderRole: m.senderRole,
      senderName: nameMap.get(m.senderId) ?? 'Unknown',
      body: m.body,
      isBroadcast: m.isBroadcast,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ messages: result, recipientName });
  } catch (err) {
    console.error('[mobile/owner/fleet/messages/[recipientId] GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/fleet/messages/[recipientId]
 *
 * Creates a new fleet message in this thread and sends a push notification.
 * Special case: recipientId = "broadcast" sends a broadcast message.
 *
 * Body: { body: string }
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const { tenantId, userId } = auth;
  const { recipientId } = await params;
  const isBroadcast = recipientId === 'broadcast';

  let reqBody: unknown;
  try {
    reqBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = reqBody as Record<string, unknown>;

  if (typeof payload.body !== 'string' || payload.body.trim().length === 0) {
    return NextResponse.json({ error: 'body is required and must be a non-empty string' }, { status: 400 });
  }
  if (payload.body.length > 500) {
    return NextResponse.json({ error: 'body must be 500 characters or fewer' }, { status: 400 });
  }

  const messageBody = payload.body.trim();

  try {
    // Fetch sender name for response
    const sender = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
    }, TX_OPTIONS);

    const senderName = sender
      ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Owner'
      : 'Owner';

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.fleetMessage.create({
        data: {
          tenantId,
          senderId: userId,
          senderRole: 'OWNER',
          body: messageBody,
          recipientId: isBroadcast ? null : recipientId,
          isBroadcast,
        },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          body: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Send push notifications — fire and forget
    const pushTitle = 'Fleet Message';
    const pushBodyText = messageBody.slice(0, 100);

    if (isBroadcast) {
      const drivers = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { tenantId, role: 'DRIVER', isActive: true },
          select: { id: true },
        });
      }, TX_OPTIONS);

      for (const driver of drivers) {
        void sendPushToUser(driver.id, { title: pushTitle, body: pushBodyText });
      }
    } else {
      void sendPushToUser(recipientId, { title: pushTitle, body: pushBodyText });
    }

    const message = {
      id: created.id,
      senderId: created.senderId,
      senderRole: created.senderRole,
      senderName,
      body: created.body,
      isBroadcast: created.isBroadcast,
      createdAt: created.createdAt.toISOString(),
    };

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error('[mobile/owner/fleet/messages/[recipientId] POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
