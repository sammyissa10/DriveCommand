'use server';

import type { ActionState } from '@drivecommand/types'

import { requireRole, getCurrentUser } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { sendDriverMessageNotification } from '@/lib/email/send-fleet-message-notifications';
import { createMessageNotification } from '@/lib/carrier/in-app-notifications';
import { logger } from '@/lib/logger';

/**
 * Get messages for the current driver.
 * Returns all FleetMessages the driver is involved in — direct messages, broadcasts.
 * Ordered chronologically.
 */
export async function getDriverMessages() {
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) return [];

  const prisma = await getTenantPrisma();

  const messages = await prisma.fleetMessage.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        // Direct messages to/from this driver
        { senderId: user.id },
        { recipientId: user.id },
        // Broadcast messages for this tenant
        { isBroadcast: true },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  // Mark messages addressed to driver as read
  const unreadIds = messages
    .filter((m) => !m.readAt && m.recipientId === user.id)
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await prisma.fleetMessage.updateMany({
      where: { id: { in: unreadIds } },
      data: { readAt: new Date() },
    });
  }

  return messages.map((m) => ({
    ...m,
    isOwn: m.senderId === user.id,
  }));
}

/**
 * Send a message from the driver to the owner/dispatcher.
 * Automatically sets recipientId to the tenant owner and dispatchId to the active dispatch.
 */
export async function sendDriverMessage(prevState: ActionState | null, formData: FormData) {
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

  // Find the tenant owner to set as recipient
  const owner = await prisma.user.findFirst({
    where: { tenantId: user.tenantId, role: 'OWNER' },
    select: { id: true },
  });

  // Find this driver's CarrierDriver record
  const carrierDriver = await prisma.carrierDriver.findFirst({
    where: { userId: user.id, orgId: user.tenantId },
    select: { id: true },
  });

  // Find the active dispatch for this driver (planned or in_progress, most recent)
  let activeDispatchId: string | undefined = undefined;
  if (carrierDriver) {
    const activeDispatch = await prisma.trip.findFirst({
      where: {
        primaryDriverId: carrierDriver.id,
        orgId: user.tenantId,
        status: { in: ['planned', 'in_progress'] },
      },
      orderBy: { scheduledDeparture: 'desc' },
      select: { id: true },
    });
    activeDispatchId = activeDispatch?.id;
  }

  const audioUrlField = formData.get('audioUrl') as string | null;

  await prisma.fleetMessage.create({
    data: {
      tenantId: user.tenantId,
      senderId: user.id,
      senderRole: 'DRIVER',
      body: message.trim(),
      recipientId: owner?.id ?? null,
      dispatchId: activeDispatchId ?? null,
      ...(audioUrlField ? { audioUrl: audioUrlField } : {}),
    },
  });

  const driverName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

  // Fire-and-forget: email + in-app notification to owner
  try {
    await sendDriverMessageNotification({
      driverName,
      messageBody: message.trim(),
      tenantId: user.tenantId,
      routeName: undefined,
    });
  } catch (emailError) {
    logger.error('[sendDriverMessage] owner notification email failed:', emailError);
  }

  if (owner?.id) {
    createMessageNotification({
      orgId: user.tenantId,
      recipientUserId: owner.id,
      senderName: driverName,
      messagePreview: message.trim(),
      dispatchId: activeDispatchId ?? null,
    }).catch((err) => logger.error('[sendDriverMessage] in-app notification failed:', err));
  }

  return { success: true, message: 'Message sent.' };
}

/**
 * Send a voice message from the driver.
 * Creates a FleetMessage with body "Voice message" and the given audioUrl (R2 key).
 */
export async function sendDriverVoiceMessage(audioUrl: string): Promise<ActionState> {
  await requireRole([UserRole.DRIVER]);

  if (!audioUrl || !audioUrl.trim()) {
    return { error: 'audioUrl is required.' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Authentication required.' };
  }

  const prisma = await getTenantPrisma();

  // Find the tenant owner to set as recipient
  const owner = await prisma.user.findFirst({
    where: { tenantId: user.tenantId, role: 'OWNER' },
    select: { id: true },
  });

  // Find this driver's CarrierDriver record
  const carrierDriver = await prisma.carrierDriver.findFirst({
    where: { userId: user.id, orgId: user.tenantId },
    select: { id: true },
  });

  // Find the active dispatch for this driver
  let activeDispatchId: string | undefined = undefined;
  if (carrierDriver) {
    const activeDispatch = await prisma.trip.findFirst({
      where: {
        primaryDriverId: carrierDriver.id,
        orgId: user.tenantId,
        status: { in: ['planned', 'in_progress'] },
      },
      orderBy: { scheduledDeparture: 'desc' },
      select: { id: true },
    });
    activeDispatchId = activeDispatch?.id;
  }

  await prisma.fleetMessage.create({
    data: {
      tenantId: user.tenantId,
      senderId: user.id,
      senderRole: 'DRIVER',
      body: 'Voice message',
      recipientId: owner?.id ?? null,
      dispatchId: activeDispatchId ?? null,
      audioUrl: audioUrl.trim(),
    },
  });

  const driverName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

  // Fire-and-forget: email + in-app notification to owner
  try {
    await sendDriverMessageNotification({
      driverName,
      messageBody: 'Voice message',
      tenantId: user.tenantId,
      routeName: undefined,
    });
  } catch (emailError) {
    logger.error('[sendDriverVoiceMessage] owner notification email failed:', emailError);
  }

  if (owner?.id) {
    createMessageNotification({
      orgId: user.tenantId,
      recipientUserId: owner.id,
      senderName: driverName,
      messagePreview: 'Voice message',
      dispatchId: activeDispatchId ?? null,
    }).catch((err) => logger.error('[sendDriverVoiceMessage] in-app notification failed:', err));
  }

  return { success: true, message: 'Voice message sent.' };
}
