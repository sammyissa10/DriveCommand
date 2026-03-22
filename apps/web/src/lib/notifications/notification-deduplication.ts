/**
 * Notification deduplication utilities.
 *
 * Prevents duplicate notifications via idempotency keys.
 * These functions take raw Prisma client (not tenant-scoped) since NotificationLog has no RLS.
 */

import { NotificationStatus } from '@/generated/prisma';

/**
 * Generate idempotency key for notification.
 * Format: {type}:{entityId}:{YYYY-MM-DD}
 * One notification per entity per day.
 */
export function generateIdempotencyKey(
  notificationType: string,
  entityId: string,
  date: Date
): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `${notificationType}:${entityId}:${dateStr}`;
}

/**
 * Check if notification was already sent with this idempotency key.
 */
export async function wasNotificationAlreadySent(
  prisma: any,
  idempotencyKey: string
): Promise<boolean> {
  // @ts-ignore - Prisma 7 type issue
  const existing = await prisma.notificationLog.findUnique({
    where: { idempotencyKey },
    select: { status: true },
  });

  return existing?.status === NotificationStatus.SENT;
}

/**
 * Record a new notification in PENDING status.
 * Returns the notification log ID.
 */
export async function recordNotification(
  prisma: any,
  data: {
    tenantId: string;
    idempotencyKey: string;
    notificationType: string;
    entityType?: string;
    entityId?: string;
    recipientEmail: string;
    emailSubject: string;
  }
): Promise<string> {
  // @ts-ignore - Prisma 7 type issue
  const log = await prisma.notificationLog.create({
    data: {
      tenantId: data.tenantId,
      idempotencyKey: data.idempotencyKey,
      notificationType: data.notificationType,
      entityType: data.entityType,
      entityId: data.entityId,
      recipientEmail: data.recipientEmail,
      emailSubject: data.emailSubject,
      status: NotificationStatus.PENDING,
    },
    select: { id: true },
  });

  return log.id;
}

/**
 * Mark notification as SENT with timestamp and external ID.
 */
export async function markNotificationSent(
  prisma: any,
  logId: string,
  externalId: string
): Promise<void> {
  // @ts-ignore - Prisma 7 type issue
  await prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      externalId,
    },
  });
}

/**
 * Mark notification as FAILED with error message and increment retry count.
 */
export async function markNotificationFailed(
  prisma: any,
  logId: string,
  errorMessage: string
): Promise<void> {
  // @ts-ignore - Prisma 7 type issue
  await prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: NotificationStatus.FAILED,
      failedAt: new Date(),
      errorMessage,
      retryCount: { increment: 1 },
    },
  });
}
