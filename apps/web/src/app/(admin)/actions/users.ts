'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
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
 * Uses bare Prisma client (NOT getTenantPrisma) — intentional cross-tenant
 * read for sysadmin. Matches the pattern in actions/tenants.ts.
 */
export async function getAllUsers(): Promise<AdminUserRow[]> {
  await requireAdminAccess();

  return prisma.user.findMany({
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

  // Read-before-write: capture previous state for rollback + isActive transition check
  const existing = await prisma.user.findUnique({
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
  await prisma.user.update({
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
      await prisma.user.update({
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

  const updated = await prisma.user.findUnique({
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
