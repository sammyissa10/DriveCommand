/**
 * Server-side authentication and authorization helpers.
 *
 * Single consolidated auth module for all server-side auth needs.
 * - Security claims (role, tenantId, isSystemAdmin, permissions) are read from
 *   app_metadata — admin-only, tamper-proof, not writable by end users.
 * - Display fields (firstName, lastName) are read from user_metadata — user-editable.
 *
 * DO NOT import this file from client components ("use client").
 * For client-side auth state, use auth-context.tsx and guards.tsx.
 */

import { cache } from 'react';
import type { UserPermissions } from './permissions';
import { hasPermission } from './permissions';
import { prisma } from '../db/prisma';
import { UserRole } from './roles';

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  firstName?: string;
  lastName?: string;
  isSystemAdmin?: boolean;
  permissions?: UserPermissions;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Read the current session from Supabase Auth (cookie-based via @supabase/ssr).
 * Cached per request — all callers within the same request share the same result.
 *
 * Reads security claims (role, tenantId, isSystemAdmin, permissions) from
 * app_metadata — admin-only, tamper-proof, not writable by end users.
 * Reads display fields (firstName, lastName) from user_metadata — user-editable.
 */
export const getSession = cache(async function getSession(): Promise<SessionData | null> {
  // Dynamic import to avoid circular deps and ensure server-only
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const appMeta = user.app_metadata || {};
  const userMeta = user.user_metadata || {};
  return {
    userId: user.id,
    email: user.email!,
    role: appMeta.role || 'DRIVER',
    tenantId: appMeta.tenantId || '',
    firstName: userMeta.firstName,
    lastName: userMeta.lastName,
    isSystemAdmin: appMeta.isSystemAdmin || false,
    permissions: appMeta.permissions,
  };
});

// ---------------------------------------------------------------------------
// Role & Auth checks
// ---------------------------------------------------------------------------

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
 * Reads from Supabase JWT app_metadata (fast path — no DB call needed).
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

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

/**
 * Require a specific permission for the current user.
 *
 * Use after requireRole() in server actions that should be accessible to MANAGER
 * but gated by specific permissions. OWNER users always pass through.
 *
 * - OWNER: always allowed
 * - MANAGER: `fullAccess` bypasses; otherwise default-all-true — only an
 *   explicit `false` denies
 * - All other roles: throws Unauthorized
 *
 * ─── ONE DEFINITION, DELIBERATELY (quick-554) ───────────────────────────────
 *
 * The verdict is `hasPermission()` and nothing else. This function used to
 * inline its own copy, and that copy did NOT honour `fullAccess` — so it
 * disagreed with `middleware.ts`, which does. The divergence had never bitten
 * because this function had exactly ONE caller in the whole repo
 * (`actions/ai-documents.ts`).
 *
 * It would have bitten the moment quick-554 wired the report APIs to it.
 * `fullAccess: true` alongside an explicit `revenueReport: false` is a NORMAL
 * stored state, not a corrupt one: the team-permissions UI greys the granular
 * toggles out when Full Access is on and never clears their values. Under the
 * old copy such a manager would have been waved through the middleware onto a
 * report page whose API then answered 403 — a screen that loads and cannot
 * fetch.
 *
 * BEHAVIOUR CHANGE, stated rather than buried: that same manager previously got
 * PERMISSION_DENIED from `ai-documents.ts`. They are now allowed, which is what
 * the master toggle claims and what the middleware guarding that page already
 * did.
 *
 * @throws {Error} 'Unauthorized' if not authenticated, or if the role is
 *   neither OWNER nor MANAGER
 * @throws {Error} 'PERMISSION_DENIED: ...' if a MANAGER lacks the permission
 *
 * @example
 * export async function getPayrollRecords() {
 *   await requireRole([UserRole.OWNER, UserRole.MANAGER]);
 *   await requirePermission('canViewPayroll');
 *   // ...
 * }
 */
export async function requirePermission(key: keyof UserPermissions): Promise<void> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  if (hasPermission(session.permissions ?? null, key, session.role)) {
    return;
  }

  // hasPermission() is false for two different reasons, and they are different
  // answers to the caller: a MANAGER who is merely missing this one permission,
  // versus a role that has no business here at all.
  if (session.role === 'MANAGER') {
    throw new Error('PERMISSION_DENIED: You do not have access to this feature');
  }
  throw new Error('Unauthorized');
}
