/**
 * Mobile Bearer token validator.
 *
 * Shared utility used by all /api/mobile/* route handlers.
 * Validates the Supabase access_token issued by /api/auth/login
 * and returns the authenticated user context (from app_metadata — no DB lookup).
 *
 * Security claims (role, tenantId) are stored in app_metadata (admin-only,
 * tamper-proof) — not user_metadata, which is user-writable via updateUser().
 *
 * Note: user.isActive is no longer checked on every request. Supabase handles
 * session validity. To deactivate a user, call supabase.auth.admin.updateUserById
 * with { banned: true } in addition to setting isActive=false in the User table.
 *
 * --- bypass_rls pattern for mobile API routes ---
 *
 * @bypass_rls reason: mobile-api
 * WHY: All /api/mobile/* route handlers bypass Supabase RLS because they use
 *      Bearer token authentication (not cookie sessions). The middleware does not
 *      inject x-tenant-id for these routes, and the Prisma adapter does not call
 *      set_config('app.current_user_id') from the HTTP context.
 *      Instead, each route handler calls validateMobileToken() to extract
 *      { userId, tenantId, role, driverId } from the verified JWT, then manually
 *      sets set_config('app.bypass_rls', 'on') inside each transaction and uses
 *      tenantId as a WHERE clause filter on every query.
 * SCOPE: Each route accesses only data belonging to the authenticated user's tenant.
 *        Driver routes additionally filter by driverId (= userId for DRIVER role).
 * SAFETY: Gated by validateMobileToken() — only runs for requests with a valid
 *         Supabase JWT. Tenant isolation is enforced via WHERE tenantId = auth.tenantId
 *         on all queries, replacing RLS policy enforcement.
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

    // Security claims from app_metadata (tamper-proof, admin-only writes)
    const appMeta = user.app_metadata || {};
    const ctx: MobileAuthContext = {
      userId: user.id,
      tenantId: appMeta.tenantId,
      role: appMeta.role as UserRole,
    };

    // For DRIVER role, driverId is the same as userId (drivers are User records)
    if (appMeta.role === 'DRIVER') {
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
