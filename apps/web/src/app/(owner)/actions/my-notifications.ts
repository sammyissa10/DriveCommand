'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
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
      };
    });
}

// ---------------------------------------------------------------------------
// updateMyPreference
// ---------------------------------------------------------------------------

export async function updateMyPreference(
  triggerKey: string,
  field: 'emailEnabled' | 'inAppEnabled',
  value: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAuth();
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }

  const schema = z.object({
    triggerKey: z.string().min(1),
    field: z.enum(['emailEnabled', 'inAppEnabled']),
    value: z.boolean(),
  });

  const parsed = schema.safeParse({ triggerKey, field, value });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  try {
    const userId = session.userId;
    const updateData = { [field]: value };
    const createData: Record<string, unknown> = {
      userId,
      triggerKey,
      emailEnabled: true,
      inAppEnabled: true,
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
