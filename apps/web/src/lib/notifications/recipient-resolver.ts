/**
 * Recipient resolver for the notification dispatcher.
 *
 * Resolves who should receive a notification for a given tenant + trigger by:
 *   1. Expanding DefaultRecipientRules (role / tenant_owners / related / external_email)
 *   2. Unioning explicit NotificationSubscription rows
 *   3. Deduplicating by userId (for User-backed recipients) or email (for external-email recipients)
 *   4. Attaching UserNotificationPreference (defaults: email=true, inApp=true)
 *   5. Appending email-only recipients (userId=null) for external_email rule matches with no User row
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DefaultRecipientRule } from './types';

export type ResolvedRecipient = {
  userId: string | null;
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
  // Map of userId -> email for deduplication (User-backed recipients)
  const userMap = new Map<string, { email: string }>();

  // Map of lowercased email -> { email } for deduplication (email-only recipients)
  // Only used when external_email rule finds no matching User row.
  const emailOnlyMap = new Map<string, { email: string }>();

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
    } else if (rule.type === 'external_email') {
      const rawEmail = payload[rule.payloadKey];
      if (!rawEmail || typeof rawEmail !== 'string') continue;
      const email = rawEmail.trim().toLowerCase();

      // Basic shape check — skip values that look like UUIDs or are obviously not emails
      if (!email.includes('@') || email.includes(' ')) continue;

      // Try to find an existing user with this email in the same tenant; if found,
      // promote into userMap so prefs are honored. If not found, add to emailOnlyMap.
      const existing = await prisma.user.findFirst({
        where: { tenantId, email, isActive: true },
        select: { id: true, email: true },
      });
      if (existing?.email) {
        userMap.set(existing.id, { email: existing.email });
      } else {
        emailOnlyMap.set(email, { email });
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
  // Step 4: Load preferences in one query (User-backed recipients only)
  // -------------------------------------------------------------------------
  const userIds = [...userMap.keys()];
  const result: ResolvedRecipient[] = [];

  if (userIds.length > 0) {
    const prefs = await prisma.userNotificationPreference.findMany({
      where: { userId: { in: userIds }, triggerKey },
      select: { userId: true, emailEnabled: true, inAppEnabled: true },
    });
    const prefMap = new Map(prefs.map((p) => [p.userId, p]));

    // -------------------------------------------------------------------------
    // Step 5a: Build result for User-backed recipients
    // -------------------------------------------------------------------------
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
  }

  // -------------------------------------------------------------------------
  // Step 5b: Append email-only recipients (external_email with no User row)
  //
  // inAppEnabled is always false here because:
  //   (a) InAppNotification.userId is a non-null FK — cannot create without a User row
  //   (b) Invitation templates already set inAppEnabled: false at the template level
  // emailEnabled defaults to true — no UserNotificationPreference can exist without a User row.
  // -------------------------------------------------------------------------
  for (const [, { email }] of emailOnlyMap) {
    result.push({
      userId: null,
      email,
      emailEnabled: true,
      inAppEnabled: false,
    });
  }

  return result;
}
