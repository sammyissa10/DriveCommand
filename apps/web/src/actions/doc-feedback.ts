'use server';

import { requireAuth } from '@/lib/auth/supabase';
import { requireTenantId, getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const feedbackSchema = z.object({
  docSlug: z.string().min(1).max(100),
  helpful: z.boolean(),
  comment: z.string().max(1000).optional(),
});

export async function submitDocFeedback(data: {
  docSlug: string;
  helpful: boolean;
  comment?: string;
}): Promise<{ success: boolean; error?: string }> {
  const userId = await requireAuth();
  const tenantId = await requireTenantId();

  const validation = feedbackSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const { docSlug, helpful, comment } = validation.data;

  try {
    // quick-619: the tenant is the caller's session (`requireTenantId()` above).
    // No userId passed (quick-610) — `userId` is already written explicitly below.
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    await tenantPrisma.$transaction(async (tx) => {
      await tx.docFeedback.create({
        data: {
          tenantId,
          userId,
          docSlug,
          helpful,
          comment: comment ?? null,
        },
      });
    }, TX_OPTIONS);

    return { success: true };
  } catch (error) {
    logger.error('[submitDocFeedback] error:', error);
    return { success: false, error: 'Failed to submit feedback. Please try again.' };
  }
}
