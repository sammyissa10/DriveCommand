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
 * Reads role, tenantId, and permissions from Supabase user_metadata JWT claim —
 * no DB query needed for auth flows.
 */
export const getSession = cache(async function getSession(): Promise<SessionData | null> {
  // Dynamic import to avoid circular deps and ensure server-only
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata || {};
  return {
    userId: user.id,
    email: user.email!,
    role: meta.role || 'DRIVER',
    tenantId: meta.tenantId || '',
    firstName: meta.firstName,
    lastName: meta.lastName,
    isSystemAdmin: meta.isSystemAdmin || false,
    permissions: meta.permissions,
  };
});
