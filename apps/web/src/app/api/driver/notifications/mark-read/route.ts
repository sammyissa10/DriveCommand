import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

const MarkReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
}).refine(
  (data) => data.all === true || (data.ids && data.ids.length > 0),
  { message: 'Provide either all: true or a non-empty ids array' }
);

/**
 * PATCH /api/driver/notifications/mark-read
 *
 * Marks driver notifications as read.
 * When all: true, only marks driver-relevant types (dispatch_assigned, fleet_message)
 * so driver mark-read doesn't affect owner notifications.
 *
 * Body: { ids?: string[], all?: boolean }
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'DRIVER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const body = await req.json();
    const parsed = MarkReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 });
    }

    const { all, ids } = parsed.data;
    const userFilter = [{ userId: null as string | null }, { userId: session.userId }];

    // Driver-relevant notification types (dispatch_assigned is the primary driver notification type)
    // Note: fleet_message is not an InAppNotificationType enum value
    const driverTypes = ['dispatch_assigned'] as const;

    const tenantPrisma = await getTenantPrisma();
    let result: { count: number };

    if (all) {
      result = await tenantPrisma.inAppNotification.updateMany({
        where: {
          orgId,
          read: false,
          type: { in: [...driverTypes] },
          OR: userFilter,
        },
        data: { read: true },
      });
    } else {
      // orgId filter ensures tenant isolation even when ids are provided
      result = await tenantPrisma.inAppNotification.updateMany({
        where: {
          id: { in: ids },
          orgId,
        },
        data: { read: true },
      });
    }

    return NextResponse.json({ success: true, updated: result.count });
  } catch (err) {
    logger.error('PATCH /api/driver/notifications/mark-read: failed', { orgId, error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
