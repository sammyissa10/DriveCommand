/**
 * Mobile Bearer token validator.
 *
 * Shared utility used by all /api/mobile/* route handlers.
 * Validates the Supabase access_token issued by /api/auth/login
 * and returns the authenticated user context (from user_metadata — no DB lookup).
 *
 * Note: user.isActive is no longer checked on every request. Supabase handles
 * session validity. To deactivate a user, call supabase.auth.admin.updateUserById
 * with { banned: true } in addition to setting isActive=false in the User table.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '../../generated/prisma';

export interface MobileAuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  /** Set when role === 'DRIVER'. Equals the User.id (drivers are Users, no separate Driver model). */
  driverId?: string;
}

/**
 * Validate the Authorization: Bearer <token> header from a mobile request.
 *
 * Returns the authenticated user context or null if the token is missing or invalid.
 *
 * Usage:
 *   const auth = await validateMobileToken(req);
 *   if (!auth) return unauthorizedResponse();
 */
export async function validateMobileToken(req: Request): Promise<MobileAuthContext | null> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return null;

  try {
    const admin = createAdminClient();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return null;

    const meta = user.user_metadata || {};
    const ctx: MobileAuthContext = {
      userId: user.id,
      tenantId: meta.tenantId,
      role: meta.role as UserRole,
    };

    // For DRIVER role, driverId is the same as userId (drivers are User records)
    if (meta.role === 'DRIVER') {
      ctx.driverId = user.id;
    }

    return ctx;
  } catch {
    return null;
  }
}

/**
 * Standard 401 Unauthorized response for mobile API routes.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Standard 403 Forbidden response (authenticated but accessing another driver's resource).
 */
export function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
