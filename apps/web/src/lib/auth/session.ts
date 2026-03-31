import { cache } from 'react';
import type { UserPermissions } from './permissions';

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
