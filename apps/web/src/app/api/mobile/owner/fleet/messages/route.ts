import { NextRequest, NextResponse, after } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToUser, sendPushToOrg } from '@/lib/notifications/send-push';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/fleet/messages
 *
 * Returns conversations grouped by recipient, each with the last message preview
 * and timestamp. Captures both sent and received messages for the owner, plus
 * load-scoped and route-scoped messages (loadId/routeId set, recipientId null).
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

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const { messages, nextCursor } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const rawMessages = await tx.fleetMessage.findMany({
        where: {
          tenantId,
          OR: [
            { senderId: userId },
            { recipientId: userId },
            { isBroadcast: true },
            { loadId: { not: null } },
            { routeId: { not: null } },
          ],
        },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          senderId: true,
          recipientId: true,
          loadId: true,
          routeId: true,
          body: true,
          isBroadcast: true,
          createdAt: true,
        },
      });

      let nextCursor: string | null = null;
      if (rawMessages.length > limit) {
        rawMessages.pop();
        nextCursor = rawMessages[rawMessages.length - 1]?.id ?? null;
      }

      return { messages: rawMessages, nextCursor };
    }, TX_OPTIONS);

    // Collect all participant IDs that need name resolution
    const participantIds = new Set<string>();
    for (const m of messages) {
      if (!m.isBroadcast && !m.loadId && !m.routeId) {
        if (m.senderId && m.senderId !== userId) participantIds.add(m.senderId);
        if (m.recipientId && m.recipientId !== userId) participantIds.add(m.recipientId);
      }
    }

    const nameMap = new Map<string, string>();
    if (participantIds.size > 0) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { id: { in: Array.from(participantIds) }, tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);

      for (const u of users) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
        nameMap.set(u.id, name);
      }
    }

    // Collect unique loadIds and routeIds for name resolution
    const loadIds = [...new Set(messages.filter((m) => m.loadId).map((m) => m.loadId as string))];
    const routeIds = [...new Set(messages.filter((m) => m.routeId).map((m) => m.routeId as string))];

    const loadNameMap = new Map<string, string>();
    const routeNameMap = new Map<string, string>();

    if (loadIds.length > 0) {
      const loads = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.load.findMany({
          where: { id: { in: loadIds }, tenantId },
          select: { id: true, loadNumber: true },
        });
      }, TX_OPTIONS);

      for (const l of loads) {
        loadNameMap.set(l.id, `Load #${l.loadNumber}`);
      }
    }

    if (routeIds.length > 0) {
      const routes = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.route.findMany({
          where: { id: { in: routeIds }, tenantId },
          select: { id: true, name: true, origin: true, destination: true },
        });
      }, TX_OPTIONS);

      for (const r of routes) {
        routeNameMap.set(r.id, r.name || `Route: ${r.origin} → ${r.destination}`);
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
      } else if (m.loadId && !m.recipientId) {
        // Load-scoped message: group by load
        key = `load:${m.loadId}`;
        recipientId = `load:${m.loadId}`;
        recipientName = loadNameMap.get(m.loadId) ?? 'Load Thread';
        isBroadcast = false;
      } else if (m.routeId && !m.recipientId) {
        // Route-scoped message: group by route
        key = `route:${m.routeId}`;
        recipientId = `route:${m.routeId}`;
        recipientName = routeNameMap.get(m.routeId) ?? 'Route Thread';
        isBroadcast = false;
      } else {
        // The "other" participant (direct message, possibly with loadId/routeId set)
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

    return NextResponse.json({ conversations: result, nextCursor });
  } catch (err) {
    logger.error('[mobile/owner/fleet/messages GET] error:', err);
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
        return tx.user.findFirst({
          where: { id: recipientId, tenantId },
          select: { firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);
      if (recipient) {
        recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || recipient.email || 'Driver';
      }
    }

    // Send push notifications via after() to survive serverless context freezing
    const pushBodyText = messageBody.slice(0, 100);

    if (isBroadcast) {
      after(() =>
        sendPushToOrg(tenantId, {
          title: 'New Message from Dispatcher',
          body: pushBodyText,
          data: { type: 'fleet_message', messageId: created.id },
        }, { role: 'DRIVER' })
      );
    } else if (recipientId) {
      after(() =>
        sendPushToUser(recipientId, {
          title: 'New Message from Dispatcher',
          body: pushBodyText,
          data: { type: 'fleet_message', messageId: created.id },
        })
      );
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
    logger.error('[mobile/owner/fleet/messages POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
