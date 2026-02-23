/**
 * Server-side authentication and authorization helpers
 */

import { getSession } from './session';
import { prisma, TX_OPTIONS } from '../db/prisma';
import { UserRole } from './roles';

/**
 * Get the current user's role from the session cookie.
 * Returns null if no session or no valid role.
 *
 * This is fast (no database call) and should be used for role checks in server actions.
 */
export async function getRole(): Promise<UserRole | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const role = session.role;
  if (!role || !Object.values(UserRole).includes(role as UserRole)) {
    return null;
  }

  return role as UserRole;
}

/**
 * Require authentication.
 * Throws an error if the user is not authenticated.
 * Returns the database user ID (UUID).
 */
export async function requireAuth(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }
  return session.userId;
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
  const session = await getSession();
  if (!session) {
    return false;
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.user.findUnique({
      where: { id: session.userId },
      select: { isSystemAdmin: true },
    });
  }, TX_OPTIONS);

  return user?.isSystemAdmin ?? false;
}

/**
 * Get the current user's database record.
 * Returns null if not authenticated.
 *
 * This requires a database call, so use sparingly.
 * For role checks, prefer getRole() which reads from the session cookie.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.user.findUnique({
      where: { id: session.userId },
    });
  }, TX_OPTIONS);
}
