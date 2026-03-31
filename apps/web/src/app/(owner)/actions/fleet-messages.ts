'use server';

import type { ActionState } from '@drivecommand/types'

import { requireRole, getCurrentUser } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { sendOwnerReplyNotification } from '@/lib/email/send-fleet-message-notifications';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { logger } from '@/lib/logger';

export type FleetMessageWithSender = {
  id: string;
  tenantId: string;
  routeId: string | null;
  loadId: string | null;
  senderId: string;
  senderRole: string;
  senderName: string;
  body: string;
  createdAt: Date;
};

/**
 * Get all messages for a route, with sender names resolved.
 * Owner-scoped: returns all driver and owner messages for the route.
 */
export async function getRouteMessages(routeId: string): Promise<FleetMessageWithSender[]> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const messages = await prisma.fleetMessage.findMany({
    where: { routeId },
    orderBy: { createdAt: 'asc' },
  });

  if (messages.length === 0) return [];

  // Collect unique sender IDs and resolve names in one query
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

  return messages.map((msg) => ({
    id: msg.id,
    tenantId: msg.tenantId,
    routeId: msg.routeId,
    loadId: msg.loadId,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    senderName: userMap.get(msg.senderId) ?? 'Unknown',
    body: msg.body,
    createdAt: msg.createdAt,
  }));
}

/**
 * Get all messages for a load, with sender names resolved.
 * Owner-scoped: returns all driver and owner messages for the load.
 */
export async function getLoadMessages(loadId: string): Promise<FleetMessageWithSender[]> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const messages = await prisma.fleetMessage.findMany({
    where: { loadId },
    orderBy: { createdAt: 'asc' },
  });

  if (messages.length === 0) return [];

  // Collect unique sender IDs and resolve names in one query
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

  return messages.map((msg) => ({
    id: msg.id,
    tenantId: msg.tenantId,
    routeId: msg.routeId,
    loadId: msg.loadId,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    senderName: userMap.get(msg.senderId) ?? 'Unknown',
    body: msg.body,
    createdAt: msg.createdAt,
  }));
}

/**
 * Send a reply from the owner/manager to a driver on a load.
 */
export async function sendOwnerLoadReply(prevState: ActionState | null, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const loadId = formData.get('loadId') as string;
  const message = formData.get('message') as string;

  if (!loadId) {
    return { error: 'Load ID is required.' };
  }
  if (!message || message.trim().length === 0) {
    return { error: 'Message cannot be empty.' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Authentication required.' };
  }

  const prisma = await getTenantPrisma();

  // Verify load exists and belongs to tenant
  const load = await prisma.load.findFirst({ where: { id: loadId } });
  if (!load) {
    return { error: 'Load not found.' };
  }

  await prisma.fleetMessage.create({
    data: {
      tenantId: user.tenantId,
      loadId,
      senderId: user.id,
      senderRole: 'OWNER',
      body: message.trim(),
    },
  });

  // Fire-and-forget: push notification to driver
  if (load.driverId) {
    const senderName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

    // Push notification — best-effort, never blocks the action
    void sendPushToUser(load.driverId, {
      title: `New message from ${senderName}`,
      body: message.trim().slice(0, 100),
      data: { screen: 'messages' },
    });
  }

  return { success: true };
}

/**
 * Send a reply from the owner/manager to a driver on a route.
 */
export async function sendOwnerReply(prevState: ActionState | null, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const routeId = formData.get('routeId') as string;
  const message = formData.get('message') as string;

  if (!routeId) {
    return { error: 'Route ID is required.' };
  }
  if (!message || message.trim().length === 0) {
    return { error: 'Message cannot be empty.' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Authentication required.' };
  }

  const prisma = await getTenantPrisma();

  // Verify route exists and belongs to tenant
  const route = await prisma.route.findFirst({ where: { id: routeId } });
  if (!route) {
    return { error: 'Route not found.' };
  }

  await prisma.fleetMessage.create({
    data: {
      tenantId: user.tenantId,
      routeId,
      senderId: user.id,
      senderRole: 'OWNER',
      body: message.trim(),
    },
  });

  // Fire-and-forget: email + push notification to driver
  if (route.driverId) {
    const senderName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

    try {
      await sendOwnerReplyNotification({
        ownerName: senderName,
        messageBody: message.trim(),
        driverId: route.driverId,
        routeName: route.name ?? undefined,
      });
    } catch (emailError) {
      logger.error('[sendOwnerReply] driver notification email failed:', emailError);
    }

    // Push notification — best-effort, never blocks the action
    void sendPushToUser(route.driverId, {
      title: `New message from ${senderName}`,
      body: message.trim().slice(0, 100),
      data: { screen: 'messages' },
    });
  }

  return { success: true };
}
