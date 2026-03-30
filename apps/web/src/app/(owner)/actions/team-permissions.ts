'use server';

import { getAppBaseUrl } from '@/lib/app-url';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { Prisma } from '@/generated/prisma';
import {
  UserPermissions,
  DEFAULT_MANAGER_PERMISSIONS,
  getPermissions,
} from '@/lib/auth/permissions';
import { revalidatePath } from 'next/cache';
import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';
import { logger } from '@/lib/logger';

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
    data: { permissions: permissions as unknown as Prisma.JsonObject },
  });

  revalidatePath('/settings/team-permissions');

  return { success: true };
}

/**
 * Invite a new team member (MANAGER role) with pre-configured permissions.
 * Requires OWNER role.
 */
export async function inviteTeamMember(data: {
  email: string;
  firstName: string;
  lastName: string;
  permissions: UserPermissions;
}): Promise<{ success: boolean; error?: string }> {
  await requireRole([UserRole.OWNER]);
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  const email = data.email.toLowerCase().trim();

  if (!email || !data.firstName.trim() || !data.lastName.trim()) {
    return { success: false, error: 'Email, first name, and last name are required' };
  }

  // Check for existing user with same email in tenant
  const existingUser = await prisma.user.findFirst({
    where: { email, tenantId },
  });
  if (existingUser) {
    return { success: false, error: 'A user with this email already exists in your organization' };
  }

  // Cancel any pending invitations for same email
  await prisma.driverInvitation.updateMany({
    where: { email, tenantId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });

  // Fetch tenant name for the email
  let organizationName = 'your fleet';
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    organizationName = tenant?.name || 'your fleet';
  } catch { /* non-critical */ }

  const invitation = await prisma.driverInvitation.create({
    data: {
      tenantId,
      email,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      fullName: `${data.firstName.trim()} ${data.lastName.trim()}`,
      role: UserRole.MANAGER,
      permissions: data.permissions as unknown as Prisma.JsonObject,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'PENDING',
    },
  });

  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/accept-invitation?id=${invitation.id}`;

  try {
    await sendDriverInvitation(email, {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      organizationName,
      acceptUrl,
      expiresAt: invitation.expiresAt.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
    });
  } catch (err) {
    logger.error('[inviteTeamMember] email failed:', err);
    // Invitation exists — email can be resent. Don't fail the action.
  }

  revalidatePath('/settings/team-permissions');
  return { success: true };
}
