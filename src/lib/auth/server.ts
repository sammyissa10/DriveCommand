/**
 * Server-side authentication and authorization helpers
 */

import { auth } from '@clerk/nextjs/server';
import { prisma } from '../db/prisma';
import { UserRole } from './roles';

/**
 * Get the current user's role from Clerk session publicMetadata.
 * Returns null if no session or no role set.
 *
 * This is fast (no database call) and should be used for role checks in server actions.
 */
export async function getRole(): Promise<UserRole | null> {
  const { sessionClaims } = await auth();
  if (!sessionClaims?.publicMetadata) {
    return null;
  }

  // Type assertion needed until Clerk type augmentation is properly configured
  const publicMetadata = sessionClaims.publicMetadata as { role?: string };
  const role = publicMetadata.role;

  if (!role || !Object.values(UserRole).includes(role as UserRole)) {
    return null;
  }

  return role as UserRole;
}

/**
 * Require authentication.
 * Throws an error if the user is not authenticated.
 * Returns the Clerk user ID.
 */
export async function requireAuth(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized: Authentication required');
  }
  return userId;
}

/**
 * Require one of the allowed roles.
 * Throws an error if the user's role is not in the allowed list.
 * Returns the matched role.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  const role = await getRole();
  if (!role || !allowedRoles.includes(role)) {
    throw new Error(
      `Unauthorized: Required roles: ${allowedRoles.join(', ')}. Current role: ${role || 'none'}`
    );
  }
  return role;
}

/**
 * Check if the current user is a system administrator.
 * Returns false if not authenticated or not a system admin.
 *
 * This requires a database call, so use sparingly.
 * For most role checks, use getRole() or requireRole() instead.
 */
export async function isSystemAdmin(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    select: { isSystemAdmin: true },
  });

  return user?.isSystemAdmin ?? false;
}

/**
 * Get the current user's database record.
 * Returns null if not authenticated.
 *
 * This requires a database call, so use sparingly.
 * For role checks, prefer getRole() which reads from the session token.
 */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  return await prisma.user.findUnique({
    where: { clerkUserId: userId },
  });
}
