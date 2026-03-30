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
 * Reads from Supabase JWT user_metadata (fast path — no DB call needed).
 * Returns false if not authenticated or not a system admin.
 */
export async function isSystemAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.isSystemAdmin ?? false;
}

/**
 * Get the current user's database record.
 * Returns null if not authenticated.
 *
 * This requires a database call, so use sparingly.
 * For role checks, prefer getRole() which reads from the session cookie.
 *
 * @bypass_rls reason: pre-auth
 * WHY: The User table has RLS policies scoped to tenant, but this function is called
 *      during session bootstrap before the tenant context is set on the connection.
 *      The user must be looked up to establish their tenant context in the first place.
 * SCOPE: Reads a single User row by primary key (session.userId — the authenticated user's own ID).
 * SAFETY: Gated by getSession() — only runs for authenticated users. The query is
 *         scoped to a specific userId derived from the verified session cookie.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const [, user] = await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
    prisma.user.findUnique({ where: { id: session.userId } }),
  ]) as [unknown, Awaited<ReturnType<typeof prisma.user.findUnique>> | null];
  return user;
}
