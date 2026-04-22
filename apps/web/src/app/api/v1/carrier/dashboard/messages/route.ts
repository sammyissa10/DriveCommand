import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/carrier/dashboard/messages
 *
 * Returns last 5 fleet messages for the carrier tenant.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const messages = await prisma.fleetMessage.findMany({
      where: { tenantId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (messages.length === 0) {
      return NextResponse.json([]);
    }

    // Batch-resolve sender names
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const users = await prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const userMap = new Map(
      users.map((u) => [
        u.id,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ])
    );

    const result = messages.map((m) => ({
      id: m.id,
      senderName: userMap.get(m.senderId) ?? 'Unknown',
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      isBroadcast: m.isBroadcast,
    }));

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[/api/v1/carrier/dashboard/messages] GET failed:', err);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

/**
 * POST /api/v1/carrier/dashboard/messages
 *
 * Send a broadcast or targeted fleet message.
 * Body: { body: string, recipientId?: string }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const json = await req.json();
    const body = (json?.body ?? '').trim();
    const recipientId: string | undefined = json?.recipientId;

    if (!body) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    const message = await prisma.fleetMessage.create({
      data: {
        tenantId: orgId,
        senderId: session.userId,
        senderRole: 'owner',
        body,
        isBroadcast: !recipientId,
        recipientId: recipientId ?? null,
      },
    });

    return NextResponse.json({
      id: message.id,
      senderName: `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || 'You',
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      isBroadcast: message.isBroadcast,
    });
  } catch (err) {
    logger.error('[/api/v1/carrier/dashboard/messages] POST failed:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
