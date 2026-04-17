/**
 * In-app notification writer.
 *
 * Provides a fire-and-forget createNotification() helper that persists
 * InAppNotification rows for the owner portal notification center.
 *
 * Rules:
 * - NEVER throws — errors are caught, logged, and swallowed
 * - Called AFTER email send attempts (additive only, does not affect email idempotency)
 * - orgId is always required; userId is optional (null = visible to all owners in org)
 */

import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { InAppNotificationType } from '@/generated/prisma';

export type { InAppNotificationType };

export interface CreateNotificationParams {
  orgId: string;
  userId?: string | null;
  type: InAppNotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
}

/**
 * Persist an in-app notification row for the owner portal notification center.
 *
 * Errors are caught and logged; this function never throws.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const { orgId, userId, type, title, message, entityType, entityId } = params;
  try {
    await prisma.inAppNotification.create({
      data: {
        orgId,
        userId: userId ?? null,
        type,
        title,
        message,
        entityType,
        entityId,
      },
    });
  } catch (err) {
    logger.error('createNotification: failed to persist in-app notification', {
      orgId,
      type,
      entityType,
      entityId,
      error: err,
    });
    // Never throw — notifications must not block the calling action
  }
}
