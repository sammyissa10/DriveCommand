/**
 * Recipient resolver for the notification dispatcher.
 *
 * Resolves who should receive a notification for a given tenant + trigger by:
 *   1. Expanding DefaultRecipientRules (role / tenant_owners / related / external_email)
 *   2. Unioning explicit NotificationSubscription rows
 *   3. Deduplicating by userId (for User-backed recipients) or email (for external-email recipients)
 *   4. Attaching UserNotificationPreference (defaults: email=true, inApp=true)
 *   5. Appending email-only recipients (userId=null) for external_email rule matches with no User row
 *
 * ---------------------------------------------------------------------------
 * STEPS 1 AND 2 ARE A UNION, NOT AN INTERSECTION. Read this before adding a
 * trigger.
 * ---------------------------------------------------------------------------
 *
 * `defaultRecipients` and `NotificationSubscription` are TWO INDEPENDENT
 * mechanisms whose outputs are merged. A rule of `{ type: 'tenant_owners' }` or
 * `{ type: 'role', role: 'OWNER' }` addresses every matching active user WITHOUT
 * CONSULTING SUBSCRIPTION AT ALL, and `UserNotificationPreference` — applied
 * afterwards — is a CHANNEL preference that defaults to true. So an owner who
 * has never opened the settings screen receives everything such a rule sends.
 *
 * That is correct for the triggers that use it (an HOS violation should reach
 * the owner whether or not they went looking for it), and it is a live trap for
 * any trigger whose audience is "subscribers". Section 13's six subscriber
 * triggers therefore ship with `defaultRecipients: []`: with no rules to expand,
 * step 1 contributes nothing and step 2 is the ONLY source of recipients, so an
 * unsubscribed user receives nothing BY CONSTRUCTION.
 *
 * Getting that guarantee from the shape of the data rather than from a check
 * inside this function is deliberate — a check can be edited out by someone who
 * does not know why it is there, and the failure would be silent and would look
 * like the feature working.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DefaultRecipientRule } from './types';

export type ResolvedRecipient = {
  userId: string | null;
  email: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  /** Phase 10. Defaults true like its siblings; the TEMPLATE flag is the real gate. */
  pushEnabled: boolean;
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
      select: { userId: true, emailEnabled: true, inAppEnabled: true, pushEnabled: true },
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
        pushEnabled: p?.pushEnabled ?? true,
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
      // No User row means no device token either — PushToken.userId is a
      // non-null FK, the same reason inAppEnabled is false here.
      pushEnabled: false,
    });
  }

  return result;
}
