'use server';

import { requireRole, getCurrentUser } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { prisma } from '@/lib/db/prisma';
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

// ---------------------------------------------------------------------------
// Quick Action Badges
// ---------------------------------------------------------------------------

export interface DriverQuickActionBadges {
  stopsRemaining: number;
  unreadMessages: number;
  hosStatus: string;
  expiringDocs: number;
}

/**
 * Fetch badge counts for the driver quick actions carousel.
 * Returns safe defaults on any error.
 */
export async function getDriverQuickActionBadges(): Promise<DriverQuickActionBadges> {
  const defaults: DriverQuickActionBadges = {
    stopsRemaining: 0,
    unreadMessages: 0,
    hosStatus: 'OFF',
    expiringDocs: 0,
  };

  try {
    await requireRole([UserRole.DRIVER]);
    const user = await getCurrentUser();
    if (!user) return defaults;

    const tenantPrisma = await getTenantPrisma();

    // Resolve CarrierDriver record for this user
    const carrierDriver = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.carrierDriver.findFirst({
        where: { userId: user.id, orgId: user.tenantId },
        select: { id: true },
      });
    });

    // Run all badge fetches in parallel
    const [stopsRemaining, unreadMessages, hosResult, expiringDocs] = await Promise.all([
      // Stops remaining on active dispatch
      carrierDriver
        ? prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

            const activeDispatch = await tx.trip.findFirst({
              where: {
                primaryDriverId: carrierDriver.id,
                orgId: user.tenantId,
                status: { in: ['planned', 'in_progress'] },
              },
              select: { id: true },
              orderBy: { actualDeparture: 'desc' },
            });

            if (!activeDispatch) return 0;

            return tx.carrierStop.count({
              where: {
                dispatchId: activeDispatch.id,
                status: { not: 'completed' },
              },
            });
          })
        : Promise.resolve(0),

      // Unread messages for this driver
      tenantPrisma.fleetMessage.count({
        where: {
          tenantId: user.tenantId,
          OR: [
            { recipientId: null, isBroadcast: true },
            { recipientId: user.id },
          ],
        },
      }),

      // HOS current status
      getDriverHOS().catch(() => null),

      // Expiring compliance documents within 30 days
      tenantPrisma.document.count({
        where: {
          driverId: user.id,
          expiryDate: {
            gt: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // Map HOS status to short label
    const hosStatusMap: Record<string, string> = {
      DRIVING: 'D',
      ON_DUTY: 'ON',
      SLEEPER_BERTH: 'SB',
      OFF_DUTY: 'OFF',
    };
    const hosStatus = hosStatusMap[hosResult?.currentStatus ?? 'OFF_DUTY'] ?? 'OFF';

    return {
      stopsRemaining: stopsRemaining ?? 0,
      unreadMessages: unreadMessages ?? 0,
      hosStatus,
      expiringDocs: expiringDocs ?? 0,
    };
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Recent Messages
// ---------------------------------------------------------------------------

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
