import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/me
 *
 * Returns the current user data.
 * Accepts either:
 *   - Cookie-based session (web app, via @supabase/ssr)
 *   - Authorization: Bearer <token> header (mobile app, validated via admin client)
 *
 * Returns 401 if no valid session exists.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (bearerToken) {
      // Mobile: validate Supabase access token
      const admin = createAdminClient();
      const { data: { user }, error } = await admin.auth.getUser(bearerToken);
      if (error || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }

      // Security claims from app_metadata; display fields from user_metadata
      const appMeta = user.app_metadata || {};
      const userMeta = user.user_metadata || {};

      if (!appMeta.role || !appMeta.tenantId) {
        logger.warn('GET /api/auth/me (bearer): incomplete app_metadata', {
          userId: user.id,
          hasRole: Boolean(appMeta.role),
          hasTenantId: Boolean(appMeta.tenantId),
        });
        return NextResponse.json(
          { error: 'Account setup incomplete. Please contact support.' },
          { status: 403 }
        );
      }

      const name = [userMeta.firstName, userMeta.lastName].filter(Boolean).join(' ') || user.email;
      return NextResponse.json({
        id: user.id,
        email: user.email,
        name,
        role: appMeta.role,
        tenantId: appMeta.tenantId,
        companyName: appMeta.companyName || '',
      });
    }

    // Web: cookie-based session
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Security claims from app_metadata; display fields from user_metadata
    const appMeta = user.app_metadata || {};
    const userMeta = user.user_metadata || {};

    // Non-sysadmin users must have role + tenantId — missing means incomplete provisioning
    if (!appMeta.isSystemAdmin && (!appMeta.role || !appMeta.tenantId)) {
      logger.warn('GET /api/auth/me (cookie): incomplete app_metadata', {
        userId: user.id,
        hasRole: Boolean(appMeta.role),
        hasTenantId: Boolean(appMeta.tenantId),
      });
      return NextResponse.json(
        { error: 'Account setup incomplete. Please contact support.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      role: appMeta.role,
      tenantId: appMeta.tenantId,
      firstName: userMeta.firstName,
      lastName: userMeta.lastName,
      permissions: appMeta.permissions,
    });
  } catch (error) {
    logger.error('GET /api/auth/me error', error);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
}
