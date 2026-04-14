import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ recipientId: string }> };

/**
 * GET /api/mobile/owner/fleet/messages/[recipientId]
 *
 * Returns the full message thread between the owner and the specified recipient.
 * Special cases:
 *   - recipientId = "broadcast" returns all broadcast messages
 *   - recipientId = "load:{uuid}" returns all messages for that load
 *   - recipientId = "route:{uuid}" returns all messages for that route
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId, userId } = auth;
  const { recipientId } = await params;
  const isBroadcastThread = recipientId === 'broadcast';
  const isLoadThread = recipientId.startsWith('load:');
  const isRouteThread = recipientId.startsWith('route:');

  try {
    let recipientName = 'All Drivers';

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

      if (isLoadThread) {
        const loadId = recipientId.slice(5); // after "load:"
        return tx.fleetMessage.findMany({
          where: { tenantId, loadId },
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

      if (isRouteThread) {
        const routeId = recipientId.slice(6); // after "route:"
        return tx.fleetMessage.findMany({
          where: { tenantId, routeId },
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
          where: { id: { in: senderIds }, tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);

      for (const u of users) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Driver';
        nameMap.set(u.id, name);
      }
    }

    // Resolve recipient name
    if (isLoadThread) {
      const loadId = recipientId.slice(5);
      const load = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.load.findFirst({
          where: { id: loadId, tenantId },
          select: { loadNumber: true },
        });
      }, TX_OPTIONS);
      recipientName = load ? `Load #${load.loadNumber}` : 'Load Thread';
    } else if (isRouteThread) {
      const routeId = recipientId.slice(6);
      const route = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.route.findFirst({
          where: { id: routeId, tenantId },
          select: { name: true, origin: true, destination: true },
        });
      }, TX_OPTIONS);
      recipientName = route
        ? route.name || `Route: ${route.origin} → ${route.destination}`
        : 'Route Thread';
    } else if (!isBroadcastThread) {
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

    const result = messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderRole: m.senderRole,
      senderName: nameMap.get(m.senderId) ?? 'Driver',
      body: m.body,
      isBroadcast: m.isBroadcast,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ messages: result, recipientName });
  } catch (err) {
    logger.error('[mobile/owner/fleet/messages/[recipientId] GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/fleet/messages/[recipientId]
 *
 * Creates a new fleet message in this thread and sends a push notification.
 * Special cases:
 *   - recipientId = "broadcast" sends a broadcast message
 *   - recipientId = "load:{uuid}" creates a message with loadId set (no push)
 *   - recipientId = "route:{uuid}" creates a message with routeId set (no push)
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

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId, userId } = auth;
  const { recipientId } = await params;
  const isBroadcast = recipientId === 'broadcast';
  const isLoadThread = recipientId.startsWith('load:');
  const isRouteThread = recipientId.startsWith('route:');

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
      return tx.user.findFirst({
        where: { id: userId, tenantId },
        select: { firstName: true, lastName: true, email: true },
      });
    }, TX_OPTIONS);

    const senderName = sender
      ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.email || 'Owner'
      : 'Owner';

    // Build create data based on thread type
    type MessageCreateData = {
      tenantId: string;
      senderId: string;
      senderRole: string;
      body: string;
      recipientId: string | null;
      isBroadcast: boolean;
      loadId?: string;
      routeId?: string;
    };

    const createData: MessageCreateData = {
      tenantId,
      senderId: userId,
      senderRole: 'OWNER',
      body: messageBody,
      recipientId: null,
      isBroadcast: false,
    };

    if (isBroadcast) {
      createData.isBroadcast = true;
    } else if (isLoadThread) {
      createData.loadId = recipientId.slice(5); // after "load:"
    } else if (isRouteThread) {
      createData.routeId = recipientId.slice(6); // after "route:"
    } else {
      createData.recipientId = recipientId;
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.fleetMessage.create({
        data: createData,
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
    // Load/route threads have no single recipient so skip push for those
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
    } else if (!isLoadThread && !isRouteThread) {
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
    logger.error('[mobile/owner/fleet/messages/[recipientId] POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
