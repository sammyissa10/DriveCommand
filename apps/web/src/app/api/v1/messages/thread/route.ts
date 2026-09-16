import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/messages/thread
 *
 * Returns messages for a conversation thread. Marks unread messages as read.
 *
 * Query params:
 *   ?driverId=<uuid>    - required (unless dispatchId-only mode)
 *   ?dispatchId=<uuid>  - optional, filters to dispatch-scoped messages
 *
 * If only dispatchId is provided (no driverId), returns all messages for that dispatch.
 *
 * Requires: session with OWNER or MANAGER role.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'OWNER' && session.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tenantId, userId } = session;
  const { searchParams } = new URL(req.url);
  const driverId = searchParams.get('driverId');
  const dispatchId = searchParams.get('dispatchId');

  if (!driverId && !dispatchId) {
    return NextResponse.json({ error: 'driverId or dispatchId is required' }, { status: 400 });
  }

  try {
    /*
     * quick-620: tenant-scoped client, acquired from the verified session's tenantId.
     * userId is deliberately NOT passed — it would drive the audit-columns extension to
     * start writing createdById on FleetMessage, a behaviour change this routing task
     * declines to make.
     * The mark-read updateMany gains a tenantId predicate from the extension; its ids
     * come from the tenantId-filtered read just above, so no row it would have updated
     * is hidden.
     * Every where clause below is unchanged: RLS is the second layer, not a
     * replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);

    // Build where clause
    let whereClause: Record<string, unknown>;

    if (driverId && dispatchId) {
      // Specific driver + dispatch conversation
      whereClause = {
        tenantId,
        dispatchId,
        OR: [
          { senderId: userId, recipientId: driverId },
          { senderId: driverId, recipientId: userId },
          { senderId: driverId, recipientId: null },
          { isBroadcast: true },
        ],
      };
    } else if (driverId) {
      // All messages between owner and driver
      whereClause = {
        tenantId,
        OR: [
          { senderId: userId, recipientId: driverId },
          { senderId: driverId, recipientId: userId },
          { senderId: driverId, recipientId: null },
          { isBroadcast: true },
        ],
      };
    } else {
      // Dispatch-only mode: all messages for this dispatch
      whereClause = {
        tenantId,
        dispatchId,
      };
    }

    const messages = await tenantPrisma.$transaction(async (tx) => {
      return tx.fleetMessage.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          recipientId: true,
          body: true,
          isBroadcast: true,
          dispatchId: true,
          audioUrl: true,
          readAt: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Mark unread messages as read (messages sent to this owner, not yet read)
    const unreadIds = messages
      .filter((m) => !m.readAt && m.recipientId === userId)
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      await tenantPrisma.$transaction(async (tx) => {
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
      const users = await tenantPrisma.$transaction(async (tx) => {
        return tx.user.findMany({
          where: { id: { in: Array.from(senderIds) }, tenantId },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
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
      audioUrl: m.audioUrl ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      isOwn: m.senderId === userId,
    }));

    return NextResponse.json({ messages: result });
  } catch (err) {
    logger.error('[api/v1/messages/thread GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
