import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/messages/conversations
 *
 * Returns all conversations for the current owner/manager, grouped by the other party.
 * Each conversation includes: driverId, driverName, lastMessage, lastMessageAt,
 * unreadCount, and optionally dispatchId/dispatchNumber.
 *
 * Query params:
 *   ?tab=all|dispatches|drivers (default: all)
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
  const tab = searchParams.get('tab') ?? 'all';

  try {
    /**
     * @bypass_rls reason: server-side session-authed web route
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by getSession() above. tenantId comes from the verified session cookie.
     */
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
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          senderId: true,
          recipientId: true,
          senderRole: true,
          body: true,
          isBroadcast: true,
          dispatchId: true,
          readAt: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Collect participant IDs
    const participantIds = new Set<string>();
    for (const m of messages) {
      if (m.senderId !== userId) participantIds.add(m.senderId);
      if (m.recipientId && m.recipientId !== userId) participantIds.add(m.recipientId);
    }

    // Fetch user names
    const userMap = new Map<string, string>();
    if (participantIds.size > 0) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { id: { in: Array.from(participantIds) }, tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);
      for (const u of users) {
        userMap.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email);
      }
    }

    // Collect dispatch IDs for name resolution
    const dispatchIds = new Set<string>();
    for (const m of messages) {
      if (m.dispatchId) dispatchIds.add(m.dispatchId);
    }

    const dispatchMap = new Map<string, { dispatchNumber: string; status: string }>();
    if (dispatchIds.size > 0) {
      const dispatches = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.carrierDispatch.findMany({
          where: { id: { in: Array.from(dispatchIds) }, orgId: tenantId },
          select: { id: true, status: true, scheduledDeparture: true },
        });
      }, TX_OPTIONS);
      for (const d of dispatches) {
        dispatchMap.set(d.id, {
          dispatchNumber: d.scheduledDeparture
            ? new Date(d.scheduledDeparture).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : d.id.slice(0, 8),
          status: d.status,
        });
      }
    }

    // Group messages into conversations keyed by the other party
    interface ConvBucket {
      driverId: string;
      driverName: string;
      isBroadcast: boolean;
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
      dispatchId: string | null;
      dispatchNumber: string | null;
      hasDispatch: boolean;
    }

    const convMap = new Map<string, ConvBucket>();

    for (const m of messages) {
      let key: string;
      let driverId: string;
      let driverName: string;
      let isBroadcast: boolean;

      if (m.isBroadcast) {
        key = 'broadcast';
        driverId = 'broadcast';
        driverName = 'All Drivers';
        isBroadcast = true;
      } else {
        const otherId = m.senderId === userId ? m.recipientId : m.senderId;
        key = otherId ?? 'unknown';
        driverId = otherId ?? 'unknown';
        driverName = otherId ? (userMap.get(otherId) ?? 'Driver') : 'Driver';
        isBroadcast = false;
      }

      const msgAt = m.createdAt.toISOString();
      const preview = m.body.length > 60 ? m.body.slice(0, 60) + '…' : m.body;
      const isUnread = !m.readAt && m.recipientId === userId;

      const existing = convMap.get(key);
      if (!existing) {
        const dispatchInfo = m.dispatchId ? dispatchMap.get(m.dispatchId) : null;
        convMap.set(key, {
          driverId,
          driverName,
          isBroadcast,
          lastMessage: preview,
          lastMessageAt: msgAt,
          unreadCount: isUnread ? 1 : 0,
          dispatchId: m.dispatchId ?? null,
          dispatchNumber: dispatchInfo?.dispatchNumber ?? null,
          hasDispatch: !!m.dispatchId,
        });
      } else {
        // Messages are ordered desc, so first = most recent
        if (isUnread) existing.unreadCount += 1;
        if (m.dispatchId && !existing.dispatchId) {
          existing.dispatchId = m.dispatchId;
          const dispatchInfo = dispatchMap.get(m.dispatchId);
          existing.dispatchNumber = dispatchInfo?.dispatchNumber ?? null;
          existing.hasDispatch = true;
        }
      }
    }

    let conversations = Array.from(convMap.values()).sort(
      (a, b) => (a.lastMessageAt > b.lastMessageAt ? -1 : 1)
    );

    // Filter by tab
    if (tab === 'dispatches') {
      conversations = conversations.filter((c) => c.hasDispatch);
    }
    // tab === 'drivers' or 'all' — return all

    return NextResponse.json({ conversations });
  } catch (err) {
    logger.error('[api/v1/messages/conversations GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
