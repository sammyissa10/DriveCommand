import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/owner/fleet/messages
 *
 * Returns conversations grouped by recipient, each with the last message preview
 * and timestamp. Captures both sent and received messages for the owner.
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

  const { tenantId, userId } = auth;

  try {
    const messages = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.fleetMessage.findMany({
        where: {
          tenantId,
          OR: [
            { senderId: userId },
            { recipientId: userId },
            { isBroadcast: true },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          senderId: true,
          recipientId: true,
          body: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Collect all participant IDs that need name resolution
    const participantIds = new Set<string>();
    for (const m of messages) {
      if (!m.isBroadcast) {
        if (m.senderId && m.senderId !== userId) participantIds.add(m.senderId);
        if (m.recipientId && m.recipientId !== userId) participantIds.add(m.recipientId);
      }
    }

    const nameMap = new Map<string, string>();
    if (participantIds.size > 0) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { id: { in: Array.from(participantIds) } },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);

      for (const u of users) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
        nameMap.set(u.id, name);
      }
    }

    // Group messages into conversations keyed by the other participant
    interface ConvBucket {
      recipientId: string | null;
      recipientName: string;
      isBroadcast: boolean;
      lastMessage: string;
      lastMessageAt: string;
    }

    const convMap = new Map<string, ConvBucket>();

    for (const m of messages) {
      let key: string;
      let recipientId: string | null;
      let recipientName: string;
      let isBroadcast: boolean;

      if (m.isBroadcast) {
        key = 'broadcast';
        recipientId = null;
        recipientName = 'All Drivers';
        isBroadcast = true;
      } else {
        // The "other" participant
        const otherId = m.senderId === userId ? m.recipientId : m.senderId;
        key = otherId ?? 'unknown';
        recipientId = otherId ?? null;
        recipientName = otherId ? (nameMap.get(otherId) ?? 'Driver') : 'Driver';
        isBroadcast = false;
      }

      const existing = convMap.get(key);
      const msgAt = m.createdAt.toISOString();
      const preview = m.body.length > 100 ? m.body.slice(0, 100) + '…' : m.body;

      if (!existing || msgAt > existing.lastMessageAt) {
        convMap.set(key, {
          recipientId,
          recipientName,
          isBroadcast,
          lastMessage: preview,
          lastMessageAt: msgAt,
        });
      }
    }

    // Sort by lastMessageAt descending
    const conversations = Array.from(convMap.values()).sort(
      (a, b) => (a.lastMessageAt > b.lastMessageAt ? -1 : 1)
    );

    const result = conversations.map((c) => ({
      recipientId: c.recipientId,
      recipientName: c.recipientName,
      isBroadcast: c.isBroadcast,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: 0,
    }));

    return NextResponse.json({ conversations: result });
  } catch (err) {
    console.error('[mobile/owner/fleet/messages GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/fleet/messages
 *
 * Creates a new fleet message and sends a push notification to recipient(s).
 *
 * Body:
 *   { recipientId?: string, body: string, isBroadcast?: boolean }
 *
 * - If isBroadcast is true: sends push to all active DRIVER users in tenant
 * - If isBroadcast is false: recipientId is required, sends push to that driver
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId, userId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;

  // Validate message body
  if (typeof payload.body !== 'string' || payload.body.trim().length === 0) {
    return NextResponse.json({ error: 'body is required and must be a non-empty string' }, { status: 400 });
  }
  if (payload.body.length > 500) {
    return NextResponse.json({ error: 'body must be 500 characters or fewer' }, { status: 400 });
  }

  const messageBody = payload.body.trim();
  const isBroadcast = payload.isBroadcast === true;
  const recipientId = typeof payload.recipientId === 'string' ? payload.recipientId : null;

  // Validate targeting
  if (!isBroadcast && !recipientId) {
    return NextResponse.json(
      { error: 'recipientId is required when isBroadcast is false' },
      { status: 400 }
    );
  }

  try {
    // Create the fleet message record
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
          recipientId: true,
          body: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Resolve recipient name for response
    let recipientName = 'All Drivers';
    if (!isBroadcast && recipientId) {
      const recipient = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findUnique({
          where: { id: recipientId },
          select: { firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);
      if (recipient) {
        recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || recipient.email || 'Driver';
      }
    }

    // Send push notifications — fire and forget
    const pushTitle = 'Fleet Message';
    const pushBody = messageBody.slice(0, 100);

    if (isBroadcast) {
      // Fetch all active drivers in tenant then send push to each
      const drivers = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { tenantId, role: 'DRIVER', isActive: true },
          select: { id: true },
        });
      }, TX_OPTIONS);

      for (const driver of drivers) {
        void sendPushToUser(driver.id, { title: pushTitle, body: pushBody });
      }
    } else if (recipientId) {
      void sendPushToUser(recipientId, { title: pushTitle, body: pushBody });
    }

    const message = {
      id: created.id,
      recipientName,
      body: created.body,
      isBroadcast: created.isBroadcast,
      createdAt: created.createdAt.toISOString(),
    };

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error('[mobile/owner/fleet/messages POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
