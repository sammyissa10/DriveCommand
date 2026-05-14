/**
 * Recipient resolver for the notification dispatcher.
 *
 * Resolves who should receive a notification for a given tenant + trigger by:
 *   1. Expanding DefaultRecipientRules (role / tenant_owners / related)
 *   2. Unioning explicit NotificationSubscription rows
 *   3. Deduplicating by userId
 *   4. Attaching UserNotificationPreference (defaults: email=true, inApp=true)
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DefaultRecipientRule } from './types';

export type ResolvedRecipient = {
  userId: string;
  email: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

/**
 * Resolve the full deduplicated recipient list for one notification dispatch.
 *
 * Uses the BASE prisma client (not getTenantPrisma). Cross-tenant safety is
 * enforced by explicit `tenantId` filters on every query.
 */
export async function resolveRecipients(
  prisma: PrismaClient,
  tenantId: string,
  triggerKey: string,
  defaultRecipients: DefaultRecipientRule[],
  payload: Record<string, string>,
): Promise<ResolvedRecipient[]> {
  // Map of userId -> email for deduplication
  const userMap = new Map<string, { email: string }>();

  // -------------------------------------------------------------------------
  // Step 1-2: Expand DefaultRecipientRules
  // -------------------------------------------------------------------------
  for (const rule of defaultRecipients) {
    if (rule.type === 'role') {
      const users = await prisma.user.findMany({
        where: {
          tenantId,
          role: rule.role,
          isActive: true,
          email: { not: undefined },
        },
        select: { id: true, email: true },
      });
      for (const u of users) {
        if (u.email) {
          userMap.set(u.id, { email: u.email });
        }
      }
    } else if (rule.type === 'tenant_owners') {
      const users = await prisma.user.findMany({
        where: {
          tenantId,
          role: 'OWNER',
          isActive: true,
          email: { not: undefined },
        },
        select: { id: true, email: true },
      });
      for (const u of users) {
        if (u.email) {
          userMap.set(u.id, { email: u.email });
        }
      }
    } else if (rule.type === 'related') {
      const userId = payload[rule.payloadKey];
      if (!userId) continue;
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          tenantId,
          isActive: true,
          email: { not: undefined },
        },
        select: { id: true, email: true },
      });
      if (user?.email) {
        userMap.set(user.id, { email: user.email });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Union explicit NotificationSubscription rows
  // -------------------------------------------------------------------------
  const subs = await prisma.notificationSubscription.findMany({
    where: { tenantId, triggerKey },
    select: {
      user: { select: { id: true, email: true, isActive: true } },
    },
  });
  for (const sub of subs) {
    const u = sub.user;
    if (u.isActive && u.email) {
      userMap.set(u.id, { email: u.email });
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Load preferences in one query
  // -------------------------------------------------------------------------
  const userIds = [...userMap.keys()];
  if (userIds.length === 0) return [];

  const prefs = await prisma.userNotificationPreference.findMany({
    where: { userId: { in: userIds }, triggerKey },
    select: { userId: true, emailEnabled: true, inAppEnabled: true },
  });
  const prefMap = new Map(prefs.map((p) => [p.userId, p]));

  // -------------------------------------------------------------------------
  // Step 5: Build result
  // -------------------------------------------------------------------------
  const result: ResolvedRecipient[] = [];
  for (const [userId, { email }] of userMap) {
    if (!email) continue; // defensive
    const p = prefMap.get(userId);
    result.push({
      userId,
      email,
      emailEnabled: p?.emailEnabled ?? true,
      inAppEnabled: p?.inAppEnabled ?? true,
    });
  }

  return result;
}
