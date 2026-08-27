import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
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

    const tenantPrisma = await getTenantPrisma();
    const [notifications, unreadCount] = await Promise.all([
      tenantPrisma.inAppNotification.findMany({
        where: {
          orgId,
          ...(unreadOnly ? { read: false } : {}),
          OR: userFilter,
        },
        /*
          Unread first, then newest — quick-561.

          This was `createdAt: 'desc'` alone, and on the demo tenant that meant
          the panel's 20 rows were 20 read `Dispatch Generated` notices, the
          newest of them from 16 June, while all five unread items — every one
          of them a blocked trip, a failed brake check or a new trip — sat
          outside the window. 71 notifications, 5 unread, none of the 5 visible.

          `read: 'asc'` puts false before true, so the unread set leads and the
          remainder of the budget still fills with the most recent read items.

          The LIMIT IS DELIBERATELY UNCHANGED at 20. It was never the problem —
          a smaller window would have hidden the same five items slightly
          faster. What was wrong was the order they competed in.

          Note this is a genuinely new capability, not a flag that already
          existed: `?unread=true` is a FILTER and is what the bell calls for its
          badge count. Nothing before this could sort.
        */
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      tenantPrisma.inAppNotification.count({
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
