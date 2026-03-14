'use server';

import { requireRole } from '@/lib/auth/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';

/**
 * Get messages for the current driver's active route.
 * Returns all FleetMessages (from both driver and owner) for the route,
 * ordered chronologically.
 */
export async function getDriverMessages() {
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) return [];

  const prisma = await getTenantPrisma();

  // Find the driver's active route
  const route = await prisma.route.findFirst({
    where: {
      driverId: user.id,
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    },
    select: { id: true },
  });

  if (!route) return [];

  const messages = await prisma.fleetMessage.findMany({
    where: { routeId: route.id },
    orderBy: { createdAt: 'asc' },
  });

  return messages;
}

/**
 * Send a message from the driver to dispatch.
 * Persists to FleetMessage table scoped to the driver's active route.
 */
export async function sendDriverMessage(prevState: any, formData: FormData) {
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

  // Find the driver's active route
  const route = await prisma.route.findFirst({
    where: {
      driverId: user.id,
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    },
    select: { id: true },
  });

  if (!route) {
    return {
      error: 'No active route found. You must have an assigned route to send messages.',
    };
  }

  await prisma.fleetMessage.create({
    data: {
      tenantId: user.tenantId,
      routeId: route.id,
      senderId: user.id,
      senderRole: 'DRIVER',
      body: message.trim(),
    },
  });

  return { success: true, message: 'Message sent.' };
}
