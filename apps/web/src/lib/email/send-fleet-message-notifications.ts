/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementations are preserved below as `legacy*` and serve as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import React from 'react';
import { sendEmail } from '@/lib/email/resend-client';
import { FleetMessageNotificationEmail } from '@/emails/fleet-message-notification';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface DriverMessageNotificationParams {
  driverName: string;
  messageBody: string;
  tenantId: string;
  routeName?: string;
  /** Optional: sender user ID for relatedEntity. */
  senderId?: string;
  /** threadUrl for the notification payload. */
  threadUrl?: string;
}

/**
 * Notify the tenant owner when a driver sends a fleet message.
 * Routes through dispatchNotification, falls back to legacy Gmail SMTP on error.
 * Fire-and-forget safe: all errors are caught and logged internally.
 */
export async function sendDriverMessageNotification(
  params: DriverMessageNotificationParams
): Promise<void> {
  try {
    await dispatchNotification('message.received', {
      tenantId: params.tenantId,
      payload: {
        senderId: params.senderId ?? '',
        senderName: params.driverName,
        preview: params.messageBody.slice(0, 200),
        threadUrl: params.threadUrl ?? `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/messages`,
      },
      relatedEntity: { type: 'FleetMessage', id: params.senderId ?? params.tenantId },
    });
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    await legacySendDriverMessageNotification(params);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendDriverMessageNotification(
  params: DriverMessageNotificationParams
): Promise<void> {
  try {
    const prisma = await getTenantPrisma();

    const owner = await prisma.user.findFirst({
      where: { tenantId: params.tenantId, role: 'OWNER' },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!owner || !owner.email) {
      logger.warn('[sendDriverMessageNotification] No owner email found', { tenantId: params.tenantId });
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
    logger.error('[sendDriverMessageNotification] Failed to send owner notification email:', err);
  }
}

export interface OwnerReplyNotificationParams {
  ownerName: string;
  messageBody: string;
  driverId: string;
  routeName?: string;
  /** Tenant the email is being sent on behalf of — drives template lookup and audit log. */
  tenantId: string;
  /** threadUrl for the notification payload. */
  threadUrl?: string;
}

/**
 * Notify the driver when an owner/manager replies to a fleet message.
 * Routes through dispatchNotification (tenant-aware). Falls back to legacy Gmail SMTP only when
 * the dispatcher itself throws.
 * Fire-and-forget safe: all errors are caught and logged internally.
 */
export async function sendOwnerReplyNotification(
  params: OwnerReplyNotificationParams
): Promise<void> {
  try {
    await dispatchNotification('message.received', {
      tenantId: params.tenantId,
      payload: {
        senderId: params.driverId,
        senderName: params.ownerName,
        preview: params.messageBody.slice(0, 200),
        threadUrl: params.threadUrl ?? `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/messages`,
      },
      relatedEntity: { type: 'FleetMessage', id: params.driverId },
    });
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    await legacySendOwnerReplyNotification(params);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendOwnerReplyNotification(
  params: OwnerReplyNotificationParams
): Promise<void> {
  try {
    const prisma = await getTenantPrisma();

    const driver = await prisma.user.findUnique({
      where: { id: params.driverId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!driver || !driver.email) {
      logger.warn('[sendOwnerReplyNotification] No driver email found', { driverId: params.driverId });
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
    logger.error('[sendOwnerReplyNotification] Failed to send driver notification email:', err);
  }
}
