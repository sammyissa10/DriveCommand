'use server';

import { requireAuth } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';

/**
 * Mark the current user's first-run navigational tour as seen so it never
 * auto-starts again. Fire-and-forget from the client (skip or finish) — mirrors
 * markCongratsShown: scoped to the caller's own row, never throws.
 *
 * "Replay walkthrough" re-runs the tour purely client-side and does NOT reset
 * this flag; the flag governs only the one-time automatic first-run.
 */
export async function markTourSeen(): Promise<{ ok: boolean }> {
  try {
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingTourSeen: true },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
