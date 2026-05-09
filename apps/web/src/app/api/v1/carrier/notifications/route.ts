import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const unreadOnly = searchParams.get('unread') === 'true';
    const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Math.min(Math.max(1, rawLimit), 50);

    // Users see org-wide notifications (userId null) AND their own targeted notifications
    const userFilter = [{ userId: null as string | null }, { userId: session.userId }];

    const [notifications, unreadCount] = await Promise.all([
      prisma.inAppNotification.findMany({
        where: {
          orgId,
          ...(unreadOnly ? { read: false } : {}),
          OR: userFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.inAppNotification.count({
        where: {
          orgId,
          read: false,
          OR: userFilter,
        },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    logger.error('GET /api/v1/carrier/notifications: failed', { orgId: session.tenantId, error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
