'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import {
  UserPermissions,
  DEFAULT_MANAGER_PERMISSIONS,
  getPermissions,
} from '@/lib/auth/permissions';
import { revalidatePath } from 'next/cache';

export interface TeamMember {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  permissions: UserPermissions;
}

/**
 * Get all active MANAGER users for the current tenant with their permissions.
 * Requires OWNER role.
 */
export async function getTeamMembers(): Promise<TeamMember[]> {
  await requireRole([UserRole.OWNER]);

  const prisma = await getTenantPrisma();

  const users = await prisma.user.findMany({
    where: {
      role: UserRole.MANAGER,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      permissions: true,
    },
    orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    permissions: getPermissions({ role: 'MANAGER', permissions: user.permissions }),
  }));
}

/**
 * Update the permissions for a specific MANAGER user.
 * Requires OWNER role.
 * Enforces cross-tenant security: verifies user belongs to this tenant and is MANAGER.
 */
export async function updateUserPermissions(
  userId: string,
  permissions: UserPermissions
): Promise<{ success: boolean }> {
  await requireRole([UserRole.OWNER]);
  const tenantId = await requireTenantId();

  const prisma = await getTenantPrisma();

  // Security: verify user exists, belongs to this tenant, and is MANAGER
  const targetUser = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      role: UserRole.MANAGER,
    },
    select: { id: true },
  });

  if (!targetUser) {
    throw new Error('User not found or not authorized to modify');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { permissions: permissions as any },
  });

  revalidatePath('/settings/team-permissions');

  return { success: true };
}
