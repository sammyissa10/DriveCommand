'use server';

import { requireRole, getCurrentUser } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { getMyActiveDispatch } from './driver-routes';
import { getDriverHOS } from './driver-hos';

export interface MessagePreview {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

/**
 * Get all dashboard data for the authenticated driver in a single server action call.
 *
 * SECURITY: Enforces DRIVER role. Identity resolved from session, not URL params.
 */
export async function getDriverDashboardData() {
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  // Fetch dispatch, HOS, and recent messages in parallel
  const [dispatch, hos, recentMessages] = await Promise.all([
    getMyActiveDispatch().catch(() => null),
    getDriverHOS().catch(() => null),
    getRecentUnreadMessages(user.id, user.tenantId),
  ]);

  return {
    dispatch,
    hos,
    recentMessages,
  };
}

/**
 * Get the last 2 unread FleetMessages for this driver.
 * Used for the dashboard messages preview widget.
 */
async function getRecentUnreadMessages(userId: string, tenantId: string): Promise<MessagePreview[]> {
  try {
    const prisma = await getTenantPrisma();

    // Collect load IDs assigned to this driver for scoping
    const driverLoads = await prisma.load.findMany({
      where: { driverId: userId },
      select: { id: true },
    });
    const loadIds = driverLoads.map((l) => l.id);

    const messages = await prisma.fleetMessage.findMany({
      where: {
        tenantId,
        OR: [
          // Broadcast messages (no specific recipient)
          { recipientId: null, isBroadcast: true },
          // Messages addressed to this driver
          { recipientId: userId },
          // Messages on loads assigned to this driver
          ...(loadIds.length > 0 ? [{ loadId: { in: loadIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: {
        id: true,
        senderRole: true,
        body: true,
        createdAt: true,
      },
    });

    return messages.map((m) => ({
      id: m.id,
      senderRole: m.senderRole,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
