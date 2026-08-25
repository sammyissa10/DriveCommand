'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import type { VariableDef } from '@/lib/notifications/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MyPreferenceRow = {
  template: {
    triggerKey: string;
    displayName: string;
    description: string;
    category: string;
    availableVariables: VariableDef[];
  };
  emailEnabled: boolean;
  inAppEnabled: boolean;
  /** Phase 10. Only meaningful when `pushOffered` is true. */
  pushEnabled: boolean;
  /**
   * Phase 10 — does this trigger push at all? `NotificationTemplate.pushEnabled`,
   * default false, true on exactly the three Section 13 triggers that name Push.
   * Used to hide a toggle that could not do anything on the other 44.
   */
  pushOffered: boolean;
  /**
   * Phase 10 — is the user in this trigger's audience by subscription?
   *
   * Distinct from the channel flags above: this decides WHETHER they are a
   * recipient, those decide HOW a notification reaches them once they are.
   */
  subscribed: boolean;
  /**
   * True when subscription is the ONLY route to this trigger — i.e. the template
   * carries no `defaultRecipients` rules at all.
   *
   * Drives the copy, because the same unchecked box means two very different
   * things. On a subscriber-only trigger it means "you will receive nothing".
   * On a trigger with a `role` or `related` rule it means only "you are not on
   * the extra list" — the rule may well address you regardless. Showing one
   * control with one label for both would be actively misleading.
   */
  subscriptionOnly: boolean;
};

// ---------------------------------------------------------------------------
// getMyPreferences
// ---------------------------------------------------------------------------

export async function getMyPreferences(): Promise<MyPreferenceRow[]> {
  await requireAuth();
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }

  // Fetch all globally-active templates
  const templates = await prisma.notificationTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
  });

  // Fetch this user's preferences
  const preferences = await prisma.userNotificationPreference.findMany({
    where: { userId: session.userId },
  });
  const prefByTrigger = new Map(preferences.map((p) => [p.triggerKey, p]));

  // Phase 10 — this user's own subscriptions, scoped to their tenant. Empty set
  // when they have no tenant, which is the honest answer rather than a throw.
  const subscribedKeys = new Set<string>(
    session.tenantId
      ? (
          await prisma.notificationSubscription.findMany({
            where: { tenantId: session.tenantId, userId: session.userId },
            select: { triggerKey: true },
          })
        ).map((s) => s.triggerKey)
      : [],
  );

  // If tenant exists, filter out tenant-disabled triggers
  let disabledByTenant = new Set<string>();
  if (session.tenantId) {
    try {
      const tenantDb = await getTenantPrisma();
      const tenantSettings = await tenantDb.tenantNotificationSettings.findMany({
        where: { tenantId: session.tenantId, isActive: false },
        select: { triggerKey: true },
      });
      disabledByTenant = new Set(tenantSettings.map((s) => s.triggerKey));
    } catch {
      // If tenant context not available, skip the filter
    }
  }

  return templates
    .filter((t) => !disabledByTenant.has(t.triggerKey))
    .map((t) => {
      const pref = prefByTrigger.get(t.triggerKey);
      return {
        template: {
          triggerKey: t.triggerKey,
          displayName: t.displayName,
          description: t.description,
          category: t.category as string,
          availableVariables: t.availableVariables as VariableDef[],
        },
        emailEnabled: pref?.emailEnabled ?? true,
        inAppEnabled: pref?.inAppEnabled ?? true,
        pushEnabled: pref?.pushEnabled ?? true,
        pushOffered: t.pushEnabled,
        subscribed: subscribedKeys.has(t.triggerKey),
        // `defaultRecipients` is jsonb. An empty array means no rule can put
        // anybody in the audience, so `NotificationSubscription` is the only
        // way in — which is exactly how the six Section 13 subscriber triggers
        // are seeded.
        subscriptionOnly:
          Array.isArray(t.defaultRecipients) && (t.defaultRecipients as unknown[]).length === 0,
      };
    });
}

// ---------------------------------------------------------------------------
// updateMyPreference
// ---------------------------------------------------------------------------

export async function updateMyPreference(
  triggerKey: string,
  field: 'emailEnabled' | 'inAppEnabled' | 'pushEnabled',
  value: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAuth();
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }

  const schema = z.object({
    triggerKey: z.string().min(1),
    // `pushEnabled` added in Phase 10 alongside the dispatcher's PUSH branch.
    field: z.enum(['emailEnabled', 'inAppEnabled', 'pushEnabled']),
    value: z.boolean(),
  });

  const parsed = schema.safeParse({ triggerKey, field, value });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  // `UserNotificationPreference.tenantId` is NOT NULL and the create branch
  // below omitted it, so the FIRST write for any (user, trigger) pair threw
  // "Argument `tenantId` is missing" and was returned as a generic error
  // string. Production carries ZERO rows in that table, which is what a
  // create path that has never once succeeded looks like. This is the bare
  // prisma client, so the tenant-RLS extension does not inject it either.
  //
  // Found while wiring Phase 10, which depends on this table for per-user
  // channel control. Fixed rather than worked around: the notification the
  // brief asks an owner to switch off could not be switched off.
  if (!session.tenantId) {
    return { success: false, error: 'No tenant context for this account.' };
  }

  try {
    const userId = session.userId;
    const updateData = { [field]: value };
    const createData: Record<string, unknown> = {
      userId,
      tenantId: session.tenantId,
      triggerKey,
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: true,
      [field]: value,
    };

    await prisma.userNotificationPreference.upsert({
      where: { userId_triggerKey: { userId, triggerKey } },
      create: createData as Parameters<typeof prisma.userNotificationPreference.upsert>[0]['create'],
      update: updateData,
    });

    revalidatePath('/settings/my-notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// updateMySubscription — Document Import Phase 10
// ---------------------------------------------------------------------------

/**
 * Subscribe or unsubscribe the signed-in user from one trigger.
 *
 * WHY THIS EXISTS. Section 13's build item 3 requires subscription to be "per
 * user, per trigger, self-service in the existing notification preferences UI".
 * Before Phase 10 it was none of those things from the user's side:
 * `NotificationSubscription` rows could only be created by an OWNER on
 * `/settings/notifications` → Subscribers, assigning other people. This screen
 * showed channel toggles and nothing else.
 *
 * That gap matters more than it looks, because the six Section 13 subscriber
 * triggers ship with `defaultRecipients: []` — subscription is the ONLY way to
 * receive them. Without this action they would be unreachable for anyone whose
 * owner had not hand-assigned them.
 *
 * SUBSCRIPTION IS NOT A CHANNEL PREFERENCE, and the two must not be merged:
 *   - `NotificationSubscription` decides WHETHER you are a recipient at all.
 *   - `UserNotificationPreference` decides WHICH CHANNELS reach you once you are.
 * Deleting a subscription removes you from the audience; turning every channel
 * off leaves you in it, receiving nothing. Only the first is what "unsubscribed"
 * means in the acceptance test.
 *
 * Unsubscribing DELETES the row rather than writing a false flag, because there
 * is no such flag — presence in the table IS the subscription. That is the same
 * shape as quick-516's stored template decision: when presence is the state,
 * "undo" is a delete, never another write.
 */
export async function updateMySubscription(
  triggerKey: string,
  subscribed: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAuth();
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }
  if (!session.tenantId) {
    return { success: false, error: 'No tenant context for this account.' };
  }

  const parsed = z
    .object({ triggerKey: z.string().min(1), subscribed: z.boolean() })
    .safeParse({ triggerKey, subscribed });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  const tenantId = session.tenantId;
  const userId = session.userId;

  try {
    if (subscribed) {
      // Unique on (tenantId, triggerKey, userId), so a double-tap is a no-op
      // rather than a duplicate row.
      await prisma.notificationSubscription.upsert({
        where: { tenantId_triggerKey_userId: { tenantId, triggerKey, userId } },
        create: { tenantId, triggerKey, userId },
        update: {},
      });
    } else {
      // `deleteMany`, not `delete`: deleting a row that is not there must be a
      // no-op, not a P2025 the user sees as an error for an action that had
      // already achieved what they wanted.
      await prisma.notificationSubscription.deleteMany({
        where: { tenantId, triggerKey, userId },
      });
    }

    revalidatePath('/settings/my-notifications');
    return { success: true };
  } catch (err) {
    // Never a bare string into the log. `logger.error(message, error, context)`
    // takes the error SECOND; the user-facing message stays separate.
    logger.error('[my-notifications] subscription update failed', err, {
      triggerKey,
      userId,
      tenantId,
      error: serializeError(err),
    });
    return { success: false, error: 'Could not save that. Please try again.' };
  }
}
