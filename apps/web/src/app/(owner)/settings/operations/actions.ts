'use server';

import { revalidatePath } from 'next/cache';
import { getSession, requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';

export interface OperationsSettings {
  requirePreTripInspection: boolean;
  blockTripStartOnFailedInspection: boolean;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Save the two Phase 9 tenant settings.
 *
 * Both columns already existed in production before this phase — Phase 1 added
 * them (`requirePreTripInspection` NOT NULL default false,
 * `blockTripStartOnFailedInspection` NOT NULL default true, both verified
 * against `information_schema`). What did not exist was any way for an owner to
 * change them. `autoCreateRouteTemplatesFromImports` still has that problem and
 * is deliberately out of scope here.
 */
export async function saveOperationsSettings(
  settings: OperationsSettings
): Promise<SaveResult> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, error: 'Not signed in.' };

  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  } catch {
    return { ok: false, error: 'Only an owner or manager can change these settings.' };
  }

  try {
    const tenantPrisma = await getTenantPrismaForOrg(session.tenantId, session.userId);
    await tenantPrisma.tenant.update({
      where: { id: session.tenantId },
      data: {
        requirePreTripInspection: settings.requirePreTripInspection === true,
        blockTripStartOnFailedInspection: settings.blockTripStartOnFailedInspection === true,
      },
    });

    logger.info('[settings] operations settings saved', {
      orgId: session.tenantId,
      byUserId: session.userId,
      requirePreTripInspection: settings.requirePreTripInspection,
      blockTripStartOnFailedInspection: settings.blockTripStartOnFailedInspection,
    });

    revalidatePath('/settings/operations');
    return { ok: true };
  } catch (err) {
    logger.error('[settings] saveOperationsSettings failed', err, {
      orgId: session.tenantId,
      error: serializeError(err),
    });
    return { ok: false, error: 'Could not save. Please try again.' };
  }
}
