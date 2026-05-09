import { NextRequest, NextResponse, after } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { createMessageNotification } from '@/lib/carrier/in-app-notifications';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/carrier/stops/[id]/messages
 *
 * Returns all messages scoped to a specific stop. Marks unread messages as read.
 * Requires: session with OWNER or MANAGER role.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'OWNER' && session.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tenantId, userId } = session;
  const { id: stopId } = await params;

  try {
    /**
     * @bypass_rls reason: server-side session-authed web route
     * SCOPE: Only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by getSession() above; stop ownership verified via dispatch.orgId.
     */

    // Verify stop belongs to this tenant
    const stop = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.carrierStop.findFirst({
        where: { id: stopId, dispatch: { orgId: tenantId } },
        select: { id: true, dispatchId: true },
      });
    }, TX_OPTIONS);

    if (!stop) return NextResponse.json({ error: 'Stop not found' }, { status: 404 });

    const messages = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.findMany({
        where: { tenantId, stopId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          recipientId: true,
          body: true,
          isBroadcast: true,
          dispatchId: true,
          stopId: true,
          audioUrl: true,
          readAt: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Mark unread messages as read (messages sent to this owner/manager)
    const unreadIds = messages
      .filter((m) => !m.readAt && m.recipientId === userId)
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        await tx.fleetMessage.updateMany({
          where: { id: { in: unreadIds } },
          data: { readAt: new Date() },
        });
      }, TX_OPTIONS);
    }

    // Resolve sender names
    const senderIds = new Set(messages.map((m) => m.senderId));
    const senderMap = new Map<string, string>();
    if (senderIds.size > 0) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { id: { in: Array.from(senderIds) }, tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);
      for (const u of users) {
        senderMap.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email);
      }
    }

    const result = messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: senderMap.get(m.senderId) ?? 'Unknown',
      senderRole: m.senderRole,
      recipientId: m.recipientId,
      body: m.body,
      isBroadcast: m.isBroadcast,
      dispatchId: m.dispatchId,
      stopId: m.stopId,
      audioUrl: m.audioUrl ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      isOwn: m.senderId === userId,
    }));

    return NextResponse.json({ messages: result });
  } catch (err) {
    logger.error('[api/v1/carrier/stops/[id]/messages GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/v1/carrier/stops/[id]/messages
 *
 * Send a message scoped to a specific stop. Recipient is the assigned primary driver.
 * Requires: session with OWNER or MANAGER role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'OWNER' && session.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tenantId, userId, role, firstName, lastName } = session;
  const senderName = [firstName, lastName].filter(Boolean).join(' ') || 'Dispatch';
  const { id: stopId } = await params;

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
  const audioUrl = typeof payload.audioUrl === 'string' && payload.audioUrl.trim() ? payload.audioUrl.trim() : null;

  try {
    /**
     * @bypass_rls reason: server-side session-authed web route
     * SCOPE: Only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by getSession() above.
     */

    // Resolve stop -> dispatch -> primaryDriver -> userId
    const stopData = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.carrierStop.findFirst({
        where: { id: stopId, dispatch: { orgId: tenantId } },
        select: {
          id: true,
          dispatchId: true,
          dispatch: {
            select: {
              primaryDriverId: true,
              primaryDriver: {
                select: { userId: true },
              },
            },
          },
        },
      });
    }, TX_OPTIONS);

    if (!stopData) return NextResponse.json({ error: 'Stop not found' }, { status: 404 });

    const recipientUserId = stopData.dispatch.primaryDriver?.userId ?? null;
    if (!recipientUserId) {
      return NextResponse.json(
        { error: 'Driver does not have an app account — messaging unavailable' },
        { status: 422 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.create({
        data: {
          tenantId,
          senderId: userId,
          senderRole: role,
          body: messageBody,
          recipientId: recipientUserId,
          stopId,
          dispatchId: stopData.dispatchId,
          isBroadcast: false,
          ...(audioUrl ? { audioUrl } : {}),
        },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          recipientId: true,
          body: true,
          dispatchId: true,
          stopId: true,
          audioUrl: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    const pushBody = messageBody.slice(0, 100);
    after(() =>
      sendPushToUser(recipientUserId, {
        title: `New Message from ${senderName}`,
        body: pushBody,
        data: { type: 'fleet_message', messageId: created.id },
      })
    );
    after(() =>
      createMessageNotification({
        orgId: tenantId,
        recipientUserId,
        senderName,
        messagePreview: messageBody,
        dispatchId: created.dispatchId ?? undefined,
        messageId: created.id,
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
    logger.error('[api/v1/carrier/stops/[id]/messages POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
