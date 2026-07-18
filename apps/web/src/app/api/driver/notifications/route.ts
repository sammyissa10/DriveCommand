import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

/**
 * GET /api/driver/notifications
 *
 * Returns in-app notifications for the authenticated driver.
 * Filters to driver-relevant types: dispatch_assigned, fleet_message.
 *
 * Query params:
 *   ?unread=true  — only return unread notifications
 *   ?limit=20     — max results (capped at 50)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'DRIVER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const unreadOnly = searchParams.get('unread') === 'true';
    const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Math.min(Math.max(1, rawLimit), 50);

    // Driver sees org-wide notifications (userId null) AND their own targeted notifications
    const userFilter = [{ userId: null as string | null }, { userId: session.userId }];

    // Driver-relevant notification types (dispatch_assigned is the primary driver notification type)
    // Note: fleet_message is not an InAppNotificationType enum value — drivers get dispatch notifications
    const driverTypes = ['dispatch_assigned'] as const;

    const tenantPrisma = await getTenantPrisma();
    const [notifications, unreadCount] = await Promise.all([
      tenantPrisma.inAppNotification.findMany({
        where: {
          orgId,
          type: { in: [...driverTypes] },
          ...(unreadOnly ? { read: false } : {}),
          OR: userFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      tenantPrisma.inAppNotification.count({
        where: {
          orgId,
          type: { in: [...driverTypes] },
          read: false,
          OR: userFilter,
        },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    logger.error('GET /api/driver/notifications: failed', { orgId, error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
