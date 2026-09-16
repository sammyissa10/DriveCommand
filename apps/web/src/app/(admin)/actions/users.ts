'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}

/**
 * Explicit shape of a user row returned to the sysadmin client.
 * Only whitelisted fields — no passwordHash, licenseNumber, permissions,
 * isDispatchReady, isSample, or isSystemAdmin.
 */
export type AdminUserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  tenantId: string;
  tenant: { name: string } | null;
};

/**
 * Get all non-sample, non-sysadmin users across every tenant.
 * quick-615 — this used to say "uses bare Prisma client … intentional
 * cross-tenant read". The intent was right and the mechanism was not: the bare
 * client is the TENANT connection, and after the `app_user` cutover it returns
 * zero rows here. Cross-tenant reads go on `getAdminDb`. Matches the pattern in
 * actions/tenants.ts, which quick-615 fixed in the same way.
 */
export async function getAllUsers(): Promise<AdminUserRow[]> {
  await requireAdminAccess();

  // quick-615 — ROUTE. Lists every user in EVERY tenant; `User` carries
  // `tenant_isolation_policy` on `"tenantId"`, so under `app_user` with no
  // tenant context this returns nothing at all.
  const adminDbUserList = await getAdminDb('sysadmin user listing');
  return adminDbUserList.user.findMany({
    where: { isSample: false, isSystemAdmin: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// updateUserProfile
// ---------------------------------------------------------------------------

const updateUserProfileSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  role: z.enum(['OWNER', 'MANAGER', 'DRIVER']),
  isActive: z.boolean(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

export type UpdateUserProfileResult =
  | { success: true; user: AdminUserRow }
  | { success: false; error: string };

/**
 * Update a non-sysadmin user's whitelisted profile fields.
 *
 * Side-effect contract:
 *   - If isActive transitions, calls Supabase Admin API to ban/unban
 *     (ban_duration: '876000h' for ban, 'none' for unban — terminates session).
 *   - If the Supabase call fails, the Prisma update is reverted in a
 *     compensating transaction so the two systems stay consistent.
 *
 * Hard guards:
 *   - Refuses to touch users where isSystemAdmin = true.
 *   - role enum is restricted to OWNER/MANAGER/DRIVER by Zod (no sysadmin path).
 *   - Never reads email, tenantId, passwordHash, isSystemAdmin, isSample from input.
 */
export async function updateUserProfile(
  input: UpdateUserProfileInput
): Promise<UpdateUserProfileResult> {
  await requireAdminAccess();

  const parsed = updateUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { userId, firstName, lastName, role, isActive } = parsed.data;

  // quick-615 — ROUTE. ONE acquisition for the whole unit of work: the
  // read-before-write, the update, the COMPENSATING ROLLBACK and the re-read.
  // The input is `{userId, …}` — there is no tenant in hand anywhere in this
  // function — and a rollback landing on a different connection from the write
  // it reverses would be worse than the failure it is compensating for.
  const adminDbUserUpdate = await getAdminDb('sysadmin user profile update');

  // Read-before-write: capture previous state for rollback + isActive transition check
  const existing = await adminDbUserUpdate.user.findUnique({
    where: { id: userId },
    select: {
      id: true, firstName: true, lastName: true, role: true,
      isActive: true, isSystemAdmin: true,
    },
  });
  if (!existing) return { success: false, error: 'User not found' };
  if (existing.isSystemAdmin) {
    return { success: false, error: 'Cannot edit a system administrator through this UI' };
  }

  // Apply Prisma update
  await adminDbUserUpdate.user.update({
    where: { id: userId },
    data: { firstName, lastName, role, isActive },
  });

  // If isActive changed, sync Supabase session state
  if (existing.isActive !== isActive) {
    try {
      const supabase = createAdminClient();
      const { error: sbErr } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? 'none' : '876000h', // ~100 years = effectively permanent
      });
      if (sbErr) throw sbErr;
    } catch (err) {
      // Compensating rollback — restore previous Prisma state
      await adminDbUserUpdate.user.update({
        where: { id: userId },
        data: {
          firstName: existing.firstName,
          lastName: existing.lastName,
          role: existing.role,
          isActive: existing.isActive,
        },
      });
      const msg = err instanceof Error ? err.message : 'Supabase ban/unban failed';
      return { success: false, error: `Failed to sync Supabase session: ${msg}. Changes reverted.` };
    }
  }

  const updated = await adminDbUserUpdate.user.findUnique({
    where: { id: userId },
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true,
      isActive: true, createdAt: true, tenantId: true,
      tenant: { select: { name: true } },
    },
  });
  if (!updated) return { success: false, error: 'User vanished after update' };

  return { success: true, user: updated };
}
