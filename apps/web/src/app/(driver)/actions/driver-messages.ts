'use server';

import type { ActionState } from '@drivecommand/types'

import { requireRole } from '@/lib/auth/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { sendDriverMessageNotification } from '@/lib/email/send-fleet-message-notifications';
import { logger } from '@/lib/logger';

/**
 * Get messages for the current driver.
 * Returns all FleetMessages the driver is involved in — across loads, routes, and unscoped.
 * Ordered chronologically. Never blocks on route/load assignment.
 */
export async function getDriverMessages() {
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) return [];

  const prisma = await getTenantPrisma();

  // Collect all load IDs assigned to this driver
  const driverLoads = await prisma.load.findMany({
    where: { driverId: user.id },
    select: { id: true },
  });
  const loadIds = driverLoads.map((l) => l.id);

  // Collect all route IDs assigned to this driver (legacy route-scoped messages)
  const driverRoutes = await prisma.route.findMany({
    where: { driverId: user.id },
    select: { id: true },
  });
  const routeIds = driverRoutes.map((r) => r.id);

  const messages = await prisma.fleetMessage.findMany({
    where: {
      OR: [
        // Messages on loads assigned to this driver
        ...(loadIds.length > 0 ? [{ loadId: { in: loadIds } }] : []),
        // Legacy unscoped messages sent by this driver
        { loadId: null, routeId: null, senderId: user.id },
        // Legacy route-scoped messages for this driver
        ...(routeIds.length > 0 ? [{ routeId: { in: routeIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  return messages;
}

/**
 * Send a message from the driver to dispatch.
 * Not scoped to any route or load — any authenticated driver can send at any time.
 */
export async function sendDriverMessage(prevState: ActionState, formData: FormData) {
  await requireRole([UserRole.DRIVER]);

  const message = formData.get('message') as string;
  if (!message || message.trim().length === 0) {
    return { error: 'Message cannot be empty.' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Authentication required.' };
  }

  const prisma = await getTenantPrisma();

  await prisma.fleetMessage.create({
    data: {
      tenantId: user.tenantId,
      senderId: user.id,
      senderRole: 'DRIVER',
      body: message.trim(),
    },
  });

  // Fire-and-forget: notify owner
  try {
    await sendDriverMessageNotification({
      driverName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      messageBody: message.trim(),
      tenantId: user.tenantId,
      routeName: undefined,
    });
  } catch (emailError) {
    logger.error('[sendDriverMessage] owner notification email failed:', emailError);
  }

  return { success: true, message: 'Message sent.' };
}
