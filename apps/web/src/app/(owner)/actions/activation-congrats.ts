'use server';

import { getTenantPrisma } from '@/lib/context/tenant-context';

/**
 * Idempotent set-once write: stamps congratsShownAt to now() the first time
 * the owner sees the activation-complete congrats moment.
 *
 * Safe to call multiple times — the WHERE guard (isActivated + congratsShownAt IS NULL)
 * ensures it only writes once even under concurrent calls.
 */
export async function markCongratsShown(): Promise<{ ok: boolean }> {
  try {
    const prisma = await getTenantPrisma();
    await prisma.activationProgress.updateMany({
      where: { isActivated: true, congratsShownAt: null },
      data: { congratsShownAt: new Date() },
    });
    return { ok: true };
  } catch {
    // Fire-and-forget UI write — never throw to the caller
    return { ok: false };
  }
}
