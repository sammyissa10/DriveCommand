import React from 'react';
import { sendEmail } from '@/lib/email/gmail-client';
import { FleetMessageNotificationEmail } from '@/emails/fleet-message-notification';
import { getTenantPrisma } from '@/lib/context/tenant-context';

export interface DriverMessageNotificationParams {
  driverName: string;
  messageBody: string;
  tenantId: string;
  routeName?: string;
}

/**
 * Notify the tenant owner when a driver sends a fleet message.
 * Fire-and-forget safe: all errors are caught and logged internally.
 */
export async function sendDriverMessageNotification(
  params: DriverMessageNotificationParams
): Promise<void> {
  try {
    const prisma = await getTenantPrisma();

    const owner = await prisma.user.findFirst({
      where: { tenantId: params.tenantId, role: 'OWNER' },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!owner || !owner.email) {
      console.warn('[sendDriverMessageNotification] No owner email found for tenantId:', params.tenantId);
      return;
    }

    const recipientName =
      `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email;

    await sendEmail({
      to: owner.email,
      subject: `[DriveCommand] New Message from Driver: ${params.driverName}`,
      react: React.createElement(FleetMessageNotificationEmail, {
        recipientName,
        senderName: params.driverName,
        senderRole: 'DRIVER',
        messagePreview: params.messageBody,
        routeName: params.routeName,
      }),
    });
  } catch (err) {
    console.error('[sendDriverMessageNotification] Failed to send owner notification email:', err);
  }
}

export interface OwnerReplyNotificationParams {
  ownerName: string;
  messageBody: string;
  driverId: string;
  routeName?: string;
}

/**
 * Notify the driver when an owner/manager replies to a fleet message.
 * Fire-and-forget safe: all errors are caught and logged internally.
 */
export async function sendOwnerReplyNotification(
  params: OwnerReplyNotificationParams
): Promise<void> {
  try {
    const prisma = await getTenantPrisma();

    const driver = await prisma.user.findUnique({
      where: { id: params.driverId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!driver || !driver.email) {
      console.warn('[sendOwnerReplyNotification] No driver email found for driverId:', params.driverId);
      return;
    }

    const recipientName =
      `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || driver.email;

    await sendEmail({
      to: driver.email,
      subject: `[DriveCommand] New Reply from Dispatch: ${params.ownerName}`,
      react: React.createElement(FleetMessageNotificationEmail, {
        recipientName,
        senderName: params.ownerName,
        senderRole: 'OWNER',
        messagePreview: params.messageBody,
        routeName: params.routeName,
      }),
    });
  } catch (err) {
    console.error('[sendOwnerReplyNotification] Failed to send driver notification email:', err);
  }
}
